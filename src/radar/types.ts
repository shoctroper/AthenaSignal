/**
 * Tipos del milestone M4 — Continuous Editorial Radar (ORDEN-008).
 *
 * Extienden el modelo M1/M2/M3 sin romperlo. La capa de radar mantiene un
 * modelo vivo y persistente de qué oportunidades existen, cómo evolucionan y
 * cuáles merecen atención ahora. El contrato de handoff AKP
 * (`athenasignal.research_candidate.handoff.v1`) se preserva.
 */

import type {
  AthenaOsHandoff,
  ResearchAssessment,
} from '../domain/entities.ts';
import type {
  Corpus,
  CorpusItem,
  DiscoveredSignal,
  EvidenceItem,
  InterpretedFinding,
  Priority,
  ResearchabilityAssessment,
} from '../autonomous/types.ts';
import type { RubricItem } from '../autonomous/types.ts';

/** Eventos que el radar debe poder observar a lo largo del tiempo (ORDEN-008 §2). */
export type RadarEventKind =
  | 'NEW'
  | 'KNOWN'
  | 'DUPLICATE'
  | 'RELATED'
  | 'UPDATED'
  | 'CONTRADICTED'
  | 'REASSESSED'
  | 'PRIORITY_CHANGED'
  | 'DISCARDED'
  | 'PROMOTED';

export const RADAR_EVENT_KINDS: RadarEventKind[] = [
  'NEW',
  'KNOWN',
  'DUPLICATE',
  'RELATED',
  'UPDATED',
  'CONTRADICTED',
  'REASSESSED',
  'PRIORITY_CHANGED',
  'DISCARDED',
  'PROMOTED',
];

export type RadarSubjectType = 'SOURCE' | 'SIGNAL' | 'CLUSTER' | 'CANDIDATE';

export interface RadarEvent {
  eventId: string;
  kind: RadarEventKind;
  cycleId: string;
  cycleNumber: number;
  occurredAt: string;
  subjectType: RadarSubjectType;
  subjectId: string;
  message: string;
  details: Record<string, unknown>;
}

/** Defunción de un ciclo de descubrimiento continuo. */
export interface M4Cycle {
  cycleId: string;
  cycleNumber: number;
  occurredAt: string;
  sourceIds: string[];
  notes: string;
}

export interface M4Corpus extends Corpus {
  kind: 'athenasignal.m4.corpus.v1';
  cycles: M4Cycle[];
}

export interface RadarSignalRecord {
  signalId: string;
  corpusId: string;
  topic: string;
  assertion: string;
  policy: string;
  fingerprint: string;
  firstSeenCycle: string;
  lastSeenCycle: string;
  seenCount: number;
  clusterId: string;
  assessment: ResearchAssessment;
  researchabilityLevel: string;
  editorialScore: number;
  noiseLikelihood: number;
  findingCount: number;
  evidenceUrls: string[];
  contradiction: boolean;
}

export interface PriorityPoint {
  cycleId: string;
  cycleNumber: number;
  priority: Priority;
  score: number;
}

/** Punto del historial de estado editorial (no sobrescribe el pasado). */
export interface StatusPoint {
  cycleId: string;
  cycleNumber: number;
  status: RadarClusterStatus;
  reason: string;
  at: string;
}

export type RadarClusterStatus = 'ACTIVE' | 'DISCARDED' | 'PROMOTED';

export interface RadarCluster {
  clusterId: string;
  label: string;
  tokens: string[];
  signalIds: string[];
  sourceIds: string[];
  authoritySourceIds: string[];
  evidenceUrls: string[];
  assessment: ResearchAssessment;
  priority: Priority;
  priorityScore: number;
  priorityHistory: PriorityPoint[];
  /** Historial completo de estados editoriales; nunca se sobrescribe el pasado. */
  statusHistory: StatusPoint[];
  /** Explicación observable de la prioridad (score + nº de fuentes + contradicción). */
  priorityReasons: string[];
  contradiction: boolean;
  contradictionDetails: string[];
  /** Explica por qué un assessment positivo coexiste con una contradicción abierta. */
  resolutionNote: string | null;
  firstCycle: string;
  lastCycle: string;
  status: RadarClusterStatus;
  highSinceCycle: number | null;
  promotedAt: string | null;
}

export interface RadarCandidate {
  candidateId: string;
  clusterId: string;
  title: string;
  researchQuestion: string;
  originSignalIds: string[];
  sourceIds: string[];
  assessment: ResearchAssessment;
  priority: Priority;
  priorityScore: number;
  priorityHistory: PriorityPoint[];
  priorityReasons: string[];
  resolutionNote: string | null;
  status: RadarClusterStatus;
  /** Historial completo de estados editoriales; nunca se sobrescribe el pasado. */
  statusHistory: StatusPoint[];
  firstCycle: string;
  lastCycle: string;
  recommendedAthenaOsInput: AthenaOsHandoff;
  promotionReason: string | null;
  promotionReasons: string[];
}

export interface ProcessedSource {
  firstCycle: string;
  contentHash: string;
  timesSeen: number;
}

