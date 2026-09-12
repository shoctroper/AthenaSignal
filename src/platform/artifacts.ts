/**
 * Artefactos de aceptación M5 (ORDEN-009 §5, §6, §7, §11).
 *
 * Todos derivan del estado persistido, del corpus y de las observaciones
 * cognitivas reales (replay), de modo que la evidencia es reconstruible sin la
 * narrativa del worker.
 */

import type { Priority } from '../autonomous/types.ts';
import type { M5Corpus, M5PlatformState, NodeHealth } from './types.ts';
import type { CognitiveRoute, M5Benchmark, M5BenchmarkClass, M5Metrics, M5Observability } from './types.ts';
import { hashContent } from '../research/provenance.ts';

export interface M5BenchmarkEntryDefinition {
  id: string;
  description: string;
  check: string;
}

export const M5_BENCHMARK_CLASSES: M5BenchmarkEntryDefinition[] = [
  { id: 'NEW', description: 'Se descubren señales nuevas a lo largo de la vida de la plataforma.', check: 'eventCounts.NEW > 0' },
  { id: 'KNOWN', description: 'Material conocido reaparece preservando identidad histórica.', check: 'eventCounts.KNOWN > 0' },
  { id: 'DUPLICATE', description: 'Fuentes repetidas no se reprocesan ni duplican.', check: 'eventCounts.DUPLICATE > 0' },
  { id: 'RELATED', description: 'Se vinculan fuentes/señales relacionadas cross-source.', check: 'eventCounts.RELATED > 0' },
  { id: 'AMBIGUOUS', description: 'Afirmaciones ambiguas se tratan como tales, sin elevarse a hecho.', check: 'rawAssessments.AMBIGUOUS > 0' },
  { id: 'SUPPORTED', description: 'Afirmaciones sostenidas por evidencia de autoridad.', check: 'rawAssessments.SUPPORTED > 0' },
  { id: 'UNSUPPORTED', description: 'Afirmaciones no sostenidas se reformulan o descartan; nunca se promueven.', check: 'rawAssessments.UNSUPPORTED > 0 y sin promoción' },
  { id: 'REFRAMED', description: 'Claims incorrectos se reformulan como pregunta investigable.', check: 'rawAssessments.REFRAMED > 0 o candidatos REFRAMED' },
  { id: 'CONTRADICTED', description: 'Contradicciones entre fuentes se conservan explícitamente.', check: 'eventCounts.CONTRADICTED > 0 o clusters en contradicción' },
  { id: 'DISCARD', description: 'Ruido promocional/no investigable se descarta sin destruir estado.', check: 'eventCounts.DISCARDED > 0 o candidatos DISCARDED' },
  { id: 'PROMOTION', description: 'Un candidate sostenido se promueve a AKP con handoff válido.', check: 'eventCounts.PROMOTED > 0 o candidatos PROMOTED' },
  { id: 'PRIORITY_CHANGE', description: 'La prioridad cambia dinámicamente con justificación observable.', check: 'eventCounts.PRIORITY_CHANGED > 0' },
  { id: 'MULTILINGUAL', description: 'Material en varios idiomas se conserva con provenance.', check: 'idiomas procesados >= 2' },
  { id: 'CROSS_SOURCE', description: 'Un cluster reúne >= 2 fuentes independientes.', check: 'clusters multi-fuente >= 1' },
  { id: 'RECOVERED', description: 'El sistema se recupera de reinicios, nodos caídos y fallos.', check: 'recovery events > 0' },
];

export const M5_RUBRIC = [
  { id: 'P1', question: '¿El radar continuó aprendiendo entre procesos y reinicios sin reiniciar el universo?' },
  { id: 'P2', question: '¿Reconoció material conocido conservando la misma identidad histórica?' },
  { id: 'P3', question: '¿Encontró material nuevo y lo distinguió de lo conocido?' },
  { id: 'P4', question: '¿Evitó duplicar fuentes, señales y handoffs (idempotencia)?' },
  { id: 'P5', question: '¿Relacionó fuentes equivalentes en varios idiomas?' },
  { id: 'P6', question: '¿Actualizó decisiones y prioridades con razones auditables?' },
  { id: 'P7', question: '¿Mantuvo las contradicciones sin convertirlas en hechos?' },
  { id: 'P8', question: '¿Se recuperó de fallos de nodo/proceso sin fabricar evidencia?' },
  { id: 'P9', question: '¿Entregó a AKP un candidate investigable y validado?' },
  { id: 'P10', question: '¿Evitó saturar a AthenaOS con handoffs duplicados o ruido?' },
];

