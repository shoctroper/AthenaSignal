/**
 * Continuous Editorial Radar M4 (ORDEN-008 §1, §2, §6).
 *
 * Ingesta ciclos de descubrimiento de forma incremental y mantiene un modelo
 * vivo y persistente: identidad histórica de señales, deduplicación de fuentes
 * repetidas, clusters cross-source, evolución de evidencia, contradicciones,
 * reevaluación, priorización dinámica y promoción a AthenaOS. Es idempotente:
 * reprocesar un ciclo ya aplicado no altera el estado.
 */

import type { Priority, ResearchAssessment } from '../autonomous/types.ts';
import {
  assertionPolarity,
  clusterIdFor,
  clusterLabel,
  clusterStems,
  sameCluster,
  sharedStems,
  signalFingerprint,
} from './identity.ts';
import { cloneState, emptyState, normalizeRadarState } from './store.ts';
import type {
  M4Cycle,
  RadarCluster,
  RadarCycleResult,
  RadarEvent,
  RadarEventKind,
  RadarSignalRecord,
  RadarState,
  SignalObservation,
} from './types.ts';
import { RADAR_EVENT_KINDS } from './types.ts';

const ASSESSMENT_RANK: Record<string, number> = {
  SUPPORTED: 4,
  REFRAMED: 3,
  AMBIGUOUS: 2,
  UNSUPPORTED: 1,
};

const RESEARCHABILITY_RANK: Record<string, number> = { HIGH: 1, MEDIUM: 0.5, LOW: 0 };

/**
 * Calibración de prioridad (ORDEN-008 §0bis D-M4-01).
 *
 * `HIGH` no puede ser el resultado por defecto de un score apenas por encima
 * del umbral: exige simultáneamente un score más alto y soporte suficiente
 * (fuentes independientes + profundidad de evidencia). Un candidate
 * mono-fuente queda como máximo en `MEDIUM`.
 */
export const HIGH_PRIORITY_SCORE = 0.6;
export const MEDIUM_PRIORITY_SCORE = 0.32;
export const LOW_PRIORITY_SCORE = 0.2;
export const MIN_INDEPENDENT_SOURCES = 2;
export const MIN_EVIDENCE_URLS = 2;

export interface RadarEngineOptions {
  generatedAt: string;
  observations: Record<string, SignalObservation>;
}

export class ContinuousEditorialRadar {
  private state: RadarState;
  private readonly observations: Record<string, SignalObservation>;

  constructor(options: RadarEngineOptions) {
    this.observations = options.observations;
    this.state = emptyState(options.generatedAt);
  }

  static fromSnapshot(
    snapshot: RadarState,
    options: RadarEngineOptions
  ): ContinuousEditorialRadar {
    const engine = new ContinuousEditorialRadar(options);
    engine.state = normalizeRadarState(cloneState(snapshot));
    return engine;
  }

  snapshot(): RadarState {
    return cloneState(this.state);
  }

  hasProcessedCycle(cycleId: string): boolean {
    return this.state.cyclesProcessed.includes(cycleId);
  }

