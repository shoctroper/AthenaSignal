/**
 * Benchmark versionado M3 (ORDEN-007 §12).
 *
 * Cubre KNOWN-GOOD, KNOWN-BAD CLAIMS, AMBIGUOUS, REFRAMING CASES, LOW-VALUE
 * NOISE y MULTI-SOURCE. Parte del conjunto procede de fuentes reales; las
 * afirmaciones de descubrimiento son casos de entrada (curated) con evidencia
 * real asociada.
 */

import type { Benchmark, BenchmarkClass, BenchmarkEntry } from './types.ts';

export const BENCHMARK_CLASSES: BenchmarkClass[] = [
  'KNOWN_GOOD',
  'KNOWN_BAD_CLAIM',
  'AMBIGUOUS',
  'REFRAMING_CASE',
  'LOW_VALUE_NOISE',
  'MULTI_SOURCE',
];

export const M3_BENCHMARK_ENTRIES: BenchmarkEntry[] = [
  {
    id: 'bench-creatine-known-good',
    class: 'KNOWN_GOOD',
    origin: 'real',
    corpusIds: ['src-creatine-pmc', 'src-creatine-harvard'],
    description: 'Creatina: revisión real y fuente secundaria de alta autoridad.',
    expected: { notDiscarded: true },
  },
  {
    id: 'bench-creatine-multi-source',
    class: 'MULTI_SOURCE',
    origin: 'real',
    corpusIds: ['src-creatine-pmc', 'src-creatine-harvard'],
    description: 'Cruce de dos fuentes independientes sobre creatina.',
    expected: { notDiscarded: true },
  },
  {
    id: 'bench-airllm-known-bad',
    class: 'KNOWN_BAD_CLAIM',
    origin: 'real',
    corpusIds: ['src-airllm-claim', 'src-airllm-readme'],
    description:
      'Claim "DeepSeek V4 con 12 GB de RAM": confunde VRAM con RAM y una versión no documentada.',
    expected: { assessment: 'REFRAMED', reframed: true },
  },
  {
    id: 'bench-airllm-reframing',
    class: 'REFRAMING_CASE',
    origin: 'real',
    corpusIds: ['src-airllm-claim'],
    description: 'La afirmación falsa debe reformularse en pregunta investigable sin reaparecer como hecho.',
    expected: { assessment: 'REFRAMED', reframed: true },
  },
  {
    id: 'bench-if-ambiguous',
    class: 'AMBIGUOUS',
    origin: 'real',
    corpusIds: ['src-if-mayo', 'src-if-cochrane'],
    description: 'Ayuno intermitente: beneficios reportados frente a evidencia crítica (Cochrane).',
    expected: { notDiscarded: true },
  },
  {
    id: 'bench-if-multi-source',
    class: 'MULTI_SOURCE',
    origin: 'real',
    corpusIds: ['src-if-mayo', 'src-if-cochrane'],
    description: 'Contraste entre fuente optimista y fuente escéptica.',
    expected: {},
  },
  {
    id: 'bench-miracle-noise',
    class: 'LOW_VALUE_NOISE',
    origin: 'curated',
    corpusIds: ['src-miracle-weightloss'],
    description: 'Anuncio de producto milagro: ruido promocional sin interés investigable.',
    expected: { discarded: true },
  },
  {
    id: 'bench-miracle-known-bad',
    class: 'KNOWN_BAD_CLAIM',
    origin: 'curated',
    corpusIds: ['src-miracle-weightloss', 'src-cofepris-alert'],
    description: 'Claim de salud falso con alerta regulatoria real en contra.',
    expected: { assessment: 'REFRAMED', reframed: true },
  },
  {
    id: 'bench-kafka-known-good',
    class: 'KNOWN_GOOD',
    origin: 'real',
    corpusIds: ['src-kafka-vs-rabbitmq'],
    description: 'Comparación oficial RabbitMQ vs Kafka: fuente de autoridad sobre su propio producto.',
    expected: { notDiscarded: true },
  },
  {
    id: 'bench-kafka-multi-source',
    class: 'MULTI_SOURCE',
    origin: 'real',
    corpusIds: ['src-kafka-vs-rabbitmq'],
    description: 'La investigación inicial debe cruzar la fuente con evidencia independiente.',
    expected: {},
  },
  {
    id: 'bench-python-known-good',
    class: 'KNOWN_GOOD',
    origin: 'real',
    corpusIds: ['src-python-freethreading'],
    description: 'Documentación primaria de Python sobre free-threading y sus límites.',
    expected: { notDiscarded: true },
  },
];

export function buildBenchmark(generatedAt: string): Benchmark {
  return {
    kind: 'athenasignal.m3.benchmark.v1',
    generatedAt,
    entries: M3_BENCHMARK_ENTRIES.map((entry) => ({
      ...entry,
      corpusIds: [...entry.corpusIds],
      expected: { ...entry.expected },
    })),
  };
}
