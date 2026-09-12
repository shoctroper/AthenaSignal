/**
 * Tipos del milestone M5 — Autonomous Editorial Intelligence Platform
 * (ORDEN-009).
 *
 * M5 continúa el radar persistente de M4 sin romperlo: conserva el
 * `RadarState` como memoria histórica viva y agrega la capa de plataforma
 * (routing cognitivo, multi-proceso, recovery, idempotencia, sink AKP y
 * observabilidad). El contrato de handoff (`athenasignal.research_candidate.handoff.v1`)
 * se preserva.
 */

import type { AthenaOsHandoff } from '../domain/entities.ts';
import type { Priority } from '../autonomous/types.ts';
import type {
  M4Corpus,
  RadarState,
  RadarTimeline,
} from '../radar/types.ts';

/** Ruta por la que se resolvió una etapa cognitiva (ORDEN-009 §3). */
export type CognitiveRoute =
  | 'LOCAL'
  | 'LOCAL_ALT'
  | 'REMOTE_ESCALATION'
  | 'DETERMINISTIC_FALLBACK';

export const COGNITIVE_ROUTES: CognitiveRoute[] = [
  'LOCAL',
  'LOCAL_ALT',
  'REMOTE_ESCALATION',
  'DETERMINISTIC_FALLBACK',
];

/** Salud determinista de un nodo de la topología. */
export interface NodeHealth {
  node: string;
  route: CognitiveRoute;
  status: 'UP' | 'DOWN';
  reason: string;
}

/** Nodo cognitivo abstracto: nunca depende de red en la aceptación offline. */
export interface CognitiveNode {
  node: string;
  route: CognitiveRoute;
  provider: import('../llm/types.ts').LLMProvider;
  model: string;
  /** Determinista: el test/replay decide la salud sin sondas de red. */
  healthy: () => boolean;
  reason: string;
}

export interface RoutingDecision {
  decisionId: string;
  sequence: number;
  runId: string;
  stage: string;
  route: CognitiveRoute;
  node: string;
  provider: string;
  model: string;
  /** true cuando la respuesta provino del fallback determinista seguro. */
  deterministic: boolean;
  /** true cuando se degradó a una ruta distinta de la preferida. */
  fallback: boolean;
  /** true cuando se usó escalado remoto justificado. */
  escalated: boolean;
  reason: string;
}

export type RecoveryKind =
  | 'PROCESS_RESTART'
  | 'NODE_DOWN'
  | 'LLM_FALLBACK'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'PARTIAL_RUN'
  | 'REPLAY_MISS';

export type RecoveryAction = 'RESUMED' | 'FALLBACK' | 'SKIPPED' | 'RETRIED' | 'DEGRADED';

export interface RecoveryEvent {
  recoveryId: string;
  runId: string;
  at: string;
  kind: RecoveryKind;
  subject: string;
  action: RecoveryAction;
  detail: string;
}

export type IdempotencyKind = 'CYCLE' | 'SOURCE' | 'SIGNAL' | 'HANDOFF' | 'RUN';

export interface IdempotencyRecord {
  key: string;
  kind: IdempotencyKind;
  runId: string;
  appliedAt: string;
  attempts: number;
  noOp: boolean;
  detail: string;
}

export type RunStatus = 'COMPLETED' | 'CRASHED' | 'IDEMPOTENT_NOOP';

export interface M5RunMetrics {
  cyclesRequested: number;
  cyclesApplied: number;
  inputsObserved: number;
  newSignals: number;
  knownSignals: number;
  duplicateSources: number;
  routingDecisions: number;
  fallbacks: number;
}

export interface M5Run {
  runId: string;
  processId: string;
  startedAt: string;
  endedAt: string | null;
  resumedFrom: string | null;
  status: RunStatus;
  crashAt: string | null;
  crashReason: string | null;
  cyclesRequested: string[];
  cyclesApplied: string[];
  metrics: M5RunMetrics;
}

export type AkpDeliveryStatus =
  | 'DELIVERED_TO_SINK'
  | 'CONSUMED'
  | 'DUPLICATE_SUPPRESSED';

