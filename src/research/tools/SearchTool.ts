/**
 * Contratos de herramientas de búsqueda y fetch (ORDEN-007 §5).
 */

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  publishedDate: string | null;
  engines: string[];
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface SearchTool {
  readonly id: string;
  search(query: string): Promise<SearchResponse>;
}

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  text: string;
}

export interface FetchTool {
  readonly id: string;
  fetch(url: string): Promise<FetchResult>;
}

export function normalizeSearchResult(raw: Record<string, unknown>): SearchResult | undefined {
  const url = typeof raw.url === 'string' ? raw.url : '';
  if (!url) return undefined;
  const engines = Array.isArray(raw.engines)
    ? raw.engines.filter((e): e is string => typeof e === 'string')
    : [];
  return {
    title: typeof raw.title === 'string' ? raw.title : url,
    url,
    content: typeof raw.content === 'string' ? raw.content : '',
    publishedDate: typeof raw.publishedDate === 'string' ? raw.publishedDate : null,
    engines,
  };
}
