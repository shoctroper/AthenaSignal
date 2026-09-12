/**
 * Corpus multi-ciclo del radar M4 (ORDEN-008 §2, §5, §6).
 *
 * El corpus reutiliza los snapshots reales vendoreados de M3 (mismas fuentes,
 * mismo contenido/hash) y los distribuye en ciclos de descubrimiento continuo.
 * La repetición de fuentes entre ciclos es intencional: demuestra dedup,
 * identidad histórica e idempotencia.
 */

import type { Corpus } from '../autonomous/types.ts';
import type { M4Corpus, M4Cycle } from './types.ts';

export interface M4CycleSeed {
  cycleId: string;
  cycleNumber: number;
  occurredAt: string;
  sourceIds: string[];
  notes: string;
}

export const M4_CYCLE_SEEDS: M4CycleSeed[] = [
  {
    cycleId: 'm4-cycle-1',
    cycleNumber: 1,
    occurredAt: '2026-09-12T01:00:00.000Z',
    sourceIds: ['src-creatine-pmc'],
    notes: 'Primera señal de creatina descubierta: candidate inicial MEDIUM.',
  },
  {
    cycleId: 'm4-cycle-2',
    cycleNumber: 2,
    occurredAt: '2026-09-12T02:00:00.000Z',
    sourceIds: ['src-creatine-pmc', 'src-creatine-harvard'],
    notes:
      'La misma señal reaparece (KNOWN/DUPLICATE, no se duplica) y una fuente nueva relacionada amplía el cluster de creatina.',
  },
  {
    cycleId: 'm4-cycle-3',
    cycleNumber: 3,
    occurredAt: '2026-09-12T03:00:00.000Z',
    sourceIds: ['src-if-mayo'],
    notes: 'Nueva señal de ayuno intermitente (postura optimista): cluster nuevo.',
  },
  {
    cycleId: 'm4-cycle-4',
    cycleNumber: 4,
    occurredAt: '2026-09-12T04:00:00.000Z',
    sourceIds: ['src-if-cochrane'],
    notes:
      'Evidencia contradictoria (Cochrane) sobre ayuno intermitente: refleja contradicción, reevalúa y cambia prioridad.',
  },
  {
    cycleId: 'm4-cycle-5',
    cycleNumber: 5,
    occurredAt: '2026-09-12T05:00:00.000Z',
    sourceIds: ['src-airllm-claim', 'src-airllm-readme', 'src-miracle-weightloss'],
    notes:
      'Caso de reformulación (AirLLM) y ruido promocional descartado (KetoBig). La README primaria no descubre señal propia.',
  },
  {
    cycleId: 'm4-cycle-6',
    cycleNumber: 6,
    occurredAt: '2026-09-12T06:00:00.000Z',
    sourceIds: [
      'src-python-freethreading',
      'src-kafka-vs-rabbitmq',
      'src-cofepris-alert',
      'src-creatine-pmc',
    ],
    notes:
      'Nuevos temas (Python, Kafka, COFEPRIS), reprocesamiento de material conocido sin alterar el estado y acumulación de evidencia.',
  },
];

export function buildM4Corpus(m3: Corpus, generatedAt: string): M4Corpus {
  const byId = new Map(m3.sources.map((source) => [source.id, source]));
  const referenced = new Set(M4_CYCLE_SEEDS.flatMap((seed) => seed.sourceIds));

  const missing = [...referenced].filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error(`[buildM4Corpus] fuentes M3 faltantes: ${missing.join(', ')}`);
  }

  const cycles: M4Cycle[] = M4_CYCLE_SEEDS.map((seed) => ({
    cycleId: seed.cycleId,
    cycleNumber: seed.cycleNumber,
    occurredAt: seed.occurredAt,
    sourceIds: [...seed.sourceIds],
    notes: seed.notes,
  }));

  const sources = m3.sources
    .filter((source) => referenced.has(source.id))
    .map((source) => ({ ...source, discoveryQueries: [...source.discoveryQueries], benchmarkClasses: [...source.benchmarkClasses] }));

  return {
    kind: 'athenasignal.m4.corpus.v1',
    generatedAt,
    cycles,
    sources,
  };
}

export function verifyM4Corpus(corpus: M4Corpus): string[] {
  const errors: string[] = [];
  if (corpus.kind !== 'athenasignal.m4.corpus.v1') {
    errors.push(`invalid M4 corpus kind: ${corpus.kind}`);
  }
  if (!Array.isArray(corpus.cycles) || corpus.cycles.length === 0) {
    errors.push('M4 corpus must define at least one cycle');
    return errors;
  }
  const sourceIds = new Set(corpus.sources.map((source) => source.id));
  const cycleIds = new Set<string>();
  for (const cycle of corpus.cycles) {
    if (cycleIds.has(cycle.cycleId)) errors.push(`duplicate cycle id: ${cycle.cycleId}`);
    cycleIds.add(cycle.cycleId);
    for (const id of cycle.sourceIds) {
      if (!sourceIds.has(id)) errors.push(`cycle ${cycle.cycleId} references unknown source ${id}`);
    }
  }
  return errors;
}