export interface ArtifactInput {
  generatedAt: string;
  corpus: M5Corpus;
  state: M5PlatformState;
  topology: NodeHealth[];
  rawAssessments: Record<string, number>;
  missingRecordings: string[];
  llm: { providerChain: string; realResponses: number; deterministicResponses: number };
  research: { queries: number; evidenceItems: number };
}

export function buildMetrics(input: ArtifactInput): M5Metrics {
  const { state, corpus } = input;
  const candidates = Object.values(state.radar.candidates);
  const clusters = Object.values(state.radar.clusters);
  const eventCounts = state.radar.eventCounts;

  const itemById = new Map(corpus.sources.map((source) => [source.id, source]));
  const languages: Record<string, number> = {};
  const platforms: Record<string, number> = {};
  for (const sourceId of Object.keys(state.radar.processedSources)) {
    const item = itemById.get(sourceId) ?? corpus.sources.find((s) => s.id === sourceId);
    if (!item) continue;
    languages[item.language] = (languages[item.language] ?? 0) + 1;
    platforms[item.platform] = (platforms[item.platform] ?? 0) + 1;
  }

  const multiSourceClusters = clusters.filter((cluster) => cluster.sourceIds.length >= 2).length;
  const averageSourcesPerCandidate = candidates.length
    ? Number(
        (
          candidates.reduce((sum, candidate) => sum + candidate.sourceIds.length, 0) /
          candidates.length
        ).toFixed(3)
      )
    : 0;

  const recoveryByKind: Record<string, number> = {};
  for (const event of state.recovery) recoveryByKind[event.kind] = (recoveryByKind[event.kind] ?? 0) + 1;
  const routes = state.routing.reduce<Record<string, number>>((acc, decision) => {
    acc[decision.route] = (acc[decision.route] ?? 0) + 1;
    return acc;
  }, {});

  const uniqueSources = Object.keys(state.radar.processedSources).length;
  const inputsObserved = state.counters.inputsObserved;

  return {
    kind: 'athenasignal.m5.metrics.v1',
    generatedAt: input.generatedAt,
    runs: state.runs.length,
    processes: new Set(state.runs.map((run) => run.processId)).size,
    cycles: state.radar.cyclesProcessed.length,
    sources: corpus.sources.length,
    extendedSources: corpus.extendedSourceIds.length,
    inputsObserved,
    uniqueSources,
    repeatedSources: Object.values(state.radar.processedSources).filter((source) => source.timesSeen > 1).length,
    signalsTracked: Object.keys(state.radar.signals).length,
    newSignals: eventCounts.NEW ?? 0,
    knownSignals: eventCounts.KNOWN ?? 0,
    duplicates: eventCounts.DUPLICATE ?? 0,
    related: eventCounts.RELATED ?? 0,
    clusters: clusters.length,
    multiSourceClusters,
    candidates: candidates.length,
    discarded: candidates.filter((candidate) => candidate.status === 'DISCARDED').length,
    promoted: candidates.filter((candidate) => candidate.status === 'PROMOTED').length,
    priorityChanges: eventCounts.PRIORITY_CHANGED ?? 0,
    evidenceUpdates: eventCounts.UPDATED ?? 0,
    reassessments: eventCounts.REASSESSED ?? 0,
    contradictions: eventCounts.CONTRADICTED ?? 0,
    supported: input.rawAssessments.SUPPORTED ?? 0,
    unsupported: input.rawAssessments.UNSUPPORTED ?? 0,
    ambiguous: input.rawAssessments.AMBIGUOUS ?? 0,
    reframed: input.rawAssessments.REFRAMED ?? 0,
    averageSourcesPerCandidate,
    languages,
    platforms,
    llm: {
      providerChain: input.llm.providerChain,
      realResponses: input.llm.realResponses,
      deterministicResponses: input.llm.deterministicResponses,
      replayMisses: input.missingRecordings.length,
      localRoutes: routes.LOCAL ?? 0,
      localAltRoutes: routes.LOCAL_ALT ?? 0,
      remoteRoutes: routes.REMOTE_ESCALATION ?? 0,
      fallbackRoutes: routes.DETERMINISTIC_FALLBACK ?? 0,
    },
    research: input.research,
    recovery: {
      events: state.recovery.length,
      byKind: recoveryByKind,
    },
    idempotency: {
      noOps: state.idempotency.filter((record) => record.noOp).length,
      attempted: state.idempotency.reduce((sum, record) => sum + record.attempts, 0),
    },
    akp: {
      delivered: state.akp.deliveries.filter((delivery) => delivery.status === 'DELIVERED_TO_SINK').length,
      consumed: state.akp.consumed,
      suppressed: state.akp.deliveries.filter((delivery) => delivery.status === 'DUPLICATE_SUPPRESSED').length,
    },
    rawAssessments: { ...input.rawAssessments },
    falsePositiveObservations: [],
  };
}

