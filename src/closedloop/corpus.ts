/**
 * Corpus M6 (ORDEN-010 §2.7): continúa el universo M5 y lo amplía
 * materialmente sin re-grabar LLM.
 *
 * Añade canales espejo M6 para cada fuente extendida real de M5 (mismo
 * contenido/hash/provenance, otro canal de observación) y un barrido de
 * continuidad que rota el universo ampliado a lo largo de más ciclos. Los
 * espejos carecen de cognición grabada propia, así que la extracción degrada al
 * fallback determinista seguro (nunca inventa señales): más fuentes no elevan
 * linealmente el ruido ni los candidates.
 */

import type { CorpusItem } from '../autonomous/types.ts';
import type { M4Cycle } from '../radar/types.ts';
import type { M5Corpus } from '../platform/types.ts';
import type { M6Corpus, M6CorpusBuildOptions } from './types.ts';

export const M6_CYCLE_START = 49;
export const M6_CYCLE_COUNT = 24;
export const M6_SOURCES_PER_CYCLE = 12;

export function buildM6Corpus(
  m5: M5Corpus,
  generatedAt: string,
  options: M6CorpusBuildOptions = {}
): M6Corpus {
  const mirrorEvery = Math.max(1, options.mirrorEvery ?? 1);
  const byId = new Map(m5.sources.map((source) => [source.id, source]));

  const mirrors: CorpusItem[] = [];
  m5.extendedSourceIds.forEach((sourceId, index) => {
    if (index % mirrorEvery !== 0) return;
    const base = byId.get(sourceId);
    if (!base) return;
    const joiner = base.url.includes('?') ? '&' : '?';
    mirrors.push({
      ...base,
      id: `src-m6-mirror-${base.id}`,
      url: `${base.url}${joiner}m6channel=continuity`,
      content: base.content,
      contentHash: base.contentHash,
      discoveryQueries: [...base.discoveryQueries],
      benchmarkClasses: [...base.benchmarkClasses],
      notes:
        `${base.notes} Canal espejo M6 de continuidad del snapshot real ${base.id}; ` +
        'amplía el universo observado sin aportar cognición nueva (ORDEN-010 §2.7).',
    });
  });

  const m6SourceIds = mirrors.map((mirror) => mirror.id);
  const universe = [...m5.sources.map((source) => source.id), ...m6SourceIds];
  const cycles = buildM6Cycles(universe, m5.cycles.length + 1);

  return {
    kind: 'athenasignal.m6.corpus.v1',
    generatedAt,
    baseM5SourceCount: m5.sources.length,
    m6SourceIds,
    extendedSourceIds: [...m5.extendedSourceIds],
    sources: [...m5.sources, ...mirrors],
    cycles: [...m5.cycles, ...cycles],
  };
}

export function buildM6Cycles(universe: string[], firstCycleNumber: number): M4Cycle[] {
  const size = Math.max(1, universe.length);
  const perCycle = Math.min(M6_SOURCES_PER_CYCLE, size);
  const cycles: M4Cycle[] = [];
  for (let i = 0; i < M6_CYCLE_COUNT; i += 1) {
    const cycleNumber = firstCycleNumber + i;
    const start = (i * perCycle) % size;
    const picked = new Set<string>();
    for (let k = 0; k < perCycle; k += 1) picked.add(universe[(start + k) % size]);
    const sourceIds = [...picked].sort();
    cycles.push({
      cycleId: `m6-cycle-${cycleNumber}`,
      cycleNumber,
      occurredAt: new Date(Date.UTC(2026, 8, 14, i, 0, 0)).toISOString(),
      sourceIds,
      notes:
        `Continuidad M6 ${cycleNumber}: observación desatendida de ${sourceIds.length} ` +
        'fuentes del universo ampliado (incluye canales espejo M6).',
    });
  }
  return cycles;
}

export function verifyM6Corpus(corpus: M6Corpus): string[] {
  const errors: string[] = [];
  if (corpus.kind !== 'athenasignal.m6.corpus.v1') {
    errors.push(`invalid M6 corpus kind: ${corpus.kind}`);
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
  for (const id of corpus.m6SourceIds) {
    if (!ids.has(id)) errors.push(`m6SourceIds references unknown source ${id}`);
  }
  if (corpus.sources.length <= corpus.baseM5SourceCount) {
    errors.push('M6 must observe a larger universe than M5');
  }
  return errors;
}
