/**
 * Fuentes extendidas M5 (ORDEN-009 §0bis.1, §2.3, §2.5).
 *
 * Materializa resultados reales de búsqueda capturados por el deep search de
 * M3 (`evidence/m3/raw/searx_*.json`) como fuentes de observación con
 * provenance completa (URL, título, extracto, motor, fecha de captura y hash
 * de contenido). No accede a la red: el corpus crece con material real ya
 * grabado, de modo que el aumento de escala es reproducible offline.
 *
 * Estas fuentes se observan e ingieren de forma determinista. Al carecer de
 * cognición grabada para cada una, la extracción cognitiva degrada al fallback
 * seguro (sin inventar señales), lo que demuestra que más fuentes no elevan
 * linealmente el ruido/candidates.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { hashContent } from '../research/provenance.ts';
import type { CorpusItem } from '../autonomous/types.ts';

export const M5_RAW_CAPTURE_DIR = 'evidence/m3/raw';
export const M5_RAW_CAPTURED_AT = '2026-09-11T00:00:00.000Z';

interface RawSearxResult {
  title?: string;
  url?: string;
  content?: string;
  publishedDate?: string | null;
  engines?: string[];
  engine?: string;
}

interface RawSearxCapture {
  query?: string;
  results?: RawSearxResult[];
}

export interface ExtendedSourceOptions {
  captureDir?: string;
  capturedAt?: string;
  /** URLs ya presentes en el corpus cognitivo (canónicas/espejo) a excluir. */
  excludeUrls?: Set<string>;
}

export interface ExtendedSourceSet {
  sources: CorpusItem[];
  queries: string[];
  captureFiles: string[];
}

/**
 * Lee las capturas reales de SearXNG y las convierte en fuentes únicas
 * (dedup por URL) con provenance verificable.
 */
export function buildExtendedSources(options: ExtendedSourceOptions = {}): ExtendedSourceSet {
  const captureDir = resolve(process.cwd(), options.captureDir ?? M5_RAW_CAPTURE_DIR);
  const capturedAt = options.capturedAt ?? M5_RAW_CAPTURED_AT;
  const excludeUrls = options.excludeUrls ?? new Set<string>();

  const files = readdirSync(captureDir)
    .filter((file) => file.endsWith('.json'))
    .sort();

  const byUrl = new Map<string, CorpusItem>();
  const queries = new Set<string>();

  for (const file of files) {
    const raw = JSON.parse(readFileSync(resolve(captureDir, file), 'utf8')) as RawSearxCapture;
    const query = typeof raw.query === 'string' ? raw.query.trim() : '';
    if (query) queries.add(query);
    const results = Array.isArray(raw.results) ? raw.results : [];

    for (const result of results) {
      const url = typeof result.url === 'string' ? result.url.trim() : '';
      const title = typeof result.title === 'string' ? result.title.trim() : '';
      if (!url || !title) continue;
      if (excludeUrls.has(url) || byUrl.has(url)) continue;

      const snippet = typeof result.content === 'string' ? result.content.trim() : '';
      const content = `${title}\n${snippet}`.trim();
      const language = detectLanguage(url, `${title} ${snippet} ${query}`);
      const engines = result.engines ?? (result.engine ? [result.engine] : []);

      byUrl.set(url, {
        id: sourceIdForUrl(url),
        title,
        url,
        platform: platformForUrl(url),
        creator: hostForUrl(url),
        publishedAt: normalizeDate(result.publishedDate) ?? capturedAt,
        language,
        policy: 'DISCOVERY',
        capturedAt,
        content,
        contentHash: hashContent(content),
        discoveryQueries: query ? [query] : [],
        benchmarkClasses: [],
        notes:
          `Resultado real de búsqueda SearXNG capturado en ${M5_RAW_CAPTURE_DIR}/${file}` +
          `${query ? ` (query: "${query}")` : ''}; motores: ${engines.join(', ') || 'n/d'}. ` +
          'Observado como fuente de descubrimiento para escala material (ORDEN-009 §0bis.1).',
      });
    }
  }

  const sources = [...byUrl.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    sources,
    queries: [...queries].sort(),
    captureFiles: files,
  };
}

export function sourceIdForUrl(url: string): string {
  return `src-web-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
}

export function platformForUrl(url: string): string {
  const host = hostForUrl(url);
  const path = safePath(url);
  if (/youtube\.com|youtu\.be/.test(host)) return 'youtube';
  if (/github\.com|github\.io|raw\.githubusercontent/.test(host)) return 'github';
  if (/wikipedia\.org/.test(host)) return 'wikipedia';
  if (/pmc\.ncbi|pubmed|doi\.org|nature\.com|sciencedirect|springer|wiley/.test(host)) return 'pmc';
  if (/docs\.|readthedocs|\.dev$/.test(host) || /\/docs?\//.test(path)) return 'docs';
  if (/\.(gov|gob)(\.|\/)/.test(host)) return 'gob';
  if (/medium\.com|substack\.com|dev\.to|blog/.test(host)) return 'blog';
  return 'web';
}

export function detectLanguage(url: string, text: string): 'es' | 'en' {
  if (/[áéíóúüñ¿¡]/.test(text)) return 'es';
  const host = hostForUrl(url);
  if (/(^|\.)(es|mx|ar|co|cl|pe|uy|ve|ec|bo|py|do|cu|cr|gt|hn|ni|pa|pr|sv)\./.test(host)) return 'es';
  if (/cochrane\.org/.test(host) && /\/(es|mx)\//.test(safePath(url))) return 'es';
  return 'en';
}

function hostForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}