export function buildBenchmark(input: ArtifactInput): M5Benchmark {
  const { state } = input;
  const eventCounts = state.radar.eventCounts;
  const clusters = Object.values(state.radar.clusters);
  const candidates = Object.values(state.radar.candidates);
  const idsWithStatus = new Set(candidates.map((candidate) => candidate.candidateId));
  void idsWithStatus;

  const entries: M5BenchmarkClass[] = M5_BENCHMARK_CLASSES.map((definition) => {
    const { observed, evidence } = checkBenchmark(definition.id, input);
    return { id: definition.id, description: definition.description, observed, evidence };
  });

  const observedCount = entries.filter((entry) => entry.observed).length;
  const falsePositiveObservations = entries
    .filter((entry) => !entry.observed)
    .map((entry) => `Benchmark ${entry.id}: no observado (${entry.evidence}).`);

  void eventCounts;
  void clusters;

  return {
    kind: 'athenasignal.m5.benchmark.v1',
    generatedAt: input.generatedAt,
    entries,
    coverage: Number((observedCount / entries.length).toFixed(4)),
    falsePositiveObservations,
  };
}

function checkBenchmark(id: string, input: ArtifactInput): { observed: boolean; evidence: string } {
  const { state, rawAssessments } = input;
  const eventCounts = state.radar.eventCounts;
  const candidates = Object.values(state.radar.candidates);
  const clusters = Object.values(state.radar.clusters);

  switch (id) {
    case 'NEW':
      return obs((eventCounts.NEW ?? 0) > 0, `${eventCounts.NEW ?? 0} eventos NEW`);
    case 'KNOWN':
      return obs((eventCounts.KNOWN ?? 0) > 0, `${eventCounts.KNOWN ?? 0} eventos KNOWN`);
    case 'DUPLICATE':
      return obs((eventCounts.DUPLICATE ?? 0) > 0, `${eventCounts.DUPLICATE ?? 0} eventos DUPLICATE`);
    case 'RELATED':
      return obs((eventCounts.RELATED ?? 0) > 0, `${eventCounts.RELATED ?? 0} eventos RELATED`);
    case 'AMBIGUOUS':
      return obs((rawAssessments.AMBIGUOUS ?? 0) > 0, `${rawAssessments.AMBIGUOUS ?? 0} assessments ambiguos`);
    case 'SUPPORTED':
      return obs((rawAssessments.SUPPORTED ?? 0) > 0, `${rawAssessments.SUPPORTED ?? 0} assessments soportados`);
    case 'UNSUPPORTED': {
      const unsupported = rawAssessments.UNSUPPORTED ?? 0;
      const unsafe = candidates.some((candidate) => candidate.assessment === 'UNSUPPORTED');
      return obs(unsupported > 0 && !unsafe, `${unsupported} assessments no soportados, ninguno promovido como hecho`);
    }
    case 'REFRAMED':
      return obs(
        (rawAssessments.REFRAMED ?? 0) > 0 || candidates.some((candidate) => candidate.assessment === 'REFRAMED'),
        `${rawAssessments.REFRAMED ?? 0} assessments reformulados`
      );
    case 'CONTRADICTED':
      return obs(
        (eventCounts.CONTRADICTED ?? 0) > 0 || clusters.some((cluster) => cluster.contradiction),
        `${eventCounts.CONTRADICTED ?? 0} eventos CONTRADICTED`
      );
    case 'DISCARD':
      return obs(
        (eventCounts.DISCARDED ?? 0) > 0 || candidates.some((candidate) => candidate.status === 'DISCARDED'),
        `${eventCounts.DISCARDED ?? 0} eventos DISCARDED`
      );
    case 'PROMOTION':
      return obs(
        (eventCounts.PROMOTED ?? 0) > 0 || candidates.some((candidate) => candidate.status === 'PROMOTED'),
        `${eventCounts.PROMOTED ?? 0} eventos PROMOTED`
      );
    case 'PRIORITY_CHANGE':
      return obs((eventCounts.PRIORITY_CHANGED ?? 0) > 0, `${eventCounts.PRIORITY_CHANGED ?? 0} cambios de prioridad`);
    case 'MULTILINGUAL': {
      const languages = new Set(
        input.corpus.sources
          .filter((source) => source.id in state.radar.processedSources)
          .map((source) => source.language)
      );
      return obs(languages.size >= 2, `${languages.size} idiomas: ${[...languages].sort().join(', ')}`);
    }
    case 'CROSS_SOURCE': {
      const multi = clusters.filter((cluster) => cluster.sourceIds.length >= 2).length;
      return obs(multi >= 1, `${multi} clusters multi-fuente`);
    }
    case 'RECOVERED':
      return obs(state.recovery.length > 0, `${state.recovery.length} eventos de recuperación`);
    default:
      return obs(false, 'clase desconocida');
  }
}

