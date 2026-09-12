/**
 * Persistencia del radar M4 (ORDEN-008 §1, §6, §8).
 *
 * El estado es un documento JSON versionado. Se puede serializar en memoria
 * (recovery/idempotencia en tests) o persistir en disco con escritura atómica
 * (runner offline). El store nunca interpreta el estado: sólo lo transporta.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { RadarState } from './types.ts';

export function emptyState(updatedAt: string): RadarState {
  return {
    kind: 'athenasignal.m4.radar_state.v1',
    updatedAt,
    cyclesProcessed: [],
    processedSources: {},
    signals: {},
    clusters: {},
    candidates: {},
    events: [],
    eventCounts: {},
  };
}

export function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Garantiza que estados históricos (M4/M5) sin `statusHistory` sigan siendo
 * mutables: ancla el estado vigente como primer punto sin reescribir el pasado.
 */
export function normalizeRadarState(state: RadarState): RadarState {
  for (const cluster of Object.values(state.clusters ?? {})) {
    if (!Array.isArray(cluster.statusHistory)) {
      cluster.statusHistory = [
        {
          cycleId: cluster.firstCycle,
          cycleNumber: 0,
          status: cluster.status,
          reason: 'Historial de estado importado; se ancla el estado vigente sin reescribir el pasado.',
          at: state.updatedAt,
        },
      ];
    }
  }
  for (const candidate of Object.values(state.candidates ?? {})) {
    if (!Array.isArray(candidate.statusHistory)) {
      candidate.statusHistory = [
        {
          cycleId: candidate.firstCycle,
          cycleNumber: 0,
          status: candidate.status,
          reason: 'Historial de estado importado; se ancla el estado vigente sin reescribir el pasado.',
          at: state.updatedAt,
        },
      ];
    }
  }
  return state;
}

export function serializeState(state: RadarState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function deserializeState(json: string): RadarState {
  const parsed = JSON.parse(json) as RadarState;
  if (parsed.kind !== 'athenasignal.m4.radar_state.v1') {
    throw new Error(`[deserializeState] kind inválido: ${String(parsed?.kind)}`);
  }
  return normalizeRadarState(parsed);
}

export class RadarStore {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  exists(): boolean {
    return existsSync(this.path);
  }

  load(): RadarState | null {
    if (!this.exists()) return null;
    return deserializeState(readFileSync(this.path, 'utf8'));
  }

  save(state: RadarState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, serializeState(state), 'utf8');
    renameSync(tmp, this.path);
  }
}

/** Persistencia en memoria para recovery/idempotencia sin tocar el disco. */
export class MemoryRadarStore {
  private value: string | null = null;

  save(state: RadarState): void {
    this.value = serializeState(state);
  }

  load(): RadarState | null {
    return this.value ? deserializeState(this.value) : null;
  }

  exists(): boolean {
    return this.value !== null;
  }
}
