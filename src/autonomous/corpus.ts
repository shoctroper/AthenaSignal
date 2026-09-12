/**
 * Corpus real de M3 (ORDEN-007 §5, §12, §14).
 *
 * Cada ítem es un snapshot vendoreado de una fuente real, con provenance y
 * hash. Algunos ítems son afirmaciones de descubrimiento (p. ej. un short de
 * divulgación) cuyo texto se conserva tal cual; el sistema debe descubrir por
 * sí mismo qué merece investigación.
 */

import type { BenchmarkClass, Corpus, CorpusItem, SourcePolicy } from './types.ts';
import type { FetchTool } from '../research/tools/SearchTool.ts';
import { hashContent } from '../research/provenance.ts';

export interface CorpusSeed {
  id: string;
  title: string;
  url: string;
  platform: string;
  creator: string;
  publishedAt: string;
  language: string;
  policy: SourcePolicy;
  discoveryQueries: string[];
  benchmarkClasses: BenchmarkClass[];
  notes: string;
  /** Si es true se descarga el contenido; si no, se usa `claimText`. */
  live: boolean;
  claimText?: string;
}

export const CORPUS_SEEDS: CorpusSeed[] = [
  {
    id: 'src-airllm-claim',
    title: 'AirLLM permite ejecutar DeepSeek V4 localmente con 12 GB de RAM',
    url: 'https://www.youtube.com/@legitalgorithmswithpeter',
    platform: 'youtube',
    creator: '@legitalgorithmswithpeter',
    publishedAt: '2026-09-01T00:00:00.000Z',
    language: 'es',
    policy: 'DISCOVERY',
    discoveryQueries: ['AirLLM DeepSeek V4 VRAM requirements', 'AirLLM layer-wise inference RAM'],
    benchmarkClasses: ['KNOWN_BAD_CLAIM', 'REFRAMING_CASE'],
    notes:
      'Short de divulgación. Afirmación a verificar: confunde VRAM con RAM y atribuye a una versión no documentada (V4) una capacidad medida sobre DeepSeek-V3.',
    live: false,
    claimText:
      'AirLLM permite ejecutar DeepSeek V4 localmente con 12 GB de RAM. Es la forma definitiva de correr modelos gigantes en tu portátil sin GPU cara. Nadie más lo logra con tan poca memoria.',
  },
  {
    id: 'src-airllm-readme',
    title: 'lyogavin/airllm — README',
    url: 'https://raw.githubusercontent.com/lyogavin/airllm/main/README.md',
    platform: 'github',
    creator: 'lyogavin',
    publishedAt: '2026-08-01T00:00:00.000Z',
    language: 'en',
    policy: 'PRIMARY',
    discoveryQueries: ['AirLLM VRAM requirement layer by layer', 'AirLLM DeepSeek V3 671B'],
    benchmarkClasses: ['KNOWN_GOOD'],
    notes: 'Repositorio primario de AirLLM. Evidencia de autoridad para la afirmación de la fuente de descubrimiento.',
    live: true,
  },
  {
    id: 'src-creatine-pmc',
    title: 'Creatine in Health and Disease — PMC7910963',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7910963/',
    platform: 'pmc',
    creator: 'NIH / PubMed Central',
    publishedAt: '2021-01-01T00:00:00.000Z',
    language: 'en',
    policy: 'EVIDENCE',
    discoveryQueries: ['creatine supplementation efficacy safety', 'creatine kidney safety myth'],
    benchmarkClasses: ['KNOWN_GOOD', 'MULTI_SOURCE'],
    notes: 'Revisión real sobre creatina. Fuente de evidencia de alta autoridad.',
    live: true,
  },
  {
    id: 'src-creatine-harvard',
    title: 'What is creatine? Potential benefits and risks — Harvard Health',
    url: 'https://www.health.harvard.edu/exercise-and-fitness/what-is-creatine-potential-benefits-and-risks-of-this-popular-supplement',
    platform: 'blog',
    creator: 'Harvard Health Publishing',
    publishedAt: '2024-01-01T00:00:00.000Z',
    language: 'en',
    policy: 'SECONDARY',
    discoveryQueries: ['creatine benefits risks adults'],
    benchmarkClasses: ['KNOWN_GOOD', 'MULTI_SOURCE'],
    notes: 'Segunda fuente independiente sobre creatina: permite cruzar evidencia (MULTI_SOURCE).',
    live: true,
  },
  {
    id: 'src-if-mayo',
    title: 'Ayuno intermitente: los beneficios — Mayo Clinic',
    url: 'https://www.mayoclinic.org/es/healthy-lifestyle/nutrition-and-healthy-eating/expert-answers/intermittent-fasting/faq-20441303',
    platform: 'blog',
    creator: 'Mayo Clinic',
    publishedAt: '2024-01-01T00:00:00.000Z',
    language: 'es',
    policy: 'SECONDARY',
    discoveryQueries: ['ayuno intermitente beneficios evidencia'],
    benchmarkClasses: ['AMBIGUOUS', 'MULTI_SOURCE'],
    notes: 'Presenta beneficios potenciales; contrasta con evidencia escéptica de Cochrane.',
    live: true,
  },
  {
    id: 'src-if-cochrane',
    title: 'La evidencia científica sobre el ayuno intermitente — Cochrane',
    url: 'https://mx.cochrane.org/news/la-evidencia-cientifica-sobre-el-ayuno-intermitente-para-adelgazar-no-esta-la-altura-de-su',
    platform: 'blog',
    creator: 'Cochrane',
    publishedAt: '2024-01-01T00:00:00.000Z',
    language: 'es',
    policy: 'EVIDENCE',
    discoveryQueries: ['ayuno intermitente evidencia científica adelgazar'],
    benchmarkClasses: ['AMBIGUOUS', 'MULTI_SOURCE'],
    notes: 'Contraste crítico: la evidencia no está a la altura del entusiasmo mediático.',
    live: true,
  },
  {
    id: 'src-python-freethreading',
    title: 'Python experimental support for free threading — Python 3.13 docs',
    url: 'https://docs.python.org/3.13/howto/free-threading-python.html',
    platform: 'docs',
    creator: 'Python Software Foundation',
    publishedAt: '2024-10-01T00:00:00.000Z',
    language: 'en',
    policy: 'PRIMARY',
    discoveryQueries: ['Python free-threading GIL performance', 'Python 3.13 free-threaded limitations'],
    benchmarkClasses: ['KNOWN_GOOD'],
    notes: 'Documentación primaria del propio proyecto sobre free-threading.',
    live: true,
  },
  {
    id: 'src-kafka-vs-rabbitmq',
    title: 'RabbitMQ vs. Apache Kafka — RabbitMQ',
    url: 'https://www.rabbitmq.com/docs/compare/kafka',
    platform: 'docs',
    creator: 'Broadcom / RabbitMQ',
    publishedAt: '2024-01-01T00:00:00.000Z',
    language: 'en',
    policy: 'PRIMARY',
    discoveryQueries: ['Kafka vs RabbitMQ when to use', 'RabbitMQ vs Kafka official comparison'],
    benchmarkClasses: ['KNOWN_GOOD', 'MULTI_SOURCE'],
    notes: 'Comparación de un vendor (RabbitMQ) frente a Kafka: fuente parcial pero de autoridad sobre su propio producto.',
    live: true,
  },
  {
    id: 'src-miracle-weightloss',
    title: 'KetoBig: pierde 10 kilos en una semana sin dieta ni ejercicio',
    url: 'https://k-state.com/plketobig',
    platform: 'tiktok',
    creator: '@keto_milagro',
    publishedAt: '2026-08-01T00:00:00.000Z',
    language: 'es',
    policy: 'TERTIARY',
    discoveryQueries: ['productos milagro bajar de peso alerta'],
    benchmarkClasses: ['LOW_VALUE_NOISE', 'KNOWN_BAD_CLAIM'],
    notes:
      'Anuncio de producto milagro. Debe ser rechazado por ruido: sin respaldo, riesgo para la salud y sin interés editorial investigable.',
    live: false,
    claimText:
      'KetoBig es el suplemento milagro que te hace bajar 10 kilos en una semana sin dieta ni ejercicio. Miles de personas ya lo usan y los resultados son increíbles. Bájalo ahora con descuento.',
  },
  {
    id: 'src-cofepris-alert',
    title: 'Alerta por la proliferación de anuncios de productos "milagro" — COFEPRIS',
    url: 'https://www.gob.mx/cofepris/prensa/alerta-por-la-proliferacion-de-anuncios-de-productos-milagro-para-supuestamente-bajar-de-peso-en-redes-sociales',
    platform: 'gob',
    creator: 'COFEPRIS',
    publishedAt: '2023-01-01T00:00:00.000Z',
    language: 'es',
    policy: 'EVIDENCE',
    discoveryQueries: ['productos milagro bajar de peso alerta COFEPRIS'],
    benchmarkClasses: ['KNOWN_BAD_CLAIM'],
    notes: 'Autoridad regulatoria real que desmiente productos milagro sin registro sanitario.',
    live: true,
  },
];