export interface AkpDelivery {
  handoffId: string;
  candidateId: string;
  clusterId: string;
  version: number;
  contentHash: string;
  deliveredAt: string;
  runId: string;
  status: AkpDeliveryStatus;
  validation: { valid: boolean; errors: string[] };
  recommendedAthenaOsInput: AthenaOsHandoff;
  consumption: {
    consumer: string | null;
    consumedAt: string | null;
    limitation: string;
  };
}

/** Resultado de la ingesta real del lado-AKP (consumidor local del sink). */
export type AkpConsumptionStatus = 'INGESTED' | 'DUPLICATE' | 'INVALID';

export interface AkpConsumptionRecord {
  handoffId: string;
  candidateId: string;
  clusterId: string;
  contentHash: string;
  status: AkpConsumptionStatus;
  inboxPath: string | null;
  consumedAt: string;
  validation: { valid: boolean; errors: string[] };
}

export interface AkpConsumption {
  kind: 'athenasignal.m5.akp_consumption.v1';
  consumer: string;
  consumedAt: string;
  /** Handoffs válidos y distintos efectivamente consumidos por AKP. */
  consumed: number;
  /** Handoffs escritos en el inbox en esta corrida. */
  ingested: number;
  /** Handoffs válidos ya presentes en el inbox (idempotencia). */
  duplicates: number;
  invalid: number;
  inboxDir: string;
  records: AkpConsumptionRecord[];
}

export interface M5Counters {
  /** Ingestiones observadas (sourceId × ciclo) a lo largo de toda la vida. */
  inputsObserved: number;
  cyclesProcessed: number;
  runs: number;
  signals: number;
  clusters: number;
  candidates: number;
  promoted: number;
  discarded: number;
  routingDecisions: number;
  localRoutes: number;
  remoteRoutes: number;
  deterministicRoutes: number;
  recoveryEvents: number;
  idempotencyNoops: number;
  akpDeliveries: number;
}

/** Estado persistente de la plataforma M5. */
export interface M5PlatformState {
  kind: 'athenasignal.m5.platform_state.v1';
  schemaVersion: 1;
  updatedAt: string;
  importedFrom: string | null;
  radar: RadarState;
  runs: M5Run[];
  routing: RoutingDecision[];
  recovery: RecoveryEvent[];
  idempotency: IdempotencyRecord[];
  akp: {
    sink: string;
    consumed: number;
    limitation: string;
    deliveries: AkpDelivery[];
    /** Ingesta real del lado-AKP (o null si no se ejecutó el consumidor). */
    consumption: AkpConsumption | null;
  };
  counters: M5Counters;
}

/** Corpus M5: ciclos M4 heredados + observación continua ampliada. */
export interface M5Corpus extends M4Corpus {
  kind: 'athenasignal.m5.corpus.v1';
  extendedSourceIds: string[];
}

export interface M5CorpusBuildOptions {
  /** Fuentes reales extendidas ya materializadas (por defecto se leen de evidence/m3/raw). */
  extendedSources?: import('../autonomous/types.ts').CorpusItem[];
}

export interface M5BenchmarkClass {
  id: string;
  description: string;
  observed: boolean;
  evidence: string;
}

export interface M5Benchmark {
  kind: 'athenasignal.m5.benchmark.v1';
  generatedAt: string;
  entries: M5BenchmarkClass[];
  coverage: number;
  falsePositiveObservations: string[];
}

export interface M5BenchmarkEntry {
  id: string;
  description: string;
  /** Cómo se verifica la clase sobre el estado final. */
  check: string;
}

export interface M5Metrics {
  kind: 'athenasignal.m5.metrics.v1';
  generatedAt: string;
  runs: number;
  processes: number;
  cycles: number;
  sources: number;
  extendedSources: number;
  inputsObserved: number;
  uniqueSources: number;
  repeatedSources: number;
  signalsTracked: number;
  newSignals: number;
  knownSignals: number;
  duplicates: number;
  related: number;
  clusters: number;
  multiSourceClusters: number;
  candidates: number;
  discarded: number;
  promoted: number;
  priorityChanges: number;
  evidenceUpdates: number;
  reassessments: number;
  contradictions: number;
  supported: number;
  unsupported: number;
  ambiguous: number;
  reframed: number;
  averageSourcesPerCandidate: number;
  languages: Record<string, number>;
  platforms: Record<string, number>;
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
  research: {
    queries: number;
    evidenceItems: number;
  };
  recovery: {
    events: number;
    byKind: Record<string, number>;
  };
  idempotency: {
    noOps: number;
    attempted: number;
  };
  akp: {
    delivered: number;
    consumed: number;
    suppressed: number;
  };
  rawAssessments: Record<string, number>;
  falsePositiveObservations: string[];
}