  ingestCycle(
    cycle: M4Cycle,
    observationsByCorpus: Map<string, SignalObservation[]>,
    sourceMetadata?: Map<string, string>
  ): RadarCycleResult {
    // Idempotencia a nivel de ciclo: un ciclo ya aplicado es un no-op.
    if (this.hasProcessedCycle(cycle.cycleId)) {
      return {
        cycle,
        events: [],
        eventCounts: {},
        newSignals: [],
        knownSignals: [],
        affectedClusters: [],
      };
    }

    const events: RadarEvent[] = [];
    const newSignals: string[] = [];
    const knownSignals: string[] = [];
    const affected = new Set<string>();
    const createdClusters = new Set<string>();
    const baseline = new Map<
      string,
      { assessment: ResearchAssessment; priority: Priority; evidence: number; contradiction: boolean }
    >();

    for (const sourceId of cycle.sourceIds) {
      const observations = observationsByCorpus.get(sourceId) ?? [];
      const existing = this.state.processedSources[sourceId];
      if (existing) {
        existing.timesSeen += 1;
        this.pushEvent(
          events,
          cycle,
          'DUPLICATE',
          'SOURCE',
          sourceId,
          `Fuente ${sourceId} ya procesada (hash ${existing.contentHash.slice(0, 12)}); no se reprocesa ni duplica.`,
          { contentHash: existing.contentHash, timesSeen: existing.timesSeen }
        );
        for (const observation of observations) {
          const record = this.state.signals[observation.signal.signalId];
          if (!record) continue;
          record.seenCount += 1;
          record.lastSeenCycle = cycle.cycleId;
          knownSignals.push(observation.signal.signalId);
          this.pushEvent(
            events,
            cycle,
            'KNOWN',
            'SIGNAL',
            observation.signal.signalId,
            `Señal conocida que reaparece; identidad histórica preservada (vista ${record.seenCount} veces).`,
            { fingerprint: record.fingerprint, seenCount: record.seenCount, clusterId: record.clusterId }
          );
        }
        continue;
      }

      const item = observations[0]?.item;
      this.state.processedSources[sourceId] = {
        firstCycle: cycle.cycleId,
        contentHash: item?.contentHash ?? sourceMetadata?.get(sourceId) ?? '',
        timesSeen: 1,
      };

      for (const observation of observations) {
        const signalId = observation.signal.signalId;
        if (this.state.signals[signalId]) {
          const record = this.state.signals[signalId];
          record.seenCount += 1;
          record.lastSeenCycle = cycle.cycleId;
          knownSignals.push(signalId);
          this.pushEvent(
            events,
            cycle,
            'KNOWN',
            'SIGNAL',
            signalId,
            'Señal ya registrada; se preserva la identidad histórica.',
            { fingerprint: record.fingerprint, seenCount: record.seenCount }
          );
          continue;
        }
        this.addSignal(observation, cycle, events, affected, createdClusters, baseline);
        newSignals.push(signalId);
      }
    }

    for (const clusterId of [...affected].sort()) {
      this.recomputeCluster(clusterId, cycle, events, createdClusters, baseline);
    }

    this.state.cyclesProcessed.push(cycle.cycleId);
    this.state.updatedAt = cycle.occurredAt;
    this.state.events.push(...events);

    const eventCounts = countEvents(events);
    for (const [kind, count] of Object.entries(eventCounts)) {
      this.state.eventCounts[kind] = (this.state.eventCounts[kind] ?? 0) + count;
    }

    return {
      cycle,
      events,
      eventCounts,
      newSignals,
      knownSignals,
      affectedClusters: [...affected].sort(),
    };
  }

