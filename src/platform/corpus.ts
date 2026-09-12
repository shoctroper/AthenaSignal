/**
 * Corpus M5 (ORDEN-009 §2.2, §2.5, §2.6, §5).
 *
 * Continúa el universo de M4: reutiliza los snapshots reales vendoreados de M3
 * y los ciclos M4, y agrega ciclos de observación continua y fuentes espejo
 * ("mirror") que representan el mismo material observado por otro canal. Los
 * espejos permiten demostrar dedup por contenido, cross-source linking,
 * multilingüismo y degradación a fallback determinista sin re-grabar LLM.
 */

import { hashContent } from '../research/provenance.ts';
import type { Corpus, CorpusItem } from '../autonomous/types.ts';
import type { M4Cycle } from '../radar/types.ts';
import { buildM4Corpus, verifyM4Corpus } from '../radar/corpus.ts';
import { buildExtendedSources } from './extendedSources.ts';
import type { M5Corpus, M5CorpusBuildOptions } from './types.ts';

interface MirrorSeed {
  id: string;
  of: string;
  channel: string;
  urlSuffix: string;
}

/** Espejos deterministas: mismo contenido/título/plataforma, distinto canal. */
export const M5_MIRROR_SEEDS: MirrorSeed[] = [
  {
    id: 'src-mirror-creatine-harvard',
    of: 'src-creatine-harvard',
    channel: 'health-portal-mirror',
    urlSuffix: '?channel=health-portal',
  },
  {
    id: 'src-mirror-if-cochrane',
    of: 'src-if-cochrane',
    channel: 'cochrane-es-mirror',
    urlSuffix: '?channel=cochrane-es',
  },
  {
    id: 'src-mirror-airllm-readme',
    of: 'src-airllm-readme',
    channel: 'github-raw-mirror',
    urlSuffix: '?channel=github-raw',
  },
  {
    id: 'src-mirror-python-freethreading',
    of: 'src-python-freethreading',
    channel: 'docs-mirror',
    urlSuffix: '?channel=docs',
  },
  {
    id: 'src-mirror-kafka-vs-rabbitmq',
    of: 'src-kafka-vs-rabbitmq',
    channel: 'vendor-mirror',
    urlSuffix: '?channel=vendor',
  },
  {
    id: 'src-mirror-cofepris-alert',
    of: 'src-cofepris-alert',
    channel: 'gob-mirror',
    urlSuffix: '?channel=gob',
  },
];

interface CycleSeed {
  cycleId: string;
  cycleNumber: number;
  occurredAt: string;
  sourceIds: string[];
  notes: string;
}

