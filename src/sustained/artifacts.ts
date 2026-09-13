/**
 * Artefactos de aceptación M8 (ORDEN-012 §4, §6, §7).
 *
 * Todos derivan del scheduler sostenido, del ledger epistémico vivo, del radar
 * mutado por el feedback y de las invocaciones reales a motores/infraestructura.
 * La evidencia es reconstruible: cada estado tiene su transición, cada
 * transición su evidencia y cada mutación del radar su feedback.
 */

import type { IdempotencyRecord, RecoveryEvent, RoutingDecision } from '../platform/types.ts';
import type { RadarState, SignalObservation } from '../radar/types.ts';
import type { FeedbackUpdate, M6State, TopologyNode } from '../closedloop/types.ts';
import type { M7ProvenanceGraph, M7ResearchResult, M7RunSummary } from '../epistemic/types.ts';
import { isAuthoritativeUrl, type EpistemicLedger } from '../epistemic/resolver.ts';
import type {
  M8AkpIngestion,
  M8Artifacts,
  M8Corpus,
  M8Cost,
  M8HumanReviewPacket,
  M8Metrics,
  M8Observability,
  M8OperationTimeline,
  M8RealEngines,
  M8RealResearch,
  M8Scheduler,
  SustainedProcess,
} from './types.ts';

export const M8_BENCHMARK_CLASSES: Array<{ id: string; description: string; check: string }> = [
  { id: 'SUSTAINED_WINDOW', description: 'El scheduler opera una ventana prolongada con múltiples ticks.', check: 'ticks > 1 y duración > 0' },
  { id: 'NEW_SIGNAL', description: 'La operación descubre señales nuevas sobre el universo ampliado.', check: 'radar NEW > 0' },
  { id: 'KNOWN', description: 'Material conocido reaparece preservando identidad histórica.', check: 'radar KNOWN > 0' },
  { id: 'DUPLICATE', description: 'Fuentes repetidas no se reprocesan ni duplican.', check: 'radar DUPLICATE > 0' },
  { id: 'RELATED', description: 'Fuentes/señales relacionadas se vinculan cross-source.', check: 'radar RELATED > 0' },
  { id: 'SCALE', description: 'M8 observa un universo materialmente mayor que M7 (>= 1000 fuentes).', check: 'sources >= 1000' },
  { id: 'CANDIDATE_RESEARCH', description: 'Durante la operación se investigan Research Candidates.', check: 'm8Results > 0' },
  { id: 'CONFIRMED', description: 'Evidencia sostiene al menos un candidate.', check: 'verdict CONFIRMED > 0' },
  { id: 'REFUTED', description: 'Evidencia refuta al menos un candidate.', check: 'verdict REFUTED > 0' },
  { id: 'CLOSURE', description: 'Un candidate se cierra por confirmación o refutación.', check: 'CLOSED_CONFIRMED o CLOSED_REFUTED' },
  { id: 'REOPENING', description: 'Nueva evidencia reabre un candidate.', check: 'transición REOPENED' },
  { id: 'PROMOTION', description: 'Un candidate se promueve con handoff válido.', check: 'estado PROMOTED' },
  { id: 'DEMOTION', description: 'Un candidate se degrada por nueva evidencia.', check: 'estado DEMOTED' },
  { id: 'CONTRADICTION', description: 'Evidencia contradictoria se representa y resuelve o conserva.', check: 'contradiction artifact > 0' },
  { id: 'FEEDBACK_UPDATE', description: 'El resultado muta el radar conservando las capas separadas.', check: 'feedbackUpdates > 0' },
  { id: 'REAL_ENGINE', description: 'Se invocan motores reales (AthenaOS/AKP) y se documentan.', check: 'invocaciones OK > 0' },
  { id: 'DISTRIBUTED_HONESTY', description: 'Ubuntu participa; Mac mini se documenta como no disponible.', check: 'ubuntu reachable && macmini documentado' },
  { id: 'NODE_FAILURE', description: 'El loop degrada correctamente ante un nodo caído.', check: 'recovery NODE_DOWN' },
  { id: 'PROCESS_RESTART', description: 'El loop sobrevive a un reinicio de proceso.', check: 'recovery PROCESS_RESTART > 0' },
  { id: 'LLM_FAILURE', description: 'Un fallo de LLM/timeout degrada sin fabricar evidencia.', check: 'recovery LLM_FALLBACK/TIMEOUT/INVALID_RESPONSE' },
  { id: 'IDEMPOTENCY', description: 'Reintentos no corrompen el conocimiento compartido.', check: 'idempotency noOps > 0' },
  { id: 'PROVENANCE', description: 'Provenance completa source → signal → candidate → evidencia → radar.', check: 'completeChains > 0' },
  { id: 'EPISTEMIC_HISTORY', description: 'Cada resolución conserva statusHistory sin sobrescribir.', check: 'statusHistory >= 1' },
];

