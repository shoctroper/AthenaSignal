/**
 * Capa LLM de AthenaSignal M3 (ORDEN-007 §4).
 *
 * Abstracción `LLMProvider` con cadena de resiliencia:
 *   primario (Ollama/DeepSeek) → fallback → fallback determinista.
 *
 * El `core` cognitivo nunca depende de un proveedor concreto: los tests y la
 * ruta de aceptación usan reproducción (replay) sin red.
 */

export type LLMStage =
  | 'signal_discovery'
  | 'assertion_decomposition'
  | 'evidence_interpretation'
  | 'claim_assessment'
  | 'researchability'
  | 'reframing'
  | 'editorial_relevance'
  | 'prioritization'
  /** M6: síntesis de investigación profunda del worker AthenaOS. */
  | 'deep_research';

export const LLM_STAGES: LLMStage[] = [
  'signal_discovery',
  'assertion_decomposition',
  'evidence_interpretation',
  'claim_assessment',
  'researchability',
  'reframing',
  'editorial_relevance',
  'prioritization',
  'deep_research',
];

export interface LLMRequest {
  stage: LLMStage;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface LLMResponse {
  text: string;
  /** Proveedor que resolvió la respuesta. */
  provider: string;
  model: string;
  /** true cuando el texto provino de un proveedor determinista local. */
  deterministic: boolean;
}

export interface LLMProvider {
  readonly id: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export function isLLMResponse(value: unknown): value is LLMResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.text === 'string' &&
    typeof candidate.provider === 'string' &&
    typeof candidate.model === 'string' &&
    typeof candidate.deterministic === 'boolean'
  );
}
