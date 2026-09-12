/**
 * Grabación real de la investigación profunda M7 (ORDEN-011 §0, §5).
 *
 * Corre una vez la capa de resolución epistémica contra Ollama local, registra
 * las respuestas normalizadas (sin secretos) y las persiste para que
 * `runM7Offline` y `tests/epistemic-resolution-e2e.test.ts` reproduzcan la
 * investigación real sin red.
 *
 * Uso:
 *   node --experimental-strip-types scripts/m7-record.ts
 */

import { resolve } from 'node:path';

import { createOllamaProvider } from '../src/llm/OllamaProvider.ts';
import { RecordingLLMProvider, writeLLMRecording } from '../src/llm/RecordReplay.ts';
import type { LLMRecording } from '../src/llm/RecordReplay.ts';
import { runM7Offline, DEFAULT_M7_LLM_RECORDING_PATH } from '../src/epistemic/index.ts';

const recordedAt = '2026-09-12T00:00:00.000Z';

async function main(): Promise<void> {
  const model = process.env.OLLAMA_MODEL?.trim() || 'qwen2.5:7b-instruct';
  const recorder = new RecordingLLMProvider(createOllamaProvider(process.env, model), {
    recordedAt,
    generatedBy: `ollama:${model}:m7`,
  });

  let recording: LLMRecording | null = null;
  const summary = await runM7Offline({
    write: false,
    akpDir: resolve(process.cwd(), '.m7tmp/akp-record'),
    workerLlm: recorder,
    onWorkerRecording: (captured) => {
      recording = captured;
    },
  });

  if (!recording) throw new Error('[m7-record] no se capturó ninguna grabación de investigación');
  const target = resolve(process.cwd(), DEFAULT_M7_LLM_RECORDING_PATH);
  writeLLMRecording(target, recording);
  const entries = (recording as LLMRecording).entries.length;
  const refuted = summary.state.resolutions.filter((resolution) => resolution.verdict === 'REFUTED').length;
  const confirmed = summary.state.resolutions.filter((resolution) => resolution.verdict === 'CONFIRMED').length;
  console.log(
    `[m7-record] ${entries} respuestas reales registradas en ${DEFAULT_M7_LLM_RECORDING_PATH} ` +
      `(${summary.state.resolutions.length} candidates, ${confirmed} CONFIRMED, ${refuted} REFUTED).`
  );
}

main().catch((error) => {
  console.error('[m7-record] fallo:', error);
  process.exit(1);
});
