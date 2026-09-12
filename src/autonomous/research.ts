/**
 * Investigación inicial M3 (ORDEN-007 §3, §7): genera queries reales a partir
 * de la señal, consulta la herramienta de búsqueda y (opcionalmente) hace
 * fetch del documento. Conserva provenance y distingue DISCOVERY de EVIDENCE.
 */

import type { FetchTool, SearchTool } from '../research/tools/SearchTool.ts';
import type { CorpusItem, DiscoveredSignal, EvidenceItem, SourcePolicy } from './types.ts';

export interface GatheredResearch {
  queries: string[];
  evidence: EvidenceItem[];
}

export interface GatherOptions {
  maxQueries?: number;
  maxResultsPerQuery?: number;
  fetchTop?: boolean;
  fetchChars?: number;
}

export async function gatherEvidence(
  signal: DiscoveredSignal,
  item: CorpusItem,
  searchTool: SearchTool,
  fetchTool: FetchTool,
  options: GatherOptions = {}
): Promise<GatheredResearch> {
  const maxQueries = options.maxQueries ?? 3;
  const maxResults = options.maxResultsPerQuery ?? 4;
  const fetchTop = options.fetchTop ?? true;
  const fetchChars = options.fetchChars ?? 1200;

  const queries = buildQueries(signal, item).slice(0, maxQueries);
  const evidence: EvidenceItem[] = [];
  const seen = new Set<string>();

  // La fuente de origen es evidencia de primera clase para las afirmaciones
  // que se extraen de ella. Su rol depende de la política (DISCOVERY ≠ EVIDENCE).
  const originRole: EvidenceItem['role'] =
    item.policy === 'DISCOVERY' || item.policy === 'TERTIARY' || item.policy === 'BLOCKED'
      ? 'DISCOVERY'
      : 'EVIDENCE';
  evidence.push({
    sourceUrl: item.url,
    title: `${item.title} (fuente de origen)`,
    excerpt: item.content.replace(/\s+/g, ' ').trim().slice(0, 1600),
    policy: item.policy,
    role: originRole,
    supports: null,
    query: 'fuente de origen',
  });
  seen.add(item.url);

  for (const query of queries) {
    const response = await searchTool.search(query);
    for (const result of response.results.slice(0, maxResults)) {
      if (seen.has(result.url)) continue;
      seen.add(result.url);
      const policy = inferPolicy(result.url);
      evidence.push({
        sourceUrl: result.url,
        title: result.title,
        excerpt: result.content,
        policy,
        role: policy === 'DISCOVERY' || policy === 'TERTIARY' ? 'DISCOVERY' : 'EVIDENCE',
        supports: null,
        query,
      });
    }
  }

  if (fetchTop) {
    const target = evidence.find((entry) => entry.role === 'EVIDENCE' && entry.sourceUrl !== item.url);
    if (target) {
      try {
        const fetched = await fetchTool.fetch(target.sourceUrl);
        if (fetched.status >= 200 && fetched.status < 400 && fetched.text.trim().length > 80) {
          target.excerpt = fetched.text.replace(/\s+/g, ' ').trim().slice(0, fetchChars);
        }
      } catch {
        // El fetch es best-effort; el resultado de búsqueda sigue siendo evidencia.
      }
    }
  }

  return { queries, evidence };
}

export function buildQueries(signal: DiscoveredSignal, item: CorpusItem): string[] {
  // Prioriza las queries de descubrimiento curadas por tema y la afirmación
  // central; solo después los conceptos (evita queries genéricas ruidosas).
  const queries: string[] = [...item.discoveryQueries];
  queries.push(signal.assertion.slice(0, 140));
  for (const concept of signal.concepts.slice(0, 2)) {
    if (concept.trim()) queries.push(`${concept.trim()} evidencia`);
  }
  return unique(queries).filter((query) => query.length >= 4);
}

export function inferPolicy(url: string): SourcePolicy {
  const lower = url.toLowerCase();
  if (/(wikipedia\.org)/.test(lower)) return 'DISCOVERY';
  if (/(docs\.|\.gov|\.int|arxiv\.org|ncbi\.nlm\.nih\.gov|pmc\.|github\.com|softwarefoundation|kafka\.apache\.org|rabbitmq\.com|python\.org)/.test(lower)) {
    return 'PRIMARY';
  }
  if (/(medium\.com|dev\.to|substack\.com|blog|health\.harvard|mayoclinic|clevelandclinic|cochrane)/.test(lower)) {
    return 'SECONDARY';
  }
  return 'SECONDARY';
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      result.push(trimmed);
    }
  }
  return result;
}