/**
 * Construye el corpus real descargando el contenido de las fuentes `live` y
 * conservando el texto de las fuentes-afirmación. Se ejecuta una sola vez
 * (script de grabación); la aceptación usa `corpus.json` congelado.
 */
export async function buildCorpusLive(
  fetchTool: FetchTool,
  options: { generatedAt: string; maxChars?: number }
): Promise<Corpus> {
  const maxChars = options.maxChars ?? 6000;
  const sources: CorpusItem[] = [];
  for (const seed of CORPUS_SEEDS) {
    let content = seed.claimText ?? '';
    if (seed.live) {
      const result = await fetchTool.fetch(seed.url);
      content = result.text;
    }
    const trimmed = content.replace(/\s+\n/g, '\n').trim().slice(0, maxChars);
    sources.push({
      id: seed.id,
      title: seed.title,
      url: seed.url,
      platform: seed.platform,
      creator: seed.creator,
      publishedAt: seed.publishedAt,
      language: seed.language,
      policy: seed.policy,
      capturedAt: options.generatedAt,
      content: trimmed,
      contentHash: hashContent(trimmed),
      discoveryQueries: seed.discoveryQueries,
      benchmarkClasses: seed.benchmarkClasses,
      notes: seed.notes,
    });
  }
  return {
    kind: 'athenasignal.m3.corpus.v1',
    generatedAt: options.generatedAt,
    sources,
  };
}

export function corpusById(corpus: Corpus): Map<string, CorpusItem> {
  return new Map(corpus.sources.map((source) => [source.id, source]));
}

export function verifyCorpus(corpus: Corpus): string[] {
  const errors: string[] = [];
  if (corpus.kind !== 'athenasignal.m3.corpus.v1') {
    errors.push(`invalid corpus kind: ${corpus.kind}`);
  }
  if (!Array.isArray(corpus.sources) || corpus.sources.length === 0) {
    errors.push('corpus.sources must be a non-empty array');
    return errors;
  }
  for (const source of corpus.sources) {
    if (hashContent(source.content) !== source.contentHash) {
      errors.push(`contentHash mismatch for ${source.id}`);
    }
    if (!source.url.startsWith('http')) errors.push(`url must be http(s) for ${source.id}`);
  }
  return errors;
}
