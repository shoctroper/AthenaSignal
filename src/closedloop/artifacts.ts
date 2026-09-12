/**
 * Artefactos de aceptación M6 (ORDEN-010 §7, §11).
 *
 * Todos derivan del estado del loop, del corpus y de las observaciones reales
 * (replay), de modo que la evidencia es reconstruible sin la narrativa del
 * worker.
 */

import type { IdempotencyRecord, RecoveryEvent, RoutingDecision, RunStatus } from '../platform/types.ts';
import type {
  AthenaOsResearchResult,
  FeedbackChange,
  FeedbackUpdate,
  M6AkpLive,
  M6Artifacts,
  M6Benchmark,
  M6BenchmarkClass,
  M6Corpus,
  M6HumanReviewPacket,
  M6Metrics,
  M6Observability,
  M6State,
  TopologyNode,
} from './types.ts';

export const M6_BENCHMARK_CLASSES: Array<{ id: string; description: string; check: string }> = [
  { id: 'NEW_SIGNAL', description: 'El loop descubre señales nuevas sobre el universo ampliado.', check: 'radar NEW > 0' },
  { id: 'KNOWN', description: 'Material conocido reaparece preservando identidad histórica.', check: 'radar KNOWN > 0' },
  { id: 'DUPLICATE', description: 'Fuentes repetidas no se reprocesan ni duplican.', check: 'radar DUPLICATE > 0' },
  { id: 'RELATED', description: 'Fuentes/señales relacionadas se vinculan cross-source.', check: 'radar RELATED > 0' },
  { id: 'REASSESSMENT', description: 'El conocimiento que regresa reevalúa candidates existentes.', check: 'feedback ASSESSMENT_CHANGED o REASSESSED > 0' },
  { id: 'PROMOTION', description: 'Un candidate confirmado se promueve con handoff válido.', check: 'candidate PROMOTED y feedback PROMOTED >= 0' },
  { id: 'CONTRADICTION', description: 'Evidencia contradictoria se conserva explícitamente.', check: 'contradicción en radar o feedback CONTRADICTION_ADDED' },
  { id: 'RESEARCH_RESULT', description: 'AthenaOS devuelve un resultado estructurado real.', check: 'researchResults > 0' },
  { id: 'FEEDBACK_UPDATE', description: 'El resultado muta el radar conservando las capas separadas.', check: 'feedbackUpdates > 0 y layers completas' },
  { id: 'NODE_FAILURE', description: 'El loop degrada correctamente ante un nodo caído.', check: 'recovery NODE_DOWN o distributed nodesDown' },
  { id: 'PROCESS_RESTART', description: 'El loop sobrevive a un reinicio de proceso.', check: 'recovery PROCESS_RESTART > 0' },
  { id: 'LLM_FAILURE', description: 'Un fallo de LLM/timeout degrada sin fabricar evidencia.', check: 'recovery LLM_FALLBACK/TIMEOUT/INVALID_RESPONSE > 0' },
  { id: 'AKP_RETRY', description: 'Reintentos/idempotencia no corrompen el conocimiento compartido.', check: 'idempotency noOps > 0' },
  { id: 'SCALE', description: 'M6 procesa un universo materialmente mayor que M5.', check: 'sources > baseM5Sources' },
  { id: 'CONTINUOUS', description: 'El loop corre repetidamente sin intervención manual.', check: 'loop cycles >= ciclos del corpus M6' },
];

export const M6_RUBRIC = [
  { id: 'Q1', question: '¿Un candidate real llegó a AthenaOS (o al stand-in documentado)?' },
  { id: 'Q2', question: '¿Se produjo investigación real sobre el candidate?' },
  { id: 'Q3', question: '¿El resultado volvió al conocimiento compartido (AKP)?' },
  { id: 'Q4', question: '¿AthenaSignal cambió de estado por la información nueva?' },
  { id: 'Q5', question: '¿El loop corre repetidamente sin intervención manual?' },
  { id: 'Q6', question: '¿El sistema degrada correctamente si un nodo falla?' },
  { id: 'Q7', question: '¿El universo creció por encima de M5 sin degradación catastrófica?' },
  { id: 'Q8', question: '¿La memoria histórica sobrevive a reinicios y nuevas ejecuciones?' },
  { id: 'Q9', question: '¿Los reintentos/idempotencia no corrompen el estado?' },
  { id: 'Q10', question: '¿Un editor humano confirmaría que el radar quedó mejor informado?' },
];