export const M8_RUBRIC = [
  { id: 'Q1', question: '¿El circuito AthenaSignal→AKP→AthenaOS→AKP→AthenaSignal se sostiene en el tiempo?' },
  { id: 'Q2', question: '¿Se usaron motores reales (AthenaOS/AKP) y nodo Ubuntu cuando fue posible?' },
  { id: 'Q3', question: '¿La ventana sostenida es verificable (ticks/procesos/duración)?' },
  { id: 'Q4', question: '¿El corpus supera materialmente a M7 sin fabricar cognición?' },
  { id: 'Q5', question: '¿Se generan, investigan, resuelven y actualizan candidates durante la operación?' },
  { id: 'Q6', question: '¿Los resultados producen cambios observables en estado/prioridad/radar?' },
  { id: 'Q7', question: '¿Cada transición epistémica conserva evidencia y provenance?' },
  { id: 'Q8', question: '¿El sistema es recuperable e idempotente sin corromper memoria?' },
  { id: 'Q9', question: '¿La infraestructura no disponible se documenta sin simular participación?' },
  { id: 'Q10', question: '¿Un editor humano confirmaría que el radar quedó mejor informado?' },
];

export interface M8ArtifactInput {
  generatedAt: string;
  corpus: M8Corpus;
  m7: M7RunSummary;
  scheduler: M8Scheduler;
  radar: RadarState;
  ledger: EpistemicLedger;
  m8Results: M7ResearchResult[];
  m8Feedback: FeedbackUpdate[];
  observations: Record<string, SignalObservation>;
  realEngines: M8RealEngines;
  realResearch: M8RealResearch | null;
  akpIngestion: M8AkpIngestion | null;
  recovery: RecoveryEvent[];
  idempotency: IdempotencyRecord[];
  routing: RoutingDecision[];
  provenance: M7ProvenanceGraph;
  handoffTrace: M7ArtifactsHandoffTrace;
  missingRecordings: string[];
  transport: { inboxDir: string; returnDir: string; consumer: string; worker: string; limitation: string };
}

type M7ArtifactsHandoffTrace = M7RunSummary['state']['handoffTrace'];

export function buildM8Artifacts(input: M8ArtifactInput): M8Artifacts {
  const resolutions = input.ledger.all();
  const transitions = resolutions.flatMap((resolution) => resolution.statusHistory);
  const m7Results = input.m7.artifacts.athenaosResults.results;
  const m7Feedback = input.m7.artifacts.feedbackUpdates.updates;
  const results = [...m7Results, ...input.m8Results];
  const feedback = [...m7Feedback, ...input.m8Feedback];
  const contradictions = buildContradictions(input);
  const benchmark = buildBenchmark(input, contradictions);
  const metrics = buildMetrics(input, contradictions);
  metrics.falsePositiveObservations = [...benchmark.falsePositiveObservations];

  return {
    corpus: input.corpus,
    benchmark,
    scheduler: input.scheduler,
    operationTimeline: buildOperationTimeline(input),
    radarState: input.radar,
    akpLive: {
      kind: 'athenasignal.m8.akp_live.v1',
      generatedAt: input.generatedAt,
      inboxDir: input.transport.inboxDir,
      returnDir: input.transport.returnDir,
      transport: 'durable-file-queue',
      consumer: input.transport.consumer,
      worker: input.transport.worker,
      handoffs: input.m8Results.map((result) => ({
        handoffId: result.handoffId,
        candidateId: result.candidateId,
        clusterId: result.clusterId,
        contentHash: result.handoffContentHash,
        wave: result.wave,
        consumedAt: result.createdAt,
      })),
      consumed: input.m8Results.length,
      resultsReturned: input.m8Results.length,
      returnedResultIds: input.m8Results.map((result) => result.resultId),
      ingestion: input.akpIngestion,
      limitation: input.transport.limitation,
    },
    athenaosReal: {
      kind: 'athenasignal.m8.athenaos_real.v1',
      generatedAt: input.generatedAt,
      engines: input.realEngines,
      realResearch: input.realResearch,
      replayedResults: m7Results,
      m8Results: input.m8Results,
      note:
        'Los resultados M8 provienen del worker de investigación en modo replay (grabaciones reales ' +
        'M6/M7/M8 de Ollama) o, si falta grabación, del fallback determinista seguro. Las invocaciones ' +
        'a AthenaOS/AKP/Ubuntu son reales y quedan registradas en engines.invocations.',
    },
    feedbackUpdates: {
      kind: 'athenasignal.m8.feedback_updates.v1',
      generatedAt: input.generatedAt,
      updates: feedback,
      byChange: countChanges(feedback),
    },
    epistemicResolutions: {
      kind: 'athenasignal.m8.epistemic_resolutions.v1',
      generatedAt: input.generatedAt,
      resolutions,
      byStatus: input.ledger.byStatus(),
    },
    contradictions: {
      kind: 'athenasignal.m8.contradictions.v1',
      generatedAt: input.generatedAt,
      contradictions,
      resolved: contradictions.filter((entry) => entry.kind === 'RESOLVED').length,
      conserved: contradictions.filter((entry) => entry.kind === 'CONSERVED').length,
    },
    distributed: buildDistributed(input),
    recoveryEvents: {
      kind: 'athenasignal.m8.recovery_events.v1',
      generatedAt: input.generatedAt,
      events: input.recovery,
      byKind: countBy(input.recovery, (event) => event.kind),
    },
    idempotency: {
      kind: 'athenasignal.m8.idempotency.v1',
      generatedAt: input.generatedAt,
      records: input.idempotency,
      noOps: input.idempotency.filter((record) => record.noOp).length,
      attempted: input.idempotency.length,
    },
    provenance: input.provenance,
    handoffTrace: input.handoffTrace,
    metrics,
    observability: buildObservability(input),
    cost: buildCost(input, feedback),
    humanReview: buildHumanReview(input, contradictions, results),
  };
}

