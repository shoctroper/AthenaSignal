/**
 * Tipos del milestone M6 — Closed-Loop Editorial Intelligence (ORDEN-010).
 *
 * M6 cierra el loop editorial: AthenaSignal descubre y promueve un candidate,
 * AKP lo transporta, un worker AthenaOS hace investigación profunda real y
 * devuelve un resultado estructurado que AKP re-ingiere, y AthenaSignal muta su
 * radar con la información nueva sin sobrescribir el pasado.
 *
 * El estado M6 se apoya en el `RadarState` persistente de M4/M5 (memoria
 * histórica viva) y agrega la capa de loop: runs multi-proceso, timeline de
 * fases, resultados de investigación, feedback que muta el radar, recuperación,
 * idempotencia y topología distribuida. El contrato AKP
 * (`athenasignal.research_candidate.handoff.v1`) se preserva.
 */

import type { FindingKind, ResearchAssessment, SourceRole } from '../domain/entities.ts';
import type { Priority } from '../autonomous/types.ts';
import type {
  IdempotencyRecord,
  M5Corpus,
  RecoveryEvent,
  RoutingDecision,
  RunStatus,
} from '../platform/types.ts';
import type { M4Cycle, RadarState } from '../radar/types.ts';

/** Estado de un candidate tras la investigación profunda de AthenaOS. */
export type ResearchStatus =
  | 'RESEARCHED_CONFIRMED'
  | 'RESEARCHED_REFUTED'
  | 'RESEARCHED_INCONCLUSIVE'
  | 'RESEARCH_FAILED';

export const RESEARCH_STATUSES: ResearchStatus[] = [
  'RESEARCHED_CONFIRMED',
  'RESEARCHED_REFUTED',
  'RESEARCHED_INCONCLUSIVE',
  'RESEARCH_FAILED',
];

export type ResearchVerdict = 'SUPPORTED' | 'CONTRADICTED' | 'UNCERTAIN';

export interface ResearchClaim {
  claimId: string;
  statement: string;
  verdict: ResearchVerdict;
  confidence: number;
  evidenceRefs: string[];
}

export interface ResearchFinding {
  kind: FindingKind;
  text: string;
  refs: string[];
}

export interface ResearchEvidenceRef {
  url: string;
  title: string;
  role: SourceRole;
  origin: 'HANDOFF' | 'SEARCH' | 'FETCH';
}

export interface ResearchStep {
  id: string;
  step: string;
  detail: string;
}

/** Capas epistemológicas separadas que exige ORDEN-010 §2.9/§3. */
export interface ResearchLayers {
  originalSignal: string;
  researchQuestion: string;
  researchResult: string;
  newEvidence: string[];
  newInterpretation: string;
}

/** Resultado estructurado que AthenaOS devuelve a AKP (ORDEN-010 §2.2). */
export interface AthenaOsResearchResult {
  kind: 'athenasignal.m6.athenaos_result.v1';
  resultId: string;
  candidateId: string;
  clusterId: string;
  handoffId: string;
  handoffContentHash: string;
  researchQuestion: string;
  worker: string;
  executionMode: 'live' | 'replay';
  provider: string;
  model: string;
  deterministic: boolean;
  status: ResearchStatus;
  steps: ResearchStep[];
  findings: ResearchFinding[];
  claims: ResearchClaim[];
  evidence: ResearchEvidenceRef[];
  provenance: Array<{
    url: string;
    title: string;
    language: string;
    role: SourceRole;
    accessedAt: string;
  }>;
  uncertainties: string[];
  finalAssessment: ResearchAssessment;
  confidence: number;
  layers: ResearchLayers;
  createdAt: string;
  runId: string;
  /** Errores/timeout documentados si la investigación degradó. */
  limitations: string[];
}

export type FeedbackChange =
  | 'EVIDENCE_ADDED'
  | 'ASSESSMENT_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'PROMOTED'
  | 'CLOSED'
  | 'CLOSED_REFUTED'
  | 'REOPENED'
  | 'CONFIRMED'
  | 'CONTRADICTION_ADDED'
  | 'INTERPRETATION_UPDATED';

