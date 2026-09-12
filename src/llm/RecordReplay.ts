/**
 * Record/replay de LLM (ORDEN-007 §5, §14).
 *
 * La aceptación es offline: el pipeline corre una vez contra un proveedor real
 * y registra request/response normalizados (sin secretos). Tests y replay
 * reproducen el corpus sin red.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { LLMProvider, LLMRequest, LLMResponse, LLMStage } from './types.ts';
import { isLLMResponse } from './types.ts';

export const LLM_RECORDING_KIND = 'athenasignal.m3.llm_recordings.v1';

export interface LLMRecordingEntry {
  key: string;
  stage: LLMStage;
  request: Required<Pick<LLMRequest, 'stage' | 'system' | 'prompt'>> & {
    temperature: number;
    maxTokens: number | null;
    json: boolean;
  };
  response: LLMResponse;
  recordedAt: string;
}

export interface LLMRecording {
  kind: typeof LLM_RECORDING_KIND;
  generatedBy: string;
  entries: LLMRecordingEntry[];
}

export function normalizeRequest(request: LLMRequest): LLMRecordingEntry['request'] {
  return {
    stage: request.stage,
    system: request.system,
    prompt: request.prompt,
    temperature: request.temperature ?? 0,
    maxTokens: request.maxTokens ?? null,
    json: request.json ?? false,
  };
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function requestKey(request: LLMRequest): string {
  return createHash('sha256').update(stableStringify(normalizeRequest(request)), 'utf8').digest('hex');
}

/**
 * Envuelve un proveedor real y registra cada respuesta. Si el request ya fue
 * registrado, reutiliza la respuesta (evita llamadas duplicadas y mantiene la
 * reproducibilidad).
 */
export class RecordingLLMProvider implements LLMProvider {
  readonly id: string;
  private readonly inner: LLMProvider;
  private readonly entries: LLMRecordingEntry[] = [];
  private readonly byKey = new Map<string, LLMRecordingEntry>();
  private readonly recordedAt: string;
  private readonly generatedBy: string;

  constructor(inner: LLMProvider, options: { recordedAt: string; generatedBy?: string }) {
    this.inner = inner;
    this.id = `recording(${inner.id})`;
    this.recordedAt = options.recordedAt;
    this.generatedBy = options.generatedBy ?? inner.id;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const key = requestKey(request);
    const cached = this.byKey.get(key);
    if (cached) return cached.response;

    const response = await this.inner.complete(request);
    const entry: LLMRecordingEntry = {
      key,
      stage: request.stage,
      request: normalizeRequest(request),
      response,
      recordedAt: this.recordedAt,
    };
    this.entries.push(entry);
    this.byKey.set(key, entry);
    return response;
  }

  toRecording(): LLMRecording {
    return {
      kind: LLM_RECORDING_KIND,
      generatedBy: this.generatedBy,
      entries: [...this.entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    };
  }
}

/**
 * Reproduce respuestas registradas por clave de request. Si falta una entrada
 * aplica el fallback determinista inyectado y registra el miss (nunca falla en
 * silencio cuando `strict`).
 */
export class ReplayLLMProvider implements LLMProvider {
  readonly id = 'replay';
  private readonly byKey = new Map<string, LLMResponse>();
  private readonly fallback?: LLMProvider;
  private readonly strict: boolean;
  private readonly misses: string[] = [];

  constructor(recording: LLMRecording, options: { fallback?: LLMProvider; strict?: boolean } = {}) {
    for (const entry of recording.entries) {
      this.byKey.set(entry.key, entry.response);
    }
    this.fallback = options.fallback;
    this.strict = options.strict ?? false;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const key = requestKey(request);
    const hit = this.byKey.get(key);
    if (hit) return { ...hit };

    if (this.strict) {
      throw new Error(`[ReplayLLMProvider] missing recording for ${request.stage} (${key.slice(0, 12)})`);
    }
    this.misses.push(`${request.stage}:${key}`);
    if (this.fallback) return this.fallback.complete(request);
    return {
      text: '{}',
      provider: 'replay-missing',
      model: 'none',
      deterministic: true,
    };
  }

  missingKeys(): string[] {
    return [...this.misses].sort();
  }
}

export function readLLMRecording(path: string): LLMRecording {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as LLMRecording;
  if (raw.kind !== LLM_RECORDING_KIND || !Array.isArray(raw.entries)) {
    throw new Error(`[readLLMRecording] formato inválido en ${path}`);
  }
  for (const entry of raw.entries) {
    if (!isLLMResponse(entry.response)) {
      throw new Error(`[readLLMRecording] response inválida en ${path} (${entry.key})`);
    }
  }
  return raw;
}

/**
 * Combina grabaciones de distintos milestones. Ante una clave duplicada gana
 * la primera (la grabación real base); las suplementarias sólo aportan las
 * respuestas que faltaban, preservando la reproducibilidad offline completa.
 */
export function mergeLLMRecordings(...recordings: LLMRecording[]): LLMRecording {
  const byKey = new Map<string, LLMRecordingEntry>();
  for (const recording of recordings) {
    for (const entry of recording.entries) {
      if (!byKey.has(entry.key)) byKey.set(entry.key, entry);
    }
  }
  return {
    kind: LLM_RECORDING_KIND,
    generatedBy: recordings.map((recording) => recording.generatedBy).filter(Boolean).join('+') || 'merged',
    entries: [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  };
}

export function writeLLMRecording(path: string, recording: LLMRecording): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(recording, null, 2)}\n`, 'utf8');
}