function buildOperationTimeline(input: M8ArtifactInput): M8OperationTimeline {
  const waves = input.scheduler.ticks.map((tick, index) => ({
    wave: index + 1,
    runId: tick.processId,
    tick: tick.tick,
    host: tick.host,
    startedAt: tick.startedAt,
    endedAt: tick.endedAt,
    candidates: [] as string[],
    resultIds: [] as string[],
    transitionIds: [] as string[],
    feedbackIds: [] as string[],
    notes: `Tick sostenido ${tick.tick} (${tick.cycleId}) con ${tick.sourcesObserved} fuentes observadas.`,
  }));
  for (const result of input.m8Results) {
    const wave = waves[result.wave - 1] ?? waves[0];
    if (!wave) continue;
    wave.candidates.push(result.candidateId);
    wave.resultIds.push(result.resultId);
  }
  for (const update of input.m8Feedback) {
    const match = waves.find((wave) => wave.resultIds.includes(update.resultId));
    if (match) match.feedbackIds.push(update.updateId);
  }
  for (const transition of input.ledger.all().flatMap((resolution) => resolution.statusHistory)) {
    if (transition.wave < 1) continue;
    const match = waves[transition.wave - 1];
    if (match) match.transitionIds.push(transition.transitionId);
  }
  return {
    kind: 'athenasignal.m8.operation_timeline.v1',
    generatedAt: input.generatedAt,
    windowId: input.scheduler.windowId,
    ticks: input.scheduler.ticks,
    researchWaves: waves,
    epistemicTransitions: input.ledger.all().flatMap((resolution) => resolution.statusHistory),
    m6Runs: input.m7.state.m6.runs,
    m6Loop: input.m7.state.m6.loop,
  };
}

function buildDistributed(input: M8ArtifactInput): M8Artifacts['distributed'] {
  const base = input.m7.state.m6.distribution;
  const ubuntu = input.realEngines.distributed.ubuntu;
  const macmini = input.realEngines.distributed.macmini;
  return {
    ...base,
    degraded: !ubuntu.reachable || !macmini.reachable,
    ubuntuReachable: ubuntu.reachable,
    macminiReachable: macmini.reachable,
    documented: [ubuntu, macmini],
  };
}