export interface M5Observability {
  kind: 'athenasignal.m5.observability.v1';
  generatedAt: string;
  topology: {
    nodes: Array<{
      node: string;
      route: CognitiveRoute;
      model: string;
      health: 'UP' | 'DOWN';
      reason: string;
    }>;
  };
  runs: Array<{
    runId: string;
    processId: string;
    status: RunStatus;
    cyclesRequested: number;
    cyclesApplied: number;
    inputsObserved: number;
    fallbacks: number;
    resumedFrom: string | null;
    crashed: boolean;
  }>;
  processed: {
    cycles: string[];
    pending: string[];
    sources: number;
  };
  routing: {
    decisions: number;
    byRoute: Record<string, number>;
    fallbacks: number;
    escalationReasons: string[];
  };
  failures: {
    recoveryEvents: number;
    byKind: Record<string, number>;
  };
  pending: {
    cycles: string[];
    candidatesActive: number;
  };
  promoted: string[];
  discarded: string[];
  cost: {
    llmCalls: number;
    localCalls: number;
    remoteCalls: number;
    deterministicCalls: number;
    estimatedRemoteCostUnits: number;
  };
}

export interface M5HumanReviewPacket {
  kind: 'athenasignal.m5.human_review_packet.v1';
  generatedAt: string;
  rubric: Array<{ id: string; question: string }>;
  longitudinalStory: string[];
  bestCandidate: {
    candidateId: string;
    title: string;
    priority: Priority;
    assessment: string;
    firstCycle: string;
    lastCycle: string;
    cyclesSeen: number;
    sources: number;
    why: string;
  } | null;
  newestDiscovery: { candidateId: string; firstCycle: string; why: string } | null;
  priorityEvolution: Array<{
    candidateId: string;
    from: Priority;
    to: Priority;
    cycles: string[];
  }>;
  recovered: Array<{ recoveryId: string; kind: RecoveryKind; runId: string; why: string }>;
  akpConsumption: {
    delivered: number;
    consumed: number;
    consumer: string | null;
    limitation: string;
  };
  promoted: Array<{ candidateId: string; promotionReason: string | null; validationValid: boolean }>;
}

export interface M5Artifacts {
  corpus: M5Corpus;
  benchmark: M5Benchmark;
  runTimeline: {
    kind: 'athenasignal.m5.run_timeline.v1';
    generatedAt: string;
    runs: M5Run[];
  };
  state: M5PlatformState;
  metrics: M5Metrics;
  cognitiveRouting: {
    kind: 'athenasignal.m5.cognitive_routing.v1';
    generatedAt: string;
    policy: Record<string, CognitiveRoute[]>;
    decisions: RoutingDecision[];
    byRoute: Record<string, number>;
    byStage: Record<string, Record<string, number>>;
    fallbackReasons: string[];
  };
  observability: M5Observability;
  recoveryEvents: {
    kind: 'athenasignal.m5.recovery_events.v1';
    generatedAt: string;
    events: RecoveryEvent[];
    byKind: Record<string, number>;
  };
  idempotency: {
    kind: 'athenasignal.m5.idempotency.v1';
    generatedAt: string;
    records: IdempotencyRecord[];
    noOps: number;
    attempted: number;
  };
  akpHandoff: {
    kind: 'athenasignal.m5.akp_handoff.v1';
    generatedAt: string;
    sink: string;
    limitation: string;
    consumed: number;
    consumption: AkpConsumption | null;
    deliveries: AkpDelivery[];
  };
  humanReview: M5HumanReviewPacket;
}

export type { M4Corpus, RadarState, RadarTimeline };
