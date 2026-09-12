/**
 * Adaptador OpenAI-compatible genérico. Lo comparten Ollama (local) y
 * DeepSeek (remoto opcional). No imprime ni registra secretos.
 */

import type { LLMRequest, LLMResponse } from './types.ts';

export interface OpenAiCompatibleConfig {
  id: string;
  model: string;
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
}

export class OpenAiCompatibleProvider {
  readonly id: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(config: OpenAiCompatibleConfig) {
    this.id = config.id;
    this.model = config.model;
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 120_000;
    this.extraHeaders = config.extraHeaders ?? {};
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.extraHeaders,
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const body: Record<string, unknown> = {
        model: this.model,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
        temperature: request.temperature ?? 0,
      };
      if (request.maxTokens) body.max_tokens = request.maxTokens;
      if (request.json) body.response_format = { type: 'json_object' };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await safeText(response);
        throw new Error(`${this.id} HTTP ${response.status}: ${detail.slice(0, 300)}`);
      }

      const payload = (await response.json()) as ChatCompletionResponse;
      const text = payload.choices?.[0]?.message?.content ?? '';
      if (!text.trim()) {
        throw new Error(`${this.id} returned an empty completion`);
      }
      return {
        text,
        provider: this.id,
        model: payload.model ?? this.model,
        deterministic: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<unreadable body>';
  }
}