  private addSignal(
    observation: SignalObservation,
    cycle: M4Cycle,
    events: RadarEvent[],
    affected: Set<string>,
    createdClusters: Set<string>,
    baseline: Map<
      string,
      { assessment: ResearchAssessment; priority: Priority; evidence: number; contradiction: boolean }
    >
  ): void {
    const { signal, item } = observation;
    const stems = clusterStems(signal);
    let cluster = this.findCluster(stems, item.id);

    if (cluster) {
      this.pushEvent(
        events,
        cycle,
        'RELATED',
        'SIGNAL',
        signal.signalId,
        `Señal relacionada con el cluster ${cluster.clusterId}; se vincula a fuentes ya conocidas.`,
        {
          clusterId: cluster.clusterId,
          sharedStems: sharedStems(stems, cluster.tokens),
          sources: [...cluster.sourceIds],
        }
      );
    } else {
      const label = clusterLabel(signal);
      const clusterId = uniqueClusterId(this.state, clusterIdFor(label));
      cluster = {
        clusterId,
        label,
        tokens: [],
        signalIds: [],
        sourceIds: [],
        authoritySourceIds: [],
        evidenceUrls: [],
        assessment: observation.assessment,
        priority: 'LOW',
        priorityScore: 0,
        priorityHistory: [],
        statusHistory: [
          {
            cycleId: cycle.cycleId,
            cycleNumber: cycle.cycleNumber,
            status: 'ACTIVE',
            reason: 'Cluster creado por el radar; arranca ACTIVE hasta acumular corroboración.',
            at: cycle.occurredAt,
          },
        ],
        priorityReasons: [],
        contradiction: false,
        contradictionDetails: [],
        resolutionNote: null,
        firstCycle: cycle.cycleId,
        lastCycle: cycle.cycleId,
        status: 'ACTIVE',
        highSinceCycle: null,
        promotedAt: null,
      };
      this.state.clusters[clusterId] = cluster;
      createdClusters.add(clusterId);
    }

    if (!baseline.has(cluster.clusterId)) {
      baseline.set(cluster.clusterId, {
        assessment: cluster.assessment,
        priority: cluster.priority,
        evidence: cluster.evidenceUrls.length,
        contradiction: cluster.contradiction,
      });
    }

    const record: RadarSignalRecord = {
      signalId: signal.signalId,
      corpusId: item.id,
      topic: signal.topic,
      assertion: signal.assertion,
      policy: signal.policy,
      fingerprint: signalFingerprint(signal),
      firstSeenCycle: cycle.cycleId,
      lastSeenCycle: cycle.cycleId,
      seenCount: 1,
      clusterId: cluster.clusterId,
      assessment: observation.assessment,
      researchabilityLevel: observation.researchability.level,
      editorialScore: observation.editorialScore,
      noiseLikelihood: signal.noiseLikelihood,
      findingCount: observation.findings.length,
      evidenceUrls: unique([item.url, ...observation.evidence.map((entry) => entry.sourceUrl)]).sort(),
      contradiction: false,
    };
    this.state.signals[signal.signalId] = record;

    cluster.signalIds.push(signal.signalId);
    if (!cluster.sourceIds.includes(item.id)) cluster.sourceIds.push(item.id);
    if (
      (item.policy === 'PRIMARY' || item.policy === 'EVIDENCE') &&
      !cluster.authoritySourceIds.includes(item.id)
    ) {
      cluster.authoritySourceIds.push(item.id);
    }
    for (const url of record.evidenceUrls) if (!cluster.evidenceUrls.includes(url)) cluster.evidenceUrls.push(url);
    for (const stem of stems) if (!cluster.tokens.includes(stem)) cluster.tokens.push(stem);
    cluster.signalIds.sort();
    cluster.sourceIds.sort();
    cluster.authoritySourceIds.sort();
    cluster.evidenceUrls.sort();
    cluster.tokens.sort();
    cluster.lastCycle = cycle.cycleId;

    this.pushEvent(
      events,
      cycle,
      'NEW',
      'SIGNAL',
      signal.signalId,
      `Nueva señal descubierta en ${item.id}: "${signal.assertion.slice(0, 120)}"`,
      { clusterId: cluster.clusterId, policy: signal.policy }
    );
    affected.add(cluster.clusterId);
  }

  private findCluster(stems: string[], corpusId: string): RadarCluster | null {
    const clusters = Object.values(this.state.clusters).sort((a, b) =>
      a.clusterId < b.clusterId ? -1 : a.clusterId > b.clusterId ? 1 : 0
    );
    // Señales derivadas de la misma fuente pertenecen siempre al mismo tema.
    for (const cluster of clusters) {
      if (cluster.signalIds.some((signalId) => this.state.signals[signalId]?.corpusId === corpusId)) {
        return cluster;
      }
    }
    for (const cluster of clusters) {
      if (sameCluster(stems, cluster.tokens)) return cluster;
    }
    return null;
  }

