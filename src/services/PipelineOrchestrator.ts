import { ISourceAdapter } from '../adapters/ISourceAdapter';
import { SignalExtractor } from './SignalExtractor';
import { ClaimVerifier } from './ClaimVerifier';
import { EditorialScorer } from './EditorialScorer';

/**
 * Orquestador principal de AthenaSignal V2 (Fase Deep Search).
 * Gestiona el ciclo: Adquisición -> Extracción (LLM) -> Verificación Iterativa (Odysseus) -> Scoring.
 */
export class PipelineOrchestrator {
  private adapters: ISourceAdapter[];
  private extractor: SignalExtractor;
  private verifier: ClaimVerifier;
  private scorer: EditorialScorer;

  constructor(adapters: ISourceAdapter[], extractor: SignalExtractor, verifier: ClaimVerifier, scorer: EditorialScorer) {
    this.adapters = adapters;
    this.extractor = extractor;
    this.verifier = verifier;
    this.scorer = scorer;
  }

  public async processUrl(url: string) {
    console.log(`\n=== INICIANDO PIPELINE ATHENA PARA: ${url} ===`);

    // 1. Ruteo y Adquisición
    const adapter = this.adapters.find(a => a.canHandle(url));
    if (!adapter) {
      throw new Error(`Ningún adaptador soporta la URL: ${url}`);
    }

    const normalizedContent = await adapter.acquire(url);
    console.log(`[Pipeline] Contenido adquirido (${normalizedContent.transcript.length} chars)`);

    // 2. Extracción de Señales Iniciales
    const signal = await this.extractor.extract(normalizedContent);
    console.log(`[Pipeline] Señal extraída con ${signal.claims.length} claims.`);

    // 3. Verificación de Deep Search (Nuevo paso T-014)
    const verification = await this.verifier.verify(signal);
    console.log(`[Pipeline] Verificación completa. Confianza: ${verification.confidenceScore}`);

    // Adjuntar resultados de verificación a la señal
    signal.metadata = { ...signal.metadata, verification };

    // 4. Scoring Editorial
    const opportunity = this.scorer.score(signal);
    console.log(`[Pipeline] Oportunidad Editorial: ${opportunity.finalScore.toFixed(2)}/1.0`);

    return opportunity;
  }
}
