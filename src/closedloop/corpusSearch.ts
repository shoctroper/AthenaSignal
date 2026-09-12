/**
 * Búsqueda de evidencia sobre el corpus compartido (stand-in de investigación
 * profunda M6, ORDEN-010 §0bis §1).
 *
 * El worker AthenaOS no sólo consulta búsquedas grabadas: también indexa el
 * corpus real capturado (M5/M6) para descubrir evidencia adicional sobre la
 * pregunta de investigación. Los resultados conservan `url`, `title` y extracto
 * reales —nunca se fabrican— y son deterministas (score por solape de tokens y
 * orden estable). Se documenta como stand-in del motor externo no invocable.
 */

import type { CorpusItem } from '../autonomous/types.ts';
import type { SearchResponse, SearchResult, SearchTool } from '../research/tools/SearchTool.ts';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
  'los', 'las', 'una', 'unos', 'unas', 'del', 'que', 'con', 'por', 'para',
  'como', 'sus', 'mas', 'más', 'sobre', 'entre', 'sin', 'cada', 'este', 'esta',
  'son', 'fue', 'han', 'hay', 'the', 'of', 'to', 'in', 'is', 'it', 'on', 'or',
]);

export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  return new Set(tokens);
}

export class LocalCorpusSearchTool implements SearchTool {
  readonly id = 'local-corpus-index';
  private readonly sources: CorpusItem[];
  private readonly limit: number;

  constructor(sources: CorpusItem[], limit = 5) {
    this.sources = [...sources].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
    this.limit = Math.max(1, limit);
  }

  async search(query: string): Promise<SearchResponse> {
    const queryTokens = tokenize(query);
    if (!queryTokens.size) return { query, results: [] };
    const scored: Array<{ source: CorpusItem; score: number }> = [];
    for (const source of this.sources) {
      const haystack = tokenize(
        `${source.title} ${source.content} ${source.discoveryQueries.join(' ')}`
      );
      let score = 0;
      for (const token of queryTokens) if (haystack.has(token)) score += 1;
      if (score > 0) scored.push({ source, score });
    }
    scored.sort((a, b) => b.score - a.score || (a.source.url < b.source.url ? -1 : 1));
    const results: SearchResult[] = scored.slice(0, this.limit).map(({ source }) => ({
      title: source.title,
      url: source.url,
      content: source.content.slice(0, 280),
      publishedDate: source.publishedAt || null,
      engines: [this.id],
    }));
    return { query, results };
  }
}

/** Combina varias herramientas de búsqueda, deduplicando por URL (primera gana). */
export class CompositeSearchTool implements SearchTool {
  readonly id: string;
  private readonly tools: SearchTool[];

  constructor(tools: SearchTool[]) {
    this.tools = tools;
    this.id = `composite(${tools.map((tool) => tool.id).join('+')})`;
  }

  async search(query: string): Promise<SearchResponse> {
    const merged = new Map<string, SearchResult>();
    for (const tool of this.tools) {
      let results: SearchResult[] = [];
      try {
        results = (await tool.search(query)).results ?? [];
      } catch {
        results = [];
      }
      for (const result of results) {
        if (result.url && !merged.has(result.url)) merged.set(result.url, result);
      }
    }
    return { query, results: [...merged.values()] };
  }
}