  private recomputeCluster(
    clusterId: string,
    cycle: M4Cycle,
    events: RadarEvent[],
    createdClusters: Set<string>,
    baseline: Map<
      string,
      { assessment: ResearchAssessment; priority: Priority; evidence: number; contradiction: boolean }
    >
  ): void {
    const cluster = this.state.clusters[clusterId];
    if (!cluster) return;
    const records = cluster.signalIds
      .map((signalId) => this.state.signals[signalId])
      .filter((record): record is RadarSignalRecord => Boolean(record));
    if (!records.length) return;

    const initial = createdClusters.has(clusterId);
    const previous = baseline.get(clusterId) ?? {
      assessment: cluster.assessment,
      priority: cluster.priority,
      evidence: cluster.evidenceUrls.length,
      contradiction: cluster.contradiction,
    };

    cluster.assessment = aggregateAssessment(records);
    cluster.contradictionDetails = detectContradictions(records);
    cluster.contradiction = cluster.contradictionDetails.length > 0;
    cluster.priorityScore = computePriorityScore(cluster, records);
    const discard = qualifiesForDiscard(cluster, records);
    cluster.priority = discard
      ? 'DISCARD'
      : priorityFromScore(cluster.priorityScore, {
          sources: cluster.sourceIds.length,
          evidence: cluster.evidenceUrls.length,
        });
    cluster.resolutionNote = contradictionResolutionNote(cluster, records);
    cluster.priorityReasons = buildPriorityReasons(cluster, records);
    cluster.lastCycle = cycle.cycleId;

    const lastPoint = cluster.priorityHistory[cluster.priorityHistory.length - 1];
    if (!lastPoint || lastPoint.priority !== cluster.priority || lastPoint.score !== cluster.priorityScore) {
      cluster.priorityHistory.push({
        cycleId: cycle.cycleId,
        cycleNumber: cycle.cycleNumber,
        priority: cluster.priority,
        score: cluster.priorityScore,
      });
    }

    if (!initial) {
      if (cluster.contradiction && !previous.contradiction) {
        this.pushEvent(
          events,
          cycle,
          'CONTRADICTED',
          'CLUSTER',
          clusterId,
          `Evidencia contradictoria detectada en ${clusterId}.`,
          { details: [...cluster.contradictionDetails] }
        );
      }
      if (cluster.assessment !== previous.assessment) {
        this.pushEvent(
          events,
          cycle,
          'REASSESSED',
          'CLUSTER',
          clusterId,
          `Reevaluación: ${previous.assessment} → ${cluster.assessment}.`,
          { from: previous.assessment, to: cluster.assessment }
        );
      }
      if (cluster.evidenceUrls.length > previous.evidence) {
        this.pushEvent(
          events,
          cycle,
          'UPDATED',
          'CLUSTER',
          clusterId,
          `Evidencia ampliada: ${previous.evidence} → ${cluster.evidenceUrls.length} fuentes de evidencia.`,
          { from: previous.evidence, to: cluster.evidenceUrls.length }
        );
      }
      if (cluster.priority !== previous.priority) {
        this.pushEvent(
          events,
          cycle,
          'PRIORITY_CHANGED',
          'CLUSTER',
          clusterId,
          `Prioridad ${previous.priority} → ${cluster.priority} (score ${cluster.priorityScore}).`,
          { from: previous.priority, to: cluster.priority, score: cluster.priorityScore }
        );
      }
    }

    if (discard) {
      if (cluster.status !== 'DISCARDED') {
        cluster.status = 'DISCARDED';
        cluster.statusHistory.push({
          cycleId: cycle.cycleId,
          cycleNumber: cycle.cycleNumber,
          status: 'DISCARDED',
          reason: `Descartado por ruido/no investigable (score ${cluster.priorityScore}).`,
          at: cycle.occurredAt,
        });
        this.pushEvent(
          events,
          cycle,
          'DISCARDED',
          'CLUSTER',
          clusterId,
          `Descartado: ruido/no investigable (score ${cluster.priorityScore}).`,
          { reasons: discardReasons(cluster, records) }
        );
      }
      this.updateCandidate(cluster, cycle, records);
      return;
    }

    if (cluster.status === 'ACTIVE' && qualifiesForPromotion(cluster, records)) {
      if (cluster.highSinceCycle === null) cluster.highSinceCycle = cycle.cycleNumber;
      cluster.status = 'PROMOTED';
      cluster.promotedAt = cycle.occurredAt;
      cluster.statusHistory.push({
        cycleId: cycle.cycleId,
        cycleNumber: cycle.cycleNumber,
        status: 'PROMOTED',
        reason: `Promovido a AthenaOS con prioridad ${cluster.priority} (${promotionReason(cluster)}).`,
        at: cycle.occurredAt,
      });
      this.pushEvent(
        events,
        cycle,
        'PROMOTED',
        'CLUSTER',
        clusterId,
        `Candidate promovido a AthenaOS con prioridad ${cluster.priority} (promotionReason registrado).`,
        {
          score: cluster.priorityScore,
          sources: [...cluster.sourceIds],
          evidence: cluster.evidenceUrls.length,
          assessment: cluster.assessment,
          promotionReason: promotionReason(cluster),
        }
      );
    }

    this.updateCandidate(cluster, cycle, records);
  }

