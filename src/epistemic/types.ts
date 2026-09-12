/**
 * Tipos del milestone M7 — Epistemically Resolutive Closed Loop (ORDEN-011).
 *
 * M7 convierte el closed loop editorial de M6 en un sistema **epistemológicamente
 * resolutivo**: cada Research Candidate tiene un estado epistémico explícito y
 * una historia de transiciones justificadas por evidencia/provenance. El
 * conocimiento que regresa de AthenaOS (vía AKP) cambia materialmente el estado;
 * las contradicciones se representan y se conservan o resuelven.
 *
 * La capa epistémica no sustituye al radar M4/M5/M6: lo observa y lo anota. El
 * `RadarState` sigue siendo la memoria histórica viva y el contrato de handoff
 * (`athenasignal.research_candidate.handoff.v1`) se preserva.
 */

import type { FindingKind, ResearchAssessment, SourceRole } from '../domain/entities.ts';
import type { AthenaOsResearchResult, M6Corpus, M6State } from '../closedloop/types.ts';
import type { Priority } from '../autonomous/types.ts';
import type { M4Cycle, RadarState } from '../radar/types.ts';
import type {
  IdempotencyRecord,
  RecoveryEvent,
  RoutingDecision,
  RunStatus,
} from '../platform/types.ts';

/**
 * Estados epistémicos formales (ORDEN-011 §2). Ninguno se asigna arbitrariamente:
 * cada transición registra la evidencia que la justifica.
 */
export type EpistemicStatus =
  | 'RESEARCHABLE'
  | 'CONFIRMED'
  | 'REFUTED'
  | 'INCONCLUSIVE'
  | 'CLOSED_CONFIRMED'
  | 'CLOSED_REFUTED'
  | 'REOPENED'
  | 'DEMOTED'
  | 'PROMOTED'
  | 'DISCARDED';

export const EPISTEMIC_STATUSES: EpistemicStatus[] = [
  'RESEARCHABLE',
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'CLOSED_CONFIRMED',
  'CLOSED_REFUTED',
  'REOPENED',
  'DEMOTED',
  'PROMOTED',
  'DISCARDED',
];

/** Postura derivada de la evidencia (no de una etiqueta manual). */
export type EpistemicStance = 'SUPPORT' | 'REFUTE' | 'UNCERTAIN';

export const EPISTEMIC_STANCES: EpistemicStance[] = ['SUPPORT', 'REFUTE', 'UNCERTAIN'];

export type ResolutionVerdict = 'CONFIRMED' | 'REFUTED' | 'INCONCLUSIVE';

/** Referencia de evidencia con provenance reconstruible. */
export interface EpistemicEvidenceRef {
  url: string;
  title: string;
  role: SourceRole;
  origin: 'HANDOFF' | 'SEARCH' | 'FETCH' | 'CORPUS' | 'RECORDING';
  /** Autoridad explícita (organismo oficial, revisión por pares, doc primaria). */
  authoritative: boolean;
  researchResultId: string | null;
}

/** Transición epistémica: el pasado nunca se sobrescribe. */
export interface EpistemicTransition {
  transitionId: string;
  candidateId: string;
  sequence: number;
  wave: number;
  from: EpistemicStatus;
  to: EpistemicStatus;
  at: string;
  cycleId: string;
  runId: string;
  researchResultId: string | null;
  stance: EpistemicStance;
  evidenceRefs: string[];
  provenance: EpistemicEvidenceRef[];
  claims: Array<{ claimId: string; statement: string; verdict: string }>;
  reason: string;
}