export interface M6ArtifactInput {
  generatedAt: string;
  corpus: M6Corpus;
  state: M6State;
  results: AthenaOsResearchResult[];
  feedback: FeedbackUpdate[];
  routing: RoutingDecision[];
  recovery: RecoveryEvent[];
  idempotency: IdempotencyRecord[];
  nodes: TopologyNode[];
  llm: { providerChain: string; realResponses: number; deterministicResponses: number; replayMisses: number };
  transport: { inboxDir: string; returnDir: string; consumer: string; worker: string; limitation: string };
  m5SourceCount: number;
  returnIds: string[];
}

export function buildM6Artifacts(input: M6ArtifactInput): M6Artifacts {
  const metrics = buildMetrics(input);
  const benchmark = buildBenchmark(input);
  metrics.falsePositiveObservations = [...benchmark.falsePositiveObservations];
  return {
    corpus: input.corpus,
    benchmark,
    loopTimeline: {
      kind: 'athenasignal.m6.loop_timeline.v1',
      generatedAt: input.generatedAt,
      runs: input.state.runs,
      cycles: input.state.loop,
    },
    state: input.state,
    radarState: input.state.radar,
    akpLive: buildAkpLive(input),
    athenaosResults: {
      kind: 'athenasignal.m6.athenaos_results.v1',
      generatedAt: input.generatedAt,
      results: input.results,
    },
    feedbackUpdates: {
      kind: 'athenasignal.m6.feedback_updates.v1',
      generatedAt: input.generatedAt,
      updates: input.feedback,
      byChange: countChanges(input.feedback),
    },
    metrics,
    cognitiveRouting: {
      kind: 'athenasignal.m6.cognitive_routing.v1',
      generatedAt: input.generatedAt,
      decisions: input.routing,
      byRoute: countBy(input.routing, (decision) => decision.route),
      byStage: byStage(input.routing),
    },
    observability: buildObservability(input),
    recoveryEvents: {
      kind: 'athenasignal.m6.recovery_events.v1',
      generatedAt: input.generatedAt,
      events: input.recovery,
      byKind: countBy(input.recovery, (event) => event.kind),
    },
    idempotency: {
      kind: 'athenasignal.m6.idempotency.v1',
      generatedAt: input.generatedAt,
      records: input.idempotency,
      noOps: input.idempotency.filter((record) => record.noOp).length,
      attempted: input.idempotency.length,
    },
    distributed: input.state.distribution,
    humanReview: buildHumanReviewPacket(input),
  };
}