export const FEEDBACK_CHANGES: FeedbackChange[] = [
  'EVIDENCE_ADDED',
  'ASSESSMENT_CHANGED',
  'PRIORITY_CHANGED',
  'PROMOTED',
  'CLOSED',
  'CLOSED_REFUTED',
  'REOPENED',
  'CONFIRMED',
  'CONTRADICTION_ADDED',
  'INTERPRETATION_UPDATED',
];

export interface FeedbackSnapshot {
  assessment: ResearchAssessment;
  priority: Priority;
  score: number;
  status: 'ACTIVE' | 'DISCARDED' | 'PROMOTED';
  evidence: number;
  contradiction: boolean;
}

/** Mutación del radar producida por el conocimiento que regresó de AthenaOS. */
export interface FeedbackUpdate {
  kind: 'athenasignal.m6.feedback_update.v1';
  updateId: string;
  resultId: string;
  candidateId: string;
  clusterId: string;
  runId: string;
  at: string;
  cycleId: string;
  cycleNumber: number;
  previous: FeedbackSnapshot;
  next: FeedbackSnapshot;
  changes: FeedbackChange[];
  layers: ResearchLayers;
  reason: string;
}

export type LoopPhase =
  | 'DISCOVER'
  | 'TRIAGE'
  | 'CANDIDATE'
  | 'HANDOFF'
  | 'RESEARCH'
  | 'RETURN'
  | 'FEEDBACK'
  | 'RADAR_UPDATE';

export const LOOP_PHASES: LoopPhase[] = [
  'DISCOVER',
  'TRIAGE',
  'CANDIDATE',
  'HANDOFF',
  'RESEARCH',
  'RETURN',
  'FEEDBACK',
  'RADAR_UPDATE',
];

export interface LoopCycle {
  cycleId: string;
  cycleNumber: number;
  at: string;
  runId: string;
  phase: LoopPhase;
  sourcesObserved: number;
  candidatesAvailable: number;
  handoffsDelivered: number;
  resultsReturned: number;
  feedbackApplied: number;
  notes: string;
}

export interface TopologyNode {
  node: string;
  role: 'ORCHESTRATION' | 'SCHEDULER' | 'INGESTION' | 'PERSISTENCE' | 'RESEARCH' | 'COGNITIVE';
  route: 'LOCAL' | 'LOCAL_ALT' | 'REMOTE_ESCALATION' | 'DETERMINISTIC_FALLBACK';
  host: string;
  model: string;
  status: 'UP' | 'DOWN';
  reason: string;
}

export interface DistributedReport {
  kind: 'athenasignal.m6.distributed.v1';
  generatedAt: string;
  nodes: TopologyNode[];
  degradedRuns: string[];
  examples: string[];
  fallbackRoutes: number;
  remoteEscalations: number;
}

export interface M6RunMetrics {
  cyclesRequested: number;
  cyclesApplied: number;
  sourcesObserved: number;
  handoffsDelivered: number;
  researchCompleted: number;
  feedbackApplied: number;
  routingDecisions: number;
  fallbacks: number;
}

export interface M6Run {
  runId: string;
  processId: string;
  host: string;
  startedAt: string;
  endedAt: string | null;
  resumedFrom: string | null;
  status: RunStatus;
  crashAt: string | null;
  crashReason: string | null;
  cyclesRequested: string[];
  cyclesApplied: string[];
  researchCompleted: string[];
  feedbackApplied: string[];
  metrics: M6RunMetrics;
}

export interface M6Counters {
  inputsObserved: number;
  cyclesProcessed: number;
  runs: number;
  handoffs: number;
  researchResults: number;
  feedbackUpdates: number;
  promotionsTriggeredByFeedback: number;
  closuresTriggeredByFeedback: number;
  contradictionsRaised: number;
  priorityChangesFromFeedback: number;
  routingDecisions: number;
  recoveryEvents: number;
  idempotencyNoops: number;
}

