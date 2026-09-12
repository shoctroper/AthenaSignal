#!/usr/bin/env node
/**
 * Replay determinista del milestone M5 — Autonomous Editorial Intelligence
 * Platform (ORDEN-009 §7, §10).
 *
 * Reproduce la plataforma completa sin red usando las grabaciones M3 y el
 * estado persistido M4. Emite una salida canónica (JSON estable + hash del
 * estado final). Dos corridas deben producir bytes idénticos y exit code 0.
 *
 * Uso:
 *   node --experimental-strip-types scripts/m5-replay.ts
 *   node --experimental-strip-types scripts/m5-replay.ts --no-write
 */

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runM5Offline } from '../src/platform/offline.ts';
import { serializePlatformState } from '../src/platform/store.ts';
import type { M5Artifacts, M5PlatformState } from '../src/platform/types.ts';

export interface M5ReplayOutput {
  generatedAt: string;
  corpus: {
    cycles: number;
    sources: number;
    extendedSources: number;
    languages: string[];
  };
  runs: Array<{
    runId: string;
    processId: string;
    status: string;
    cyclesRequested: number;
    cyclesApplied: number;
    inputsObserved: number;
    fallbacks: number;
    resumedFrom: string | null;
  }>;
  eventCounts: Record<string, number>;
  eventTotals: number;
  counters: M5PlatformState['counters'];
  routing: {
    byRoute: Record<string, number>;
    fallbacks: number;
    decisions: number;
  };
  recovery: {
    total: number;
    byKind: Record<string, number>;
  };
  idempotency: {
    noOps: number;
    attempted: number;
  };
  akp: {
    delivered: number;
    suppressed: number;
    consumed: number;
    validHandoffs: number;
  };
  benchmark: {
    coverage: number;
    observed: string[];
    missing: string[];
  };
  promoted: string[];
  discarded: string[];
  stateHash: string;
}

export async function replayM5(options: { write?: boolean } = {}): Promise<M5ReplayOutput> {
  const summary = await runM5Offline({ write: options.write ?? true });
  return buildReplayOutput(summary.artifacts);
}

export function buildReplayOutput(artifacts: M5Artifacts): M5ReplayOutput {
  const state = artifacts.state;
  const languages = [...new Set(artifacts.corpus.sources.map((source) => source.language))].sort();

  const routingByRoute: Record<string, number> = {};
  for (const decision of state.routing) {
    routingByRoute[decision.route] = (routingByRoute[decision.route] ?? 0) + 1;
  }
  const recoveryByKind: Record<string, number> = {};
  for (const event of state.recovery) recoveryByKind[event.kind] = (recoveryByKind[event.kind] ?? 0) + 1;

  return {
    generatedAt: artifacts.corpus.generatedAt,
    corpus: {
      cycles: artifacts.corpus.cycles.length,
      sources: artifacts.corpus.sources.length,
      extendedSources: artifacts.corpus.extendedSourceIds.length,
      languages,
    },
    runs: state.runs.map((run) => ({
      runId: run.runId,
      processId: run.processId,
      status: run.status,
      cyclesRequested: run.cyclesRequested.length,
      cyclesApplied: run.cyclesApplied.length,
      inputsObserved: run.metrics.inputsObserved,
      fallbacks: run.metrics.fallbacks,
      resumedFrom: run.resumedFrom,
    })),
    eventCounts: { ...state.radar.eventCounts },
    eventTotals: state.radar.events.length,
    counters: { ...state.counters },
    routing: {
      byRoute: routingByRoute,
      fallbacks: state.routing.filter((decision) => decision.fallback).length,
      decisions: state.routing.length,
    },
    recovery: { total: state.recovery.length, byKind: recoveryByKind },
    idempotency: {
      noOps: state.idempotency.filter((record) => record.noOp).length,
      attempted: state.idempotency.reduce((sum, record) => sum + record.attempts, 0),
    },
    akp: {
      delivered: state.akp.deliveries.filter((delivery) => delivery.status === 'DELIVERED_TO_SINK').length,
      suppressed: state.akp.deliveries.filter((delivery) => delivery.status === 'DUPLICATE_SUPPRESSED').length,
      consumed: state.akp.consumed,
      validHandoffs: state.akp.deliveries.filter((delivery) => delivery.validation.valid).length,
    },
    benchmark: {
      coverage: artifacts.benchmark.coverage,
      observed: artifacts.benchmark.entries.filter((entry) => entry.observed).map((entry) => entry.id),
      missing: artifacts.benchmark.entries.filter((entry) => !entry.observed).map((entry) => entry.id),
    },
    promoted: Object.values(state.radar.candidates)
      .filter((candidate) => candidate.status === 'PROMOTED')
      .map((candidate) => candidate.candidateId)
      .sort(),
    discarded: Object.values(state.radar.candidates)
      .filter((candidate) => candidate.status === 'DISCARDED')
      .map((candidate) => candidate.candidateId)
      .sort(),
    stateHash: createHash('sha256').update(serializePlatformState(artifacts.state), 'utf8').digest('hex'),
  };
}

async function main(): Promise<void> {
  const write = !process.argv.includes('--no-write');
  const output = await replayM5({ write });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error('[M5:replay] Error:', error);
    process.exit(1);
  });
}
