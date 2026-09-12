/**
 * Entidades Centrales del Dominio Epistemológico de AthenaSignal
 * Basado en DU-001 (Modelo Conceptual) y RFC-003 (Arquitectura Técnica)
 */

export interface Source {
  id?: string;
  platform: 'tiktok' | 'youtube' | 'reddit' | 'rss' | 'blog' | 'podcast' | string;
  creator: string;
  url: string;
  publishedAt: string;
  contentId: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  id?: string;
  text: string;
  sourceType: 'official_api' | 'captions' | 'platform_stt' | 'speech_to_text' | 'video_fallback' | string;
  language: string;
  segments?: TranscriptSegment[];
}

export interface Content {
  id?: string;
  source: Source;
  title: string;
  description: string;
  transcript: Transcript | string;
  language: string;
  metadata?: Record<string, unknown>;
}

export type ClaimStatus = 'UNVERIFIED' | 'VERIFIED' | 'REFUTED' | 'UNVERIFIED_AMBIGUOUS';

/**
 * Veredicto emitido por el bucle Odysseus del ClaimVerifier.
 * Un claim sin resolución tras MAX_ITERATIONS se marca como UNVERIFIED_AMBIGUOUS.
 */
export type ClaimVerdict = 'VERIFIED' | 'REFUTED' | 'UNVERIFIED_AMBIGUOUS';

export interface ClaimVerificationResult {
  claimId?: string;
  statement: string;
  verdict: ClaimVerdict;
  iterations: number;
  confidence: number;
  evidence: string[];
  contradictions: string[];
}

export interface VerificationReport {
  signalId?: string;
  maxIterations: number;
  claims: ClaimVerificationResult[];
  verdictCounts: Record<ClaimVerdict, number>;
  overallConfidence: number;
  penalty: number;
}

export class Claim {
  id?: string;
  statement: string;
  status: ClaimStatus;
  provenanceSourceId: string;

  constructor(statement: string, provenanceSourceId: string, id?: string, status: ClaimStatus = 'UNVERIFIED') {
    this.id = id;
    this.statement = statement;
    this.provenanceSourceId = provenanceSourceId;
    this.status = status;
  }
}

/**
 * Función fábrica para instanciar un Claim asegurando el estado 'UNVERIFIED' por defecto.
 */
export function createClaim(params: {
  statement: string;
  provenanceSourceId: string;
  id?: string;
  status?: ClaimStatus;
}): Claim {
  return new Claim(params.statement, params.provenanceSourceId, params.id, params.status ?? 'UNVERIFIED');
}

export interface Signal {
  id?: string;
  sourceId?: string;
  topic: string;
  topics?: string[];
  concepts: string[];
  claimsToInvestigate: Claim[];
  questions: string[];
  arguments: string[];
  assumptions: string[];
  contradictions: string[];
  potentialAngles?: string[];
  createdAt?: string;
  verification?: VerificationReport;
}

/**
 * =====================================================================
 * M2 — Signal-to-Research-Candidate (ORDEN-006)
 * Tipos del vertical slice de investigación editorial. Extienden el
 * modelo M1 sin romperlo (los campos M1 permanecen opcionales).
 * =====================================================================
 */

export type Researchability = 'HIGH' | 'MEDIUM' | 'LOW';

export type ResearchAssessment = 'SUPPORTED' | 'UNSUPPORTED' | 'AMBIGUOUS' | 'REFRAMED';

/**
 * Rol epistemológico de una fuente en el handoff.
 * - DISCOVERY: sirve para descubrir entidades/conceptos/referencias.
 * - EVIDENCE: candidata a evidencia por su autoridad.
 */
export type SourceRole = 'DISCOVERY' | 'EVIDENCE';

/**
 * Distinción obligatoria en los artefactos (ORDEN-006 §9).
 */
export type FindingKind = 'FACT' | 'EVIDENCE' | 'MODEL_INTERPRETATION' | 'EDITORIAL_REFRAMING';