  private updateCandidate(
    cluster: RadarCluster,
    cycle: M4Cycle,
    records: RadarSignalRecord[]
  ): void {
    const representative = this.representativeRecord(records);
    const observation = representative ? this.observations[representative.signalId] : undefined;
    if (!observation) return;

    const candidateId = `rc4-${cluster.clusterId}`;
    this.state.candidates[candidateId] = {
      candidateId,
      clusterId: cluster.clusterId,
      title: observation.candidateBase.title,
      researchQuestion: observation.candidateBase.researchQuestion,
      originSignalIds: [...cluster.signalIds],
      sourceIds: [...cluster.sourceIds],
      assessment: cluster.assessment,
      priority: cluster.priority,
      priorityScore: cluster.priorityScore,
      priorityHistory: cluster.priorityHistory.map((point) => ({ ...point })),
      priorityReasons: [...cluster.priorityReasons],
      resolutionNote: cluster.resolutionNote,
      status: cluster.status,
      statusHistory: cluster.statusHistory.map((point) => ({ ...point })),
      firstCycle: cluster.firstCycle,
      lastCycle: cycle.cycleId,
      recommendedAthenaOsInput: observation.candidateBase.recommendedAthenaOsInput,
      promotionReason: cluster.status === 'PROMOTED' ? promotionReason(cluster) : null,
      promotionReasons: cluster.status === 'PROMOTED' ? promotionReasons(cluster) : [],
    };
  }

  private representativeRecord(records: RadarSignalRecord[]): RadarSignalRecord | null {
    if (!records.length) return null;
    return [...records].sort((a, b) => {
      const authorityA = a.policy === 'PRIMARY' || a.policy === 'EVIDENCE' ? 1 : 0;
      const authorityB = b.policy === 'PRIMARY' || b.policy === 'EVIDENCE' ? 1 : 0;
      if (authorityA !== authorityB) return authorityB - authorityA;
      if (ASSESSMENT_RANK[a.assessment] !== ASSESSMENT_RANK[b.assessment]) {
        return ASSESSMENT_RANK[b.assessment] - ASSESSMENT_RANK[a.assessment];
      }
      if (a.editorialScore !== b.editorialScore) return b.editorialScore - a.editorialScore;
      return a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0;
    })[0];
  }

  private pushEvent(
    events: RadarEvent[],
    cycle: M4Cycle,
    kind: RadarEventKind,
    subjectType: RadarEvent['subjectType'],
    subjectId: string,
    message: string,
    details: Record<string, unknown>
  ): void {
    events.push({
      eventId: `evt-${cycle.cycleId}-${events.length + 1}`,
      kind,
      cycleId: cycle.cycleId,
      cycleNumber: cycle.cycleNumber,
      occurredAt: cycle.occurredAt,
      subjectType,
      subjectId,
      message,
      details,
    });
  }
}

export function aggregateAssessment(records: RadarSignalRecord[]): ResearchAssessment {
  let best: ResearchAssessment = 'UNSUPPORTED';
  let bestRank = 0;
  for (const record of records) {
    const rank = ASSESSMENT_RANK[record.assessment] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = record.assessment;
    }
  }
  return best;
}

export function detectContradictions(records: RadarSignalRecord[]): string[] {
  const details: string[] = [];
  const sorted = [...records].sort((a, b) => (a.signalId < b.signalId ? -1 : 1));
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const polarityA = assertionPolarity(sorted[i].assertion);
      const polarityB = assertionPolarity(sorted[j].assertion);
      if (polarityA !== 0 && polarityB !== 0 && polarityA !== polarityB) {
        details.push(
          `Contradicción entre ${sorted[i].signalId} (${sorted[i].corpusId}) y ${sorted[j].signalId} (${sorted[j].corpusId}).`
        );
      }
    }
  }
  return details;
}

