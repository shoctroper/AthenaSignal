/**
 * Proveedor DeepSeek remoto (opcional). Si `DEEPSEEK_API_KEY` no está
 * presente, la cadena de resiliencia degrada a Ollama o al fallback
 * determinista.
 */

import type { LLMProvider } from './types.ts';
import { OpenAiCompatibleProvider } from './OpenAiCompatibleProvider.ts';

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';

export function createDeepSeekProvider(
  env: NodeJS.ProcessEnv = process.env
): LLMProvider | undefined {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return undefined;
  const base = (env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, '');
  return new OpenAiCompatibleProvider({
    id: 'deepseek',
    model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL,
    endpoint: `${base}/chat/completions`,
    apiKey,
    timeoutMs: Number(env.DEEPSEEK_TIMEOUT_MS ?? 90_000),
  });
}