/** Ciclos de observación continua M5 (posteriores a los 6 ciclos de M4). */
export const M5_CYCLE_SEEDS: CycleSeed[] = [
  {
    cycleId: 'm5-cycle-7',
    cycleNumber: 7,
    occurredAt: '2026-09-12T07:00:00.000Z',
    sourceIds: ['src-mirror-creatine-harvard'],
    notes: 'Primer canal espejo de creatina: material conocido por otra vía.',
  },
  {
    cycleId: 'm5-cycle-8',
    cycleNumber: 8,
    occurredAt: '2026-09-12T08:00:00.000Z',
    sourceIds: ['src-creatine-pmc', 'src-creatine-harvard'],
    notes: 'Reingesta de fuentes conocidas: DUPLICATE/KNOWN sin duplicar señales.',
  },
  {
    cycleId: 'm5-cycle-9',
    cycleNumber: 9,
    occurredAt: '2026-09-12T09:00:00.000Z',
    sourceIds: ['src-mirror-if-cochrane'],
    notes: 'Espejo multilingüe del contraste sobre ayuno intermitente.',
  },
  {
    cycleId: 'm5-cycle-10',
    cycleNumber: 10,
    occurredAt: '2026-09-12T10:00:00.000Z',
    sourceIds: ['src-if-mayo', 'src-if-cochrane'],
    notes: 'Reingesta del cluster contradictorio: se conserva la tensión.',
  },
  {
    cycleId: 'm5-cycle-11',
    cycleNumber: 11,
    occurredAt: '2026-09-12T11:00:00.000Z',
    sourceIds: ['src-mirror-airllm-readme', 'src-airllm-claim'],
    notes: 'Espejo de la fuente primaria de AirLLM + reclamo de descubrimiento.',
  },
  {
    cycleId: 'm5-cycle-12',
    cycleNumber: 12,
    occurredAt: '2026-09-12T12:00:00.000Z',
    sourceIds: ['src-python-freethreading', 'src-mirror-python-freethreading'],
    notes: 'Cross-source: documento primario y su espejo.',
  },
  {
    cycleId: 'm5-cycle-13',
    cycleNumber: 13,
    occurredAt: '2026-09-12T13:00:00.000Z',
    sourceIds: ['src-kafka-vs-rabbitmq', 'src-mirror-kafka-vs-rabbitmq'],
    notes: 'Cross-source de la comparación RabbitMQ/Kafka.',
  },
  {
    cycleId: 'm5-cycle-14',
    cycleNumber: 14,
    occurredAt: '2026-09-12T14:00:00.000Z',
    sourceIds: ['src-cofepris-alert', 'src-mirror-cofepris-alert'],
    notes: 'Cross-source de la alerta regulatoria.',
  },
  {
    cycleId: 'm5-cycle-15',
    cycleNumber: 15,
    occurredAt: '2026-09-12T15:00:00.000Z',
    sourceIds: ['src-creatine-pmc', 'src-creatine-harvard', 'src-mirror-creatine-harvard'],
    notes: 'Acumulación de evidencia en el cluster de creatina.',
  },
  {
    cycleId: 'm5-cycle-16',
    cycleNumber: 16,
    occurredAt: '2026-09-12T16:00:00.000Z',
    sourceIds: ['src-if-mayo', 'src-mirror-if-cochrane'],
    notes: 'Actualización de contradicción en ayuno intermitente.',
  },
  {
    cycleId: 'm5-cycle-17',
    cycleNumber: 17,
    occurredAt: '2026-09-12T17:00:00.000Z',
    sourceIds: ['src-miracle-weightloss', 'src-cofepris-alert'],
    notes: 'Control de ruido: promoción milagro confrontada con autoridad.',
  },
  {
    cycleId: 'm5-cycle-18',
    cycleNumber: 18,
    occurredAt: '2026-09-12T18:00:00.000Z',
    sourceIds: ['src-airllm-claim', 'src-mirror-airllm-readme'],
    notes: 'Reformulación de AirLLM con su fuente primaria espejo.',
  },
  {
    cycleId: 'm5-cycle-19',
    cycleNumber: 19,
    occurredAt: '2026-09-12T19:00:00.000Z',
    sourceIds: ['src-python-freethreading'],
    notes: 'Reingesta de material conocido (free-threading).',
  },
  {
    cycleId: 'm5-cycle-20',
    cycleNumber: 20,
    occurredAt: '2026-09-12T20:00:00.000Z',
    sourceIds: ['src-kafka-vs-rabbitmq'],
    notes: 'Reingesta de material conocido (RabbitMQ/Kafka).',
  },
  {
    cycleId: 'm5-cycle-21',
    cycleNumber: 21,
    occurredAt: '2026-09-12T21:00:00.000Z',
    sourceIds: ['src-creatine-pmc', 'src-mirror-creatine-harvard'],
    notes: 'Reevaluación con evidencia acumulada de creatina.',
  },
  {
    cycleId: 'm5-cycle-22',
    cycleNumber: 22,
    occurredAt: '2026-09-12T22:00:00.000Z',
    sourceIds: ['src-if-cochrane', 'src-mirror-if-cochrane'],
    notes: 'Reevaluación con evidencia espejo de Cochrane.',
  },
  {
    cycleId: 'm5-cycle-23',
    cycleNumber: 23,
    occurredAt: '2026-09-12T23:00:00.000Z',
    sourceIds: ['src-miracle-weightloss'],
    notes: 'Reingesta de ruido: debe permanecer descartado.',
  },
  {
    cycleId: 'm5-cycle-24',
    cycleNumber: 24,
    occurredAt: '2026-09-13T00:00:00.000Z',
    sourceIds: [
      'src-creatine-pmc',
      'src-creatine-harvard',
      'src-if-mayo',
      'src-if-cochrane',
      'src-airllm-readme',
      'src-kafka-vs-rabbitmq',
    ],
    notes: 'Barrido final del universo conocido sin mutaciones inesperadas.',
  },
];

const CANONICAL_UNIVERSE = [
  'src-airllm-claim',
  'src-airllm-readme',
  'src-creatine-pmc',
  'src-creatine-harvard',
  'src-if-mayo',
  'src-if-cochrane',
  'src-python-freethreading',
  'src-kafka-vs-rabbitmq',
  'src-miracle-weightloss',
  'src-cofepris-alert',
];

const MIRROR_UNIVERSE = M5_MIRROR_SEEDS.map((seed) => seed.id);

/** Fuentes por ciclo en el barrido de continuidad (25..48). */
export const M5_TAIL_SOURCES_PER_CYCLE = 8;

/**
 * Barrido de continuidad: ciclos 25..48 que re-observan el universo completo
 * (canónico + espejos + fuentes reales extendidas) con una rotación
 * determinista por bloques. Garantiza que toda fuente se observe al menos una
 * vez y que las reobservaciones generen dedup/KNOWN, llevando la operación a
 * cientos de inputs sin elevar el ruido.
 */
