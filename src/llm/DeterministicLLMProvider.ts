/**
 * Fallback determinista y seguro (ORDEN-007 §4).
 *
 * Garantías:
 * - No usa red, reloj ni aleatoriedad.
 * - Nunca promueve una assertion a hecho: los assessments son AMBIGUOUS y las
 *   interpretaciones se marcan como incertidumbre.
 * - Produce JSON válido por etapa para que el pipeline no falle.
 */

import type { LLMProvider, LLMRequest, LLMResponse } from './types.ts';

export class DeterministicLLMProvider implements LLMProvider {
  readonly id = 'deterministic';

  async complete(request: LLMRequest): Promise<LLMResponse> {
    return {
      text: JSON.stringify(deterministicPayload(request.stage)),
      provider: this.id,
      model: 'deterministic-fallback',
      deterministic: true,
    };
  }
}

function deterministicPayload(stage: string): unknown {
  switch (stage) {
    case 'signal_discovery':
      return { signals: [] };
    case 'assertion_decomposition':
      return {
        entities: [],
        context: [],
        implicitQuestions: [],
        hypotheses: [],
        uncertainties: [
          'Sin modelo cognitivo disponible: la afirmación permanece sin descomponer.',
        ],
      };
    case 'evidence_interpretation':
      return { findings: [] };
    case 'claim_assessment':
      return {
        assessment: 'AMBIGUOUS',
        confidence: 0,
        reasoning:
          'Sin modelo cognitivo disponible no puede establecerse soporte; la afirmación permanece NO verificada.',
        contradictions: [],
        uncertainties: ['Evaluación pendiente: no se dispone de LLM.'],
      };
    case 'researchability':
      return {
        level: 'LOW',
        evidenceAvailability: 0,
        questionClarity: 0.5,
        editorialRelevance: 0.3,
        resolvableUncertainty: 0.3,
        reason: 'Sin modelo cognitivo disponible; investigabilidad no evaluada.',
      };
    case 'reframing':
      return {
        researchQuestion: '',
        reframingNote: null,
        candidateFact: '',
      };
    case 'editorial_relevance':
      return { score: 0, reasons: ['Sin modelo cognitivo disponible.'] };
    case 'prioritization':
      return { items: [] };
    case 'deep_research':
      return {
        synthesis:
          'Sin modelo cognitivo disponible: la investigación profunda no pudo sintetizarse; ' +
          'la evidencia permanece sin interpretar.',
        findings: [],
        claims: [],
        assessment: 'AMBIGUOUS',
        confidence: 0,
        uncertainties: ['Investigación profunda pendiente: fallback determinista seguro.'],
      };
    default:
      return {};
  }
}
