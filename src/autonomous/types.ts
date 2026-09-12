/**
 * Tipos del milestone M3 — Autonomous Signal Intelligence (ORDEN-007).
 *
 * Extienden el modelo M1/M2 sin romperlo. El contrato de handoff AKP
 * (`athenasignal.research_candidate.handoff.v1`) se preserva.
 */

import type {
  AthenaOsHandoff,
  FindingKind,
  ResearchabilityAssessment,
  ResearchCandidate,
  ResearchAssessment,
} from '../domain/entities.ts';

/** Política de fuentes explícita (ORDEN-007 §6). */
export type SourcePolicy =
  | 'DISCOVERY'
  | 'EVIDENCE'
  | 'PRIMARY'
  | 'SECONDARY'
  | 'TERTIARY'
  | 'BLOCKED';

export const SOURCE_POLICIES: SourcePolicy[] = [
  'DISCOVERY',
  'EVIDENCE',
  'PRIMARY',
  'SECONDARY',
  'TERTIARY',
  'BLOCKED',
];

/** Categorías del benchmark versionado (ORDEN-007 §12). */
export type BenchmarkClass =
  | 'KNOWN_GOOD'
  | 'KNOWN_BAD_CLAIM'
  | 'AMBIGUOUS'
  | 'REFRAMING_CASE'
  | 'LOW_VALUE_NOISE'
  | 'MULTI_SOURCE';

/** Prioridad explicable (ORDEN-007 §8). */
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW' | 'DISCARD';

/** Ítem del corpus real. `content` es un snapshot vendoreado reproducible. */
export interface CorpusItem {
  id: string;
  title: string;
  url: string;
  platform: string;
  creator: string;
  publishedAt: string;
  language: string;
  policy: SourcePolicy;
  capturedAt: string;
  content: string;
  contentHash: string;
  discoveryQueries: string[];
  benchmarkClasses: BenchmarkClass[];
  notes: string;
}

export interface Corpus {
  kind: 'athenasignal.m3.corpus.v1';
  generatedAt: string;
  sources: CorpusItem[];
}

/** Señal descubierta de forma autónoma a partir de una fuente. */
export interface DiscoveredSignal {
  signalId: string;
  corpusId: string;
  topic: string;
  assertion: string;
  concepts: string[];
  questions: string[];
  noiseLikelihood: number;
  rationale: string;
  policy: SourcePolicy;
}

export interface AssertionDecomposition {
  signalId: string;
  originalAssertion: string;
  entities: string[];
  context: string[];
  implicitQuestions: string[];
  hypotheses: string[];
  uncertainties: string[];
}

export interface EvidenceItem {
  sourceUrl: string;
  title: string;
  excerpt: string;
  policy: SourcePolicy;
  role: 'DISCOVERY' | 'EVIDENCE';
  supports: boolean | null;
  query: string;
}

/** Hallazgo interpretado por el modelo; nunca eleva una inferencia a hecho. */
export interface InterpretedFinding {
  kind: FindingKind;
  text: string;
  refs: string[];
  supports: boolean | null;
}

export interface ResearchNote {
  signalId: string;
  queries: string[];
  evidence: EvidenceItem[];
  interpretation: InitialFinding[];
}

export interface ClaimAssessment {
  signalId: string;
  assessment: ResearchAssessment;
  confidence: number;
  reasoning: string;
  contradictions: string[];
  uncertainties: string[];
}

export interface Reframing {
  signalId: string;
  required: boolean;
  researchQuestion: string;
  reframingNote: string | null;
  candidateFact: string | null;
}

export interface EditorialRelevance {
  signalId: string;
  score: number;
  reasons: string[];
}

export interface PriorityScoreBreakdown {
  researchability: number;
  evidence: number;
  novelty: number;
  editorial: number;
  risk: number;
}