function buildMetrics(input: M8ArtifactInput, contradictions: M8Artifacts['contradictions']['contradictions']): M8Metrics {
  const { corpus, radar, scheduler, ledger } = input;
  const resolutions = ledger.all();
  const transitions = resolutions.flatMap((resolution) => resolution.statusHistory);
  const m7Results = input.m7.artifacts.athenaosResults.results;
  const results = [...m7Results, ...input.m8Results];
  const feedback = [...input.m7.artifacts.feedbackUpdates.updates, ...input.m8Feedback];
  const claims = results.flatMap((result) => result.claims);
  const byRoute = countBy(input.routing, (decision) => decision.route);
  const cyclesProcessed = radar.cyclesProcessed;
  const inputsObserved = corpus.cycles.reduce((sum, cycle) => sum + cycle.sourceIds.length, 0);
  const m8Cycles = corpus.cycles.filter((cycle) => cycle.cycleId.startsWith('m8-cycle-'));
  const avgTickMs = scheduler.ticks.length
    ? Number((scheduler.durationMs / scheduler.ticks.length).toFixed(3))
    : 0;
  const evidenceDriven = transitions.filter(
    (transition) => transition.wave >= 1 && transition.evidenceRefs.length > 0
  ).length;
  const candidates = Object.keys(radar.candidates).length;
  const realEngineInvocations = input.realEngines.invocations.filter((entry) => entry.status === 'OK').length;
  const ubuntu = input.realEngines.distributed.ubuntu;
  const macmini = input.realEngines.distributed.macmini;
  const processes = scheduler.processes.length;
  const hosts = new Set(scheduler.processes.map((process) => process.host)).size;
  const feedbackByKind = countBy(input.recovery, (event) => event.kind);

  return {
    kind: 'athenasignal.m8.metrics.v1',
    generatedAt: input.generatedAt,
    window: {
      startedAt: scheduler.startedAt,
      endedAt: scheduler.endedAt,
      durationMs: scheduler.durationMs,
      ticks: scheduler.ticks.length,
      processes,
      hosts,
    },
    scale: {
      sources: corpus.sources.length,
      uniqueSources: Object.keys(radar.processedSources).length,
      baseM7Sources: corpus.baseM7SourceCount,
      m8Sources: corpus.m8SourceIds.length,
      m7Sources: corpus.m7SourceIds.length,
      baseM6Sources: corpus.baseM6SourceCount,
      cycles: corpus.cycles.length,
      cyclesProcessed: cyclesProcessed.length,
      inputsObserved,
      signalsTracked: Object.keys(radar.signals).length,
      clusters: Object.keys(radar.clusters).length,
      candidates,
    },
    sustained: {
      ticks: scheduler.ticks.length,
      ticksCompleted: scheduler.ticks.filter((tick) => tick.status === 'COMPLETED').length,
      restarts: scheduler.processes.reduce((sum, process) => sum + process.restarts, 0),
      resumePoints: scheduler.processes.filter((process) => process.resumedFrom).length,
      observationCycles: m8Cycles.filter((cycle) => cyclesProcessed.includes(cycle.cycleId)).length,
      newSignals: radar.eventCounts.NEW ?? 0,
      knownSignals: radar.eventCounts.KNOWN ?? 0,
      duplicateSources: radar.eventCounts.DUPLICATE ?? 0,
      researchWaves: new Set(input.m8Results.map((result) => result.wave)).size,
      candidatesResearched: new Set(input.m8Results.map((result) => result.candidateId)).size,
    },
    epistemic: {
      resolutions: resolutions.length,
      transitions: transitions.length,
      evidenceDriven,
      confirmed: resolutions.filter((resolution) => resolution.currentStatus === 'CONFIRMED').length,
      refuted: resolutions.filter((resolution) => resolution.currentStatus === 'REFUTED').length,
      inconclusive: resolutions.filter((resolution) => resolution.currentStatus === 'INCONCLUSIVE').length,
      closedConfirmed: resolutions.filter((resolution) => resolution.currentStatus === 'CLOSED_CONFIRMED').length,
      closedRefuted: resolutions.filter((resolution) => resolution.currentStatus === 'CLOSED_REFUTED').length,
      reopened: transitions.filter((transition) => transition.to === 'REOPENED').length,
      demoted: resolutions.filter((resolution) => resolution.currentStatus === 'DEMOTED').length,
      promoted: resolutions.filter((resolution) => resolution.currentStatus === 'PROMOTED').length,
      discarded: resolutions.filter((resolution) => resolution.currentStatus === 'DISCARDED').length,
      researchable: resolutions.filter((resolution) => resolution.currentStatus === 'RESEARCHABLE').length,
      byStatus: countBy(resolutions, (resolution) => resolution.currentStatus),
      byVerdict: {
        CONFIRMED: resolutions.filter((resolution) => resolution.verdict === 'CONFIRMED').length,
        REFUTED: resolutions.filter((resolution) => resolution.verdict === 'REFUTED').length,
        INCONCLUSIVE: resolutions.filter((resolution) => resolution.verdict === 'INCONCLUSIVE').length,
      },
    },
    loop: {
      waves: scheduler.ticks.length,
      runs: input.m7.state.m6.runs.length + scheduler.processes.length,
      processes: processes + new Set(input.m7.state.m6.runs.map((run) => run.processId)).size,
      hosts,
      handoffs: input.m8Results.length,
      researchResults: results.length,
      feedbackUpdates: feedback.length,
    },
    research: {
      results: results.length,
      m7Results: m7Results.length,
      m8Results: input.m8Results.length,
      confirmed: results.filter((result) => result.status === 'RESEARCHED_CONFIRMED').length,
      refuted: results.filter((result) => result.status === 'RESEARCHED_REFUTED').length,
      inconclusive: results.filter((result) => result.status === 'RESEARCHED_INCONCLUSIVE').length,
      realResponses: results.filter((result) => !result.deterministic).length,
      deterministicResponses: results.filter((result) => result.deterministic).length,
      replayMisses: input.missingRecordings.length,
      claims: claims.length,
      evidenceRefs: results.reduce((sum, result) => sum + result.evidence.length, 0),
      providers: unique(results.map((result) => result.provider)),
    },
    contradictions: {
      total: contradictions.length,
      resolved: contradictions.filter((entry) => entry.kind === 'RESOLVED').length,
      conserved: contradictions.filter((entry) => entry.kind === 'CONSERVED').length,
    },
    provenance: {
      edges: input.provenance.edges.length,
      completeChains: input.provenance.completeChains,
      missingChains: input.provenance.missingChains.length,
    },
    distributed: {
      nodesUp: input.realEngines.invocations.filter((entry) => entry.status === 'OK').length,
      nodesDown: input.realEngines.invocations.filter((entry) => entry.status !== 'OK').length,
      degraded: !ubuntu.reachable || !macmini.reachable,
      remoteEscalations: byRoute.REMOTE_ESCALATION ?? 0,
      ubuntuReachable: ubuntu.reachable,
      macminiReachable: macmini.reachable,
      realEngineInvocations,
    },
    recovery: { events: input.recovery.length, byKind: feedbackByKind },
    idempotency: {
      noOps: input.idempotency.filter((record) => record.noOp).length,
      attempted: input.idempotency.length,
    },
    performance: {
      costUnits:
        (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0) + 4 * (byRoute.REMOTE_ESCALATION ?? 0),
      localCalls: (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0),
      remoteCalls: byRoute.REMOTE_ESCALATION ?? 0,
      deterministicCalls: byRoute.DETERMINISTIC_FALLBACK ?? 0,
      inputsPerTick: scheduler.ticks.length
        ? Number((inputsObserved / scheduler.ticks.length).toFixed(3))
        : 0,
      avgTickMs,
    },
    quality: {
      resolutionCoverage: candidates
        ? Number((resolutions.filter((resolution) => resolution.researchResultIds.length > 0).length / candidates).toFixed(3))
        : 0,
      evidenceDrivenRate: transitions.length ? Number((evidenceDriven / transitions.length).toFixed(3)) : 0,
      provenanceCoverage: candidates
        ? Number((input.provenance.completeChains / candidates).toFixed(3))
        : 0,
      sustainedTicksCompleted: scheduler.ticks.filter((tick) => tick.status === 'COMPLETED').length,
      researchResponseRate: scheduler.ticks.length
        ? Number((input.m8Results.length / scheduler.ticks.length).toFixed(3))
        : 0,
    },
    falsePositiveObservations: [],
  };
}