/**
 * Trazabilidad de una fuente real capturada (URL, plataforma, idioma,
 * fecha de captura y hash del snapshot vendoreado).
 */
export interface Provenance {
  sourceId: string;
  url: string;
  platform: string;
  language: string;
  title: string;
  role: SourceRole;
  capturedAt: string;
  contentHash: string;
}

export interface AssertionAnalysis {
  originalClaim: string;
  context: string[];
  entities: string[];
  implicitQuestions: string[];
  hypotheses: string[];
  uncertainties: string[];
}

export interface ResearchabilityAssessment {
  level: Researchability;
  evidenceAvailability: number; // 0.0 - 1.0
  questionClarity: number;      // 0.0 - 1.0
  editorialRelevance: number;   // 0.0 - 1.0
  resolvableUncertainty: number; // 0.0 - 1.0
  reason: string;
}

export interface InitialFinding {
  kind: FindingKind;
  text: string;
  refs: string[];
}

export interface AthenaOsEligibility {
  hasIdentifiableOrigin: boolean;
  hasTraceableLocation: boolean;
  hasTemporalContext: boolean;
  hasRecoverableEvidence: boolean;
}

export interface AthenaOsProposedSource {
  url: string;
  title: string;
  language: string;
  role: SourceRole;
  eligibility: AthenaOsEligibility;
  proposedTrustTier: string;
  accessedAt: string;
}

export interface AthenaOsProposedCandidateFact {
  statement: string;
  provenanceUrls: string[];
  statusHint: 'UNVERIFIED';
}

export interface AthenaOsHandoff {
  kind: 'athenasignal.research_candidate.handoff.v1';
  researchQuestion: string;
  outputLanguage: 'es';
  viableBase: {
    format: 'short_video' | 'article' | 'long_video';
    factsRequired: number;
    sourcesMinimum: number;
  };
  proposedSources: AthenaOsProposedSource[];
  proposedCandidateFacts: AthenaOsProposedCandidateFact[];
  knownUncertainties: string[];
  initialFindings: InitialFinding[];
  origin: {
    signalId: string;
    originalClaims: string[];
    assessment: ResearchAssessment;
    reframingNote: string | null;
  };
}

/**
 * Research Candidate transferible a AKP (ORDEN-006 §5).
 * Los campos M1 (`id`, `signalId`, `hypothesis`, `score`, `claims`) se
 * conservan opcionales por compatibilidad.
 */
export interface ResearchCandidate {
  candidateId: string;
  title: string;
  researchQuestion: string;
  originSignalId: string;
  originalClaims: string[];
  context: string[];
  assessment: ResearchAssessment;
  assertionAnalysis: AssertionAnalysis;
  researchability: ResearchabilityAssessment;
  knownUncertainties: string[];
  initialFindings: InitialFinding[];
  reasonForSelection: string;
  sourceProvenance: Provenance[];
  recommendedAthenaOsInput: AthenaOsHandoff;
  createdAt: string;

  // M1 (compatibilidad, opcionales)
  id?: string;
  signalId?: string;
  hypothesis?: string;
  score?: number;
  claims?: Claim[];
  primarySourcesToCheck?: string[];
}

export interface Knowledge {
  id?: string;
  claimId: string;
  statement: string;
  evidence: string[];
  verifiedAt: string;
  confidenceScore: number;
  references: string[];
}

export interface EditorialMetrics {
  novelty: number;            // 0.0 - 1.0
  researchability: number;    // 0.0 - 1.0
  audienceRelevance: number;  // 0.0 - 1.0
  contradictionTension: number; // 0.0 - 1.0
  evidenceDensity: number;    // 0.0 - 1.0
  athenaPotential: number;    // 0.0 - 1.0
  timeliness: number;         // 0.0 - 1.0
}

export interface EditorialOpportunity {
  id: string;
  topic: string;
  score: number; // Ponderado global (0.0 - 1.0)
  metrics: EditorialMetrics;
  candidate: Signal;
  narrativeAngle?: string;
  createdAt?: string;
}
