#!/usr/bin/env node
/**
 * Grabación real del milestone M3 (ORDEN-007 §5).
 *
 * Ejecuta el pipeline UNA vez contra:
 *   - Ollama local (o DeepSeek si hay key) como LLM,
 *   - SearXNG local para descubrimiento/evidencia,
 *   - fetch HTTP para documentos,
 * y registra request/response normalizados en `evidence/m3/recordings/`.
 *
 * No forma parte de `npm test`: la aceptación reproduce sin red.
 *
 * Uso:
 *   node --experimental-strip-types scripts/m3-record.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildCorpusLive } from '../src/autonomous/corpus.ts';
import { AutonomousPipeline } from '../src/autonomous/pipeline.ts';
import type { Corpus } from '../src/autonomous/types.ts';
import {
  createCognitiveProvider,
  DEFAULT_HQ_OLLAMA_MODEL,
  RecordingLLMProvider,
  writeLLMRecording,
} from '../src/llm/index.ts';
import { HttpFetchTool, SearxngSearchTool } from '../src/research/tools/index.ts';
import {
  RecordingFetchTool,
  RecordingSearchTool,
  writeToolRecording,
  type ToolRecording,
} from '../src/research/tools/RecordReplay.ts';

const GENERATED_AT = process.env.M3_GENERATED_AT ?? '2026-09-11T00:00:00.000Z';
const OUT_DIR = 'evidence/m3';

async function main(): Promise<void> {
  const fetchTool = new HttpFetchTool({ timeoutMs: 25_000, maxBytes: 300_000 });

  console.log('[M3:record] Construyendo corpus real desde fuentes vivas...');
  const corpus: Corpus = await buildCorpusLive(fetchTool, { generatedAt: GENERATED_AT, maxChars: 6000 });
  writeJson(resolve(process.cwd(), OUT_DIR, 'corpus.json'), corpus);
  console.log(`[M3:record] Corpus: ${corpus.sources.length} fuentes -> ${OUT_DIR}/corpus.json`);

  const live = createCognitiveProvider();
  const hqModel = process.env.OLLAMA_MODEL_HQ?.trim() || DEFAULT_HQ_OLLAMA_MODEL;
  const llm = new RecordingLLMProvider(live, {
    recordedAt: GENERATED_AT,
    generatedBy: `ollama(${process.env.OLLAMA_MODEL ?? 'qwen2.5:7b-instruct'})+ollama(${hqModel})+deterministic`,
  });
  const search = new RecordingSearchTool(new SearxngSearchTool({ maxResults: 5 }), GENERATED_AT);
  const fetch = new RecordingFetchTool(fetchTool, GENERATED_AT);

  console.log(
    `[M3:record] Pipeline cognitivo: extracción=${process.env.OLLAMA_MODEL ?? 'qwen2.5:7b-instruct'} ` +
      `juicio=${hqModel} + SearXNG...`
  );
  const pipeline = new AutonomousPipeline({ llm, search, fetch, createdAt: GENERATED_AT });
  const result = await pipeline.run(corpus);

  const llmRecording = llm.toRecording();
  const toolRecording: ToolRecording = {
    kind: 'athenasignal.m3.tool_recordings.v1',
    generatedBy: 'searxng+http-fetch',
    searches: search.toEntries(),
    fetches: fetch.toEntries(),
  };
  writeLLMRecording(resolve(process.cwd(), OUT_DIR, 'recordings/llm.json'), llmRecording);
  writeToolRecording(resolve(process.cwd(), OUT_DIR, 'recordings/tools.json'), toolRecording);

  const real = result.llm.realResponses;
  const deterministic = result.llm.deterministicResponses;
  console.log(
    `[M3:record] LLM responses: real=${real} deterministic=${deterministic} ` +
      `(recordings=${llmRecording.entries.length})`
  );
  console.log(
    `[M3:record] Señales=${result.signals.length} candidates=${result.candidates.length} ` +
      `descartados=${result.discarded.length}`
  );
  console.log(`[M3:record] Grabaciones -> ${OUT_DIR}/recordings/{llm,tools}.json`);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error('[M3:record] Error:', error);
  process.exit(1);
});
