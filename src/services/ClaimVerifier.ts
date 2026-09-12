import type {
  Claim,
  ClaimVerdict,
  ClaimVerificationResult,
  Signal,
  VerificationReport,
} from '../domain/entities.ts';

/**
 * Evidencia devuelta por un buscador/adaptador inyectable.
 * `supports === true` soporta el claim, `false` lo contradice y `null` es
 * inconclusa. Nunca se usa aleatoriedad para emitir un veredicto.
 */
export interface EvidenceItem {
  supports: boolean | null;
  source: string;
  excerpt: string;
}

/**
 * Contrato del buscador inyectable del bucle Odysseus.
 */
export interface ClaimSearchProvider {
  search(query: string, claim: Claim): Promise<EvidenceItem[]> | EvidenceItem[];
}

/**
 * Motor de Búsqueda Profunda y Verificación de Claims (Bucle Odysseus).
 * Itera afinando consultas y acumulando evidencia antes de emitir un veredicto.
 *
 * Reglas duras (ORDEN-005 / RFC-006):
 * - `MAX_ITERATIONS = 3` estricto.
 * - Sin generación aleatoria: la evidencia proviene de un `ClaimSearchProvider` inyectable.
 * - Sin resolución tras 3 ciclos -> `UNVERIFIED_AMBIGUOUS` (con penalización).
 */
export class ClaimVerifier {
  static readonly MAX_ITERATIONS = 3;

  private readonly maxIterations: number;
  private readonly provider: ClaimSearchProvider;

  constructor(provider?: ClaimSearchProvider, maxIterations: number = ClaimVerifier.MAX_ITERATIONS) {
    this.provider = provider ?? { search: () => [] };
    this.maxIterations = Math.max(1, Math.min(maxIterations, ClaimVerifier.MAX_ITERATIONS));
  }

  public async verify(signal: Signal): Promise<VerificationReport> {
    const claims = signal.claimsToInvestigate ?? [];
    const results: ClaimVerificationResult[] = [];

    for (const claim of claims) {
      results.push(await this.verifyClaim(claim, signal));
    }

    const verdictCounts: Record<ClaimVerdict, number> = {
      VERIFIED: 0,
      REFUTED: 0,
      UNVERIFIED_AMBIGUOUS: 0,
    };
    for (const result of results) {
      verdictCounts[result.verdict] += 1;
    }

    const overallConfidence = results.length
      ? Number((results.reduce((sum, r) => sum + r.confidence, 0) / results.length).toFixed(4))
      : 0;

    // Penalización proporcional a los claims que quedaron ambiguos.
    const penalty = Number((verdictCounts.UNVERIFIED_AMBIGUOUS * 0.15).toFixed(4));

    return {
      signalId: signal.sourceId,
      maxIterations: this.maxIterations,
      claims: results,
      verdictCounts,
      overallConfidence,
      penalty,
    };
  }

  private async verifyClaim(claim: Claim, signal: Signal): Promise<ClaimVerificationResult> {
    let confidence = 0.5;
    let iterations = 0;
    const evidence: string[] = [];
    const contradictions: string[] = [];

    while (iterations < this.maxIterations) {
      iterations += 1;
      const query = this.buildQuery(claim, signal, iterations);
      const found = await this.provider.search(query, claim);

      for (const item of found) {
        if (item.supports === true) {
          evidence.push(item.excerpt);
          confidence += 0.25;
        } else if (item.supports === false) {
          contradictions.push(item.excerpt);
          confidence -= 0.25;
        }
        // `null` => inconclusa: no altera la confianza.
      }

      confidence = this.clamp(confidence, 0, 1);

      // Confianza estadísticamente contundente: rompemos el bucle temprano.
      if (confidence >= 0.85 || confidence <= 0.15) {
        break;
      }
    }

    return {
      claimId: claim.id,
      statement: claim.statement,
      verdict: this.toVerdict(confidence),
      iterations,
      confidence: Number(confidence.toFixed(4)),
      evidence,
      contradictions,
    };
  }

  private buildQuery(claim: Claim, signal: Signal, iteration: number): string {
    const topic = signal.topic ? ` [${signal.topic}]` : '';
    return `verify claim (iter ${iteration})${topic}: ${claim.statement}`;
  }

  private toVerdict(confidence: number): ClaimVerdict {
    if (confidence >= 0.7) return 'VERIFIED';
    if (confidence <= 0.3) return 'REFUTED';
    return 'UNVERIFIED_AMBIGUOUS';
  }

  private clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }
}