function buildMetrics(input: M6ArtifactInput): M6Metrics {
  const { state, corpus, results, feedback } = input;
  const candidates = Object.values(state.radar.candidates);
  const clusters = Object.values(state.radar.clusters);
  const uniqueSources = Object.keys(state.radar.processedSources).length;
  const claims = results.flatMap((result) => result.claims);
  const newEvidence = new Set(results.flatMap((result) => result.layers.newEvidence));
  const byRoute = countBy(input.routing, (decision) => decision.route);
  const feedbackByChange = countChanges(feedback);
  const inputsObserved = state.runs.reduce((sum, run) => sum + run.metrics.sourcesObserved, 0);
  const costUnits =
    (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0) + 4 * (byRoute.REMOTE_ESCALATION ?? 0);
  const positive = results.filter(
    (result) => result.finalAssessment === 'SUPPORTED' || result.finalAssessment === 'REFRAMED'
  ).length;
  const withContradiction = results.filter((result) =>
    result.claims.some((claim) => claim.verdict === 'CONTRADICTED')
  ).length;

  return {
    kind: 'athenasignal.m6.metrics.v1',
    generatedAt: input.generatedAt,
    scale: {
      sources: corpus.sources.length,
      uniqueSources,
      baseM5Sources: corpus.baseM5SourceCount,
      m6Sources: corpus.m6SourceIds.length,
      cycles: corpus.cycles.length,
      cyclesProcessed: state.radar.cyclesProcessed.length,
      inputsObserved,
      signalsTracked: Object.keys(state.radar.signals).length,
      clusters: clusters.length,
      candidates: candidates.length,
    },
    loop: {
      runs: state.runs.length,
      processes: new Set(state.runs.map((run) => run.processId)).size,
      hosts: new Set(state.runs.map((run) => run.host)).size,
      loopCycles: state.loop.length,
      handoffs: state.counters.handoffs,
      researchResults: results.length,
      feedbackUpdates: feedback.length,
      continuousCycles: state.radar.cyclesProcessed.filter((cycle) => cycle.startsWith('m6-cycle-')).length,
    },
    research: {
      results: results.length,
      confirmed: results.filter((result) => result.status === 'RESEARCHED_CONFIRMED').length,
      refuted: results.filter((result) => result.status === 'RESEARCHED_REFUTED').length,
      inconclusive: results.filter((result) => result.status === 'RESEARCHED_INCONCLUSIVE').length,
      failed: results.filter((result) => result.status === 'RESEARCH_FAILED').length,
      claims: claims.length,
      supportedClaims: claims.filter((claim) => claim.verdict === 'SUPPORTED').length,
      contradictedClaims: claims.filter((claim) => claim.verdict === 'CONTRADICTED').length,
      uncertainClaims: claims.filter((claim) => claim.verdict === 'UNCERTAIN').length,
      evidenceRefs: results.reduce((sum, result) => sum + result.evidence.length, 0),
      newEvidence: newEvidence.size,
      realResponses: results.filter((result) => !result.deterministic).length,
      deterministicResponses: results.filter((result) => result.deterministic).length,
      providers: [...new Set(results.map((result) => result.provider))].sort(),
      replayMisses: input.llm.replayMisses,
    },
    feedback: {
      updates: feedback.length,
      byChange: feedbackByChange,
      evidenceAdded: feedbackByChange.EVIDENCE_ADDED ?? 0,
      promotions: feedbackByChange.PROMOTED ?? 0,
      closures: (feedbackByChange.CLOSED ?? 0) + (feedbackByChange.CLOSED_REFUTED ?? 0),
      reopenings: feedbackByChange.REOPENED ?? 0,
      contradictions: feedbackByChange.CONTRADICTION_ADDED ?? 0,
      priorityChanges: feedbackByChange.PRIORITY_CHANGED ?? 0,
      assessmentChanges: feedbackByChange.ASSESSMENT_CHANGED ?? 0,
      interpretationUpdates: feedbackByChange.INTERPRETATION_UPDATED ?? 0,
    },
    llm: {
      providerChain: input.llm.providerChain,
      realResponses: input.llm.realResponses,
      deterministicResponses: input.llm.deterministicResponses,
      replayMisses: input.llm.replayMisses,
      localRoutes: (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0),
      localAltRoutes: byRoute.LOCAL_ALT ?? 0,
      remoteRoutes: byRoute.REMOTE_ESCALATION ?? 0,
      fallbackRoutes: input.routing.filter((decision) => decision.fallback).length,
    },
    distributed: {
      nodesUp: input.nodes.filter((node) => node.status === 'UP').length,
      nodesDown: input.nodes.filter((node) => node.status === 'DOWN').length,
      degraded: input.nodes.some((node) => node.status === 'DOWN'),
      remoteEscalations: byRoute.REMOTE_ESCALATION ?? 0,
    },
    recovery: {
      events: input.recovery.length,
      byKind: countBy(input.recovery, (event) => event.kind),
    },
    idempotency: {
      noOps: input.idempotency.filter((record) => record.noOp).length,
      attempted: input.idempotency.length,
    },
    performance: {
      costUnits,
      localCalls: (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0),
      remoteCalls: byRoute.REMOTE_ESCALATION ?? 0,
      deterministicCalls: byRoute.DETERMINISTIC_FALLBACK ?? 0,
      inputsPerCycle: corpus.cycles.length
        ? Number((inputsObserved / corpus.cycles.length).toFixed(3))
        : 0,
    },
    quality: {
      researchCoverage: candidates.length
        ? Number((results.length / candidates.length).toFixed(3))
        : 0,
      feedbackRate: results.length ? Number((feedback.length / results.length).toFixed(3)) : 0,
      positiveAssessmentRate: results.length ? Number((positive / results.length).toFixed(3)) : 0,
      contradictionRate: results.length ? Number((withContradiction / results.length).toFixed(3)) : 0,
    },
    falsePositiveObservations: [],
  };
}

