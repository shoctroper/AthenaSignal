/**
 * Servicio Puntuador de Oportunidad Editorial (EditorialScorer)
 * Basado en DU-001 (Modelo Conceptual) y RFC-003 (Arquitectura Técnica)
 */

import type { EditorialMetrics, EditorialOpportunity, Signal } from '../domain/entities.ts';

export interface EditorialScorerWeights {
  novelty: number;
  researchability: number;
  audienceRelevance: number;
  contradictionTension: number;
  evidenceDensity: number;
  athenaPotential: number;
  timeliness: number;
}

export const DEFAULT_EDITORIAL_WEIGHTS: EditorialScorerWeights = {
  contradictionTension: 0.20,
  researchability: 0.20,
  evidenceDensity: 0.15,
  athenaPotential: 0.15,
  novelty: 0.10,
  audienceRelevance: 0.10,
  timeliness: 0.10,
};

export interface IEditorialScorer {
  score(signal: Signal): EditorialMetrics;
  calculateGlobalScore(metrics: EditorialMetrics): number;
  evaluateOpportunity(signal: Signal, id?: string): EditorialOpportunity;
}

export class EditorialScorer implements IEditorialScorer {
  private weights: EditorialScorerWeights;

  constructor(customWeights?: Partial<EditorialScorerWeights>) {
    this.weights = {
      ...DEFAULT_EDITORIAL_WEIGHTS,
      ...customWeights,
    };
    this.normalizeWeights();
  }

  /**
   * Calcula las métricas individuales para una señal.
   */
  score(signal: Signal): EditorialMetrics {
    const novelty = this.calculateNovelty(signal);
    const researchability = this.calculateResearchability(signal);
    const audienceRelevance = this.calculateAudienceRelevance(signal);
    const contradictionTension = this.calculateContradictionTension(signal);
    const evidenceDensity = this.calculateEvidenceDensity(signal);
    const athenaPotential = this.calculateAthenaPotential(
      contradictionTension,
      researchability,
      evidenceDensity
    );
    const timeliness = this.calculateTimeliness(signal);

    return {
      novelty: this.clamp(novelty),
      researchability: this.clamp(researchability),
      audienceRelevance: this.clamp(audienceRelevance),
      contradictionTension: this.clamp(contradictionTension),
      evidenceDensity: this.clamp(evidenceDensity),
      athenaPotential: this.clamp(athenaPotential),
      timeliness: this.clamp(timeliness),
    };
  }

  /**
   * Calcula el score ponderado global (0.0 a 1.0) a partir de las métricas.
   */
  calculateGlobalScore(metrics: EditorialMetrics): number {
    const rawScore =
      metrics.novelty * this.weights.novelty +
      metrics.researchability * this.weights.researchability +
      metrics.audienceRelevance * this.weights.audienceRelevance +
      metrics.contradictionTension * this.weights.contradictionTension +
      metrics.evidenceDensity * this.weights.evidenceDensity +
      metrics.athenaPotential * this.weights.athenaPotential +
      metrics.timeliness * this.weights.timeliness;

    return Number(this.clamp(rawScore).toFixed(4));
  }

  /**
   * Evalúa una señal y construye el objeto EditorialOpportunity completo.
   */
  evaluateOpportunity(signal: Signal, id?: string): EditorialOpportunity {
    const metrics = this.score(signal);
    // Penalización por claims que el ClaimVerifier dejó como UNVERIFIED_AMBIGUOUS.
    const penalty = signal.verification?.penalty ?? 0;
    const score = Number(this.clamp(this.calculateGlobalScore(metrics) - penalty).toFixed(4));
    const opportunityId = id || `opp-${signal.sourceId || 'signal'}-${Date.now()}`;
    const narrativeAngle =
      signal.potentialAngles && signal.potentialAngles.length > 0
        ? signal.potentialAngles[0]
        : undefined;

    return {
      id: opportunityId,
      topic: signal.topic || 'Unspecified Topic',
      score,
      metrics,
      candidate: signal,
      narrativeAngle,
      createdAt: new Date().toISOString(),
    };
  }

  private calculateNovelty(signal: Signal): number {
    const conceptsCount = signal.concepts ? signal.concepts.length : 0;
    const anglesCount = signal.potentialAngles ? signal.potentialAngles.length : 0;
    const topicsCount = signal.topics ? signal.topics.length : 0;

    return (conceptsCount * 0.20) + (anglesCount * 0.25) + (topicsCount > 1 ? 0.25 : 0.10);
  }

  private calculateResearchability(signal: Signal): number {
    const claimsCount = signal.claimsToInvestigate ? signal.claimsToInvestigate.length : 0;
    const questionsCount = signal.questions ? signal.questions.length : 0;
    const assumptionsCount = signal.assumptions ? signal.assumptions.length : 0;

    return (claimsCount * 0.25) + (questionsCount * 0.20) + (assumptionsCount * 0.15);
  }

  private calculateAudienceRelevance(signal: Signal): number {
    const argumentsCount = signal.arguments ? signal.arguments.length : 0;
    const anglesCount = signal.potentialAngles ? signal.potentialAngles.length : 0;
    const hasValidTopic = Boolean(signal.topic && signal.topic !== 'Unspecified Topic');

    return (hasValidTopic ? 0.30 : 0.10) + (argumentsCount * 0.20) + (anglesCount * 0.15);
  }

  private calculateContradictionTension(signal: Signal): number {
    const contradictionsCount = signal.contradictions ? signal.contradictions.length : 0;
    if (contradictionsCount === 0) return 0.0;
    return 0.40 + (contradictionsCount - 1) * 0.30;
  }

  private calculateEvidenceDensity(signal: Signal): number {
    const claimsCount = signal.claimsToInvestigate ? signal.claimsToInvestigate.length : 0;
    const argumentsCount = signal.arguments ? signal.arguments.length : 0;

    return (claimsCount * 0.30) + (argumentsCount * 0.20);
  }

  private calculateAthenaPotential(
    contradictionTension: number,
    researchability: number,
    evidenceDensity: number
  ): number {
    return (contradictionTension * 0.40) + (researchability * 0.35) + (evidenceDensity * 0.25);
  }

  private calculateTimeliness(signal: Signal): number {
    if (!signal.createdAt) return 0.85;

    const signalDate = new Date(signal.createdAt).getTime();
    if (isNaN(signalDate)) return 0.85;

    const diffHours = (Date.now() - signalDate) / (1000 * 60 * 60);
    if (diffHours <= 24) return 1.0;
    if (diffHours <= 72) return 0.90;
    if (diffHours <= 168) return 0.75;
    return 0.50;
  }

  private clamp(val: number): number {
    if (val < 0.0) return 0.0;
    if (val > 1.0) return 1.0;
    return val;
  }

  private normalizeWeights(): void {
    const total =
      this.weights.novelty +
      this.weights.researchability +
      this.weights.audienceRelevance +
      this.weights.contradictionTension +
      this.weights.evidenceDensity +
      this.weights.athenaPotential +
      this.weights.timeliness;

    if (Math.abs(total - 1.0) > 0.0001 && total > 0) {
      this.weights.novelty /= total;
      this.weights.researchability /= total;
      this.weights.audienceRelevance /= total;
      this.weights.contradictionTension /= total;
      this.weights.evidenceDensity /= total;
      this.weights.athenaPotential /= total;
      this.weights.timeliness /= total;
    }
  }
}
