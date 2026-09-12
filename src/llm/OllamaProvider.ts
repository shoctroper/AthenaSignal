/**
 * Proveedor Ollama local (garantizado sin API key).
 *
 * Endpoint OpenAI-compatible documentado en `docs/llm-provider-env.md`.
 */

import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider.ts';

export const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b-instruct';

export function ollamaBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const host = env.LOCAL_OLLAMA_HOST?.trim() || DEFAULT_OLLAMA_HOST;
  return host.replace(/\/+$/, '');
}

export function createOllamaProvider(
  env: NodeJS.ProcessEnv = process.env,
  modelOverride?: string
): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider({
    id: 'ollama',
    model: modelOverride?.trim() || env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    endpoint: `${ollamaBaseUrl(env)}/v1/chat/completions`,
    timeoutMs: Number(env.OLLAMA_TIMEOUT_MS ?? 180_000),
  });
}
