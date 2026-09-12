/**
 * Punto de entrada de la capa LLM de M3.
 */

import { DeterministicLLMProvider } from './DeterministicLLMProvider.ts';
import { createDeepSeekProvider } from './DeepSeekProvider.ts';
import { createOllamaProvider } from './OllamaProvider.ts';
import { ResilientLLMProvider } from './ResilientLLMProvider.ts';
import { readLLMRecording, ReplayLLMProvider, writeLLMRecording } from './RecordReplay.ts';
import { StageRoutingLLMProvider } from './StageRoutingProvider.ts';

import type { LLMProvider, LLMStage } from './types.ts';

export * from './types.ts';
export * from './parse.ts';
export { DeterministicLLMProvider } from './DeterministicLLMProvider.ts';
export { createOllamaProvider, DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_MODEL, ollamaBaseUrl } from './OllamaProvider.ts';
export { createDeepSeekProvider, DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL } from './DeepSeekProvider.ts';
export { ResilientLLMProvider } from './ResilientLLMProvider.ts';
export { StageRoutingLLMProvider } from './StageRoutingProvider.ts';
export {
  RecordingLLMProvider,
  ReplayLLMProvider,
  readLLMRecording,
  writeLLMRecording,
  requestKey,
  stableStringify,
  LLM_RECORDING_KIND,
} from './RecordReplay.ts';
export type { LLMRecording, LLMRecordingEntry } from './RecordReplay.ts';

/**
 * Cadena viva: primario según env → fallback → determinista.
 */
export function createLiveLLMProvider(env: NodeJS.ProcessEnv = process.env): ResilientLLMProvider {
  const deepseek = createDeepSeekProvider(env);
  const ollama = createOllamaProvider(env);
  const providers: LLMProvider[] = deepseek ? [deepseek, ollama] : [ollama];
  providers.push(new DeterministicLLMProvider());
  return new ResilientLLMProvider(providers);
}

export const DEFAULT_HQ_OLLAMA_MODEL = 'gpt-oss:20b';

/** Etapas que requieren juicio epistemológico (modelo más capaz). */
export const JUDGMENT_STAGES: LLMStage[] = [
  'claim_assessment',
  'reframing',
  'researchability',
  'editorial_relevance',
  'prioritization',
];

/**
 * Cadena cognitiva para grabación en vivo: extracción con el modelo base,
 * juicio con el modelo HQ, y fallback determinista en toda la cadena.
 */
export function createCognitiveProvider(env: NodeJS.ProcessEnv = process.env): StageRoutingLLMProvider {
  const deterministic = new DeterministicLLMProvider();
  const base = new ResilientLLMProvider([createOllamaProvider(env), deterministic]);
  const hqModel = env.OLLAMA_MODEL_HQ?.trim() || DEFAULT_HQ_OLLAMA_MODEL;
  const hq = new ResilientLLMProvider([
    createOllamaProvider(env, hqModel),
    createOllamaProvider(env),
    deterministic,
  ]);

  const routes: Partial<Record<LLMStage, LLMProvider>> = {};
  for (const stage of JUDGMENT_STAGES) routes[stage] = hq;
  return new StageRoutingLLMProvider(routes, base);
}

export function createReplayLLMProvider(
  recordingPath: string,
  options: { strict?: boolean; fallback?: LLMProvider } = {}
): ReplayLLMProvider {
  const recording = readLLMRecording(recordingPath);
  return new ReplayLLMProvider(recording, {
    strict: options.strict,
    fallback: options.fallback ?? new DeterministicLLMProvider(),
  });
}