function buildBenchmark(input: M8ArtifactInput, contradictions: M8Artifacts['contradictions']['contradictions']): M8Artifacts['benchmark'] {
  const { radar, corpus, scheduler, ledger, realEngines } = input;
  const resolutions = ledger.all();
  const transitions = resolutions.flatMap((resolution) => resolution.statusHistory);
  const verdicts = resolutions.map((resolution) => resolution.verdict);
  const statuses = new Set(resolutions.map((resolution) => resolution.currentStatus));
  const recoveryKinds = new Set(input.recovery.map((event) => event.kind));
  const okInvocations = realEngines.invocations.filter((entry) => entry.status === 'OK').length;
  const m8CyclesProcessed = radar.cyclesProcessed.some((cycleId) => cycleId.startsWith('m8-cycle-'));

  const observedById: Record<string, boolean> = {
    SUSTAINED_WINDOW: scheduler.ticks.length > 1 && scheduler.durationMs > 0,
    NEW_SIGNAL: (radar.eventCounts.NEW ?? 0) > 0,
    KNOWN: (radar.eventCounts.KNOWN ?? 0) > 0,
    DUPLICATE: (radar.eventCounts.DUPLICATE ?? 0) > 0,
    RELATED: (radar.eventCounts.RELATED ?? 0) > 0,
    SCALE: corpus.sources.length >= 1000,
    CANDIDATE_RESEARCH: input.m8Results.length > 0,
    CONFIRMED: verdicts.includes('CONFIRMED'),
    REFUTED: verdicts.includes('REFUTED'),
    CLOSURE: statuses.has('CLOSED_CONFIRMED') || statuses.has('CLOSED_REFUTED'),
    REOPENING: transitions.some((transition) => transition.to === 'REOPENED'),
    PROMOTION: statuses.has('PROMOTED') || transitions.some((transition) => transition.to === 'PROMOTED'),
    DEMOTION: statuses.has('DEMOTED') || transitions.some((transition) => transition.to === 'DEMOTED'),
    CONTRADICTION: contradictions.length > 0,
    FEEDBACK_UPDATE: input.m8Feedback.length > 0,
    REAL_ENGINE: okInvocations > 0,
    DISTRIBUTED_HONESTY: realEngines.distributed.ubuntu.reachable && !realEngines.distributed.macmini.reachable,
    NODE_FAILURE: recoveryKinds.has('NODE_DOWN'),
    PROCESS_RESTART: recoveryKinds.has('PROCESS_RESTART'),
    LLM_FAILURE:
      recoveryKinds.has('LLM_FALLBACK') ||
      recoveryKinds.has('TIMEOUT') ||
      recoveryKinds.has('INVALID_RESPONSE'),
    IDEMPOTENCY: input.idempotency.some((record) => record.noOp),
    PROVENANCE: input.provenance.completeChains > 0,
    EPISTEMIC_HISTORY:
      transitions.filter((transition) => transition.wave >= 1).length > 0 &&
      transitions.filter((transition) => transition.wave >= 1).every((transition) => transition.evidenceRefs.length > 0) &&
      m8CyclesProcessed,
  };

  const entries = M8_BENCHMARK_CLASSES.map((definition) => {
    const observed = observedById[definition.id] ?? false;
    return {
      id: definition.id,
      description: definition.description,
      observed,
      evidence: observed ? definition.check : `NO OBSERVADO: ${definition.check}`,
    };
  });
  const observedCount = entries.filter((entry) => entry.observed).length;
  return {
    kind: 'athenasignal.m8.benchmark.v1',
    generatedAt: input.generatedAt,
    entries,
    coverage: Number((observedCount / entries.length).toFixed(3)),
    falsePositiveObservations: entries.filter((entry) => !entry.observed).map((entry) => entry.id),
  };
}

