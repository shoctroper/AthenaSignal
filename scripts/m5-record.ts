#!/usr/bin/env node
/**
 * Grabación suplementaria M5 (ORDEN-009 §0bis.2, §7).
 *
 * El corpus M5 reutiliza las grabaciones reales de M3 para el material canónico
 * y añade fuentes reales extendidas que no tienen cognición grabada. Este
 * script ejecuta el pipeline UNA vez y registra, para cada request sin
 * grabación previa, la respuesta del fallback determinista seguro, de modo que
 * el replay offline quede completo (`replayMisses === 0`) sin inventar
 * evidencia: cada respuesta registrada se marca `deterministic: true`.
 *
 * No forma parte de `npm test`. El resultado se versiona en
 * `evidence/m5/recordings/llm.json` y lo consume `runM5Offline`.
 *
 * Uso:
 *   node --experimental-strip-types scripts/m5-record.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { AutonomousPipeline } from '../src/autonomous/pipeline.ts';
import type { LLMProvider, LLMRequest, LLMResponse } from '../src/llm/types.ts';
import { DeterministicLLMProvider } from '../src/llm/DeterministicLLMProvider.ts';
import {
  LLM_RECORDING_KIND,
  normalizeRequest,
  readLLMRecording,
  requestKey,
  type LLMRecordingEntry,
} from '../src/llm/RecordReplay.ts';
import { ReplayFetchTool, ReplaySearchTool, readToolRecording } from '../src/research/tools/RecordReplay.ts';
import { buildM5Corpus } from '../src/platform/corpus.ts';
import { loadM3Corpus, M5_GENERATED_AT } from '../src/platform/offline.ts';

const OUT_PATH = 'evidence/m5/recordings/llm.json';
const BASE_PATH = 'evidence/m3/recordings/llm.json';
const TOOL_PATH = 'evidence/m3/recordings/tools.json';

async function main(): Promise<void> {
  const m3Corpus = loadM3Corpus();
  const corpus = buildM5Corpus(m3Corpus, M5_GENERATED_AT);
  const baseRecording = readLLMRecording(resolve(process.cwd(), BASE_PATH));
  const baseByKey = new Map(baseRecording.entries.map((entry) => [entry.key, entry.response]));
  const toolRecording = readToolRecording(resolve(process.cwd(), TOOL_PATH));

  const deterministic = new DeterministicLLMProvider();
  const recorded = new Map<string, LLMResponse>();
  const entries: LLMRecordingEntry[] = [];

  const bridge: LLMProvider = {
    id: 'm5-record-bridge',
    async complete(request: LLMRequest): Promise<LLMResponse> {
      const key = requestKey(request);
      const base = baseByKey.get(key);
      if (base) return { ...base };
      const existing = recorded.get(key);
      if (existing) return existing;
      const response = await deterministic.complete(request);
      recorded.set(key, response);
      entries.push({
        key,
        stage: request.stage,
        request: normalizeRequest(request),
        response,
        recordedAt: M5_GENERATED_AT,
      });
      return response;
    },
  };

  const pipeline = new AutonomousPipeline({
    llm: bridge,
    search: new ReplaySearchTool(toolRecording),
    fetch: new ReplayFetchTool(toolRecording),
    createdAt: M5_GENERATED_AT,
  });
  const result = await pipeline.run({ kind: 'athenasignal.m3.corpus.v1', generatedAt: M5_GENERATED_AT, sources: corpus.sources });

  const sorted = entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const recording = {
    kind: LLM_RECORDING_KIND,
    generatedBy: 'deterministic-safe-fallback(M5 extended corpus)',
    entries: sorted,
  };
  const outPath = resolve(process.cwd(), OUT_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(recording, null, 2)}\n`, 'utf8');

  const byStage: Record<string, number> = {};
  for (const entry of sorted) byStage[entry.stage] = (byStage[entry.stage] ?? 0) + 1;

  console.log(`[M5:record] corpus=${corpus.sources.length} fuentes (${corpus.extendedSourceIds.length} extendidas)`);
  console.log(`[M5:record] señales=${result.signals.length} candidates=${result.candidates.length}`);
  console.log(`[M5:record] respuestas base=${baseByKey.size} suplementarias=${sorted.length}`);
  console.log(`[M5:record] por etapa=${JSON.stringify(byStage)}`);
  console.log(`[M5:record] grabación -> ${OUT_PATH}`);
}

main().catch((error) => {
  console.error('[M5:record] Error:', error);
  process.exit(1);
});