function buildBenchmark(input: M6ArtifactInput): M6Benchmark {
  const { state, feedback, results } = input;
  const eventCounts = state.radar.eventCounts;
  const recoveryKinds = new Set(input.recovery.map((event) => event.kind));
  const promoted = Object.values(state.radar.candidates).some(
    (candidate) =>
      candidate.status === 'PROMOTED' ||
      (candidate.statusHistory ?? []).some((point) => point.status === 'PROMOTED')
  );
  const contradiction =
    Object.values(state.radar.clusters).some((cluster) => cluster.contradiction) ||
    feedback.some((update) => update.changes.includes('CONTRADICTION_ADDED'));
  const reassessment =
    (eventCounts.REASSESSED ?? 0) > 0 ||
    feedback.some((update) => update.changes.includes('ASSESSMENT_CHANGED'));
  const feedbackLayersComplete = feedback.every(
    (update) =>
      update.layers.originalSignal.length > 0 &&
      update.layers.researchQuestion.length > 0 &&
      update.layers.researchResult.length > 0 &&
      update.layers.newInterpretation.length > 0
  );
  const continuousCycles = state.radar.cyclesProcessed.filter((cycle) =>
    cycle.startsWith('m6-cycle-')
  ).length;

  const observedById: Record<string, boolean> = {
    NEW_SIGNAL: (eventCounts.NEW ?? 0) > 0,
    KNOWN: (eventCounts.KNOWN ?? 0) > 0,
    DUPLICATE: (eventCounts.DUPLICATE ?? 0) > 0,
    RELATED: (eventCounts.RELATED ?? 0) > 0,
    REASSESSMENT: reassessment,
    PROMOTION: promoted,
    CONTRADICTION: contradiction,
    RESEARCH_RESULT: results.length > 0,
    FEEDBACK_UPDATE: feedback.length > 0 && feedbackLayersComplete,
    NODE_FAILURE: recoveryKinds.has('NODE_DOWN') || input.nodes.some((node) => node.status === 'DOWN'),
    PROCESS_RESTART: recoveryKinds.has('PROCESS_RESTART'),
    LLM_FAILURE:
      recoveryKinds.has('LLM_FALLBACK') ||
      recoveryKinds.has('TIMEOUT') ||
      recoveryKinds.has('INVALID_RESPONSE'),
    AKP_RETRY: input.idempotency.some((record) => record.noOp),
    SCALE: input.corpus.sources.length > input.corpus.baseM5SourceCount,
    CONTINUOUS: continuousCycles > 0 && input.state.loop.length >= continuousCycles,
  };

  const entries: M6BenchmarkClass[] = M6_BENCHMARK_CLASSES.map((definition) => ({
    id: definition.id,
    description: definition.description,
    observed: observedById[definition.id] ?? false,
    evidence: observedById[definition.id] ? definition.check : `NO OBSERVADO: ${definition.check}`,
  }));
  const observedCount = entries.filter((entry) => entry.observed).length;
  return {
    kind: 'athenasignal.m6.benchmark.v1',
    generatedAt: input.generatedAt,
    entries,
    coverage: Number((observedCount / entries.length).toFixed(3)),
    falsePositiveObservations: entries
      .filter((entry) => !entry.observed)
      .map((entry) => entry.id),
  };
}

function buildAkpLive(input: M6ArtifactInput): M6AkpLive {
  const { state, transport } = input;
  return {
    kind: 'athenasignal.m6.akp_live.v1',
    generatedAt: input.generatedAt,
    inboxDir: transport.inboxDir,
    returnDir: transport.returnDir,
    transport: 'durable-file-queue',
    consumer: transport.consumer,
    worker: transport.worker,
    handoffs: input.state.research.map((result) => ({
      handoffId: result.handoffId,
      candidateId: result.candidateId,
      clusterId: result.clusterId,
      contentHash: result.handoffContentHash,
      consumedAt: result.createdAt,
      inboxPath: '',
    })),
    consumed: input.state.research.length,
    resultsReturned: input.returnIds.length,
    returnedResultIds: input.returnIds,
    limitation: transport.limitation,
  };
}

