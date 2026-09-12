/**
 * Herramienta de búsqueda real contra SearXNG local (ORDEN-007 §5).
 *
 *   GET http://localhost:8888/search?q=<query>&format=json
 */

import type { SearchResponse, SearchResult, SearchTool } from './SearchTool.ts';
import { normalizeSearchResult } from './SearchTool.ts';

export const DEFAULT_SEARXNG_URL = 'http://localhost:8888';

export function searxngBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.SEARXNG_URL?.trim() || DEFAULT_SEARXNG_URL).replace(/\/+$/, '');
}

export class SearxngSearchTool implements SearchTool {
  readonly id = 'searxng';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxResults: number;

  constructor(options: { baseUrl?: string; timeoutMs?: number; maxResults?: number } = {}) {
    this.baseUrl = options.baseUrl ?? searxngBaseUrl();
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxResults = options.maxResults ?? 5;
  }

  async search(query: string): Promise<SearchResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&format=json`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`[SearxngSearchTool] HTTP ${response.status} for "${query}"`);
      }
      const payload = (await response.json()) as { results?: Array<Record<string, unknown>> };
      const results: SearchResult[] = (payload.results ?? [])
        .map(normalizeSearchResult)
        .filter((r): r is SearchResult => r !== undefined)
        .slice(0, this.maxResults);
      return { query, results };
    } finally {
      clearTimeout(timer);
    }
  }
}