function buildContradictions(input: M8ArtifactInput): M8Artifacts['contradictions']['contradictions'] {
  const contradictions: M8Artifacts['contradictions']['contradictions'] = [];
  const seen = new Set<string>();
  for (const resolution of input.ledger.all()) {
    const refuteTransitions = resolution.statusHistory.filter((transition) => transition.stance === 'REFUTE');
    const refuted = resolution.verdict === 'REFUTED';
    if (!resolution.contradictions.length && !refuted) continue;
    const supporting = resolution.statusHistory
      .filter((transition) => transition.stance === 'SUPPORT')
      .flatMap((transition) => transition.evidenceRefs);
    const contradicting = refuteTransitions.flatMap((transition) => transition.evidenceRefs);
    contradictions.push({
      contradictionId: `ct-m8-${resolution.candidateId}`,
      candidateId: resolution.candidateId,
      clusterId: resolution.clusterId,
      kind: refuted ? 'RESOLVED' : 'CONSERVED',
      statements: resolution.contradictions.length
        ? resolution.contradictions.slice(0, 10)
        : refuteTransitions
            .flatMap((transition) => transition.claims.map((claim) => `AthenaOS refuta: ${claim.statement}`))
            .slice(0, 10),
      supportingRefs: unique(supporting),
      contradictingRefs: unique(contradicting.length ? contradicting : resolution.evidenceRefs),
      resolution: refuted
        ? 'Resuelta por refutación basada en evidencia: la afirmación no se sostiene.'
        : 'Conservada explícitamente: la tensión editorial permanece y bloquea promociones.',
      detectedAtWave: refuteTransitions[0]?.wave ?? resolution.statusHistory[0]?.wave ?? 1,
    });
    seen.add(resolution.candidateId);
  }
  for (const cluster of Object.values(input.radar.clusters)) {
    if (!cluster.contradiction) continue;
    const candidateIds = Object.values(input.radar.candidates)
      .filter((candidate) => candidate.clusterId === cluster.clusterId)
      .map((candidate) => candidate.candidateId);
    if (candidateIds.some((id) => seen.has(id))) continue;
    contradictions.push({
      contradictionId: `ct-m8-cluster-${cluster.clusterId}`,
      candidateId: candidateIds[0] ?? `cluster:${cluster.clusterId}`,
      clusterId: cluster.clusterId,
      kind: 'CONSERVED',
      statements: cluster.contradictionDetails.slice(0, 10),
      supportingRefs: [...cluster.evidenceUrls],
      contradictingRefs: [],
      resolution: 'Conservada: contradicción detectada por el radar sin resolución de investigación.',
      detectedAtWave: 0,
    });
  }
  return contradictions.sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));
}