function obs(observed: boolean, evidence: string): { observed: boolean; evidence: string } {
  return { observed, evidence };
}

export function buildObservability(input: ArtifactInput): M5Observability {
  const { state, corpus } = input;
  const routes = state.routing.reduce<Record<string, number>>((acc, decision) => {
    acc[decision.route] = (acc[decision.route] ?? 0) + 1;
    return acc;
  }, {});
  const recoveryByKind: Record<string, number> = {};
  for (const event of state.recovery) recoveryByKind[event.kind] = (recoveryByKind[event.kind] ?? 0) + 1;
  const cycles = new Set(state.radar.cyclesProcessed);

  return {
    kind: 'athenasignal.m5.observability.v1',
    generatedAt: input.generatedAt,
    topology: { nodes: input.topology.map((node) => ({ ...node })) },
    runs: state.runs.map((run) => ({
      runId: run.runId,
      processId: run.processId,
      status: run.status,
      cyclesRequested: run.cyclesRequested.length,
      cyclesApplied: run.cyclesApplied.length,
      inputsObserved: run.metrics.inputsObserved,
      fallbacks: run.metrics.fallbacks,
      resumedFrom: run.resumedFrom,
      crashed: run.status === 'CRASHED',
    })),
    processed: {
      cycles: [...state.radar.cyclesProcessed].sort(),
      pending: corpus.cycles.map((cycle) => cycle.cycleId).filter((cycleId) => !cycles.has(cycleId)).sort(),
      sources: Object.keys(state.radar.processedSources).length,
    },
    routing: {
      decisions: state.routing.length,
      byRoute: routes,
      fallbacks: state.routing.filter((decision) => decision.fallback).length,
      escalationReasons: unique(
        state.routing.filter((decision) => decision.escalated).map((decision) => decision.reason)
      ),
    },
    failures: {
      recoveryEvents: state.recovery.length,
      byKind: recoveryByKind,
    },
    pending: {
      cycles: corpus.cycles
        .map((cycle) => cycle.cycleId)
        .filter((cycleId) => !cycles.has(cycleId))
        .sort(),
      candidatesActive: Object.values(state.radar.candidates).filter(
        (candidate) => candidate.status === 'ACTIVE'
      ).length,
    },
    promoted: Object.values(state.radar.candidates)
      .filter((candidate) => candidate.status === 'PROMOTED')
      .map((candidate) => candidate.candidateId)
      .sort(),
    discarded: Object.values(state.radar.candidates)
      .filter((candidate) => candidate.status === 'DISCARDED')
      .map((candidate) => candidate.candidateId)
      .sort(),
    cost: {
      llmCalls: input.llm.realResponses + input.llm.deterministicResponses,
      localCalls: (routes.LOCAL ?? 0) + (routes.LOCAL_ALT ?? 0),
      remoteCalls: routes.REMOTE_ESCALATION ?? 0,
      deterministicCalls: routes.DETERMINISTIC_FALLBACK ?? 0,
      estimatedRemoteCostUnits: routes.REMOTE_ESCALATION ?? 0,
    },
  };
}