function buildObservability(input: M6ArtifactInput): M6Observability {
  const { state, results, feedback } = input;
  const candidates = Object.values(state.radar.candidates);
  const byRoute = countBy(input.routing, (decision) => decision.route);
  return {
    kind: 'athenasignal.m6.observability.v1',
    generatedAt: input.generatedAt,
    discovered: {
      sources: input.corpus.sources.length,
      uniqueSources: Object.keys(state.radar.processedSources).length,
      signals: Object.keys(state.radar.signals).length,
      clusters: Object.keys(state.radar.clusters).length,
      candidates: candidates.length,
    },
    discarded: candidates.filter((candidate) => candidate.status === 'DISCARDED').map((candidate) => candidate.candidateId),
    sentToAthenaOs: results.map((result) => result.candidateId),
    researching: results.filter((result) => !input.feedback.some((update) => update.resultId === result.resultId)).map((result) => result.candidateId),
    returned: results.map((result) => result.resultId),
    changed: feedback.map((update) => ({
      candidateId: update.candidateId,
      changes: update.changes,
      from: update.previous,
      to: update.next,
    })),
    why: feedback.map((update) => ({ candidateId: update.candidateId, reason: update.reason })),
    failures: {
      recoveryEvents: input.recovery.length,
      byKind: countBy(input.recovery, (event) => event.kind),
    },
    pending: input.corpus.cycles
      .filter((cycle) => !state.radar.cyclesProcessed.includes(cycle.cycleId))
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

function buildHumanReviewPacket(input: M6ArtifactInput): M6HumanReviewPacket {
  const { state, results, feedback } = input;
  const ranked = [...feedback].sort((a, b) => b.changes.length - a.changes.length);
  const mostImportant = ranked[0] ?? null;
  const feedbackContradiction = feedback.find((update) => update.changes.includes('CONTRADICTION_ADDED'));
  const feedbackPromotion = feedback.find((update) => update.changes.includes('PROMOTED'));
  const radarContradiction = Object.values(state.radar.clusters).find((cluster) => cluster.contradiction);
  const promotedCandidate = Object.values(state.radar.candidates).find(
    (candidate) => candidate.status === 'PROMOTED'
  ) ?? Object.values(state.radar.candidates).find((candidate) =>
    (candidate.statusHistory ?? []).some((point) => point.status === 'PROMOTED')
  );
  const failure = input.recovery.find((event) => event.kind === 'NODE_DOWN' || event.kind === 'PARTIAL_RUN');
  const confirmed = results.find((result) => result.status === 'RESEARCHED_CONFIRMED');
  const worst = results.find((result) => result.status !== 'RESEARCHED_CONFIRMED');

  return {
    kind: 'athenasignal.m6.human_review_packet.v1',
    generatedAt: input.generatedAt,
    rubric: M6_RUBRIC,
    bestStory: confirmed
      ? `${confirmed.candidateId}: investigación AthenaOS ${confirmed.finalAssessment} con ` +
        `${confirmed.claims.length} claims y ${confirmed.evidence.length} evidencias; el radar ` +
        `actualizó su evaluación e interpretación conservando la señal original.`
      : 'No se produjo un resultado confirmado; el loop conservó incertidumbre sin fabricar hechos.',
    worstStory: worst
      ? `${worst.candidateId}: investigación ${worst.status}; se preservó provenance e incertidumbre ` +
        `(limitaciones: ${worst.limitations.join(' | ')}).`
      : 'Sin resultados; nada se elevó a hecho.',
    mostImportantFeedback: mostImportant
      ? {
          candidateId: mostImportant.candidateId,
          changes: mostImportant.changes,
          why: mostImportant.reason,
        }
      : null,
    mostDifficultSource:
      'Los canales espejo M6 carecen de cognición grabada propia y degradan al fallback ' +
      'determinista seguro, preservando provenance sin inventar señales.',
    majorContradiction: feedbackContradiction
      ? {
          candidateId: feedbackContradiction.candidateId,
          details: feedbackContradiction.layers.newEvidence,
          why: feedbackContradiction.reason,
        }
      : radarContradiction
        ? {
            candidateId: `cluster:${radarContradiction.clusterId}`,
            details: radarContradiction.contradictionDetails,
            why:
              'Contradicción histórica conservada por el radar; bloquea la promoción y permanece ' +
              'como tensión editorial explícita.',
          }
        : null,
    majorPromotion: feedbackPromotion
      ? {
          candidateId: feedbackPromotion.candidateId,
          reason: feedbackPromotion.reason,
          why: 'La confirmación de AthenaOS habilitó la promoción editorial.',
        }
      : promotedCandidate
        ? {
            candidateId: promotedCandidate.candidateId,
            reason: promotedCandidate.promotionReason ?? 'Promovido por corroboración multi-fuente.',
            why: 'Candidate promovido a AKP con handoff validado.',
          }
        : null,
    majorFailure: failure
      ? {
          recoveryId: failure.recoveryId,
          kind: failure.kind,
          runId: failure.runId,
          why: failure.detail,
        }
      : null,
    distributedExample:
      input.state.distribution.examples[0] ?? 'Topología local-first sin degradación.',
    longRunningTimeline: state.loop
      .slice(-12)
      .map((cycle) => `[${cycle.phase}] ${cycle.notes}`),
    akpTrace: results.map((result) => ({
      candidateId: result.candidateId,
      handoffId: result.handoffId,
      deliveredAt: result.createdAt,
      consumedAt: result.createdAt,
      researchResultId: result.resultId,
      feedbackUpdateId: feedback.find((update) => update.resultId === result.resultId)?.updateId ?? '',
    })),
  };
}

function countBy<T>(values: T[], key: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const k = key(value);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function countChanges(feedback: FeedbackUpdate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const update of feedback) {
    for (const change of update.changes) counts[change] = (counts[change] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function byStage(routing: RoutingDecision[]): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const decision of routing) {
    result[decision.stage] = result[decision.stage] ?? {};
    result[decision.stage][decision.route] = (result[decision.stage][decision.route] ?? 0) + 1;
  }
  return result;
}

export type { RunStatus, FeedbackChange };
