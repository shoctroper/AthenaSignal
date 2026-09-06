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

export type ClaimStatus = 'UNVERIFIED' | 'VERIFIED' | 'REFUTED';

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
}

export interface ResearchCandidate {
  id?: string;
  signalId: string;
  hypothesis: string;
  score: number;
  claims: Claim[];
  primarySourcesToCheck?: string[];
  createdAt?: string;
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