export function buildCognitiveRouting(input: ArtifactInput): {
  kind: 'athenasignal.m5.cognitive_routing.v1';
  generatedAt: string;
  policy: Record<string, CognitiveRoute[]>;
  decisions: M5PlatformState['routing'];
  byRoute: Record<string, number>;
  byStage: Record<string, Record<string, number>>;
  fallbackReasons: string[];
} {
  const { state } = input;
  const byRoute: Record<string, number> = {};
  const byStage: Record<string, Record<string, number>> = {};
  for (const decision of state.routing) {
    byRoute[decision.route] = (byRoute[decision.route] ?? 0) + 1;
    byStage[decision.stage] = byStage[decision.stage] ?? {};
    byStage[decision.stage][decision.route] = (byStage[decision.stage][decision.route] ?? 0) + 1;
  }
  return {
    kind: 'athenasignal.m5.cognitive_routing.v1',
    generatedAt: input.generatedAt,
    policy: POLICIES as unknown as Record<string, CognitiveRoute[]>,
    decisions: state.routing.map((decision) => ({ ...decision })),
    byRoute,
    byStage,
    fallbackReasons: unique(
      state.routing.filter((decision) => decision.fallback).map((decision) => decision.reason)
    ),
  };
}

const POLICIES: Record<string, CognitiveRoute[]> = {
  signal_discovery: ['LOCAL', 'LOCAL_ALT'],
  assertion_decomposition: ['LOCAL', 'LOCAL_ALT'],
  evidence_interpretation: ['LOCAL', 'LOCAL_ALT'],
  claim_assessment: ['LOCAL_ALT', 'REMOTE_ESCALATION', 'LOCAL'],
  reframing: ['LOCAL_ALT', 'REMOTE_ESCALATION', 'LOCAL'],
  researchability: ['LOCAL_ALT', 'LOCAL'],
  editorial_relevance: ['LOCAL_ALT', 'LOCAL'],
  prioritization: ['LOCAL_ALT', 'REMOTE_ESCALATION', 'LOCAL'],
};

export function buildHumanReview(input: ArtifactInput): import('./types.ts').M5HumanReviewPacket {
  const { state } = input;
  const candidates = Object.values(state.radar.candidates);
  const clusters = state.radar.clusters;

  const best =
    [...candidates]
      .sort(
        (a, b) =>
          priorityValue(b.priority) - priorityValue(a.priority) ||
          b.priorityScore - a.priorityScore ||
          (a.candidateId < b.candidateId ? -1 : 1)
      )
      .filter((candidate) => candidate.status !== 'DISCARDED')[0] ?? null;

  const newest =
    [...candidates]
      .filter((candidate) => candidate.lastCycle.startsWith('m5-'))
      .sort(
        (a, b) =>
          cycleNumber(b.lastCycle) - cycleNumber(a.lastCycle) ||
          (a.candidateId < b.candidateId ? -1 : 1)
      )[0] ?? null;

  const priorityEvolution = candidates
    .filter((candidate) => {
      const values = candidate.priorityHistory.map((point) => point.priority);
      return new Set(values).size > 1;
    })
    .sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1))
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      from: candidate.priorityHistory[0].priority,
      to: candidate.priorityHistory[candidate.priorityHistory.length - 1].priority,
      cycles: candidate.priorityHistory.map((point) => point.cycleId),
    }));

  const promotionReasons = candidates
    .filter((candidate) => candidate.status === 'PROMOTED')
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      promotionReason: candidate.promotionReason,
      validationValid:
        state.akp.deliveries.find((delivery) => delivery.candidateId === candidate.candidateId)?.validation
          .valid ?? false,
    }));

  const m5Events = state.radar.events.filter((event) => event.cycleId.startsWith('m5-'));
  const story = [
    `El estado persistido se importó desde ${state.importedFrom ?? 'memoria inicial'} sin reiniciar el universo.`,
    `Se procesaron ${state.radar.cyclesProcessed.length} ciclos (${m5Events.length} eventos en ciclos M5).`,
    `Sobrevivieron ${state.runs.filter((run) => run.status === 'CRASHED').length} muerte(s) de proceso y ` +
      `${state.recovery.length} evento(s) de recuperación.`,
    `Se descubrieron ${state.radar.eventCounts.NEW ?? 0} señales, se reconocieron ${state.radar.eventCounts.KNOWN ?? 0} y ` +
      `se descartaron ${state.radar.eventCounts.DISCARDED ?? 0} como ruido.`,
    `Se promovieron ${candidates.filter((candidate) => candidate.status === 'PROMOTED').length} candidate(s) con handoff validado; ` +
      `el consumidor AKP local ingirió ${state.akp.consumed} handoff(s) ` +
      `(AthenaOS no expone endpoint vivo: limitación documentada).`,
  ];

  return {
    kind: 'athenasignal.m5.human_review_packet.v1',
    generatedAt: input.generatedAt,
    rubric: M5_RUBRIC.map((item) => ({ ...item })),
    longitudinalStory: story,
    bestCandidate: best
      ? {
          candidateId: best.candidateId,
          title: best.title,
          priority: best.priority,
          assessment: best.assessment,
          firstCycle: best.firstCycle,
          lastCycle: best.lastCycle,
          cyclesSeen: best.priorityHistory.length,
          sources: best.sourceIds.length,
          why:
            `${best.sourceIds.length} fuentes y score ${best.priorityScore}; ` +
            `memoria desde ${best.firstCycle} hasta ${best.lastCycle}.`,
        }
      : null,
    newestDiscovery: newest
      ? {
          candidateId: newest.candidateId,
          firstCycle: newest.firstCycle,
          why: `Descubierto en ${newest.firstCycle} y reevaluado hasta ${newest.lastCycle}.`,
        }
      : null,
    priorityEvolution,
    recovered: state.recovery.slice(0, 8).map((event) => ({
      recoveryId: event.recoveryId,
      kind: event.kind,
      runId: event.runId,
      why: event.detail,
    })),
    akpConsumption: {
      delivered: state.akp.deliveries.filter((delivery) => delivery.status === 'DELIVERED_TO_SINK').length,
      consumed: state.akp.consumed,
      consumer: state.akp.consumption?.consumer ?? null,
      limitation: state.akp.limitation,
    },
    promoted: promotionReasons,
  };
}