/** Resolución epistémica completa de un candidate (historial conservado). */
export interface EpistemicResolution {
  kind: 'athenasignal.m7.epistemic_resolution.v1';
  candidateId: string;
  clusterId: string;
  title: string;
  currentStatus: EpistemicStatus;
  verdict: ResolutionVerdict;
  confidence: number;
  statusHistory: EpistemicTransition[];
  evidenceRefs: string[];
  provenance: EpistemicEvidenceRef[];
  contradictions: string[];
  researchResultIds: string[];
  layers: {
    originalSignal: string;
    researchQuestion: string;
    researchResult: string;
    newEvidence: string[];
    newInterpretation: string;
  } | null;
  lastUpdatedAt: string;
  reason: string;
}

/** Contradicción representada explícitamente (resuelta o conservada). */
export interface M7Contradiction {
  contradictionId: string;
  candidateId: string;
  clusterId: string;
  kind: 'RESOLVED' | 'CONSERVED';
  statements: string[];
  supportingRefs: string[];
  contradictingRefs: string[];
  resolution: string;
  detectedAtWave: number;
}

export interface M7ProvenanceEdge {
  from: string;
  to: string;
  relation:
    | 'SOURCE_TO_SIGNAL'
    | 'SIGNAL_TO_CANDIDATE'
    | 'CANDIDATE_TO_HANDOFF'
    | 'HANDOFF_TO_RESULT'
    | 'RESULT_TO_EVIDENCE'
    | 'RESULT_TO_FEEDBACK'
    | 'FEEDBACK_TO_RADAR'
    | 'RADAR_TO_STATE';
  detail: string;
}

export interface M7ProvenanceGraph {
  kind: 'athenasignal.m7.provenance.v1';
  generatedAt: string;
  edges: M7ProvenanceEdge[];
  chain: string[];
  completeChains: number;
  missingChains: string[];
}

export interface M7HandoffTrace {
  kind: 'athenasignal.m7.handoff_trace.v1';
  generatedAt: string;
  trace: Array<{
    candidateId: string;
    clusterId: string;
    wave: number;
    handoffId: string;
    contentHash: string;
    deliveredAt: string;
    consumedAt: string;
    researchResultId: string;
    researchStatus: string;
    feedbackUpdateId: string;
    epistemicStatus: EpistemicStatus;
  }>;
  delivered: number;
  consumed: number;
  returned: number;
  limitation: string;
}

export interface M7Corpus extends Omit<M6Corpus, 'kind'> {
  kind: 'athenasignal.m7.corpus.v1';
  m7SourceIds: string[];
  baseM6SourceCount: number;
}

export interface M7ResearchResult extends AthenaOsResearchResult {
  wave: number;
  evidenceBalance: {
    supporting: number;
    contradicting: number;
    uncertain: number;
    authoritative: number;
  };
}

export interface M7Wave {
  wave: number;
  runId: string;
  processId: string;
  host: string;
  startedAt: string;
  endedAt: string | null;
  resumedFrom: string | null;
  status: RunStatus;
  candidatesResearched: string[];
  resultsReturned: string[];
  feedbackApplied: string[];
  transitions: string[];
  notes: string;
}

export interface M7LoopTimeline {
  kind: 'athenasignal.m7.loop_timeline.v1';
  generatedAt: string;
  waves: M7Wave[];
  transitions: EpistemicTransition[];
  m6Runs: M6State['runs'];
  m6Loop: M6State['loop'];
}

export interface M7AkpLive {
  kind: 'athenasignal.m7.akp_live.v1';
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
    wave: number;
    consumedAt: string;
  }>;
  consumed: number;
  resultsReturned: number;
  returnedResultIds: string[];
  limitation: string;
}

export interface M7BenchmarkClass {
  id: string;
  description: string;
  observed: boolean;
  evidence: string;
}

export interface M7Benchmark {
  kind: 'athenasignal.m7.benchmark.v1';
  generatedAt: string;
  entries: M7BenchmarkClass[];
  coverage: number;
  falsePositiveObservations: string[];
}

