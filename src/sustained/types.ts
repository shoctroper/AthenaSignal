/**
 * Tipos del milestone M8 — Sustained Autonomous Editorial Operation (ORDEN-012).
 *
 * M8 convierte el loop epistémicamente resolutivo de M7 en una **operación
 * editorial sostenida**: un scheduler real mantiene el circuito
 * `AthenaSignal → AKP → AthenaOS → AKP → AthenaSignal` durante una ventana
 * prolongada, descubriendo material nuevo, investigando candidates, mutando el
 * radar y recuperándose de fallos sin coordinación manual entre iteraciones.
 *
 * La capa de sostenimiento no sustituye al radar ni al ledger epistémico: los
 * supervisa y los anota. La cognición proviene de las grabaciones reales M6/M7
 * y de las invocaciones reales a los motores (AthenaOS `athena.dll` y
 * AthenaKnowledge) documentadas en `evidence/m8/recordings/real-engines.json`.
 */

import type { M6State } from '../closedloop/types.ts';
import type {
  EpistemicResolution,
  EpistemicStatus,
  M7Contradiction,
  M7Corpus,
  M7HandoffTrace,
  M7ProvenanceGraph,
  M7ResearchResult,
} from '../epistemic/types.ts';
import type { RecoveryEvent, IdempotencyRecord, RoutingDecision, RunStatus } from '../platform/types.ts';
import type { RadarState, SignalObservation } from '../radar/types.ts';

export type SchedulerPhase =
  | 'DISCOVER'
  | 'TRIAGE'
  | 'CANDIDATE'
  | 'HANDOFF'
  | 'RESEARCH'
  | 'RETURN'
  | 'FEEDBACK'
  | 'RADAR'
  | 'PERSIST';

export const SCHEDULER_PHASES: SchedulerPhase[] = [
  'DISCOVER',
  'TRIAGE',
  'CANDIDATE',
  'HANDOFF',
  'RESEARCH',
  'RETURN',
  'FEEDBACK',
  'RADAR',
  'PERSIST',
];

