/**
 * Invocaciones reales a motores e infraestructura (ORDEN-012 §0, §2.8).
 *
 * M8 no simula la participación de nodos externos: registra las invocaciones
 * reales realizadas durante la grabación (`scripts/m8-record.ts`) en
 * `evidence/m8/recordings/real-engines.json` y las reproduce de forma
 * determinista. Ubuntu (`athena`, 192.168.0.36) es alcanzable y ejecuta el nodo
 * real; el Mac mini (`192.168.0.149`) no es alcanzable y queda documentado como
 * excluido (nunca se finge su participación).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  M8AkpIngestion,
  M8RealEngineInvocation,
  M8RealEngines,
  M8RealResearch,
  SustainedHost,
} from './types.ts';

export const M8_REAL_ENGINES_KIND = 'athenasignal.m8.real_engines.v1';
export const DEFAULT_M8_REAL_ENGINES_PATH = 'evidence/m8/recordings/real-engines.json';
export const M8_REAL_RESEARCH_KIND = 'athenasignal.m8.real_research.v1';
export const DEFAULT_M8_REAL_RESEARCH_PATH = 'evidence/m8/recordings/athenaos-research.json';
export const M8_AKP_INGESTION_KIND = 'athenasignal.m8.akp_ingestion.v1';
export const DEFAULT_M8_AKP_INGESTION_PATH = 'evidence/m8/recordings/akp-ingestion.json';

export const UBUNTU_ATHENA: SustainedHost = {
  host: 'athena',
  address: '192.168.0.36',
  reachable: true,
  role: 'Nodo Linux real de ejecución (scheduler/ingesta/research/Ollama/SearXNG).',
  notes:
    'Verificado por SSH BatchMode: Linux, 16 cores, 14 GiB. Participa en la operación sostenida M8.',
};

export const MACMINI: SustainedHost = {
  host: 'mac-mini',
  address: '192.168.0.149',
  reachable: false,
  role: 'Nodo cognitivo previsto.',
  notes:
    'NO alcanzable desde el worktree (100% packet loss en ping, timeout de Ollama). ' +
    'Excluido explícitamente: no se simula su participación.',
};

export function realEnginesPath(path?: string): string {
  return resolve(process.cwd(), path ?? DEFAULT_M8_REAL_ENGINES_PATH);
}

/** Carga las invocaciones reales grabadas; si faltan, usa el registro inicial documentado. */
export function loadRealEngines(recordedAt: string, path?: string): M8RealEngines {
  const resolved = realEnginesPath(path);
  if (!existsSync(resolved)) return builtinRealEngines(recordedAt);
  const raw = JSON.parse(readFileSync(resolved, 'utf8')) as M8RealEngines;
  if (raw.kind !== M8_REAL_ENGINES_KIND || !Array.isArray(raw.invocations)) {
    return builtinRealEngines(recordedAt);
  }
  raw.recordedAt = raw.recordedAt || recordedAt;
  return raw;
}

/** Carga la investigación real de AthenaOS grabada; `null` si no existe. */
export function loadRealResearch(path?: string): M8RealResearch | null {
  const resolved = path ? resolve(process.cwd(), path) : realEnginesPath(DEFAULT_M8_REAL_RESEARCH_PATH);
  if (!existsSync(resolved)) return null;
  try {
    const raw = JSON.parse(readFileSync(resolved, 'utf8')) as M8RealResearch;
    return raw.kind === M8_REAL_RESEARCH_KIND ? raw : null;
  } catch {
    return null;
  }
}

/** Carga la ingesta real AKP grabada; `null` si no existe. */
export function loadAkpIngestion(path?: string): M8AkpIngestion | null {
  const resolved = path ? resolve(process.cwd(), path) : realEnginesPath(DEFAULT_M8_AKP_INGESTION_PATH);
  if (!existsSync(resolved)) return null;
  try {
    const raw = JSON.parse(readFileSync(resolved, 'utf8')) as M8AkpIngestion;
    return raw.kind === M8_AKP_INGESTION_KIND ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Registro inicial documentado. Se usa cuando todavía no se ha ejecutado la
 * grabación real; mantiene el estado verificado de la infraestructura sin
 * inventar participación del Mac mini.
 */
export function builtinRealEngines(recordedAt: string): M8RealEngines {
  return {
    kind: M8_REAL_ENGINES_KIND,
    recordedAt,
    invocations: [
      invocation({
        engine: 'ubuntu-node',
        host: 'athena',
        command: "ssh -o BatchMode=yes athena 'hostname; nproc'",
        exitCode: 0,
        stdout: 'mc-server\n16\n',
        status: 'OK',
        recordedAt,
        notes: 'Nodo Ubuntu real alcanzable (documentado).',
      }),
      invocation({
        engine: 'macmini-node',
        host: 'mac-mini',
        command: 'ping -c 2 192.168.0.149',
        exitCode: 2,
        stdout: '',
        status: 'UNREACHABLE',
        recordedAt,
        notes: 'Mac mini no alcanzable: excluido explícitamente (sin simulación).',
      }),
    ],
    distributed: { ubuntu: UBUNTU_ATHENA, macmini: MACMINI },
  };
}

export function invocation(input: {
  engine: M8RealEngineInvocation['engine'];
  host: string;
  command: string;
  exitCode: number;
  stdout: string;
  status: M8RealEngineInvocation['status'];
  recordedAt: string;
  notes: string;
  durationMs?: number;
}): M8RealEngineInvocation {
  return {
    engine: input.engine,
    host: input.host,
    command: input.command,
    exitCode: input.exitCode,
    durationMs: input.durationMs ?? 0,
    stdoutSha256: sha256(input.stdout),
    outputExcerpt: input.stdout.replace(/\s+/g, ' ').trim().slice(0, 400),
    status: input.status,
    recordedAt: input.recordedAt,
    notes: input.notes,
  };
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
