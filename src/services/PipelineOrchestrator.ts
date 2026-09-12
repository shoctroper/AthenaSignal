import type { ISourceAdapter, NormalizedContent } from '../adapters/ISourceAdapter.ts';
import { SignalExtractor } from './SignalExtractor.ts';
import { ClaimVerifier } from './ClaimVerifier.ts';
import { EditorialScorer } from './EditorialScorer.ts';
import type { EditorialOpportunity, Signal, VerificationReport } from '../domain/entities.ts';

/**
 * Resultado completo de una corrida del pipeline, con todas las etapas
 * auditables: adquisición (`source`), extracción (`signal`), verificación
 * (`verification`) y puntuación editorial (`opportunity`).
 */
export interface PipelineRunResult {
  source: NormalizedContent;
  signal: Signal;
  verification: VerificationReport;
  opportunity: EditorialOpportunity;
}

/**
 * Orquestador principal de AthenaSignal (Fase Deep Search).
 * Cablea: Adquisición -> Extracción -> Verificación Iterativa (Odysseus) -> Scoring.
 */
export class PipelineOrchestrator {
  private adapters: ISourceAdapter[];
  private extractor: SignalExtractor;
  private verifier: ClaimVerifier;
  private scorer: EditorialScorer;

  constructor(
    adapters: ISourceAdapter[],
    extractor: SignalExtractor,
    verifier: ClaimVerifier,
    scorer: EditorialScorer
  ) {
    this.adapters = adapters;
    this.extractor = extractor;
    this.verifier = verifier;
    this.scorer = scorer;
  }

  /**
   * Ejecuta el pipeline completo y devuelve todas las etapas (evidencia M1).
   */
  public async run(url: string): Promise<PipelineRunResult> {
    // 1. Ruteo y Adquisición
    const adapter = this.adapters.find((a) => a.canHandle(url));
    if (!adapter) {
      throw new Error(`Ningun adaptador soporta la URL: ${url}`);
    }
    const source = await adapter.acquire(url);

    // 2. Extracción de Señales (todo claim nace UNVERIFIED)
    const signal = await this.extractor.extract(source);

    // 3. Verificación de Deep Search (Bucle Odysseus, MAX_ITERATIONS = 3)
    const verification = await this.verifier.verify(signal);

    // 3b. Actualizar el status de cada claim con su veredicto
    for (const claim of signal.claimsToInvestigate ?? []) {
      const match = verification.claims.find(
        (result) =>
          (claim.id !== undefined && result.claimId === claim.id) ||
          result.statement === claim.statement
      );
      if (match) {
        claim.status = match.verdict;
      }
    }

    // 3c. Adjuntar el reporte de verificación a la señal
    signal.verification = verification;

    // 4. Scoring Editorial (API real: `evaluateOpportunity` usa score + calculateGlobalScore)
    const opportunity = this.scorer.evaluateOpportunity(signal, `opp-${signal.sourceId ?? 'signal'}`);

    return { source, signal, verification, opportunity };
  }

  /**
   * Contrato principal del orquestador: devuelve la oportunidad editorial.
   */
  public async processUrl(url: string): Promise<EditorialOpportunity> {
    const result = await this.run(url);
    return result.opportunity;
  }
}