export interface RadarState {
  kind: 'athenasignal.m4.radar_state.v1';
  updatedAt: string;
  cyclesProcessed: string[];
  processedSources: Record<string, ProcessedSource>;
  signals: Record<string, RadarSignalRecord>;
  clusters: Record<string, RadarCluster>;
  candidates: Record<string, RadarCandidate>;
  events: RadarEvent[];
  eventCounts: Record<string, number>;
}

/** Observación cognitiva de una señal; cachea la salida del pipeline M3. */
export interface SignalObservation {
  signal: DiscoveredSignal;
  item: CorpusItem;
  evidence: EvidenceItem[];
  findings: InterpretedFinding[];
  assessment: ResearchAssessment;
  reasoning: string;
  contradictions: string[];
  researchability: ResearchabilityAssessment;
  editorialScore: number;
  reframingNote: string | null;
  candidateBase: import('../autonomous/candidateBuilder.ts').CandidateBase;
}

export interface RadarCycleResult {
  cycle: M4Cycle;
  events: RadarEvent[];
  eventCounts: Record<string, number>;
  newSignals: string[];
  knownSignals: string[];
  affectedClusters: string[];
}

export interface RadarTimeline {
  kind: 'athenasignal.m4.radar_timeline.v1';
  generatedAt: string;
  cycles: Array<{
    cycleId: string;
    cycleNumber: number;
    occurredAt: string;
    sourceIds: string[];
    events: RadarEvent[];
    eventCounts: Record<string, number>;
  }>;
  eventTotals: Record<string, number>;
}

export interface M4Metrics {
  kind: 'athenasignal.m4.metrics.v1';
  generatedAt: string;
  cycles: number;
  sourcesIngested: number;
  signalsTracked: number;
  clusters: number;
  candidates: number;
  promoted: number;
  discarded: number;
  eventCounts: Record<string, number>;
  eventTotals: number;
  dedup: {
    repeatedSources: number;
    knownSignals: number;
    uniqueSignals: number;
  };
  contradictions: number;
  reassessments: number;
  priorityChanges: number;
  llm: {
    providerChain: string;
    realResponses: number;
    deterministicResponses: number;
    replayMisses: string[];
  };
  research: {
    queries: number;
    evidenceItems: number;
    missingRecordings: string[];
  };
  falsePositiveObservations: string[];
}

export interface M4BenchmarkEntry {
  id: string;
  description: string;
  cycles: string[];
  expected: {
    eventKinds?: RadarEventKind[];
    promoted?: boolean;
    discarded?: boolean;
    contradiction?: boolean;
    noDuplicateSignals?: boolean;
    idempotent?: boolean;
  };
}

export interface M4Benchmark {
  kind: 'athenasignal.m4.benchmark.v1';
  generatedAt: string;
  entries: M4BenchmarkEntry[];
}

export interface RadarCandidateReview {
  candidateId: string;
  title: string;
  researchQuestion: string;
  priority: Priority;
  assessment: ResearchAssessment;
  status: RadarClusterStatus;
  score: number;
  sourceCount: number;
  evidenceCount: number;
  cycles: string[];
  priorityReasons: string[];
  resolutionNote: string | null;
  promotionReason: string | null;
  why: string;
}

export interface M4HumanReviewPacket {
  kind: 'athenasignal.m4.human_review_packet.v1';
  generatedAt: string;
  rubric: RubricItem[];
  bestCandidate: RadarCandidateReview | null;
  worstCandidate: RadarCandidateReview | null;
  largestPriorityChange: {
    candidateId: string;
    from: Priority;
    to: Priority;
    delta: number;
    cycles: string[];
    why: string;
  } | null;
  mostDifficultDeduplication: {
    subjectId: string;
    seenCount: number;
    cycles: string[];
    why: string;
  } | null;
  importantContradiction: {
    clusterId: string;
    details: string[];
    resolutionNote: string | null;
    why: string;
  } | null;
  importantReframing: {
    candidateId: string;
    note: string;
    why: string;
  } | null;
  importantDiscard: {
    candidateId: string;
    reason: string;
    why: string;
  } | null;
  promotedToAthenaOs: RadarCandidateReview[];
}

export interface M4Artifacts {
  corpus: M4Corpus;
  benchmark: M4Benchmark;
  timeline: RadarTimeline;
  state: RadarState;
  metrics: M4Metrics;
  handoff: {
    kind: 'athenasignal.handoff_bundle.v1';
    generatedAt: string;
    handoffs: Array<{
      candidateId: string;
      clusterId: string;
      priority: Priority;
      assessment: ResearchAssessment;
      promotedAt: string | null;
      promotionReason: string | null;
      promotionReasons: string[];
      validation: { valid: boolean; errors: string[] };
      recommendedAthenaOsInput: AthenaOsHandoff;
    }>;
  };
  humanReview: M4HumanReviewPacket;
}

export type { Corpus, CorpusItem, DiscoveredSignal, EvidenceItem, InterpretedFinding };