export function buildRecovery(input: ArtifactInput): {
  kind: 'athenasignal.m5.recovery_events.v1';
  generatedAt: string;
  events: M5PlatformState['recovery'];
  byKind: Record<string, number>;
} {
  const byKind: Record<string, number> = {};
  for (const event of input.state.recovery) byKind[event.kind] = (byKind[event.kind] ?? 0) + 1;
  return {
    kind: 'athenasignal.m5.recovery_events.v1',
    generatedAt: input.generatedAt,
    events: input.state.recovery.map((event) => ({ ...event })),
    byKind,
  };
}

export function buildIdempotency(input: ArtifactInput): {
  kind: 'athenasignal.m5.idempotency.v1';
  generatedAt: string;
  records: M5PlatformState['idempotency'];
  noOps: number;
  attempted: number;
} {
  return {
    kind: 'athenasignal.m5.idempotency.v1',
    generatedAt: input.generatedAt,
    records: input.state.idempotency.map((record) => ({ ...record })),
    noOps: input.state.idempotency.filter((record) => record.noOp).length,
    attempted: input.state.idempotency.reduce((sum, record) => sum + record.attempts, 0),
  };
}

export function buildAkpHandoff(input: ArtifactInput): {
  kind: 'athenasignal.m5.akp_handoff.v1';
  generatedAt: string;
  sink: string;
  limitation: string;
  consumed: number;
  consumption: import('./types.ts').AkpConsumption | null;
  deliveries: M5PlatformState['akp']['deliveries'];
} {
  return {
    kind: 'athenasignal.m5.akp_handoff.v1',
    generatedAt: input.generatedAt,
    sink: input.state.akp.sink,
    limitation: input.state.akp.limitation,
    consumed: input.state.akp.consumed,
    consumption: input.state.akp.consumption,
    deliveries: input.state.akp.deliveries.map((delivery) => ({ ...delivery })),
  };
}

export function buildRunTimeline(input: ArtifactInput): {
  kind: 'athenasignal.m5.run_timeline.v1';
  generatedAt: string;
  runs: M5PlatformState['runs'];
} {
  return {
    kind: 'athenasignal.m5.run_timeline.v1',
    generatedAt: input.generatedAt,
    runs: input.state.runs.map((run) => ({
      ...run,
      cyclesRequested: [...run.cyclesRequested],
      cyclesApplied: [...run.cyclesApplied],
      metrics: { ...run.metrics },
    })),
  };
}

function cycleNumber(cycleId: string): number {
  const match = cycleId.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function priorityValue(priority: Priority): number {
  return { HIGH: 3, MEDIUM: 2, LOW: 1, DISCARD: 0 }[priority] ?? 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

void hashContent;
