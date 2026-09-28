import type { NormalizedContent, ExtractedSignal, CustomExtractorEngine } from '../services/SignalExtractor.ts';

export interface OpenAICompatibleExtractionEngineOptions {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export const DEFAULT_OPENAI_BASE_URL = 'http://localhost:11434/v1';
export const DEFAULT_OPENAI_MODEL = 'qwen2.5:7b-instruct';
export const DEFAULT_TIMEOUT_MS = 30000;

export interface ExtractedUnitClaim {
  statement: string;
  quote: string | null;
  provenanceSourceId: string;
}

export class OpenAICompatibleExtractionEngine {
  public readonly baseUrl: string;
  public readonly model: string;
  public readonly timeoutMs: number;
  private readonly apiKey: string;
  private readonly fetchFn?: typeof globalThis.fetch;

  constructor(options: OpenAICompatibleExtractionEngineOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.SIGNAL_EXTRACTOR_BASE_URL ?? DEFAULT_OPENAI_BASE_URL).replace(
      /\/+$/,
      ''
    );
    this.model = options.model ?? process.env.SIGNAL_EXTRACTOR_MODEL ?? DEFAULT_OPENAI_MODEL;
    this.apiKey = options.apiKey ?? process.env.SIGNAL_EXTRACTOR_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchFn = options.fetch;

    const self = this;
    const callable = function (content: NormalizedContent) {
      return self.extract(content);
    };
    Object.setPrototypeOf(callable, OpenAICompatibleExtractionEngine.prototype);
    Object.assign(callable, this);
    return callable as unknown as OpenAICompatibleExtractionEngine;
  }

  extract = async (content: NormalizedContent): Promise<Partial<ExtractedSignal>> => {
    const endpoint = this.baseUrl.endsWith('/chat/completions')
      ? this.baseUrl
      : `${this.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an epistemic signal extraction engine. ' +
            'Extract key topics, concepts, and factual claims to investigate from the provided content. ' +
            'CRITICAL: For every claim in claimsToInvestigate, you MUST provide both "statement" and "quote". ' +
            'The "quote" MUST be a verbatim, literal substring from the transcript text (exact match). ' +
            'Do not paraphrase or fabricate quotes. ' +
            'Respond ONLY with a valid JSON object with the following structure:\n' +
            '{\n' +
            '  "topics": ["topic1", "topic2"],\n' +
            '  "concepts": ["concept1", "concept2"],\n' +
            '  "claimsToInvestigate": [\n' +
            '    { "statement": "Factual assertion", "quote": "Literal quote from transcript" }\n' +
            '  ]\n' +
            '}',
        },
        {
          role: 'user',
          content: JSON.stringify({
            title: content.title,
            description: content.description,
            transcript: content.transcript,
          }),
        },
      ],
      temperature: 0,
      reasoning_effort: 'none',
      response_format: { type: 'json_object' },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      const fetchToUse = this.fetchFn || globalThis.fetch;
      response = await fetchToUse(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (networkError) {
      throw new Error(`Extraction engine network error: ${(networkError as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`Extraction engine HTTP error ${response.status}: ${response.statusText}`);
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch (jsonError) {
      throw new Error(`Extraction engine failed to parse response envelope JSON: ${(jsonError as Error).message}`);
    }

    if (!payload || typeof payload !== 'object') {
      throw new Error('Extraction engine received non-object JSON payload');
    }

    const rawChoice = payload.choices?.[0];
    const rawContent = rawChoice?.message?.content;

    if (typeof rawContent !== 'string' || rawContent.trim().length === 0) {
      throw new Error('Extraction engine received empty content from model');
    }

    let parsedResult: any;
    try {
      const cleaned = rawContent
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
      parsedResult = JSON.parse(cleaned);
    } catch (parseError) {
      throw new Error(`Extraction engine received non-JSON model output: ${(parseError as Error).message}`);
    }

    if (!parsedResult || typeof parsedResult !== 'object' || Array.isArray(parsedResult)) {
      throw new Error('Extraction engine parsed model output is not a JSON object');
    }

    const topics = Array.isArray(parsedResult.topics)
      ? parsedResult.topics.map((t: unknown) => String(t).trim()).filter(Boolean)
      : [];

    const concepts = Array.isArray(parsedResult.concepts)
      ? parsedResult.concepts.map((c: unknown) => String(c).trim()).filter(Boolean)
      : [];

    const rawClaims = Array.isArray(parsedResult.claimsToInvestigate)
      ? parsedResult.claimsToInvestigate
      : Array.isArray(parsedResult.claims)
        ? parsedResult.claims
        : [];

    const claimsToInvestigate: ExtractedUnitClaim[] = rawClaims.map((item: unknown) => {
      if (typeof item === 'string') {
        return {
          statement: item,
          quote: null,
          provenanceSourceId: content.source.contentId,
        };
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        return {
          statement: typeof obj.statement === 'string' ? obj.statement : '',
          quote: typeof obj.quote === 'string' ? obj.quote : null,
          provenanceSourceId: content.source.contentId,
        };
      }
      return {
        statement: '',
        quote: null,
        provenanceSourceId: content.source.contentId,
      };
    });

    const result: Partial<ExtractedSignal> = {
      sourceId: content.source.contentId,
      topic: topics[0] || content.title || 'Unspecified Topic',
      topics: topics.length > 0 ? topics : [content.title || 'Unspecified Topic'],
      concepts,
      claimsToInvestigate: claimsToInvestigate as any,
      metadata: {
        extractor: 'openai-compatible',
        model: this.model,
      },
    };

    return result;
  };

  asCustomEngine(): CustomExtractorEngine {
    return (content: NormalizedContent) => this.extract(content);
  }
}

export function createOpenAICompatibleExtractionEngine(
  options?: OpenAICompatibleExtractionEngineOptions
): CustomExtractorEngine {
  const engine = new OpenAICompatibleExtractionEngine(options);
  return (content: NormalizedContent) => engine.extract(content);
}