function buildObservability(input: M8ArtifactInput): M8Observability {
  const resolutions = input.ledger.all();
  const transitions = resolutions.flatMap((resolution) => resolution.statusHistory);
  const byRoute = countBy(input.routing, (decision) => decision.route);
  return {
    kind: 'athenasignal.m8.observability.v1',
    generatedAt: input.generatedAt,
    windowId: input.scheduler.windowId,
    discovered: {
      sources: input.corpus.sources.length,
      uniqueSources: Object.keys(input.radar.processedSources).length,
      signals: Object.keys(input.radar.signals).length,
      clusters: Object.keys(input.radar.clusters).length,
      candidates: Object.keys(input.radar.candidates).length,
    },
    epistemicBoard: input.ledger.byStatus(),
    scheduler: {
      ticks: input.scheduler.ticks.length,
      processes: input.scheduler.processes.length,
      restarts: input.scheduler.processes.reduce((sum, process) => sum + process.restarts, 0),
      resumes: input.scheduler.processes.filter((process) => process.resumedFrom).length,
    },
    sentToAthenaOs: unique(input.m8Results.map((result) => result.candidateId)),
    returned: input.m8Results.map((result) => result.resultId),
    changed: transitions.map((transition) => ({
      candidateId: transition.candidateId,
      from: transition.from,
      to: transition.to,
      why: transition.reason,
    })),
    failures: { recoveryEvents: input.recovery.length, byKind: countBy(input.recovery, (event) => event.kind) },
    pending: input.corpus.cycles
      .filter((cycle) => cycle.cycleId.startsWith('m8-cycle-') && !input.radar.cyclesProcessed.includes(cycle.cycleId))
      .map((cycle) => cycle.cycleId),
    cost: {
      llmCalls: input.routing.length,
      localCalls: (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0),
      remoteCalls: byRoute.REMOTE_ESCALATION ?? 0,
      deterministicCalls: byRoute.DETERMINISTIC_FALLBACK ?? 0,
      estimatedCostUnits:
        (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0) + 4 * (byRoute.REMOTE_ESCALATION ?? 0),
    },
  };
}

function buildCost(input: M8ArtifactInput, feedback: FeedbackUpdate[]): M8Cost {
  const byRoute = countBy(input.routing, (decision) => decision.route);
  const byProvider: Record<string, number> = {};
  const byStage: Record<string, Record<string, number>> = {};
  for (const decision of input.routing) {
    byProvider[decision.provider] = (byProvider[decision.provider] ?? 0) + 1;
    byStage[decision.stage] = byStage[decision.stage] ?? {};
    byStage[decision.stage][decision.route] = (byStage[decision.stage][decision.route] ?? 0) + 1;
  }
  return {
    kind: 'athenasignal.m8.cost.v1',
    generatedAt: input.generatedAt,
    llmCalls: input.routing.length,
    byProvider: sortRecord(byProvider),
    byRoute: sortRecord(byRoute),
    byStage,
    localCalls: (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0),
    remoteCalls: byRoute.REMOTE_ESCALATION ?? 0,
    deterministicCalls: byRoute.DETERMINISTIC_FALLBACK ?? 0,
    replayHits: input.routing.filter((decision) => !decision.deterministic && !decision.fallback).length,
    replayMisses: input.missingRecordings.length,
    estimatedCostUnits:
      (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0) + 4 * (byRoute.REMOTE_ESCALATION ?? 0),
    costModel: 'proxy determinista: 1 unidad local, 4 remotas, 0 deterministas (no factura real).',
    limitation:
      'No hay facturación real expuesta por el endpoint local; el coste es un proxy de routing ' +
      `documentado (${feedback.length} feedbacks aplicados).`,
  };
}

