/**
 * Grabación real de la investigación profunda M6 (ORDEN-010 §0, §2.2).
 *
 * Corre una vez el worker AthenaOS contra Ollama local, registra las respuestas
 * normalizadas (sin secretos) y las persiste para que `runM6Offline` y
 * `tests/closed-loop-e2e.test.ts` reproduzcan la investigación real sin red.
 *
 * Uso:
 *   node --experimental-strip-types scripts/m6-record.ts
 */

import { resolve } from 'node:path';

import { createOllamaProvider } from '../src/llm/OllamaProvider.ts';
import { RecordingLLMProvider, writeLLMRecording } from '../src/llm/RecordReplay.ts';
import type { LLMRecording } from '../src/llm/RecordReplay.ts';
import { runM6Offline, DEFAULT_M6_LLM_RECORDING_PATH } from '../src/closedloop/offline.ts';

const recordedAt = '2026-09-12T00:00:00.000Z';

async function main(): Promise<void> {
  const model = process.env.OLLAMA_MODEL?.trim() || 'qwen2.5:7b-instruct';
  const recorder = new RecordingLLMProvider(createOllamaProvider(process.env, model), {
    recordedAt,
    generatedBy: `ollama:${model}`,
  });

  let recording: LLMRecording | null = null;
  const summary = await runM6Offline({
    write: false,
    akpDir: resolve(process.cwd(), '.m6tmp/akp-record'),
    workerLlm: recorder,
    onWorkerRecording: (captured) => {
      recording = captured;
    },
  });

  if (!recording) throw new Error('[m6-record] no se capturó ninguna grabación de investigación');
  const target = resolve(process.cwd(), DEFAULT_M6_LLM_RECORDING_PATH);
  writeLLMRecording(target, recording);
  const entries = (recording as LLMRecording).entries.length;
  console.log(
    `[m6-record] ${entries} respuestas reales registradas en ${DEFAULT_M6_LLM_RECORDING_PATH} ` +
      `(${summary.results.length} resultados de investigación).`
  );
}

main().catch((error) => {
  console.error('[m6-record] fallo:', error);
  process.exit(1);
});
