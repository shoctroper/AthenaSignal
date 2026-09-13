/**
 * Grabación real de la operación sostenida M8 (ORDEN-012 §0, §2.8).
 *
 * Ejecuta una vez:
 *   - las invocaciones reales a los motores/infraestructura (Ubuntu `athena`,
 *     AthenaOS `athena.dll`, AthenaKnowledge/AKP, Mac mini) y las registra en
 *     `evidence/m8/recordings/real-engines.json`;
 *   - la investigación M8 contra Ollama local y registra las respuestas
 *     normalizadas (sin secretos) en `evidence/m8/recordings/llm.json`.
 *
 * Después, `runM8Offline` y `tests/sustained-operation-e2e.test.ts` reproducen
 * todo sin red de forma determinista.
 *
 * Uso:
 *   node --experimental-strip-types scripts/m8-record.ts
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createOllamaProvider } from '../src/llm/OllamaProvider.ts';
import { RecordingLLMProvider, writeLLMRecording, type LLMRecording } from '../src/llm/RecordReplay.ts';
import {
  M8_REAL_ENGINES_KIND,
  UBUNTU_ATHENA,
  MACMINI,
  invocation,
} from '../src/sustained/realEngines.ts';
import { runM8Offline, DEFAULT_M8_LLM_RECORDING_PATH } from '../src/sustained/index.ts';
import type { M8RealEngineInvocation, M8RealEngines } from '../src/sustained/types.ts';

const recordedAt = '2026-09-12T00:00:00.000Z';
const ATHENA_DLL = '/Volumes/Medios/Repos/AthenaFramework/src/Athena.Cli/bin/Release/net9.0/athena.dll';
const AKP_DIR = '/Volumes/Medios/Repos/AthenaKnowledge/athena-knowledge-ingestion';

function run(input: {
  engine: M8RealEngineInvocation['engine'];
  host: string;
  command: string;
  env?: Record<string, string>;
  cwd?: string;
  unreachableOnError?: boolean;
  notes: string;
}): M8RealEngineInvocation {
  const start = Date.now();
  try {
    const stdout = execSync(input.command, {
      encoding: 'utf8',
      timeout: 180_000,
      cwd: input.cwd,
      env: { ...process.env, ...(input.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return invocation({
      engine: input.engine,
      host: input.host,
      command: input.command,
      exitCode: 0,
      stdout,
      status: 'OK',
      recordedAt,
      durationMs: Date.now() - start,
      notes: input.notes,
    });
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    return invocation({
      engine: input.engine,
      host: input.host,
      command: input.command,
      exitCode: err.status ?? 1,
      stdout: output,
      status: input.unreachableOnError ? 'UNREACHABLE' : 'ERROR',
      recordedAt,
      durationMs: Date.now() - start,
      notes: `${input.notes} (${err.message ?? 'fallo'})`,
    });
  }
}

async function main(): Promise<void> {
  const invocations: M8RealEngineInvocation[] = [
    run({
      engine: 'ubuntu-node',
      host: 'athena',
      command: "ssh -o BatchMode=yes -o ConnectTimeout=8 athena 'hostname; nproc; free -g | head -2'",
      notes: 'Nodo Ubuntu real (athena, 192.168.0.36) alcanzable por SSH BatchMode.',
    }),
    run({
      engine: 'ubuntu-node',
      host: 'athena',
      command: "ssh -o BatchMode=yes -o ConnectTimeout=8 athena 'curl -s --max-time 5 http://127.0.0.1:11434/api/tags | head -c 400'",
      notes: 'Ollama real en Ubuntu disponible (modelos locales).',
    }),
    run({
      engine: 'athenaos',
      host: 'athena',
      command: `dotnet "${ATHENA_DLL}" doctor`,
      notes: 'AthenaOS doctor: verifica proveedor LLM (gemini agotado 429, documentado).',
    }),
    run({
      engine: 'athenaos',
      host: 'athena',
      command: `dotnet "${ATHENA_DLL}" list`,
      env: { ATHENA_LLM_PROVIDER: 'template' },
      notes: 'AthenaOS list con proveedor template real (motor invocado).',
    }),
    run({
      engine: 'athenaknowledge',
      host: 'athena',
      command: `dotnet build --nologo -v q`,
      cwd: AKP_DIR,
      notes: 'Build real de AthenaKnowledge/AKP (ingesta).',
    }),
    run({
      engine: 'macmini-node',
      host: 'mac-mini',
      command: 'ping -c 2 192.168.0.149',
      unreachableOnError: true,
      notes: 'Mac mini (192.168.0.149) no alcanzable: excluido sin simulación.',
    }),
  ];

  const realEngines: M8RealEngines = {
    kind: M8_REAL_ENGINES_KIND,
    recordedAt,
    invocations,
    distributed: { ubuntu: UBUNTU_ATHENA, macmini: MACMINI },
  };
  const realTarget = resolve(process.cwd(), 'evidence/m8/recordings/real-engines.json');
  mkdirSync(dirname(realTarget), { recursive: true });
  writeFileSync(realTarget, `${JSON.stringify(realEngines, null, 2)}\n`, 'utf8');

  const model = process.env.OLLAMA_MODEL?.trim() || 'qwen2.5:7b-instruct';
  const recorder = new RecordingLLMProvider(createOllamaProvider(process.env, model), {
    recordedAt,
    generatedBy: `ollama:${model}:m8`,
  });

  let recording: LLMRecording | null = null;
  const summary = await runM8Offline({
    write: false,
    akpDir: resolve(process.cwd(), '.m8tmp/akp-record'),
    workerLlm: recorder,
    onWorkerRecording: (captured) => {
      recording = captured;
    },
  });

  if (!recording) throw new Error('[m8-record] no se capturó ninguna grabación de investigación');
  writeLLMRecording(resolve(process.cwd(), DEFAULT_M8_LLM_RECORDING_PATH), recording);

  const ok = invocations.filter((entry) => entry.status === 'OK').length;
  const entries = (recording as LLMRecording).entries.length;
  console.log(
    `[m8-record] ${invocations.length} invocaciones reales (${ok} OK) → ${realTarget}; ` +
      `${entries} respuestas LLM reales (${model}) → ${DEFAULT_M8_LLM_RECORDING_PATH}; ` +
      `${summary.artifacts.metrics.research.m8Results} resultados M8.`
  );
}

main().catch((error) => {
  console.error('[m8-record] fallo:', error);
  process.exit(1);
});