function buildHumanReview(
  input: M8ArtifactInput,
  contradictions: M8Artifacts['contradictions']['contradictions'],
  results: M7ResearchResult[]
): M8HumanReviewPacket {
  const resolutions = input.ledger.all();
  const confirmed = resolutions.find((resolution) => resolution.verdict === 'CONFIRMED');
  const refuted = resolutions.find((resolution) => resolution.verdict === 'REFUTED');
  const transitions = resolutions.flatMap((resolution) => resolution.statusHistory);
  const closure = resolutions.find(
    (resolution) => resolution.currentStatus === 'CLOSED_CONFIRMED' || resolution.currentStatus === 'CLOSED_REFUTED'
  );
  const reopening = transitions.find((transition) => transition.to === 'REOPENED');
  const demotion = resolutions.find((resolution) => resolution.currentStatus === 'DEMOTED');
  const promotion = resolutions.find((resolution) => resolution.currentStatus === 'PROMOTED');
  const failure = input.recovery.find(
    (event) => event.kind === 'NODE_DOWN' || event.kind === 'PROCESS_RESTART' || event.kind === 'INVALID_RESPONSE'
  );
  const contradiction = contradictions[0] ?? null;
  const realInvocations = input.realEngines.invocations.filter(
    (entry) => entry.engine === 'ubuntu-node' || entry.engine === 'athenaos'
  );

  return {
    kind: 'athenasignal.m8.human_review_packet.v1',
    generatedAt: input.generatedAt,
    windowId: input.scheduler.windowId,
    durationMs: input.scheduler.durationMs,
    rubric: M8_RUBRIC,
    timeline: input.scheduler.ticks
      .slice(-12)
      .map((tick) => `[tick ${tick.tick}] ${tick.cycleId} ${tick.status} (${tick.sourcesObserved} fuentes, ${tick.candidates} candidates, ${tick.recovery.length} recovery)`),
    bestStory: confirmed
      ? `${confirmed.candidateId}: sostenido a lo largo del ciclo completo; estado ` +
        `${confirmed.statusHistory.map((transition) => transition.to).join(' → ')} y veredicto ${confirmed.verdict}.`
      : 'Sin caso confirmado; el sistema conservó la incertidumbre sin elevar afirmaciones a hecho.',
    worstStory: refuted
      ? `${refuted.candidateId}: la investigación refutó la afirmación (${refuted.currentStatus}); ` +
        'la evidencia contradictoria quedó registrada y bloqueó la promoción.'
      : 'Sin caso refutado; se conservó la incertidumbre.',
    confirmedCase: confirmed
      ? {
          candidateId: confirmed.candidateId,
          why: confirmed.statusHistory.at(-1)?.reason ?? confirmed.reason,
          evidenceRefs: confirmed.evidenceRefs.slice(0, 10),
        }
      : null,
    refutedCase: refuted
      ? {
          candidateId: refuted.candidateId,
          why: refuted.statusHistory.at(-1)?.reason ?? refuted.reason,
          evidenceRefs: refuted.evidenceRefs.slice(0, 10),
        }
      : null,
    uncertainCase: resolutions.some((resolution) => resolution.verdict === 'INCONCLUSIVE')
      ? {
          candidateId: resolutions.find((resolution) => resolution.verdict === 'INCONCLUSIVE')!.candidateId,
          why: 'La evidencia acumulada no basta para confirmar ni refutar; se conserva la incertidumbre.',
        }
      : null,
    closedCases: resolutions
      .filter(
        (resolution) =>
          resolution.currentStatus === 'CLOSED_CONFIRMED' || resolution.currentStatus === 'CLOSED_REFUTED'
      )
      .map((resolution) => ({
        candidateId: resolution.candidateId,
        status: resolution.currentStatus,
        why: resolution.statusHistory.at(-1)?.reason ?? resolution.reason,
      })),
    radarMutations: input.m8Feedback.map((update) => ({
      candidateId: update.candidateId,
      changes: update.changes,
      why: update.reason,
    })),
    promotion: promotion
      ? { candidateId: promotion.candidateId, why: promotion.statusHistory.at(-1)?.reason ?? promotion.reason }
      : null,
    demotion: demotion
      ? { candidateId: demotion.candidateId, why: demotion.statusHistory.at(-1)?.reason ?? demotion.reason }
      : null,
    reopening: reopening ? { candidateId: reopening.candidateId, why: reopening.reason } : null,
    closure: closure
      ? {
          candidateId: closure.candidateId,
          status: closure.currentStatus,
          why: closure.statusHistory.at(-1)?.reason ?? closure.reason,
        }
      : null,
    ubuntuExecution: realInvocations,
    realResearch: input.realResearch,
    akpIngestion: input.akpIngestion,
    failoverRecovery: failure ? { recoveryId: failure.recoveryId, kind: failure.kind, why: failure.detail } : null,
    akpToAthenaOsToAkpTrace: input.handoffTrace.trace,
    metrics: {
      quality: estimateQuality(resolutions),
      avgTickMs: input.scheduler.ticks.length
        ? Number((input.scheduler.durationMs / input.scheduler.ticks.length).toFixed(3))
        : 0,
      costUnits: 0,
      llmCalls: input.routing.length,
      sources: input.corpus.sources.length,
      candidates: Object.keys(input.radar.candidates).length,
    },
    limitations: [
      'La operación sostenida es determinista y offline en la aceptación: las invocaciones reales a ' +
        'AthenaOS/AKP/Ubuntu se graban una vez y se reproducen.',
      `Mac mini ${input.realEngines.distributed.macmini.address} no alcanzable: documentado, no simulado.`,
      'El coste es un proxy de routing; no hay facturación real del endpoint local.',
      `Resultados M8 totales: ${results.length}.`,
    ],
  };
}

function estimateQuality(
  resolutions: Array<{ statusHistory: Array<{ evidenceRefs: string[] }> }>
): number {
  const transitions = resolutions.flatMap((resolution) => resolution.statusHistory);
  if (!transitions.length) return 0;
  const withEvidence = transitions.filter((transition) => transition.evidenceRefs.length > 0).length;
  return Number((withEvidence / transitions.length).toFixed(3));
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const k = key(value);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return sortRecord(counts);
}

function countChanges(feedback: FeedbackUpdate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const update of feedback) for (const change of update.changes) counts[change] = (counts[change] ?? 0) + 1;
  return sortRecord(counts);
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export type { M6State, RadarState, TopologyNode, M8RealEngines, SustainedProcess };