export function computePriorityScore(cluster: RadarCluster, records: RadarSignalRecord[]): number {
  const researchability = Math.max(
    ...records.map((record) => RESEARCHABILITY_RANK[record.researchabilityLevel] ?? 0),
    0
  );
  const evidence = Math.min(1, cluster.evidenceUrls.length / 4);
  const editorial = Math.max(...records.map((record) => record.editorialScore), 0);
  const sources = Math.min(1, cluster.sourceIds.length / 2);
  const contradiction = cluster.contradiction ? 1 : 0;
  // El soporte (fuentes independientes + evidencia) pesa más que la mera
  // investigación: así un candidate mono-fuente no alcanza `HIGH` por inercia.
  return round(
    0.2 * researchability + 0.25 * evidence + 0.2 * editorial + 0.25 * sources + 0.1 * contradiction
  );
}

export interface PrioritySupport {
  sources: number;
  evidence: number;
}

/** Soporte suficiente para aspirar a `HIGH`: corroboración + profundidad. */
export function hasSufficientSupport(cluster: RadarCluster): boolean {
  return (
    cluster.sourceIds.length >= MIN_INDEPENDENT_SOURCES &&
    cluster.evidenceUrls.length >= MIN_EVIDENCE_URLS
  );
}

export function priorityFromScore(score: number, support: PrioritySupport = { sources: 0, evidence: 0 }): Priority {
  const corroborated =
    support.sources >= MIN_INDEPENDENT_SOURCES && support.evidence >= MIN_EVIDENCE_URLS;
  if (score >= HIGH_PRIORITY_SCORE && corroborated) return 'HIGH';
  if (score >= MEDIUM_PRIORITY_SCORE) return 'MEDIUM';
  if (score >= LOW_PRIORITY_SCORE) return 'LOW';
  return 'DISCARD';
}

/** Razones observables de la prioridad (score + nº de fuentes + contradicción). */
export function buildPriorityReasons(cluster: RadarCluster, records: RadarSignalRecord[]): string[] {
  const researchability = Math.max(
    ...records.map((record) => RESEARCHABILITY_RANK[record.researchabilityLevel] ?? 0),
    0
  );
  const editorial = Math.max(...records.map((record) => record.editorialScore), 0);
  const reasons: string[] = [
    `Score compuesto ${cluster.priorityScore} (researchability ${researchability}, ` +
      `evidencia ${cluster.evidenceUrls.length}, editorial ${editorial}, ` +
      `fuentes ${cluster.sourceIds.length}, contradicción ${cluster.contradiction ? 1 : 0}).`,
    `Soporte: ${cluster.sourceIds.length} fuentes independientes y ${cluster.evidenceUrls.length} ` +
      `evidencias; soporte suficiente para HIGH: ${hasSufficientSupport(cluster) ? 'sí' : 'no'} ` +
      `(mínimo ${MIN_INDEPENDENT_SOURCES} fuentes y ${MIN_EVIDENCE_URLS} evidencias).`,
    `Prioridad ${cluster.priority} aplicando umbral HIGH ${HIGH_PRIORITY_SCORE}+ y corroboración.`,
  ];
  if (cluster.contradiction) {
    reasons.push(
      `Contradicción abierta (${cluster.contradictionDetails.length}): mantiene el cluster en ${cluster.priority} ` +
        'pero bloquea la promoción a AthenaOS.'
    );
  }
  return reasons;
}

/**
 * Resolución explicable (D-M4-03): cuando un assessment positivo (SUPPORTED/REFRAMED)
 * coexiste con una contradicción, se registra por qué no invalida el cluster.
 */
export function contradictionResolutionNote(
  cluster: RadarCluster,
  records: RadarSignalRecord[]
): string | null {
  if (!cluster.contradiction) return null;
  if (cluster.assessment !== 'SUPPORTED' && cluster.assessment !== 'REFRAMED') return null;
  const authority = records
    .filter((record) => record.policy === 'PRIMARY' || record.policy === 'EVIDENCE')
    .map((record) => record.corpusId)
    .sort();
  const weaker = records
    .filter((record) => record.policy === 'TERTIARY' || record.policy === 'SECONDARY')
    .map((record) => record.corpusId)
    .sort();
  const authorityList = authority.length ? authority.join(', ') : 'sin fuente de autoridad';
  const weakerList = weaker.length ? weaker.join(', ') : 'sin fuente de menor tier';
  return (
    `El cluster coexiste con evaluación ${cluster.assessment} y contradicción abierta: ` +
    `prevalece la evidencia de mayor tier (${authorityList}) sobre las fuentes de menor ` +
    `peso (${weakerList}); la tensión se conserva como contexto editorial y no se resuelve en un hecho.`
  );
}