/** Un tick del scheduler sostenido: una iteración completa del circuito. */
export interface SchedulerTick {
  tick: number;
  cycleId: string;
  processId: string;
  host: string;
  phases: SchedulerPhase[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: RunStatus;
  sourcesObserved: number;
  newSignals: number;
  knownSignals: number;
  duplicateSources: number;
  candidates: number;
  handoffs: number;
  results: number;
  feedback: number;
  recovery: string[];
  notes: string;
}

export interface SustainedProcess {
  processId: string;
  host: string;
  startedAt: string;
  endedAt: string | null;
  status: RunStatus;
  ticks: number;
  restarts: number;
  resumedFrom: string | null;
  notes: string;
}

export interface SustainedHost {
  host: string;
  address: string;
  reachable: boolean;
  role: string;
  notes: string;
}

export interface M8Scheduler {
  kind: 'athenasignal.m8.scheduler.v1';
  generatedAt: string;
  windowId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  tickCount: number;
  processes: SustainedProcess[];
  hosts: SustainedHost[];
  phases: SchedulerPhase[];
  ticks: SchedulerTick[];
}

/** Grabación de una ventana de operación ejecutada en **tiempo de reloj real**. */
export interface M8WindowRecordingTick {
  tick: number;
  processId: string;
  host: string;
  cycleId: string;
  phases: SchedulerPhase[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: RunStatus;
  sourcesObserved: number;
  newSignals: number;
  knownSignals: number;
  duplicateSources: number;
  recovery: string[];
  notes: string;
}

export interface M8WindowRecording {
  kind: 'athenasignal.m8.window_recording.v1';
  recordedAt: string;
  mode: 'real-clock';
  windowId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  tickCount: number;
  tickIntervalMs: number;
  ticks: M8WindowRecordingTick[];
  processes: SustainedProcess[];
  notes: string;
}

/** Investigación real end-to-end ejecutada por AthenaOS sobre el knowledge de AKP. */
export interface M8RealResearch {
  kind: 'athenasignal.m8.real_research.v1';
  recordedAt: string;
  provider: string;
  knowledgeDir: string;
  knowledgeFacts: number;
  topic: string;
  caseId: string;
  state: string;
  claims: number;
  disputed: number;
  fidelity: number;
  showExcerpt: string;
  exportPath: string | null;
  invocationIds: string[];
  limitation: string;
}

/** Ingesta real AKP end-to-end usada como base del handoff hacia AthenaOS. */
export interface M8AkpIngestion {
  kind: 'athenasignal.m8.akp_ingestion.v1';
  recordedAt: string;
  sourceDocuments: number;
  documentsImported: number;
  fragmentsCreated: number;
  assertionsExtracted: number;
  candidateFactsCreated: number;
  knownFactsWritten: number;
  conflictsDetected: number;
  duplicatesDetected: number;
  reportPath: string;
  knowledgeRepository: string;
  bridgedKnowledgeDir: string;
  bridgedFacts: number;
  athenaosAcceptedFacts: number;
  invocationIds: string[];
}

export interface M8OperationTimeline {
  kind: 'athenasignal.m8.operation_timeline.v1';
  generatedAt: string;
  windowId: string;
  ticks: SchedulerTick[];
  researchWaves: M8ResearchWave[];
  epistemicTransitions: import('../epistemic/types.ts').EpistemicTransition[];
  m6Runs: M6State['runs'];
  m6Loop: M6State['loop'];
}

export interface M8ResearchWave {
  wave: number;
  runId: string;
  tick: number;
  host: string;
  startedAt: string;
  endedAt: string;
  candidates: string[];
  resultIds: string[];
  transitionIds: string[];
  feedbackIds: string[];
  notes: string;
}

export interface M8Corpus extends Omit<M7Corpus, 'kind'> {
  kind: 'athenasignal.m8.corpus.v1';
  m8SourceIds: string[];
  baseM7SourceCount: number;
}

export interface M8RealEngineInvocation {
  engine: 'athenaos' | 'athenaknowledge' | 'ubuntu-node' | 'macmini-node';
  host: string;
  command: string;
  exitCode: number;
  durationMs: number;
  stdoutSha256: string;
  outputExcerpt: string;
  status: 'OK' | 'ERROR' | 'UNREACHABLE';
  recordedAt: string;
  notes: string;
}

export interface M8RealEngines {
  kind: 'athenasignal.m8.real_engines.v1';
  recordedAt: string;
  invocations: M8RealEngineInvocation[];
  distributed: {
    ubuntu: SustainedHost;
    macmini: SustainedHost;
  };
}

export interface M8Metrics {
  kind: 'athenasignal.m8.metrics.v1';
  generatedAt: string;
  window: { startedAt: string; endedAt: string; durationMs: number; ticks: number; processes: number; hosts: number };
  scale: {
    sources: number;
    uniqueSources: number;
    baseM7Sources: number;
    m8Sources: number;
    m7Sources: number;
    baseM6Sources: number;
    cycles: number;
    cyclesProcessed: number;
    inputsObserved: number;
    signalsTracked: number;
    clusters: number;
    candidates: number;
  };
  sustained: {
    ticks: number;
    ticksCompleted: number;
    restarts: number;
    resumePoints: number;
    observationCycles: number;
    newSignals: number;
    knownSignals: number;
    duplicateSources: number;
    researchWaves: number;
    candidatesResearched: number;
  };
  epistemic: {
    resolutions: number;
    transitions: number;
    evidenceDriven: number;
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
    byStatus: Record<string, number>;
    byVerdict: Record<string, number>;
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
    m7Results: number;
    m8Results: number;
    confirmed: number;
    refuted: number;
    inconclusive: number;
    realResponses: number;
    deterministicResponses: number;
    replayMisses: number;
    claims: number;
    evidenceRefs: number;
    providers: string[];
  };
  contradictions: { total: number; resolved: number; conserved: number };
  provenance: { edges: number; completeChains: number; missingChains: number };
  distributed: {
    nodesUp: number;
    nodesDown: number;
    degraded: boolean;
    remoteEscalations: number;
    ubuntuReachable: boolean;
    macminiReachable: boolean;
    realEngineInvocations: number;
  };
  recovery: { events: number; byKind: Record<string, number> };
  idempotency: { noOps: number; attempted: number };
  performance: {
    costUnits: number;
    localCalls: number;
    remoteCalls: number;
    deterministicCalls: number;
    inputsPerTick: number;
    avgTickMs: number;
  };
  quality: {
    resolutionCoverage: number;
    evidenceDrivenRate: number;
    provenanceCoverage: number;
    sustainedTicksCompleted: number;
    researchResponseRate: number;
  };
}

export interface M8Observability {
  kind: 'athenasignal.m8.observability.v1';
  generatedAt: string;
  windowId: string;
  discovered: { sources: number; uniqueSources: number; signals: number; clusters: number; candidates: number };
  epistemicBoard: Record<EpistemicStatus, string[]>;
  scheduler: { ticks: number; processes: number; restarts: number; resumes: number };
  sentToAthenaOs: string[];
  returned: string[];
  changed: Array<{ candidateId: string; from: EpistemicStatus; to: EpistemicStatus; why: string }>;
  failures: { recoveryEvents: number; byKind: Record<string, number> };
  pending: string[];
  cost: { llmCalls: number; localCalls: number; remoteCalls: number; deterministicCalls: number; estimatedCostUnits: number };
}

export interface M8Cost {
  kind: 'athenasignal.m8.cost.v1';
  generatedAt: string;
  llmCalls: number;
  byProvider: Record<string, number>;
  byRoute: Record<string, number>;
  byStage: Record<string, Record<string, number>>;
  localCalls: number;
  remoteCalls: number;
  deterministicCalls: number;
  replayHits: number;
  replayMisses: number;
  estimatedCostUnits: number;
  costModel: string;
  limitation: string;
}

export interface M8HumanReviewPacket {
  kind: 'athenasignal.m8.human_review_packet.v1';
  generatedAt: string;
  windowId: string;
  durationMs: number;
  rubric: Array<{ id: string; question: string }>;
  timeline: string[];
  bestStory: string;
  worstStory: string;
  confirmedCase: { candidateId: string; why: string; evidenceRefs: string[] } | null;
  refutedCase: { candidateId: string; why: string; evidenceRefs: string[] } | null;
  uncertainCase: { candidateId: string; why: string } | null;
  closedCases: Array<{ candidateId: string; status: EpistemicStatus; why: string }>;
  radarMutations: Array<{ candidateId: string; changes: string[]; why: string }>;
  promotion: { candidateId: string; why: string } | null;
  demotion: { candidateId: string; why: string } | null;
  reopening: { candidateId: string; why: string } | null;
  closure: { candidateId: string; status: EpistemicStatus; why: string } | null;
  ubuntuExecution: M8RealEngineInvocation[];
  realResearch: M8RealResearch | null;
  akpIngestion: M8AkpIngestion | null;
  failoverRecovery: { recoveryId: string; kind: string; why: string } | null;
  akpToAthenaOsToAkpTrace: M7HandoffTrace['trace'];
  metrics: {
    quality: number;
    avgTickMs: number;
    costUnits: number;
    llmCalls: number;
    sources: number;
    candidates: number;
  };
  limitations: string[];
}

export interface M8Artifacts {
  corpus: M8Corpus;
  benchmark: {
    kind: 'athenasignal.m8.benchmark.v1';
    generatedAt: string;
    entries: Array<{ id: string; description: string; observed: boolean; evidence: string }>;
    coverage: number;
    falsePositiveObservations: string[];
  };
  scheduler: M8Scheduler;
  operationTimeline: M8OperationTimeline;
  radarState: RadarState;
  akpLive: {
    kind: 'athenasignal.m8.akp_live.v1';
    generatedAt: string;
    inboxDir: string;
    returnDir: string;
    transport: string;
    consumer: string;
    worker: string;
    handoffs: Array<{ handoffId: string; candidateId: string; clusterId: string; contentHash: string; wave: number; consumedAt: string }>;
    consumed: number;
    resultsReturned: number;
    returnedResultIds: string[];
    ingestion: M8AkpIngestion | null;
    limitation: string;
  };
  athenaosReal: {
    kind: 'athenasignal.m8.athenaos_real.v1';
    generatedAt: string;
    engines: M8RealEngines;
    realResearch: M8RealResearch | null;
    replayedResults: M7ResearchResult[];
    m8Results: M7ResearchResult[];
    note: string;
  };
  feedbackUpdates: {
    kind: 'athenasignal.m8.feedback_updates.v1';
    generatedAt: string;
    updates: M6State['feedback'];
    byChange: Record<string, number>;
  };
  epistemicResolutions: {
    kind: 'athenasignal.m8.epistemic_resolutions.v1';
    generatedAt: string;
    resolutions: EpistemicResolution[];
    byStatus: Record<EpistemicStatus, string[]>;
  };
  contradictions: {
    kind: 'athenasignal.m8.contradictions.v1';
    generatedAt: string;
    contradictions: M7Contradiction[];
    resolved: number;
    conserved: number;
  };
  distributed: M6State['distribution'] & {
    degraded: boolean;
    ubuntuReachable: boolean;
    macminiReachable: boolean;
    documented: SustainedHost[];
  };
  recoveryEvents: {
    kind: 'athenasignal.m8.recovery_events.v1';
    generatedAt: string;
    events: RecoveryEvent[];
    byKind: Record<string, number>;
  };
  idempotency: {
    kind: 'athenasignal.m8.idempotency.v1';
    generatedAt: string;
    records: IdempotencyRecord[];
    noOps: number;
    attempted: number;
  };
  provenance: M7ProvenanceGraph;
  handoffTrace: M7HandoffTrace;
  metrics: M8Metrics;
  observability: M8Observability;
  cost: M8Cost;
  humanReview: M8HumanReviewPacket;
}

export interface M8RunSummary {
  artifacts: M8Artifacts;
  corpus: M8Corpus;
  scheduler: M8Scheduler;
  observations: Record<string, SignalObservation>;
  missingRecordings: string[];
  outputPaths: M8OutputPaths;
}

export interface M8OutputPaths {
  corpus: string;
  benchmark: string;
  scheduler: string;
  operationTimeline: string;
  radarState: string;
  akpLive: string;
  athenaosReal: string;
  feedbackUpdates: string;
  epistemicResolutions: string;
  contradictions: string;
  distributed: string;
  recoveryEvents: string;
  idempotency: string;
  provenance: string;
  handoffTrace: string;
  metrics: string;
  observability: string;
  cost: string;
  humanReview: string;
}

export type {
  EpistemicResolution,
  EpistemicStatus,
  M7Contradiction,
  M7Corpus,
  M7HandoffTrace,
  M7ProvenanceGraph,
  M7ResearchResult,
  RadarState,
  RecoveryEvent,
  IdempotencyRecord,
  RoutingDecision,
  SignalObservation,
};
