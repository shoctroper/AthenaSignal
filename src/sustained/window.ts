/**
 * Ventana de operación en tiempo de reloj real (ORDEN-012 §0bis.1).
 *
 * `scripts/m8-sustain.ts` ejecuta una operación sostenida real durante una
 * ventana acotada por el presupuesto del worker y deja un registro con
 * timestamps reales (`startedAt`/`endedAt`). El replay determinista
 * (`runM8Offline`) consume esa grabación: reproduce el mismo estado sin red y,
 * a la vez, conserva los tiempos reales verificables de la operación.
 *
 * Si la grabación no existe (p. ej. checkout limpio) el scheduler degrada a la
 * ventana proyectada determinista, sin romper la aceptación.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { M8WindowRecording } from './types.ts';

export const M8_WINDOW_RECORDING_KIND = 'athenasignal.m8.window_recording.v1';
export const DEFAULT_M8_WINDOW_RECORDING_PATH = 'evidence/m8/recordings/window.json';

export function windowRecordingPath(path?: string): string {
  return resolve(process.cwd(), path ?? DEFAULT_M8_WINDOW_RECORDING_PATH);
}

export function loadWindowRecording(path?: string): M8WindowRecording | null {
  const resolved = windowRecordingPath(path);
  if (!existsSync(resolved)) return null;
  try {
    const raw = JSON.parse(readFileSync(resolved, 'utf8')) as M8WindowRecording;
    if (raw.kind !== M8_WINDOW_RECORDING_KIND || !Array.isArray(raw.ticks) || !raw.ticks.length) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function writeWindowRecording(recording: M8WindowRecording, path?: string): string {
  const resolved = windowRecordingPath(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(recording, null, 2)}\n`, 'utf8');
  return resolved;
}
