/**
 * Persistencia de la plataforma M5 (ORDEN-009 §1, §14).
 *
 * El estado completo (memoria histórica del radar + runs + routing + recovery +
 * idempotencia + sink AKP) es un documento JSON versionado. La escritura es
 * atómica (tmp + rename) para sobrevivir a un proceso muerto a mitad de ciclo.
 * El store nunca interpreta el estado: sólo lo transporta.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { RadarState } from '../radar/types.ts';
import type { M5PlatformState } from './types.ts';

export function emptyPlatformState(input: {
  updatedAt: string;
  radar: RadarState;
  importedFrom: string | null;
  sink: string;
}): M5PlatformState {
  return {
    kind: 'athenasignal.m5.platform_state.v1',
    schemaVersion: 1,
    updatedAt: input.updatedAt,
    importedFrom: input.importedFrom,
    radar: input.radar,
    runs: [],
    routing: [],
    recovery: [],
    idempotency: [],
    akp: {
      sink: input.sink,
      consumed: 0,
      limitation:
        'AKP/AthenaOS no expone un endpoint vivo en este entorno: el handoff se persiste ' +
        'de forma consumible en el sink de archivo y lo ingiere el consumidor AKP local.',
      deliveries: [],
      consumption: null,
    },
    counters: {
      inputsObserved: 0,
      cyclesProcessed: input.radar.cyclesProcessed.length,
      runs: 0,
      signals: Object.keys(input.radar.signals).length,
      clusters: Object.keys(input.radar.clusters).length,
      candidates: Object.keys(input.radar.candidates).length,
      promoted: 0,
      discarded: 0,
      routingDecisions: 0,
      localRoutes: 0,
      remoteRoutes: 0,
      deterministicRoutes: 0,
      recoveryEvents: 0,
      idempotencyNoops: 0,
      akpDeliveries: 0,
    },
  };
}

export function serializePlatformState(state: M5PlatformState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

export function deserializePlatformState(json: string): M5PlatformState {
  const parsed = JSON.parse(json) as M5PlatformState;
  if (parsed.kind !== 'athenasignal.m5.platform_state.v1') {
    throw new Error(`[deserializePlatformState] kind inválido: ${String(parsed?.kind)}`);
  }
  return parsed;
}

export class PlatformStore {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  exists(): boolean {
    return existsSync(this.path);
  }

  load(): M5PlatformState | null {
    if (!this.exists()) return null;
    return deserializePlatformState(readFileSync(this.path, 'utf8'));
  }

  save(state: M5PlatformState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, serializePlatformState(state), 'utf8');
    renameSync(tmp, this.path);
  }
}

/** Store en memoria: recovery/idempotencia multi-proceso sin tocar el disco. */
export class MemoryPlatformStore {
  private value: string | null = null;

  save(state: M5PlatformState): void {
    this.value = serializePlatformState(state);
  }

  load(): M5PlatformState | null {
    return this.value ? deserializePlatformState(this.value) : null;
  }

  exists(): boolean {
    return this.value !== null;
  }
}

export function clonePlatformState(state: M5PlatformState): M5PlatformState {
  return JSON.parse(JSON.stringify(state)) as M5PlatformState;
}
