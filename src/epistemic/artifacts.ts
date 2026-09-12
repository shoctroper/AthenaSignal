/**
 * Artefactos de aceptación M7 (ORDEN-011 §7, §8, §10).
 *
 * Todos derivan del ledger epistémico, del radar vivo, de los resultados de
 * investigación y del feedback. La evidencia es reconstruible sin la narrativa
 * del worker: cada estado tiene su transición y cada transición su evidencia.
 */

import type { IdempotencyRecord, RecoveryEvent, RoutingDecision } from '../platform/types.ts';
import type { RadarState } from '../radar/types.ts';
import type {
  AthenaOsResearchResult,
  FeedbackUpdate,
  M6State,
  TopologyNode,
} from '../closedloop/types.ts';
import type { EpistemicLedger } from './resolver.ts';
import type {
  EpistemicResolution,
  EpistemicStatus,
  M7AkpLive,
  M7Artifacts,
  M7Benchmark,
  M7BenchmarkClass,
  M7Contradiction,
  M7Corpus,
  M7HandoffTrace,
  M7HumanReviewPacket,
  M7LoopTimeline,
  M7Metrics,
  M7Observability,
  M7ProvenanceGraph,
  M7ResearchResult,
  M7State,
} from './types.ts';

export const M7_BENCHMARK_CLASSES: Array<{ id: string; description: string; check: string }> = [
  { id: 'NEW_SIGNAL', description: 'El loop descubre señales nuevas sobre el universo ampliado.', check: 'radar NEW > 0' },
  { id: 'KNOWN', description: 'Material conocido reaparece preservando identidad histórica.', check: 'radar KNOWN > 0' },
  { id: 'DUPLICATE', description: 'Fuentes repetidas no se reprocesan ni duplican.', check: 'radar DUPLICATE > 0' },
  { id: 'RELATED', description: 'Fuentes/señales relacionadas se vinculan cross-source.', check: 'radar RELATED > 0' },
  { id: 'REASSESSMENT', description: 'El conocimiento que regresa reevalúa candidates existentes.', check: 'ASSESSMENT_CHANGED o transición epistémica' },
  { id: 'PROMOTION', description: 'Un candidate confirmado se promueve con handoff válido.', check: 'estado PROMOTED' },
  { id: 'DEMOTION', description: 'Un candidate confirmado se degrada por nueva evidencia.', check: 'estado DEMOTED o prioridad degradada' },
  { id: 'CLOSURE', description: 'Un candidate se cierra por confirmación o refutación.', check: 'CLOSED_CONFIRMED o CLOSED_REFUTED' },
  { id: 'REOPENING', description: 'Nueva evidencia reabre un candidate cerrado/descartado.', check: 'transición REOPENED' },
  { id: 'CONTRADICTION', description: 'Evidencia contradictoria se representa y resuelve o conserva.', check: 'contradiction artifact > 0' },
  { id: 'RESEARCH_RESULT_CONFIRMED', description: 'AthenaOS devuelve confirmación basada en evidencia.', check: 'verdict CONFIRMED > 0' },
  { id: 'RESEARCH_RESULT_REFUTED', description: 'AthenaOS devuelve refutación basada en evidencia.', check: 'verdict REFUTED > 0' },
  { id: 'FEEDBACK_UPDATE', description: 'El resultado muta el radar conservando las capas separadas.', check: 'feedbackUpdates > 0 con layers' },
  { id: 'NODE_FAILURE', description: 'El loop degrada correctamente ante un nodo caído.', check: 'recovery NODE_DOWN' },
  { id: 'PROCESS_RESTART', description: 'El loop sobrevive a un reinicio de proceso.', check: 'recovery PROCESS_RESTART > 0' },
  { id: 'LLM_FAILURE', description: 'Un fallo de LLM/timeout degrada sin fabricar evidencia.', check: 'recovery LLM_FALLBACK/TIMEOUT/INVALID_RESPONSE' },
  { id: 'AKP_RETRY', description: 'Reintentos/idempotencia no corrompen el conocimiento compartido.', check: 'idempotency noOps > 0' },
  { id: 'SCALE', description: 'M7 procesa un universo materialmente mayor que M6 (>= 400 fuentes).', check: 'sources >= 400' },
  { id: 'CONTINUOUS', description: 'El loop corre repetidamente sin intervención manual.', check: 'ondas > 1 y ciclos M7 procesados' },
  { id: 'EVIDENCE_DRIVEN_TRANSITION', description: 'Cada transición epistémica conserva evidencia y provenance.', check: 'transiciones con evidenceRefs > 0' },
];

