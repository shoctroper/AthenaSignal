#!/usr/bin/env node
/**
 * Re-grabación incremental M3 (ORDEN-007 §0bis.5).
 *
 * El saneamiento epistémico determinista puede cambiar el `assessment` que se
 * pasa a etapas posteriores (p. ej. UNSUPPORTED → REFRAMED). Este script corre
 * el pipeline sobre el corpus CONGELADO y las grabaciones existentes,
 * reutilizando todas las respuestas ya registradas y llamando al LLM real SOLO
 * para las claves nuevas. No reconstruye el corpus ni modifica las herramientas.
 *
 * Uso:
 *   node --experimental-strip-types scripts/m3-refill-recordings.ts
 */

import { resolve } from 'node:path';

import { loadCorpus } from '../src/autonomous/offline.ts';
import { AutonomousPipeline } from '../src/autonomous/pipeline.ts';
import { createCognitiveProvider, readLLMRecording, requestKey, writeLLMRecording } from '../src/llm/index.ts';
import type { LLMRecording, LLMRecordingEntry } from '../src/llm/RecordReplay.ts';
import { normalizeRequest } from '../src/llm/RecordReplay.ts';
import type { LLMProvider, LLMRequest, LLMResponse } from '../src/llm/types.ts';
import { readToolRecording, ReplayFetchTool, ReplaySearchTool } from '../src/research/tools/RecordReplay.ts';

const LLM_PATH = 'evidence/m3/recordings/llm.json';
const TOOL_PATH = 'evidence/m3/recordings/tools.json';
const GENERATED_AT = process.env.M3_GENERATED_AT ?? '2026-09-11T00:00:00.000Z';

/** Reutiliza respuestas registradas; para claves nuevas consulta el LLM real. */
class RefillingLLMProvider implements LLMProvider {
  readonly id = 'refill';
  private readonly live = createCognitiveProvider();
  private readonly byKey = new Map<string, LLMResponse>();
  private readonly added: LLMRecordingEntry[] = [];
  private readonly recording: LLMRecording;

  constructor(recording: LLMRecording) {
    this.recording = recording;
    for (const entry of recording.entries) this.byKey.set(entry.key, entry.response);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const key = requestKey(request);
    const hit = this.byKey.get(key);
    if (hit) return { ...hit };

    const response = await this.live.complete(request);
    this.byKey.set(key, response);
    this.added.push({
      key,
      stage: request.stage,
      request: normalizeRequest(request),
      response,
      recordedAt: GENERATED_AT,
    });
    console.log(`[M3:refill] nueva clave ${request.stage} ${key.slice(0, 12)} (${response.provider})`);
    return response;
  }

  toRecording(): LLMRecording {
    const entries = [...this.recording.entries, ...this.added].sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    );
    return { ...this.recording, entries };
  }
}

async function main(): Promise<void> {
  const corpus = loadCorpus();
  const base = readLLMRecording(resolve(process.cwd(), LLM_PATH));
  const toolRecording = readToolRecording(resolve(process.cwd(), TOOL_PATH));

  const llm = new RefillingLLMProvider(base);
  const pipeline = new AutonomousPipeline({
    llm,
    search: new ReplaySearchTool(toolRecording),
    fetch: new ReplayFetchTool(toolRecording),
    createdAt: GENERATED_AT,
  });
  const result = await pipeline.run(corpus);

  writeLLMRecording(resolve(process.cwd(), LLM_PATH), llm.toRecording());
  console.log(
    `[M3:refill] señales=${result.signals.length} candidates=${result.candidates.length} ` +
      `descartados=${result.discarded.length} nuevas=${llm.toRecording().entries.length - base.entries.length}`
  );
}

main().catch((error) => {
  console.error('[M3:refill] Error:', error);
  process.exit(1);
});