export function qualifiesForDiscard(cluster: RadarCluster, records: RadarSignalRecord[]): boolean {
  if (records.some((record) => record.policy === 'BLOCKED')) return true;
  const allTertiary = records.every(
    (record) => record.policy === 'TERTIARY' || record.policy === 'BLOCKED'
  );
  const maxNoise = Math.max(...records.map((record) => record.noiseLikelihood), 0);
  if (allTertiary && maxNoise >= 0.6) return true;
  return aggregateAssessment(records) === 'UNSUPPORTED';
}

export function discardReasons(cluster: RadarCluster, records: RadarSignalRecord[]): string[] {
  const reasons: string[] = [];
  if (records.every((record) => record.policy === 'TERTIARY' || record.policy === 'BLOCKED')) {
    reasons.push('Todas las fuentes del cluster son terciarias/bloqueadas con alta probabilidad de ruido.');
  }
  if (aggregateAssessment(records) === 'UNSUPPORTED') {
    reasons.push('La evidencia agregada no sostiene la afirmación y no hay reformulación viable.');
  }
  if (!reasons.length) reasons.push(`Score de prioridad insuficiente (${cluster.priorityScore}).`);
  return reasons;
}

/**
 * Criterio de promoción explícito (ORDEN-008 §0bis D-M4-02):
 * HIGH + score alto + soporte suficiente (>=2 fuentes y >=2 evidencias) +
 * al menos una fuente de autoridad + sin contradicción bloqueante +
 * evaluación positiva.
 */
export function qualifiesForPromotion(cluster: RadarCluster, records: RadarSignalRecord[]): boolean {
  return (
    cluster.priority === 'HIGH' &&
    cluster.priorityScore >= HIGH_PRIORITY_SCORE &&
    hasSufficientSupport(cluster) &&
    cluster.authoritySourceIds.length >= 1 &&
    !cluster.contradiction &&
    (cluster.assessment === 'SUPPORTED' || cluster.assessment === 'REFRAMED') &&
    !qualifiesForDiscard(cluster, records)
  );
}

/** Justificación única y legible de la promoción, registrada en timeline/handoff. */
export function promotionReason(cluster: RadarCluster): string {
  return (
    `Promovido: HIGH con score ${cluster.priorityScore} >= ${HIGH_PRIORITY_SCORE}, ` +
    `${cluster.sourceIds.length} fuentes independientes (${cluster.authoritySourceIds.length} de autoridad) ` +
    `y ${cluster.evidenceUrls.length} evidencias >= ${MIN_EVIDENCE_URLS}, sin contradicción bloqueante, ` +
    `evaluación ${cluster.assessment}.`
  );
}

export function promotionReasons(cluster: RadarCluster): string[] {
  return [
    `Prioridad ${cluster.priority} (score ${cluster.priorityScore}) con ${cluster.sourceIds.length} fuentes ` +
      `(${cluster.authoritySourceIds.length} de autoridad) y ${cluster.evidenceUrls.length} evidencias.`,
    `Evaluación agregada ${cluster.assessment} sin contradicción abierta.`,
    `Promovido a AthenaOS en ${cluster.promotedAt ?? cluster.lastCycle}.`,
  ];
}

function uniqueClusterId(state: RadarState, base: string): string {
  if (!state.clusters[base]) return base;
  let index = 2;
  while (state.clusters[`${base}-${index}`]) index += 1;
  return `${base}-${index}`;
}

function countEvents(events: RadarEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const kind of RADAR_EVENT_KINDS) counts[kind] = 0;
  for (const event of events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  const compact: Record<string, number> = {};
  for (const [kind, count] of Object.entries(counts)) if (count > 0) compact[kind] = count;
  return compact;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