/** Estado persistente del loop M6 (radar vivo + capa de loop). */
export interface M6State {
  kind: 'athenasignal.m6.state.v1';
  schemaVersion: 1;
  updatedAt: string;
  importedFrom: string | null;
  radar: RadarState;
  runs: M6Run[];
  loop: LoopCycle[];
  research: AthenaOsResearchResult[];
  feedback: FeedbackUpdate[];
  recovery: RecoveryEvent[];
  idempotency: IdempotencyRecord[];
  routed: RoutingDecision[];
  distribution: DistributedReport;
  counters: M6Counters;
}

/** Corpus M6: continúa el universo M5 y lo amplía materialmente. */
export interface M6Corpus extends Omit<M5Corpus, 'kind'> {
  kind: 'athenasignal.m6.corpus.v1';
  m6SourceIds: string[];
  baseM5SourceCount: number;
}

export interface M6CorpusBuildOptions {
  /** Canales espejo M6 a generar por cada fuente extendida M5. */
  mirrorEvery?: number;
}

export interface M6BenchmarkClass {
  id: string;
  description: string;
  observed: boolean;
  evidence: string;
}

export interface M6Benchmark {
  kind: 'athenasignal.m6.benchmark.v1';
  generatedAt: string;
  entries: M6BenchmarkClass[];
  coverage: number;
  falsePositiveObservations: string[];
}

export interface M6RunTimeline {
  kind: 'athenasignal.m6.loop_timeline.v1';
  generatedAt: string;
  runs: M6Run[];
  cycles: LoopCycle[];
}

export interface M6AkpLive {
  kind: 'athenasignal.m6.akp_live.v1';
  generatedAt: string;
  inboxDir: string;
  returnDir: string;
  transport: string;
  consumer: string;
  worker: string;
  handoffs: Array<{
    handoffId: string;
    candidateId: string;
    clusterId: string;
    contentHash: string;
    consumedAt: string;
    inboxPath: string;
  }>;
  consumed: number;
  resultsReturned: number;
  returnedResultIds: string[];
  limitation: string;
}

export interface M6Artifacts {
  corpus: M6Corpus;
  benchmark: M6Benchmark;
  loopTimeline: M6RunTimeline;
  state: M6State;
  radarState: RadarState;
  akpLive: M6AkpLive;
  athenaosResults: {
    kind: 'athenasignal.m6.athenaos_results.v1';
    generatedAt: string;
    results: AthenaOsResearchResult[];
  };
  feedbackUpdates: {
    kind: 'athenasignal.m6.feedback_updates.v1';
    generatedAt: string;
    updates: FeedbackUpdate[];
    byChange: Record<string, number>;
  };
  metrics: M6Metrics;
  cognitiveRouting: {
    kind: 'athenasignal.m6.cognitive_routing.v1';
    generatedAt: string;
    decisions: RoutingDecision[];
    byRoute: Record<string, number>;
    byStage: Record<string, Record<string, number>>;
  };
  observability: M6Observability;
  recoveryEvents: {
    kind: 'athenasignal.m6.recovery_events.v1';
    generatedAt: string;
    events: RecoveryEvent[];
    byKind: Record<string, number>;
  };
  idempotency: {
    kind: 'athenasignal.m6.idempotency.v1';
    generatedAt: string;
    records: IdempotencyRecord[];
    noOps: number;
    attempted: number;
  };
  distributed: DistributedReport;
  humanReview: M6HumanReviewPacket;
}

