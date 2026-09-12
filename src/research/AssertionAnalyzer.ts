/**
 * AssertionAnalyzer (ORDEN-006 §3.4): descompone la afirmación original en
 * afirmación, contexto, entidades, preguntas implícitas, hipótesis e
 * incertidumbres. Heurístico y determinista.
 */

import type { AssertionAnalysis, Signal } from '../domain/entities.ts';

export class AssertionAnalyzer {
  analyze(claim: string, signal: Signal): AssertionAnalysis {
    const context = this.unique([
      signal.topic,
      ...(signal.topics ?? []),
      ...(signal.arguments ?? []),
    ]);

    const entities = this.unique(signal.concepts ?? []);

    const implicitQuestions = this.unique([
      ...(signal.questions ?? []),
      `¿Qué evidencia sostiene la afirmación "${claim}"?`,
      `¿Bajo qué condiciones es válida la afirmación "${claim}"?`,
    ]);

    const hypotheses = this.unique([
      ...(signal.assumptions ?? []).map((a) => `Hipótesis: ${a}`),
      `La afirmación "${claim}" puede ser cierta solo parcialmente y depender de condiciones no explicitadas por la fuente.`,
    ]);

    const uncertainties = this.unique([
      ...(signal.contradictions ?? []),
      'La fuente original puede ser parcial, promocional o imprecisa respecto a sus propias cifras.',
    ]);

    return {
      originalClaim: claim,
      context,
      entities,
      implicitQuestions,
      hypotheses,
      uncertainties,
    };
  }

  private unique(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const trimmed = value.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
    return result;
  }
}