export interface M7Metrics {
  kind: 'athenasignal.m7.metrics.v1';
  generatedAt: string;
  scale: {
    sources: number;
    uniqueSources: number;
    baseM6Sources: number;
    m7Sources: number;
    cycles: number;
    cyclesProcessed: number;
    inputsObserved: number;
    signalsTracked: number;
    clusters: number;
    candidates: number;
  };
  epistemic: {
    resolutions: number;
    confirmed: number;
    refuted: number;
    inconclusive: number;
    closedConfirmed: number;
    closedRefuted: number;
    reopened: number;
    demoted: number;
    promoted: number;
    discarded: number;
    researchable: number;
    transitions: number;
    evidenceDriven: number;
    byStatus: Record<string, number>;
    byVerdict: Record<ResolutionVerdict, number>;
    byTransition: string[];
  };
  loop: {
    waves: number;
    runs: number;
    processes: number;
    hosts: number;
    handoffs: number;
    researchResults: number;
    feedbackUpdates: number;
  };
  research: {
    results: number;
    m6Results: number;
    m7Results: number;
    confirmed: number;
    refuted: number;
    inconclusive: number;
    realResponses: number;
    deterministicResponses: number;
    replayMisses: number;
    claims: number;
    supportedClaims: number;
    contradictedClaims: number;
    evidenceRefs: number;
    newEvidence: number;
    providers: string[];
  };
  contradictions: {
    total: number;
    resolved: number;
    conserved: number;
  };
  provenance: {
    edges: number;
    completeChains: number;
    missingChains: number;
  };
  distributed: {
    nodesUp: number;
    nodesDown: number;
    degraded: boolean;
    remoteEscalations: number;
    realNodeParticipation: boolean;
  };
  recovery: { events: number; byKind: Record<string, number> };
  idempotency: { noOps: number; attempted: number };
  performance: {
    costUnits: number;
    localCalls: number;
    remoteCalls: number;
    deterministicCalls: number;
    inputsPerCycle: number;
  };
  quality: {
    resolutionCoverage: number;
    evidenceDrivenRate: number;
    provenanceCoverage: number;
    positiveAssessmentRate: number;
    contradictionRate: number;
  };
  falsePositiveObservations: string[];
}