export interface M6Metrics {
  kind: 'athenasignal.m6.metrics.v1';
  generatedAt: string;
  scale: {
    sources: number;
    uniqueSources: number;
    baseM5Sources: number;
    m6Sources: number;
    cycles: number;
    cyclesProcessed: number;
    inputsObserved: number;
    signalsTracked: number;
    clusters: number;
    candidates: number;
  };
  loop: {
    runs: number;
    processes: number;
    hosts: number;
    loopCycles: number;
    handoffs: number;
    researchResults: number;
    feedbackUpdates: number;
    continuousCycles: number;
  };
  research: {
    results: number;
    confirmed: number;
    refuted: number;
    inconclusive: number;
    failed: number;
    claims: number;
    supportedClaims: number;
    contradictedClaims: number;
    uncertainClaims: number;
    evidenceRefs: number;
    newEvidence: number;
    realResponses: number;
    deterministicResponses: number;
    providers: string[];
    replayMisses: number;
  };
  feedback: {
    updates: number;
    byChange: Record<string, number>;
    evidenceAdded: number;
    promotions: number;
    closures: number;
    reopenings: number;
    contradictions: number;
    priorityChanges: number;
    assessmentChanges: number;
    interpretationUpdates: number;
  };
  llm: {
    providerChain: string;
    realResponses: number;
    deterministicResponses: number;
    replayMisses: number;
    localRoutes: number;
    localAltRoutes: number;
    remoteRoutes: number;
    fallbackRoutes: number;
  };
  distributed: {
    nodesUp: number;
    nodesDown: number;
    degraded: boolean;
    remoteEscalations: number;
  };
  recovery: {
    events: number;
    byKind: Record<string, number>;
  };
  idempotency: {
    noOps: number;
    attempted: number;
  };
  performance: {
    /** Proxy determinista de coste: 1 unidad local, 4 remotas, 0 deterministas. */
    costUnits: number;
    localCalls: number;
    remoteCalls: number;
    deterministicCalls: number;
    /** Proxy de throughput: observaciones de fuente por ciclo del loop. */
    inputsPerCycle: number;
  };
  quality: {
    researchCoverage: number;
    feedbackRate: number;
    /** Fracción de resultados con evaluación positiva (SUPPORTED/REFRAMED). */
    positiveAssessmentRate: number;
    /** Fracción de resultados con contradicción explícita. */
    contradictionRate: number;
  };
  falsePositiveObservations: string[];
}

export interface M6Observability {
  kind: 'athenasignal.m6.observability.v1';
  generatedAt: string;
  discovered: {
    sources: number;
    uniqueSources: number;
    signals: number;
    clusters: number;
    candidates: number;
  };
  discarded: string[];
  sentToAthenaOs: string[];
  researching: string[];
  returned: string[];
  changed: Array<{
    candidateId: string;
    changes: FeedbackChange[];
    from: FeedbackSnapshot;
    to: FeedbackSnapshot;
  }>;
  why: Array<{ candidateId: string; reason: string }>;
  failures: { recoveryEvents: number; byKind: Record<string, number> };
  pending: string[];
  cost: {
    llmCalls: number;
    localCalls: number;
    remoteCalls: number;
    deterministicCalls: number;
    estimatedCostUnits: number;
  };
}

export interface M6HumanReviewPacket {
  kind: 'athenasignal.m6.human_review_packet.v1';
  generatedAt: string;
  rubric: Array<{ id: string; question: string }>;
  bestStory: string;
  worstStory: string;
  mostImportantFeedback: {
    candidateId: string;
    changes: FeedbackChange[];
    why: string;
  } | null;
  mostDifficultSource: string;
  majorContradiction: {
    candidateId: string;
    details: string[];
    why: string;
  } | null;
  majorPromotion: {
    candidateId: string;
    reason: string;
    why: string;
  } | null;
  majorFailure: { recoveryId: string; kind: string; runId: string; why: string } | null;
  distributedExample: string;
  longRunningTimeline: string[];
  akpTrace: Array<{
    candidateId: string;
    handoffId: string;
    deliveredAt: string;
    consumedAt: string;
    researchResultId: string;
    feedbackUpdateId: string;
  }>;
}

export type { M4Cycle, RadarState, RoutingDecision, RecoveryEvent, IdempotencyRecord };
