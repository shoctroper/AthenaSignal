#!/usr/bin/env node
/**
 * Replay determinista del milestone M4 — Continuous Editorial Radar
 * (ORDEN-008 §10, §12).
 *
 * Reproduce el corpus multi-ciclo sin red usando las grabaciones M3 y emite una
 * salida canónica (JSON estable + hash del estado final). Dos corridas deben
 * producir bytes idénticos y exit code 0.
 *
 * Uso:
 *   node --experimental-strip-types scripts/m4-replay.ts
 *   node --experimental-strip-types scripts/m4-replay.ts --write
 */

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runM4Offline } from '../src/radar/offline.ts';
import { serializeState } from '../src/radar/store.ts';
import type { M4Artifacts, RadarState } from '../src/radar/types.ts';

export interface M4ReplayOutput {
  generatedAt: string;
  corpus: { cycles: number; sources: number };
  cycles: Array<{
    cycleId: string;
    cycleNumber: number;
    newSignals: number;
    knownSignals: number;
    eventCounts: Record<string, number>;
  }>;
  eventCounts: Record<string, number>;
  eventTotals: number;
  clusters: Array<{
    clusterId: string;
    priority: string;
    assessment: string;
    status: string;
    sources: number;
    evidence: number;
    contradiction: boolean;
  }>;
  candidates: Array<{
    candidateId: string;
    priority: string;
    status: string;
    priorityHistory: string[];
    sources: number;
    evidence: number;
    contradiction: boolean;
    promotionReason: string | null;
    resolutionNote: string | null;
  }>;
  priorityDistribution: Record<string, number>;
  promotedCandidateIds: string[];
  discardedCandidateIds: string[];
  handoffsValid: boolean;
  dedup: { repeatedSources: number; knownSignals: number; uniqueSignals: number };
  missingRecordings: string[];
  llm: { providerChain: string; realResponses: number; deterministicResponses: number };
  stateHash: string;
}

export async function replayM4(write = false): Promise<M4ReplayOutput> {
  const summary = await runM4Offline({ write });
  const { artifacts } = summary;
  return buildReplayOutput(artifacts, summary.cycleResults);
}

export function buildReplayOutput(
  artifacts: M4Artifacts,
  cycleResults: Array<{ cycle: { cycleId: string; cycleNumber: number }; newSignals: string[]; knownSignals: string[]; eventCounts: Record<string, number> }>
): M4ReplayOutput {
  const state: RadarState = artifacts.state;
  const clusters = Object.values(state.clusters).sort((a, b) => (a.clusterId < b.clusterId ? -1 : 1));
  const candidates = Object.values(state.candidates).sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));

  const priorityDistribution: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, DISCARD: 0 };
  for (const candidate of candidates) {
    priorityDistribution[candidate.priority] = (priorityDistribution[candidate.priority] ?? 0) + 1;
  }

  return {
    generatedAt: artifacts.corpus.generatedAt,
    corpus: { cycles: artifacts.corpus.cycles.length, sources: artifacts.corpus.sources.length },
    cycles: cycleResults.map((result) => ({
      cycleId: result.cycle.cycleId,
      cycleNumber: result.cycle.cycleNumber,
      newSignals: result.newSignals.length,
      knownSignals: result.knownSignals.length,
      eventCounts: result.eventCounts,
    })),
    eventCounts: { ...state.eventCounts },
    eventTotals: state.events.length,
    clusters: clusters.map((cluster) => ({
      clusterId: cluster.clusterId,
      priority: cluster.priority,
      assessment: cluster.assessment,
      status: cluster.status,
      sources: cluster.sourceIds.length,
      evidence: cluster.evidenceUrls.length,
      contradiction: cluster.contradiction,
    })),
    candidates: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      priority: candidate.priority,
      status: candidate.status,
      priorityHistory: candidate.priorityHistory.map((point) => point.priority),
      sources: candidate.sourceIds.length,
      evidence: state.clusters[candidate.clusterId]?.evidenceUrls.length ?? 0,
      contradiction: state.clusters[candidate.clusterId]?.contradiction ?? false,
      promotionReason: candidate.promotionReason,
      resolutionNote: candidate.resolutionNote,
    })),
    priorityDistribution,
    promotedCandidateIds: candidates.filter((c) => c.status === 'PROMOTED').map((c) => c.candidateId),
    discardedCandidateIds: candidates.filter((c) => c.status === 'DISCARDED').map((c) => c.candidateId),
    handoffsValid: artifacts.handoff.handoffs.every((handoff) => handoff.validation.valid),
    dedup: { ...artifacts.metrics.dedup },
    missingRecordings: [...artifacts.metrics.llm.replayMisses].sort(),
    llm: {
      providerChain: artifacts.metrics.llm.providerChain,
      realResponses: artifacts.metrics.llm.realResponses,
      deterministicResponses: artifacts.metrics.llm.deterministicResponses,
    },
    stateHash: createHash('sha256').update(serializeState(state), 'utf8').digest('hex'),
  };
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const output = await replayM4(write);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error('[M4:replay] Error:', error);
    process.exit(1);
  });
}
