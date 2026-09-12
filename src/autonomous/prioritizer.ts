/**
 * Priorización explicable M3 (ORDEN-007 §8, §9).
 *
 * La prioridad deriva de señales observables (researchability, evidencia,
 * valor editorial, ruido) y se reconcilia con la sugerencia del LLM. Siempre
 * se conservan `priorityReasons` para responder "¿por qué RC-X antes que RC-Y?".
 */

import type { AutonomousCandidate, ClaimAssessment, DiscoveredSignal, EditorialRelevance, Priority, PriorityScoreBreakdown, ResearchabilityAssessment } from './types.ts';
import type { CandidateBase } from './candidateBuilder.ts';
import type { PrioritySuggestion } from './cognitive.ts';

export interface PriorityInput {
  candidate: CandidateBase;
  signal: DiscoveredSignal;
  assessment: ClaimAssessment;
  researchability: ResearchabilityAssessment;
  editorialRelevance: EditorialRelevance;
  evidenceCount: number;
  reframed: boolean;
  suggestion?: PrioritySuggestion;
}

const SUGGESTIONS: Priority[] = ['HIGH', 'MEDIUM', 'LOW', 'DISCARD'];

export function prioritize(input: PriorityInput): AutonomousCandidate {
  const scores = computeScores(input);
  const composite = compositeScore(scores);
  const reasons = observableReasons(input, scores, composite);
  let priority = decide(scores, composite, input);

  const suggestion = input.suggestion;
  if (suggestion && (SUGGESTIONS as string[]).includes(suggestion.suggestedPriority)) {
    const suggested = suggestion.suggestedPriority as Priority;
    reasons.push(`Capa cognitiva sugiere ${suggested}: ${suggestion.reasons.join('; ') || 'sin detalle'}`);
    if (suggested === 'DISCARD' && composite < 0.6) {
      priority = 'DISCARD';
    } else if (suggested === 'HIGH') {
      // La sugerencia HIGH del modelo solo se aplica con base observable fuerte,
      // para que la prioridad siga siendo explicable y consistente.
      if (qualifiesForHigh(scores, composite, input)) {
        priority = 'HIGH';
      } else {
        reasons.push(
          'Sugerencia HIGH del modelo no aplicada: base de evidencia o researchability insuficiente.'
        );
      }
    }
  } else if (suggestion) {
    reasons.push(`Sugerencia del modelo no reconocida: ${suggestion.suggestedPriority}`);
  }

  if (priority === 'DISCARD') {
    reasons.push('Descartado: no supera el umbral de inviabilidad/ruido.');
  }

  return {
    ...input.candidate,
    priority,
    priorityReasons: reasons,
    scores,
  };
}

function computeScores(input: PriorityInput): PriorityScoreBreakdown {
  const resilience = input.researchability;
  const researchability = round(
    (resilience.evidenceAvailability +
      resilience.questionClarity +
      resilience.editorialRelevance +
      resilience.resolvableUncertainty) /
      4
  );
  const evidence = round(Math.min(1, input.evidenceCount / 4));
  const editorial = round(input.editorialRelevance.score);
  const novelty = round(
    input.signal.noiseLikelihood >= 0.6 ? 0.2 : 0.6 + 0.2 * (input.signal.concepts.length > 0 ? 1 : 0)
  );
  const risk = round(input.signal.noiseLikelihood);
  return { researchability, evidence, novelty, editorial, risk };
}

function compositeScore(scores: PriorityScoreBreakdown): number {
  return round(
    0.3 * scores.researchability +
      0.25 * scores.evidence +
      0.2 * scores.editorial +
      0.15 * scores.novelty +
      0.1 * (1 - scores.risk)
  );
}

function qualifiesForHigh(
  scores: PriorityScoreBreakdown,
  composite: number,
  input: PriorityInput
): boolean {
  return composite >= 0.7 && input.evidenceCount >= 3 && input.researchability.level === 'HIGH';
}

function decide(scores: PriorityScoreBreakdown, composite: number, input: PriorityInput): Priority {
  if (input.assessment.assessment === 'UNSUPPORTED' && !input.reframed) return 'DISCARD';
  if (scores.risk >= 0.7 || input.signal.policy === 'BLOCKED') return 'DISCARD';
  // HIGH exige justificación fuerte: base de evidencia y researchability altas.
  if (qualifiesForHigh(scores, composite, input)) return 'HIGH';
  if (composite >= 0.5) return 'MEDIUM';
  if (composite >= 0.32) return 'LOW';
  return 'DISCARD';
}

function observableReasons(input: PriorityInput, scores: PriorityScoreBreakdown, composite: number): string[] {
  const reasons: string[] = [];
  if (input.reframed) reasons.push('Reformulación válida: claim incorrecto con idea subyacente investigable.');
  if (scores.evidence >= 0.5) reasons.push(`Evidencia inicial suficiente (${input.evidenceCount} fuentes).`);
  else if (scores.evidence > 0) reasons.push(`Evidencia inicial limitada (${input.evidenceCount} fuentes).`);
  else reasons.push('Sin evidencia inicial recuperada.');
  if (input.researchability.level === 'HIGH') reasons.push('Researchability HIGH con incertidumbre resoluble.');
  if (input.evidenceCount >= 3 && input.researchability.level === 'HIGH') {
    reasons.push(`Base de evidencia fuerte (${input.evidenceCount} fuentes) y researchability HIGH: cumple el umbral HIGH.`);
  }
  if (input.editorialRelevance.score >= 0.6) reasons.push(`Valor editorial alto (${scores.editorial}).`);
  if (scores.risk >= 0.5) reasons.push(`Riesgo de ruido elevado (${scores.risk}).`);
  reasons.push(
    `Score compuesto ${composite} = 0.30·researchability(${scores.researchability}) + 0.25·evidencia(${scores.evidence}) + ` +
      `0.20·editorial(${scores.editorial}) + 0.15·novedad(${scores.novelty}) + 0.10·(1-riesgo(${scores.risk})).`
  );
  return reasons;
}

function round(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}