export const M7_RUBRIC = [
  { id: 'Q1', question: '¿El closed loop AthenaSignal→AKP→AthenaOS→AKP→AthenaSignal es trazable extremo a extremo?' },
  { id: 'Q2', question: '¿Existe al menos un caso CONFIRMED basado en evidencia?' },
  { id: 'Q3', question: '¿Existe al menos un caso REFUTED basado en evidencia?' },
  { id: 'Q4', question: '¿Cada transición epistémica está justificada por evidencia/provenance?' },
  { id: 'Q5', question: '¿Nueva evidencia cambia materialmente el estado de un candidate?' },
  { id: 'Q6', question: '¿Se conserva el historial completo sin sobrescribir el pasado?' },
  { id: 'Q7', question: '¿Las contradicciones están representadas y resueltas o conservadas?' },
  { id: 'Q8', question: '¿El sistema es recuperable y idempotente sin corromper memoria?' },
  { id: 'Q9', question: '¿El universo creció por encima de M6 (>= 400 fuentes) sin degradación catastrófica?' },
  { id: 'Q10', question: '¿Un editor humano confirmaría que el radar quedó mejor informado?' },
];

export interface M7ArtifactInput {
  generatedAt: string;
  corpus: M7Corpus;
  state: M7State;
  ledger: EpistemicLedger;
  results: M7ResearchResult[];
  feedback: FeedbackUpdate[];
  routing: RoutingDecision[];
  recovery: RecoveryEvent[];
  idempotency: IdempotencyRecord[];
  nodes: TopologyNode[];
  transport: { inboxDir: string; returnDir: string; consumer: string; worker: string; limitation: string };
  m6SourceCount: number;
  m6Results: AthenaOsResearchResult[];
  missingRecordings: string[];
}

export function buildM7Artifacts(input: M7ArtifactInput): M7Artifacts {
  const contradictions = buildContradictions(input);
  const provenance = input.state.provenance;
  const handoffTrace = input.state.handoffTrace;
  const benchmark = buildBenchmark(input, contradictions);
  const metrics = buildMetrics(input, contradictions);
  metrics.falsePositiveObservations = [...benchmark.falsePositiveObservations];
  const epistemicResolutions = {
    kind: 'athenasignal.m7.epistemic_resolutions.v1' as const,
    generatedAt: input.generatedAt,
    resolutions: input.ledger.all(),
    byStatus: input.ledger.byStatus(),
  };
  return {
    corpus: input.corpus,
    benchmark,
    loopTimeline: buildLoopTimeline(input),
    state: input.state,
    radarState: input.state.radar,
    akpLive: buildAkpLive(input),
    athenaosResults: {
      kind: 'athenasignal.m7.athenaos_results.v1',
      generatedAt: input.generatedAt,
      results: input.results,
    },
    feedbackUpdates: {
      kind: 'athenasignal.m7.feedback_updates.v1',
      generatedAt: input.generatedAt,
      updates: input.feedback,
      byChange: countChanges(input.feedback),
    },
    epistemicResolutions,
    contradictions: {
      kind: 'athenasignal.m7.contradictions.v1',
      generatedAt: input.generatedAt,
      contradictions,
      resolved: contradictions.filter((entry) => entry.kind === 'RESOLVED').length,
      conserved: contradictions.filter((entry) => entry.kind === 'CONSERVED').length,
    },
    provenance,
    handoffTrace,
    metrics,
    cognitiveRouting: {
      kind: 'athenasignal.m7.cognitive_routing.v1',
      generatedAt: input.generatedAt,
      decisions: input.routing,
      byRoute: countBy(input.routing, (decision) => decision.route),
      byStage: byStage(input.routing),
    },
    observability: buildObservability(input),
    recoveryEvents: {
      kind: 'athenasignal.m7.recovery_events.v1',
      generatedAt: input.generatedAt,
      events: input.recovery,
      byKind: countBy(input.recovery, (event) => event.kind),
    },
    idempotency: {
      kind: 'athenasignal.m7.idempotency.v1',
      generatedAt: input.generatedAt,
      records: input.idempotency,
      noOps: input.idempotency.filter((record) => record.noOp).length,
      attempted: input.idempotency.length,
    },
    distributed: {
      ...input.state.m6.distribution,
      degraded: input.state.m6.distribution.nodes.some((node) => node.status === 'DOWN'),
    },
    humanReview: buildHumanReview(input, contradictions),
  };
}

