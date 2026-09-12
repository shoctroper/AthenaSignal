/**
 * ResearchabilityAssessor (ORDEN-006 §3.6): evalúa explícitamente
 * investigabilidad, disponibilidad potencial de evidencia, claridad de la
 * pregunta, relevancia editorial e incertidumbre resoluble.
 */

import type {
  AssertionAnalysis,
  Researchability,
  ResearchabilityAssessment,
  ResearchAssessment,
} from '../domain/entities.ts';
import type { InitialFinding } from '../domain/entities.ts';

export interface ResearchabilityInput {
  researchQuestion: string;
  assertionAnalysis: AssertionAnalysis;
  findings: InitialFinding[];
  assessment: ResearchAssessment;
  proposedSourcesCount: number;
}

export class ResearchabilityAssessor {
  assess(input: ResearchabilityInput): ResearchabilityAssessment {
    const evidenceFindings = input.findings.filter(
      (f) => f.kind === 'EVIDENCE' || f.kind === 'FACT'
    ).length;
    const referencedFindings = input.findings.filter((f) => f.refs.length > 0).length;

    const evidenceAvailability = this.clamp(
      0.35 + 0.15 * evidenceFindings + 0.1 * input.proposedSourcesCount + 0.05 * referencedFindings
    );

    const questionClarity = this.clamp(
      input.researchQuestion.trim().endsWith('?') ? 0.9 : 0.5
    );

    const editorialRelevance = this.clamp(
      0.5 +
        0.05 * input.assertionAnalysis.entities.length +
        0.05 * input.assertionAnalysis.context.length
    );

    const resolvableUncertainty = this.clamp(
      0.4 +
        0.1 * input.findings.filter((f) => f.kind === 'EVIDENCE').length +
        (input.assessment === 'REFRAMED' ? 0.2 : 0.1)
    );

    const average =
      (evidenceAvailability + questionClarity + editorialRelevance + resolvableUncertainty) / 4;

    const level: Researchability = average >= 0.7 ? 'HIGH' : average >= 0.45 ? 'MEDIUM' : 'LOW';

    return {
      level,
      evidenceAvailability: this.round(evidenceAvailability),
      questionClarity: this.round(questionClarity),
      editorialRelevance: this.round(editorialRelevance),
      resolvableUncertainty: this.round(resolvableUncertainty),
      reason: `Nivel ${level}: evidencia potencial=${this.round(evidenceAvailability)}, claridad de pregunta=${this.round(
        questionClarity
      )}, relevancia editorial=${this.round(
        editorialRelevance
      )}, incertidumbre resoluble=${this.round(resolvableUncertainty)}.`,
    };
  }

  private clamp(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  private round(value: number): number {
    return Number(this.clamp(value).toFixed(4));
  }
}
