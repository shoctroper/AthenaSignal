/**
 * Record/replay de herramientas de búsqueda y fetch (ORDEN-007 §5, §14).
 *
 * Los resultados reales se registran una vez y se reproducen offline. El
 * contenido registrado conserva `url`, `title` y extracto para provenance.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { FetchResult, FetchTool, SearchResponse, SearchTool } from './SearchTool.ts';

export const TOOL_RECORDING_KIND = 'athenasignal.m3.tool_recordings.v1';

export interface SearchRecordingEntry {
  key: string;
  query: string;
  response: SearchResponse;
  recordedAt: string;
}

export interface FetchRecordingEntry {
  key: string;
  url: string;
  response: FetchResult;
  recordedAt: string;
}

export interface ToolRecording {
  kind: typeof TOOL_RECORDING_KIND;
  generatedBy: string;
  searches: SearchRecordingEntry[];
  fetches: FetchRecordingEntry[];
}

export function searchKey(query: string): string {
  return createHash('sha256').update(`search:${query.trim().toLowerCase()}`, 'utf8').digest('hex');
}

export function fetchKey(url: string): string {
  return createHash('sha256').update(`fetch:${url.trim()}`, 'utf8').digest('hex');
}

export class RecordingSearchTool implements SearchTool {
  readonly id: string;
  private readonly inner: SearchTool;
  private readonly entries = new Map<string, SearchRecordingEntry>();
  private readonly recordedAt: string;

  constructor(inner: SearchTool, recordedAt: string) {
    this.inner = inner;
    this.id = `recording(${inner.id})`;
    this.recordedAt = recordedAt;
  }

  async search(query: string): Promise<SearchResponse> {
    const key = searchKey(query);
    const cached = this.entries.get(key);
    if (cached) return cached.response;
    const response = await this.inner.search(query);
    this.entries.set(key, { key, query, response, recordedAt: this.recordedAt });
    return response;
  }

  toEntries(): SearchRecordingEntry[] {
    return [...this.entries.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  }
}

export class RecordingFetchTool implements FetchTool {
  readonly id: string;
  private readonly inner: FetchTool;
  private readonly entries = new Map<string, FetchRecordingEntry>();
  private readonly recordedAt: string;

  constructor(inner: FetchTool, recordedAt: string) {
    this.inner = inner;
    this.id = `recording(${inner.id})`;
    this.recordedAt = recordedAt;
  }

  async fetch(url: string): Promise<FetchResult> {
    const key = fetchKey(url);
    const cached = this.entries.get(key);
    if (cached) return cached.response;
    const response = await this.inner.fetch(url);
    this.entries.set(key, { key, url, response, recordedAt: this.recordedAt });
    return response;
  }

  toEntries(): FetchRecordingEntry[] {
    return [...this.entries.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  }
}

export class ReplaySearchTool implements SearchTool {
  readonly id = 'replay-search';
  private readonly byKey = new Map<string, SearchResponse>();
  private readonly strict: boolean;
  private readonly misses: string[] = [];

  constructor(recording: ToolRecording, options: { strict?: boolean } = {}) {
    for (const entry of recording.searches) this.byKey.set(entry.key, entry.response);
    this.strict = options.strict ?? false;
  }

  async search(query: string): Promise<SearchResponse> {
    const key = searchKey(query);
    const hit = this.byKey.get(key);
    if (hit) return hit;
    this.misses.push(`search:${query}`);
    if (this.strict) throw new Error(`[ReplaySearchTool] missing recording for "${query}"`);
    return { query, results: [] };
  }

  missingKeys(): string[] {
    return [...this.misses].sort();
  }
}

export class ReplayFetchTool implements FetchTool {
  readonly id = 'replay-fetch';
  private readonly byKey = new Map<string, FetchResult>();
  private readonly strict: boolean;
  private readonly misses: string[] = [];

  constructor(recording: ToolRecording, options: { strict?: boolean } = {}) {
    for (const entry of recording.fetches) this.byKey.set(entry.key, entry.response);
    this.strict = options.strict ?? false;
  }

  async fetch(url: string): Promise<FetchResult> {
    const key = fetchKey(url);
    const hit = this.byKey.get(key);
    if (hit) return hit;
    this.misses.push(`fetch:${url}`);
    if (this.strict) throw new Error(`[ReplayFetchTool] missing recording for "${url}"`);
    return { url, status: 0, contentType: '', text: '' };
  }

  missingKeys(): string[] {
    return [...this.misses].sort();
  }
}

export function readToolRecording(path: string): ToolRecording {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as ToolRecording;
  if (raw.kind !== TOOL_RECORDING_KIND || !Array.isArray(raw.searches) || !Array.isArray(raw.fetches)) {
    throw new Error(`[readToolRecording] formato inválido en ${path}`);
  }
  return raw;
}

export function writeToolRecording(path: string, recording: ToolRecording): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(recording, null, 2)}\n`, 'utf8');
}