function buildLoopTimeline(input: M7ArtifactInput): M7LoopTimeline {
  return {
    kind: 'athenasignal.m7.loop_timeline.v1',
    generatedAt: input.generatedAt,
    waves: input.state.waves,
    transitions: input.ledger.all().flatMap((resolution) => resolution.statusHistory),
    m6Runs: input.state.m6.runs,
    m6Loop: input.state.m6.loop,
  };
}

function buildAkpLive(input: M7ArtifactInput): M7AkpLive {
  const handoffs = input.results.map((result) => ({
    handoffId: result.handoffId,
    candidateId: result.candidateId,
    clusterId: result.clusterId,
    contentHash: result.handoffContentHash,
    wave: result.wave,
    consumedAt: result.createdAt,
  }));
  return {
    kind: 'athenasignal.m7.akp_live.v1',
    generatedAt: input.generatedAt,
    inboxDir: input.transport.inboxDir,
    returnDir: input.transport.returnDir,
    transport: 'durable-file-queue',
    consumer: input.transport.consumer,
    worker: input.transport.worker,
    handoffs,
    consumed: handoffs.length,
    resultsReturned: input.results.length,
    returnedResultIds: input.results.map((result) => result.resultId),
    limitation: input.transport.limitation,
  };
}

function buildContradictions(input: M7ArtifactInput): M7Contradiction[] {
  const contradictions: M7Contradiction[] = [];
  const seen = new Set<string>();
  for (const resolution of input.ledger.all()) {
    const refuteTransitions = resolution.statusHistory.filter((transition) => transition.stance === 'REFUTE');
    const refuted = resolution.verdict === 'REFUTED';
    if (!resolution.contradictions.length && !refuted) continue;
    const supporting = resolution.statusHistory
      .filter((transition) => transition.stance === 'SUPPORT')
      .flatMap((transition) => transition.evidenceRefs);
    const contradicting = refuteTransitions.flatMap((transition) => transition.evidenceRefs);
    const statements = resolution.contradictions.length
      ? resolution.contradictions.slice(0, 10)
      : refuteTransitions
          .flatMap((transition) => transition.claims.map((claim) => `AthenaOS refuta: ${claim.statement}`))
          .slice(0, 10);
    contradictions.push({
      contradictionId: `ct-${resolution.candidateId}`,
      candidateId: resolution.candidateId,
      clusterId: resolution.clusterId,
      kind: refuted ? 'RESOLVED' : 'CONSERVED',
      statements,
      supportingRefs: unique(supporting),
      contradictingRefs: unique(contradicting.length ? contradicting : resolution.evidenceRefs),
      resolution: refuted
        ? 'Resuelta por refutación basada en evidencia autoritativa: la afirmación no se sostiene.'
        : 'Conservada explícitamente: la tensión editorial permanece y bloquea promociones.',
      detectedAtWave: refuteTransitions[0]?.wave ?? resolution.statusHistory[0]?.wave ?? 1,
    });
    seen.add(resolution.candidateId);
  }
  for (const cluster of Object.values(input.state.radar.clusters)) {
    if (!cluster.contradiction || seen.has(`cluster:${cluster.clusterId}`)) continue;
    const candidateIds = Object.values(input.state.radar.candidates)
      .filter((candidate) => candidate.clusterId === cluster.clusterId)
      .map((candidate) => candidate.candidateId);
    if (candidateIds.some((id) => seen.has(id))) continue;
    contradictions.push({
      contradictionId: `ct-cluster-${cluster.clusterId}`,
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

function buildMetrics(input: M7ArtifactInput, contradictions: M7Contradiction[]): M7Metrics {
  const { state, corpus, results, feedback } = input;
  const resolutions = input.ledger.all();
  const transitions = resolutions.flatMap((resolution) => resolution.statusHistory);
  const byStatus = countBy(resolutions, (resolution) => resolution.currentStatus);
  const byVerdict = {
    CONFIRMED: resolutions.filter((resolution) => resolution.verdict === 'CONFIRMED').length,
    REFUTED: resolutions.filter((resolution) => resolution.verdict === 'REFUTED').length,
    INCONCLUSIVE: resolutions.filter((resolution) => resolution.verdict === 'INCONCLUSIVE').length,
  };
  const claims = results.flatMap((result) => result.claims);
  const newEvidence = new Set(results.flatMap((result) => result.layers.newEvidence));
  const byRoute = countBy(input.routing, (decision) => decision.route);
  const m6Inputs = state.m6.runs.reduce((sum, run) => sum + run.metrics.sourcesObserved, 0);
  const m7Inputs = corpus.cycles
    .filter((cycle) => cycle.cycleId.startsWith('m7-cycle-'))
    .reduce((sum, cycle) => sum + cycle.sourceIds.length, 0);
  const inputsObserved = m6Inputs + m7Inputs;
  const positive = results.filter(
    (result) => result.finalAssessment === 'SUPPORTED' || result.finalAssessment === 'REFRAMED'
  ).length;
  const withContradiction = results.filter((result) =>
    result.claims.some((claim) => claim.verdict === 'CONTRADICTED')
  ).length;
  const closed = resolutions.filter(
    (resolution) => resolution.currentStatus === 'CLOSED_CONFIRMED' || resolution.currentStatus === 'CLOSED_REFUTED'
  ).length;
  const evidenceDriven = transitions.filter(
    (transition) => transition.wave >= 1 && transition.evidenceRefs.length > 0
  ).length;
  const candidates = Object.keys(state.radar.candidates).length;

  return {
    kind: 'athenasignal.m7.metrics.v1',
    generatedAt: input.generatedAt,
    scale: {
      sources: corpus.sources.length,
      uniqueSources: Object.keys(state.radar.processedSources).length,
      baseM6Sources: corpus.baseM6SourceCount,
      m7Sources: corpus.m7SourceIds.length,
      cycles: corpus.cycles.length,
      cyclesProcessed: state.radar.cyclesProcessed.length,
      inputsObserved,
      signalsTracked: Object.keys(state.radar.signals).length,
      clusters: Object.keys(state.radar.clusters).length,
      candidates,
    },
    epistemic: {
      resolutions: resolutions.length,
      confirmed: resolutions.filter((r) => r.currentStatus === 'CONFIRMED').length,
      refuted: resolutions.filter((r) => r.currentStatus === 'REFUTED').length,
      inconclusive: resolutions.filter((r) => r.currentStatus === 'INCONCLUSIVE').length,
      closedConfirmed: resolutions.filter((r) => r.currentStatus === 'CLOSED_CONFIRMED').length,
      closedRefuted: resolutions.filter((r) => r.currentStatus === 'CLOSED_REFUTED').length,
      reopened: transitions.filter((transition) => transition.to === 'REOPENED').length,
      demoted: resolutions.filter((r) => r.currentStatus === 'DEMOTED').length,
      promoted: resolutions.filter((r) => r.currentStatus === 'PROMOTED').length,
      discarded: resolutions.filter((r) => r.currentStatus === 'DISCARDED').length,
      researchable: resolutions.filter((r) => r.currentStatus === 'RESEARCHABLE').length,
      transitions: transitions.length,
      evidenceDriven,
      byStatus,
      byVerdict,
      byTransition: unique(transitions.map((transition) => `${transition.from}→${transition.to}`)),
    },
    loop: {
      waves: state.waves.length,
      runs: state.m6.runs.length + state.waves.length,
      processes: new Set([...state.m6.runs.map((run) => run.processId), ...state.waves.map((wave) => wave.processId)]).size,
      hosts: new Set([...state.m6.runs.map((run) => run.host), ...state.waves.map((wave) => wave.host)]).size,
      handoffs: results.length,
      researchResults: results.length,
      feedbackUpdates: feedback.length,
    },
    research: {
      results: results.length,
      m6Results: input.m6Results.length,
      m7Results: results.length - input.m6Results.length,
      confirmed: results.filter((result) => result.status === 'RESEARCHED_CONFIRMED').length,
      refuted: results.filter((result) => result.status === 'RESEARCHED_REFUTED').length,
      inconclusive: results.filter((result) => result.status === 'RESEARCHED_INCONCLUSIVE').length,
      realResponses: results.filter((result) => !result.deterministic).length,
      deterministicResponses: results.filter((result) => result.deterministic).length,
      replayMisses: input.missingRecordings.length,
      claims: claims.length,
      supportedClaims: claims.filter((claim) => claim.verdict === 'SUPPORTED').length,
      contradictedClaims: claims.filter((claim) => claim.verdict === 'CONTRADICTED').length,
      evidenceRefs: results.reduce((sum, result) => sum + result.evidence.length, 0),
      newEvidence: newEvidence.size,
      providers: unique(results.map((result) => result.provider)),
    },
    contradictions: {
      total: contradictions.length,
      resolved: contradictions.filter((entry) => entry.kind === 'RESOLVED').length,
      conserved: contradictions.filter((entry) => entry.kind === 'CONSERVED').length,
    },
    provenance: {
      edges: state.provenance.edges.length,
      completeChains: state.provenance.completeChains,
      missingChains: state.provenance.missingChains.length,
    },
    distributed: {
      nodesUp: input.nodes.filter((node) => node.status === 'UP').length,
      nodesDown: input.nodes.filter((node) => node.status === 'DOWN').length,
      degraded: input.nodes.some((node) => node.status === 'DOWN'),
      remoteEscalations: byRoute.REMOTE_ESCALATION ?? 0,
      realNodeParticipation: state.m6.runs.some((run) => run.host === 'mac-mini'),
    },
    recovery: { events: input.recovery.length, byKind: countBy(input.recovery, (event) => event.kind) },
    idempotency: {
      noOps: input.idempotency.filter((record) => record.noOp).length,
      attempted: input.idempotency.length,
    },
    performance: {
      costUnits: (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0) + 4 * (byRoute.REMOTE_ESCALATION ?? 0),
      localCalls: (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0),
      remoteCalls: byRoute.REMOTE_ESCALATION ?? 0,
      deterministicCalls: byRoute.DETERMINISTIC_FALLBACK ?? 0,
      inputsPerCycle: corpus.cycles.length ? Number((inputsObserved / corpus.cycles.length).toFixed(3)) : 0,
    },
    quality: {
      resolutionCoverage: candidates ? Number((resolutions.filter((r) => r.researchResultIds.length > 0).length / candidates).toFixed(3)) : 0,
      evidenceDrivenRate: transitions.length ? Number((evidenceDriven / transitions.length).toFixed(3)) : 0,
      provenanceCoverage: candidates ? Number((state.provenance.completeChains / candidates).toFixed(3)) : 0,
      positiveAssessmentRate: results.length ? Number((positive / results.length).toFixed(3)) : 0,
      contradictionRate: results.length ? Number((withContradiction / results.length).toFixed(3)) : 0,
    },
    falsePositiveObservations: [],
  };
}

function buildBenchmark(input: M7ArtifactInput, contradictions: M7Contradiction[]): M7Benchmark {
  const { state, results, feedback } = input;
  const eventCounts = state.radar.eventCounts;
  const recoveryKinds = new Set(input.recovery.map((event) => event.kind));
  const resolutions = input.ledger.all();
  const transitions = resolutions.flatMap((resolution) => resolution.statusHistory);
  const verdicts = resolutions.map((resolution) => resolution.verdict);
  const statuses = new Set(resolutions.map((resolution) => resolution.currentStatus));
  const priorityDemotions = feedback.filter((update) => update.changes.includes('PRIORITY_CHANGED')).length;
  const closed = resolutions.some(
    (resolution) => resolution.currentStatus === 'CLOSED_CONFIRMED' || resolution.currentStatus === 'CLOSED_REFUTED'
  );

  const observedById: Record<string, boolean> = {
    NEW_SIGNAL: (eventCounts.NEW ?? 0) > 0,
    KNOWN: (eventCounts.KNOWN ?? 0) > 0,
    DUPLICATE: (eventCounts.DUPLICATE ?? 0) > 0,
    RELATED: (eventCounts.RELATED ?? 0) > 0,
    REASSESSMENT: feedback.some((update) => update.changes.includes('ASSESSMENT_CHANGED')) || transitions.length > 0,
    PROMOTION: statuses.has('PROMOTED') || transitions.some((transition) => transition.to === 'PROMOTED'),
    DEMOTION: statuses.has('DEMOTED') || priorityDemotions > 0,
    CLOSURE: closed,
    REOPENING: transitions.some((transition) => transition.to === 'REOPENED'),
    CONTRADICTION: contradictions.length > 0,
    RESEARCH_RESULT_CONFIRMED: verdicts.includes('CONFIRMED'),
    RESEARCH_RESULT_REFUTED: verdicts.includes('REFUTED'),
    FEEDBACK_UPDATE: feedback.length > 0,
    NODE_FAILURE: recoveryKinds.has('NODE_DOWN') || input.nodes.some((node) => node.status === 'DOWN'),
    PROCESS_RESTART: recoveryKinds.has('PROCESS_RESTART'),
    LLM_FAILURE: recoveryKinds.has('LLM_FALLBACK') || recoveryKinds.has('TIMEOUT') || recoveryKinds.has('INVALID_RESPONSE'),
    AKP_RETRY: input.idempotency.some((record) => record.noOp),
    SCALE: input.corpus.sources.length >= 400,
    CONTINUOUS: state.waves.length > 1 && state.radar.cyclesProcessed.some((cycle) => cycle.startsWith('m7-cycle-')),
    EVIDENCE_DRIVEN_TRANSITION:
      transitions.filter((transition) => transition.wave >= 1).length > 0 &&
      transitions
        .filter((transition) => transition.wave >= 1)
        .every((transition) => transition.evidenceRefs.length > 0),
  };

  const entries: M7BenchmarkClass[] = M7_BENCHMARK_CLASSES.map((definition) => ({
    id: definition.id,
    description: definition.description,
    observed: observedById[definition.id] ?? false,
    evidence: observedById[definition.id] ? definition.check : `NO OBSERVADO: ${definition.check}`,
  }));
  const observedCount = entries.filter((entry) => entry.observed).length;
  return {
    kind: 'athenasignal.m7.benchmark.v1',
    generatedAt: input.generatedAt,
    entries,
    coverage: Number((observedCount / entries.length).toFixed(3)),
    falsePositiveObservations: entries.filter((entry) => !entry.observed).map((entry) => entry.id),
  };
}

function buildObservability(input: M7ArtifactInput): M7Observability {
  const { state, results, feedback } = input;
  const resolutions = input.ledger.all();
  const transitions = resolutions.flatMap((resolution) => resolution.statusHistory);
  const byRoute = countBy(input.routing, (decision) => decision.route);
  return {
    kind: 'athenasignal.m7.observability.v1',
    generatedAt: input.generatedAt,
    discovered: {
      sources: input.corpus.sources.length,
      uniqueSources: Object.keys(state.radar.processedSources).length,
      signals: Object.keys(state.radar.signals).length,
      clusters: Object.keys(state.radar.clusters).length,
      candidates: Object.keys(state.radar.candidates).length,
    },
    epistemicBoard: input.ledger.byStatus(),
    sentToAthenaOs: unique(results.map((result) => result.candidateId)),
    researching: [],
    returned: results.map((result) => result.resultId),
    changed: transitions.map((transition) => ({
      candidateId: transition.candidateId,
      from: transition.from,
      to: transition.to,
      why: transition.reason,
    })),
    why: resolutions.map((resolution) => ({ candidateId: resolution.candidateId, reason: resolution.reason })),
    failures: { recoveryEvents: input.recovery.length, byKind: countBy(input.recovery, (event) => event.kind) },
    pending: input.corpus.cycles
      .filter((cycle) => !state.radar.cyclesProcessed.includes(cycle.cycleId))
      .map((cycle) => cycle.cycleId),
    cost: {
      llmCalls: input.routing.length,
      localCalls: (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0),
      remoteCalls: byRoute.REMOTE_ESCALATION ?? 0,
      deterministicCalls: byRoute.DETERMINISTIC_FALLBACK ?? 0,
      estimatedCostUnits: (byRoute.LOCAL ?? 0) + (byRoute.LOCAL_ALT ?? 0) + 4 * (byRoute.REMOTE_ESCALATION ?? 0),
    },
  };
}

function buildHumanReview(input: M7ArtifactInput, contradictions: M7Contradiction[]): M7HumanReviewPacket {
  const resolutions = input.ledger.all();
  const confirmed = resolutions.find((resolution) => resolution.verdict === 'CONFIRMED');
  const refuted = resolutions.find((resolution) => resolution.verdict === 'REFUTED');
  const transitions = resolutions.flatMap((resolution) => resolution.statusHistory);
  const material = transitions.find(
    (transition) =>
      transition.evidenceRefs.length > 0 &&
      (transition.to === 'CONFIRMED' || transition.to === 'REFUTED' || transition.to === 'REOPENED' || transition.to === 'DEMOTED')
  );
  const promotion = input.feedback.find((update) => update.changes.includes('PROMOTED'));
  const demotion = input.feedback.find(
    (update) => update.changes.includes('PRIORITY_CHANGED') || update.changes.includes('ASSESSMENT_CHANGED')
  );
  const closure = resolutions.find(
    (resolution) => resolution.currentStatus === 'CLOSED_CONFIRMED' || resolution.currentStatus === 'CLOSED_REFUTED'
  );
  const reopening = transitions.find((transition) => transition.to === 'REOPENED');
  const failure = input.recovery.find((event) => event.kind === 'NODE_DOWN' || event.kind === 'PARTIAL_RUN' || event.kind === 'INVALID_RESPONSE');
  const mostImportant = [...input.feedback].sort((a, b) => b.changes.length - a.changes.length)[0] ?? null;
  const contradiction = contradictions[0] ?? null;

  return {
    kind: 'athenasignal.m7.human_review_packet.v1',
    generatedAt: input.generatedAt,
    rubric: M7_RUBRIC,
    bestClosedLoopStory: confirmed
      ? `${confirmed.candidateId}: AthenaSignal → AKP → AthenaOS → AKP → AthenaSignal. Investigación ` +
        `con evidencia y provenance; el estado epistémico pasó por ${confirmed.statusHistory.map((t) => t.to).join(' → ')} ` +
        `y terminó en ${confirmed.currentStatus}.`
      : 'Sin caso confirmado; el loop conservó la incertidumbre sin elevar afirmaciones a hecho.',
    worstClosedLoopStory: refuted
      ? `${refuted.candidateId}: la investigación refutó la afirmación (${refuted.currentStatus}); la ` +
        'evidencia contradictoria quedó registrada y bloqueó la promoción.'
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
    mostImportantFeedback: mostImportant
      ? { candidateId: mostImportant.candidateId, changes: mostImportant.changes, why: mostImportant.reason }
      : null,
    evidenceDrivenTransition: material
      ? { candidateId: material.candidateId, from: material.from, to: material.to, why: material.reason }
      : null,
    contradictionHandling: contradiction
      ? { candidateId: contradiction.candidateId, kind: contradiction.kind, why: contradiction.resolution }
      : null,
    majorPromotion: promotion ? { candidateId: promotion.candidateId, why: promotion.reason } : null,
    majorDemotion: demotion ? { candidateId: demotion.candidateId, why: demotion.reason } : null,
    majorClosure: closure
      ? { candidateId: closure.candidateId, status: closure.currentStatus, why: closure.statusHistory.at(-1)?.reason ?? closure.reason }
      : null,
    majorReopening: reopening ? { candidateId: reopening.candidateId, why: reopening.reason } : null,
    failureAndRecovery: failure
      ? { recoveryId: failure.recoveryId, kind: failure.kind, why: failure.detail }
      : null,
    distributedExample: input.state.m6.distribution.examples[0] ?? 'Topología local-first sin degradación.',
    longRunningTimeline: input.state.m6.loop
      .slice(-10)
      .map((cycle) => `[${cycle.phase}] ${cycle.notes}`)
      .concat(input.state.waves.map((wave) => `[WAVE ${wave.wave}] ${wave.notes}`)),
    akpToAthenaOsToAkpTrace: input.state.handoffTrace.trace,
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
  for (const update of feedback) for (const change of update.changes) counts[change] = (counts[change] ?? 0) + 1;
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

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export type { EpistemicResolution, EpistemicStatus, M6State, RadarState, M7ProvenanceGraph, M7HandoffTrace };