export function buildTailCycleSeeds(fullUniverse: string[]): CycleSeed[] {
  const seeds: CycleSeed[] = [];
  const size = Math.max(1, fullUniverse.length);
  const perCycle = Math.min(M5_TAIL_SOURCES_PER_CYCLE, size);
  for (let i = 0; i < 24; i += 1) {
    const cycleNumber = 25 + i;
    const start = (i * perCycle) % size;
    const picked = new Set<string>();
    for (let k = 0; k < perCycle; k += 1) picked.add(fullUniverse[(start + k) % size]);
    const sourceIds = [...picked].sort();
    seeds.push({
      cycleId: `m5-cycle-${cycleNumber}`,
      cycleNumber,
      occurredAt: new Date(Date.UTC(2026, 8, 13, i + 1, 0, 0)).toISOString(),
      sourceIds,
      notes:
        `Barrido de continuidad ${cycleNumber}: observación incremental de ${sourceIds.length} ` +
        'fuentes reales del universo sin intervención humana.',
    });
  }
  return seeds;
}

export function buildM5Corpus(
  m3: Corpus,
  generatedAt: string,
  options: M5CorpusBuildOptions = {}
): M5Corpus {
  const base = buildM4Corpus(m3, generatedAt);
  const byId = new Map(base.sources.map((source) => [source.id, source]));

  const mirrors: CorpusItem[] = M5_MIRROR_SEEDS.map((seed) => {
    const source = byId.get(seed.of);
    if (!source) throw new Error(`[buildM5Corpus] fuente base faltante para espejo: ${seed.of}`);
    const content = source.content;
    return {
      ...source,
      id: seed.id,
      url: `${source.url}${seed.urlSuffix}`,
      content,
      contentHash: hashContent(content),
      discoveryQueries: [...source.discoveryQueries],
      benchmarkClasses: [...source.benchmarkClasses],
      notes: `${source.notes} Canal espejo ${seed.channel} del snapshot ${seed.of}.`,
    };
  });

  // Fuentes reales extendidas: resultados de búsqueda capturados por M3.
  const extendedSources =
    options.extendedSources ??
    buildExtendedSources({
      excludeUrls: new Set([...base.sources.map((source) => source.url), ...mirrors.map((mirror) => mirror.url)]),
    }).sources;

  const fullUniverse = [
    ...CANONICAL_UNIVERSE,
    ...MIRROR_UNIVERSE,
    ...extendedSources.map((source) => source.id),
  ];
  const allCycleSeeds: CycleSeed[] = [...M5_CYCLE_SEEDS, ...buildTailCycleSeeds(fullUniverse)];

  const sources = [...base.sources, ...mirrors, ...extendedSources];
  const known = new Set(sources.map((source) => source.id));
  for (const seed of allCycleSeeds) {
    for (const id of seed.sourceIds) {
      if (!known.has(id)) throw new Error(`[buildM5Corpus] ciclo ${seed.cycleId} referencia fuente desconocida ${id}`);
    }
  }

  const cycles: M4Cycle[] = [
    ...base.cycles.map((cycle) => ({ ...cycle, sourceIds: [...cycle.sourceIds] })),
    ...allCycleSeeds.map((seed) => ({
      cycleId: seed.cycleId,
      cycleNumber: seed.cycleNumber,
      occurredAt: seed.occurredAt,
      sourceIds: [...seed.sourceIds],
      notes: seed.notes,
    })),
  ];

  return {
    kind: 'athenasignal.m5.corpus.v1',
    generatedAt,
    cycles,
    sources,
    extendedSourceIds: [...mirrors.map((mirror) => mirror.id), ...extendedSources.map((source) => source.id)],
  };
}

export function verifyM5Corpus(corpus: M5Corpus): string[] {
  const errors: string[] = [];
  if (corpus.kind !== 'athenasignal.m5.corpus.v1') {
    errors.push(`invalid M5 corpus kind: ${corpus.kind}`);
  }
  const asM4 = { ...corpus, kind: 'athenasignal.m4.corpus.v1' as const, extendedSourceIds: undefined };
  errors.push(...verifyM4Corpus(asM4 as never));
  const ids = new Set<string>();
  for (const source of corpus.sources) {
    if (ids.has(source.id)) errors.push(`duplicate source id: ${source.id}`);
    ids.add(source.id);
    if (hashContent(source.content) !== source.contentHash) {
      errors.push(`contentHash mismatch for ${source.id}`);
    }
  }
  for (const id of corpus.extendedSourceIds) {
    if (!ids.has(id)) errors.push(`extendedSourceIds references unknown source ${id}`);
  }
  return errors;
}