export interface M7Observability {
  kind: 'athenasignal.m7.observability.v1';
  generatedAt: string;
  discovered: { sources: number; uniqueSources: number; signals: number; clusters: number; candidates: number };
  epistemicBoard: Record<EpistemicStatus, string[]>;
  sentToAthenaOs: string[];
  researching: string[];
  returned: string[];
  changed: Array<{ candidateId: string; from: EpistemicStatus; to: EpistemicStatus; why: string }>;
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

export interface M7HumanReviewPacket {
  kind: 'athenasignal.m7.human_review_packet.v1';
  generatedAt: string;
  rubric: Array<{ id: string; question: string }>;
  bestClosedLoopStory: string;
  worstClosedLoopStory: string;
  confirmedCase: { candidateId: string; why: string; evidenceRefs: string[] } | null;
  refutedCase: { candidateId: string; why: string; evidenceRefs: string[] } | null;
  mostImportantFeedback: { candidateId: string; changes: string[]; why: string } | null;
  evidenceDrivenTransition: { candidateId: string; from: EpistemicStatus; to: EpistemicStatus; why: string } | null;
  contradictionHandling: { candidateId: string; kind: 'RESOLVED' | 'CONSERVED'; why: string } | null;
  majorPromotion: { candidateId: string; why: string } | null;
  majorDemotion: { candidateId: string; why: string } | null;
  majorClosure: { candidateId: string; status: EpistemicStatus; why: string } | null;
  majorReopening: { candidateId: string; why: string } | null;
  failureAndRecovery: { recoveryId: string; kind: string; why: string } | null;
  distributedExample: string;
  longRunningTimeline: string[];
  akpToAthenaOsToAkpTrace: M7HandoffTrace['trace'];
}

export interface M7State {
  kind: 'athenasignal.m7.state.v1';
  schemaVersion: 1;
  updatedAt: string;
  importedFrom: string;
  radar: RadarState;
  m6: M6State;
  waves: M7Wave[];
  resolutions: EpistemicResolution[];
  results: M7ResearchResult[];
  feedback: M6State['feedback'];
  contradictions: M7Contradiction[];
  provenance: M7ProvenanceGraph;
  handoffTrace: M7HandoffTrace;
  recovery: RecoveryEvent[];
  idempotency: IdempotencyRecord[];
  routed: RoutingDecision[];
}

export interface M7Artifacts {
  corpus: M7Corpus;
  benchmark: M7Benchmark;
  loopTimeline: M7LoopTimeline;
  state: M7State;
  radarState: RadarState;
  akpLive: M7AkpLive;
  athenaosResults: {
    kind: 'athenasignal.m7.athenaos_results.v1';
    generatedAt: string;
    results: M7ResearchResult[];
  };
  feedbackUpdates: {
    kind: 'athenasignal.m7.feedback_updates.v1';
    generatedAt: string;
    updates: M6State['feedback'];
    byChange: Record<string, number>;
  };
  epistemicResolutions: {
    kind: 'athenasignal.m7.epistemic_resolutions.v1';
    generatedAt: string;
    resolutions: EpistemicResolution[];
    byStatus: Record<EpistemicStatus, string[]>;
  };
  contradictions: {
    kind: 'athenasignal.m7.contradictions.v1';
    generatedAt: string;
    contradictions: M7Contradiction[];
    resolved: number;
    conserved: number;
  };
  provenance: M7ProvenanceGraph;
  handoffTrace: M7HandoffTrace;
  metrics: M7Metrics;
  cognitiveRouting: {
    kind: 'athenasignal.m7.cognitive_routing.v1';
    generatedAt: string;
    decisions: RoutingDecision[];
    byRoute: Record<string, number>;
    byStage: Record<string, Record<string, number>>;
  };
  observability: M7Observability;
  recoveryEvents: {
    kind: 'athenasignal.m7.recovery_events.v1';
    generatedAt: string;
    events: RecoveryEvent[];
    byKind: Record<string, number>;
  };
  idempotency: {
    kind: 'athenasignal.m7.idempotency.v1';
    generatedAt: string;
    records: IdempotencyRecord[];
    noOps: number;
    attempted: number;
  };
  distributed: M6State['distribution'] & { degraded: boolean };
  humanReview: M7HumanReviewPacket;
}

export interface M7RunOptions {
  outputDir?: string;
  akpDir?: string;
  generatedAt?: string;
  write?: boolean;
  llmRecordingPath?: string;
  /** Proveedor real/envuelto para grabar la investigación M7 (modo live). */
  workerLlm?: import('../llm/types.ts').LLMProvider;
  workerRecording?: import('../llm/RecordReplay.ts').LLMRecording;
  onWorkerRecording?: (recording: import('../llm/RecordReplay.ts').LLMRecording) => void;
  distributed?: boolean;
}

export interface M7RunSummary {
  artifacts: M7Artifacts;
  state: M7State;
  missingRecordings: string[];
  outputPaths: M7OutputPaths;
}

export interface M7OutputPaths {
  corpus: string;
  benchmark: string;
  loopTimeline: string;
  radarState: string;
  akpLive: string;
  athenaosResults: string;
  feedbackUpdates: string;
  epistemicResolutions: string;
  contradictions: string;
  provenance: string;
  handoffTrace: string;
  metrics: string;
  cognitiveRouting: string;
  observability: string;
  recoveryEvents: string;
  idempotency: string;
  distributed: string;
  humanReview: string;
}

export type {
  FindingKind,
  ResearchAssessment,
  SourceRole,
  Priority,
  M4Cycle,
  RadarState,
  RecoveryEvent,
  RoutingDecision,
  IdempotencyRecord,
  AthenaOsResearchResult,
  M6State,
  M6Corpus,
};
