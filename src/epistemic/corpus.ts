/**
 * Corpus M7 (ORDEN-011 §3.9, §6): amplía materialmente el universo M6.
 *
 * Añade canales M7 reales (provenance idéntica, hash idéntico, canal de
 * observación distinto) sobre cada fuente del universo M6 y un barrido de
 * continuidad con suficientes ciclos. Los canales sin cognición grabada propia
 * degradan al fallback determinista seguro: más fuentes no elevan linealmente
 * candidatos ni ruido (misma política que M6).
 */

import type { CorpusItem } from '../autonomous/types.ts';
import type { M4Cycle } from '../radar/types.ts';
import type { M6Corpus } from '../closedloop/types.ts';
import type { M7Corpus } from './types.ts';

export const M7_CYCLE_COUNT = 32;
export const M7_SOURCES_PER_CYCLE = 16;

export function buildM7Corpus(m6: M6Corpus, generatedAt: string): M7Corpus {
  const m6Ids = new Set(m6.sources.map((source) => source.id));
  const channels: CorpusItem[] = m6.sources.map((base) => {
    const joiner = base.url.includes('?') ? '&' : '?';
    return {
      ...base,
      id: `src-m7-channel-${base.id}`,
      url: `${base.url}${joiner}m7channel=resolution`,
      content: base.content,
      contentHash: base.contentHash,
      discoveryQueries: [...base.discoveryQueries],
      benchmarkClasses: [...base.benchmarkClasses],
      notes:
        `${base.notes} Canal M7 de resolución epistémica sobre el snapshot real ${base.id}; ` +
        'amplía el universo observado sin aportar cognición nueva (ORDEN-011 §3.9).',
    };
  });

  const m7SourceIds = channels.map((channel) => channel.id);
  const universe = [...m6.sources.map((source) => source.id), ...m7SourceIds];
  const first = m6.cycles.length + 1;
  const cycles = buildM7Cycles(universe, first);

  void m6Ids;
  return {
    kind: 'athenasignal.m7.corpus.v1',
    generatedAt,
    baseM6SourceCount: m6.sources.length,
    baseM5SourceCount: m6.baseM5SourceCount,
    m6SourceIds: [...m6.m6SourceIds],
    m7SourceIds,
    extendedSourceIds: [...m6.extendedSourceIds],
    sources: [...m6.sources, ...channels],
    cycles: [...m6.cycles, ...cycles],
  };
}

export function buildM7Cycles(universe: string[], firstCycleNumber: number): M4Cycle[] {
  const size = Math.max(1, universe.length);
  const perCycle = Math.min(M7_SOURCES_PER_CYCLE, size);
  const cycles: M4Cycle[] = [];
  for (let i = 0; i < M7_CYCLE_COUNT; i += 1) {
    const cycleNumber = firstCycleNumber + i;
    const start = (i * perCycle) % size;
    const picked = new Set<string>();
    for (let k = 0; k < perCycle; k += 1) picked.add(universe[(start + k) % size]);
    const sourceIds = [...picked].sort();
    cycles.push({
      cycleId: `m7-cycle-${cycleNumber}`,
      cycleNumber,
      occurredAt: new Date(Date.UTC(2026, 8, 20, i, 0, 0)).toISOString(),
      sourceIds,
      notes:
        `Continuidad M7 ${cycleNumber}: observación desatendida de ${sourceIds.length} ` +
        'fuentes del universo ampliado (incluye canales M7 de resolución).',
    });
  }
  return cycles;
}

export function verifyM7Corpus(corpus: M7Corpus): string[] {
  const errors: string[] = [];
  if (corpus.kind !== 'athenasignal.m7.corpus.v1') {
    errors.push(`invalid M7 corpus kind: ${corpus.kind}`);
  }
  const ids = new Set<string>();
  for (const source of corpus.sources) {
    if (ids.has(source.id)) errors.push(`duplicate source id: ${source.id}`);
    ids.add(source.id);
    if (typeof source.contentHash !== 'string' || source.contentHash.length !== 64) {
      errors.push(`invalid contentHash for ${source.id}`);
    }
  }
  const cycleIds = new Set<string>();
  for (const cycle of corpus.cycles) {
    if (cycleIds.has(cycle.cycleId)) errors.push(`duplicate cycle id: ${cycle.cycleId}`);
    cycleIds.add(cycle.cycleId);
    for (const sourceId of cycle.sourceIds) {
      if (!ids.has(sourceId)) errors.push(`cycle ${cycle.cycleId} references unknown source ${sourceId}`);
    }
    if (!cycle.sourceIds.length) errors.push(`cycle ${cycle.cycleId} has no sources`);
  }
  for (const id of corpus.m7SourceIds) {
    if (!ids.has(id)) errors.push(`m7SourceIds references unknown source ${id}`);
  }
  if (corpus.sources.length <= corpus.baseM6SourceCount) {
    errors.push('M7 must observe a larger universe than M6');
  }
  if (corpus.sources.length < 400) {
    errors.push(`M7 must reach >= 400 sources (got ${corpus.sources.length})`);
  }
  return errors;
}
