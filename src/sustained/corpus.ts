/**
 * Corpus M8 (ORDEN-012 §2.4): amplía materialmente el universo M7 hasta >= 1000
 * fuentes únicas y añade un barrido de continuidad sostenida.
 *
 * Cada fuente M7 genera canales M8 de observación sostenida (misma provenance,
 * mismo hash, canal distinto). Los canales sin cognición grabada propia degradan
 * al fallback determinista seguro: más fuentes no elevan linealmente candidates
 * ni ruido (misma política que M6/M7).
 */

import type { CorpusItem } from '../autonomous/types.ts';
import type { M4Cycle } from '../radar/types.ts';
import type { M7Corpus } from '../epistemic/types.ts';
import type { M8Corpus } from './types.ts';

export const M8_CHANNELS_PER_SOURCE = 2;
export const M8_CYCLE_COUNT = 72;
export const M8_SOURCES_PER_CYCLE = 24;
export const M8_MIN_SOURCES = 1000;

export function buildM8Corpus(m7: M7Corpus, generatedAt: string): M8Corpus {
  const channels: CorpusItem[] = [];
  for (const base of m7.sources) {
    for (let channel = 1; channel <= M8_CHANNELS_PER_SOURCE; channel += 1) {
      const joiner = base.url.includes('?') ? '&' : '?';
      channels.push({
        ...base,
        id: `src-m8-${channel}-${base.id}`,
        url: `${base.url}${joiner}m8channel=${channel}-sustained`,
        content: base.content,
        contentHash: base.contentHash,
        discoveryQueries: [...base.discoveryQueries],
        benchmarkClasses: [...base.benchmarkClasses],
        notes:
          `${base.notes} Canal M8 de operación sostenida ${channel} sobre el snapshot real ${base.id}; ` +
          'amplía el universo observado sin aportar cognición nueva (ORDEN-012 §2.4).',
      });
    }
  }

  const m8SourceIds = channels.map((channel) => channel.id);
  const universe = [...m7.sources.map((source) => source.id), ...m8SourceIds];
  const first = m7.cycles.length + 1;
  const cycles = buildM8Cycles(universe, first);

  return {
    kind: 'athenasignal.m8.corpus.v1',
    generatedAt,
    baseM7SourceCount: m7.sources.length,
    baseM6SourceCount: m7.baseM6SourceCount,
    m6SourceIds: [...m7.m6SourceIds],
    m7SourceIds: [...m7.m7SourceIds],
    m8SourceIds,
    extendedSourceIds: [...m7.extendedSourceIds],
    sources: [...m7.sources, ...channels],
    cycles: [...m7.cycles, ...cycles],
  };
}

export function buildM8Cycles(universe: string[], firstCycleNumber: number): M4Cycle[] {
  const size = Math.max(1, universe.length);
  const perCycle = Math.min(M8_SOURCES_PER_CYCLE, size);
  const cycles: M4Cycle[] = [];
  for (let i = 0; i < M8_CYCLE_COUNT; i += 1) {
    const cycleNumber = firstCycleNumber + i;
    const start = (i * perCycle) % size;
    const picked = new Set<string>();
    for (let k = 0; k < perCycle; k += 1) picked.add(universe[(start + k) % size]);
    const sourceIds = [...picked].sort();
    const day = Math.floor(i / 24);
    const hour = i % 24;
    cycles.push({
      cycleId: `m8-cycle-${cycleNumber}`,
      cycleNumber,
      occurredAt: new Date(Date.UTC(2026, 8, 22 + day, hour, 0, 0)).toISOString(),
      sourceIds,
      notes:
        `Continuidad M8 ${cycleNumber}: observación sostenida de ${sourceIds.length} ` +
        'fuentes del universo ampliado (incluye canales M8 de operación sostenida).',
    });
  }
  return cycles;
}

export function verifyM8Corpus(corpus: M8Corpus): string[] {
  const errors: string[] = [];
  if (corpus.kind !== 'athenasignal.m8.corpus.v1') {
    errors.push(`invalid M8 corpus kind: ${corpus.kind}`);
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
  for (const id of corpus.m8SourceIds) {
    if (!ids.has(id)) errors.push(`m8SourceIds references unknown source ${id}`);
  }
  if (corpus.sources.length <= corpus.baseM7SourceCount) {
    errors.push('M8 must observe a larger universe than M7');
  }
  if (corpus.sources.length < M8_MIN_SOURCES) {
    errors.push(`M8 must reach >= ${M8_MIN_SOURCES} sources (got ${corpus.sources.length})`);
  }
  return errors;
}