/** Candidate M3: envuelve el contrato M2/AKP + prioridad y evidencia. */
export interface AutonomousCandidate extends ResearchCandidate {
  priority: Priority;
  priorityReasons: string[];
  scores: PriorityScoreBreakdown;
  editorialRelevance: EditorialRelevance;
  originSignalIds: string[];
  evidence: EvidenceItem[];
}

export interface BenchmarkEntry {
  id: string;
  class: BenchmarkClass;
  origin: 'real' | 'curated';
  corpusIds: string[];
  description: string;
  expected: {
    assessment?: ResearchAssessment;
    priority?: Priority;
    /** El ruido de estas fuentes debe descartarse. */
    discarded?: boolean;
    /** Debe existir al menos un candidate y ninguno debe descartarse. */
    notDiscarded?: boolean;
    /** Al menos una afirmación de estas fuentes debe reformularse. */
    reframed?: boolean;
  };
}

export interface Benchmark {
  kind: 'athenasignal.m3.benchmark.v1';
  generatedAt: string;
  entries: BenchmarkEntry[];
}

export interface M3Metrics {
  kind: 'athenasignal.m3.metrics.v1';
  generatedAt: string;
  sourcesProcessed: number;
  signalsExtracted: number;
  candidatesGenerated: number;
  candidatesDiscarded: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  reframed: number;
  unsupported: number;
  supported: number;
  ambiguous: number;
  evidenceSourcesPerCandidate: Record<string, number>;
  duplicateRate: number;
  nearDuplicateRate: number;
  falsePositiveObservations: string[];
  humanAcceptanceRate: number | null;
  priorityDistribution: Record<Priority, number>;
  assessmentDistribution: Record<string, number>;
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
}

export interface RubricItem {
  id: string;
  question: string;
}

export interface HumanReviewSample {
  candidateId: string;
  title: string;
  researchQuestion: string;
  priority: Priority;
  assessment: ResearchAssessment;
  reasonForSelection: string;
  priorityReasons: string[];
  handoffKind: AthenaOsHandoff['kind'];
  coverage: {
    hasOriginSignals: boolean;
    hasSourceProvenance: boolean;
    hasOriginalAssertions: boolean;
    hasEvidence: boolean;
    hasUncertainties: boolean;
    hasReframing: boolean;
    hasResearchability: boolean;
    hasEditorialRelevance: boolean;
    hasPriority: boolean;
  };
}

export interface HumanReviewPacket {
  kind: 'athenasignal.m3.human_review_packet.v1';
  generatedAt: string;
  rubric: RubricItem[];
  discovered: number;
  discarded: number;
  sample: HumanReviewSample[];
  falsePositiveObservations: string[];
}

export interface M3Artifacts {
  corpus: Corpus;
  signals: {
    kind: 'athenasignal.m3.signals.v1';
    generatedAt: string;
    signals: DiscoveredSignal[];
    decompositions: AssertionDecomposition[];
    assessments: ClaimAssessment[];
    researchability: Record<string, ResearchabilityAssessment>;
    reframings: Reframing[];
    evidence: Record<string, EvidenceItem[]>;
    findings: Record<string, InterpretedFinding[]>;
    queries: string[];
  };
  candidates: {
    kind: 'athenasignal.m3.candidates.v1';
    generatedAt: string;
    candidates: AutonomousCandidate[];
    discarded: Array<{
      signalId: string;
      corpusId: string;
      assertion: string;
      reason: string;
    }>;
    distribution: {
      priority: Record<Priority, number>;
      assessment: Record<string, number>;
    };
  };
  handoff: {
    kind: 'athenasignal.handoff_bundle.v1';
    generatedAt: string;
    handoffs: Array<{
      candidateId: string;
      priority: Priority;
      researchQuestion: string;
      assessment: ResearchAssessment;
      validation: { valid: boolean; errors: string[] };
      recommendedAthenaOsInput: AthenaOsHandoff;
    }>;
  };
  benchmark: Benchmark;
  metrics: M3Metrics;
  humanReview: HumanReviewPacket;
}
