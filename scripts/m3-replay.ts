#!/usr/bin/env node
/**
 * Replay determinista del milestone M3 (ORDEN-007 §15).
 *
 * Reproduce el corpus real sin red usando las grabaciones y emite una salida
 * canónica (JSON estable). Dos corridas deben producir bytes idénticos.
 *
 * Uso:
 *   node --experimental-strip-types scripts/m3-replay.ts
 *   node --experimental-strip-types scripts/m3-replay.ts --write
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runM3Offline } from '../src/autonomous/offline.ts';

export interface M3ReplayOutput {
  corpus: { sources: number; generatedAt: string };
  signals: number;
  candidates: number;
  discarded: number;
  priorityDistribution: Record<string, number>;
  assessmentDistribution: Record<string, number>;
  reframed: number;
  handoffsValid: boolean;
  missingRecordings: string[];
  falsePositiveObservations: string[];
  llm: {
    providerChain: string;
    realResponses: number;
    deterministicResponses: number;
  };
  candidateIds: string[];
}

export async function replayM3(write = false): Promise<M3ReplayOutput> {
  const summary = await runM3Offline({ write });
  const { artifacts, pipeline, missingRecordings } = summary;

  return {
    corpus: {
      sources: artifacts.corpus.sources.length,
      generatedAt: artifacts.corpus.generatedAt,
    },
    signals: pipeline.signals.length,
    candidates: pipeline.candidates.length,
    discarded: pipeline.discarded.length,
    priorityDistribution: artifacts.candidates.distribution.priority,
    assessmentDistribution: artifacts.candidates.distribution.assessment,
    reframed: artifacts.metrics.reframed,
    handoffsValid: artifacts.handoff.handoffs.every((handoff) => handoff.validation.valid),
    missingRecordings,
    falsePositiveObservations: artifacts.metrics.falsePositiveObservations,
    llm: {
      providerChain: artifacts.metrics.llm.providerChain,
      realResponses: artifacts.metrics.llm.realResponses,
      deterministicResponses: artifacts.metrics.llm.deterministicResponses,
    },
    candidateIds: pipeline.candidates.map((candidate) => candidate.candidateId),
  };
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const output = await replayM3(write);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error('[M3:replay] Error:', error);
    process.exit(1);
  });
}
