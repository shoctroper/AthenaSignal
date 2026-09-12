/**
 * Fuentes reales vendoreadas para el vertical slice M2 (ORDEN-006 §9).
 *
 * Los snapshots son extractos fieles de documentación pública, conservados
 * con provenance (URL, plataforma, idioma, fecha de captura y hash). La ruta
 * de aceptación es offline: el pipeline reproduce estos snapshots sin red.
 *
 * Fuentes reales usadas:
 * - Apache Kafka — Introduction: https://kafka.apache.org/intro
 * - RabbitMQ — AMQP 0-9-1 Model Explained: https://www.rabbitmq.com/tutorials/amqp-concepts
 * - AirLLM — PyPI: https://pypi.org/project/airllm/
 * - AirLLM — GitHub: https://github.com/lyogavin/airllm
 */

import { createClaim, type Signal } from '../domain/entities.ts';
import type { NormalizedContent } from '../adapters/ISourceAdapter.ts';
import type { Provenance } from '../domain/entities.ts';
import { provenanceFromContent } from './provenance.ts';

export const CAPTURED_AT = '2026-09-11T00:00:00.000Z';

export interface ResearchFixture {
  id: string;
  expectedAssessment: 'SUPPORTED' | 'UNSUPPORTED' | 'AMBIGUOUS' | 'REFRAMED';
  content: NormalizedContent;
  provenance: Provenance;
  signal?: Signal;
}

/**
 * CASO 1 — Idea investigable.
 * Fuente real: documentación oficial de Apache Kafka (introducción).
 * Es una fuente imperfecta: describe capacidades del propio proyecto y no
 * compara con alternativas como RabbitMQ.
 */
const KAFKA_TRANSCRIPT = [
  'Apache Kafka is an event streaming platform that combines publish/subscribe, durable storage, and stream processing.',
  'Topics are partitioned, meaning a topic is spread over a number of buckets located on different Kafka brokers.',
  'Events with the same event key are written to the same partition, and Kafka guarantees that any consumer of a given topic-partition will always read that partition events in exactly the same order as they were written.',
  'A Kafka cluster is highly scalable and fault-tolerant: if any of its servers fails, the other servers take over to ensure continuous operations without any data loss.',
  'Unlike traditional messaging systems, events are not deleted after consumption; retention is configured per topic.',
].join('\n');

export const KAFKA_CONTENT: NormalizedContent = {
  source: {
    platform: 'blog',
    creator: 'Apache Software Foundation',
    url: 'https://kafka.apache.org/intro',
    publishedAt: '2026-01-01T00:00:00.000Z',
    contentId: 'athenasignal-src-kafka-intro',
  },
  title: 'Apache Kafka — Introduction',
  description:
    'Event streaming platform: publish/subscribe, durable storage and stream processing over partitioned topics.',
  transcript: KAFKA_TRANSCRIPT,
  language: 'en',
  metadata: {
    crawler: 'vendored snapshot (offline)',
    sourceRole: 'EVIDENCE',
  },
};

export const KAFKA_FIXTURE: ResearchFixture = {
  id: 'case-1-kafka-vs-rabbitmq',
  expectedAssessment: 'SUPPORTED',
  content: KAFKA_CONTENT,
  provenance: provenanceFromContent(KAFKA_CONTENT, {
    sourceId: 'athenasignal-src-kafka-intro',
    role: 'EVIDENCE',
    capturedAt: CAPTURED_AT,
  }),
};

/**
 * CASO 2 — Afirmación problemática (OBLIGATORIO, ORDEN-006 §4).
 * Fuente real: short de @legitalgorithmswithpeter que afirma
 * "AirLLM permite ejecutar DeepSeek V4 localmente con 12 GB de RAM".
 * La investigación inicial contra la documentación real de AirLLM muestra que
 * la cifra ~12 GB corresponde a VRAM de GPU (no RAM) y al modelo DeepSeek-V3
 * (671B), no a una versión "V4". La afirmación NO se acepta como hecho.
 */
const AIRLLM_CLAIM = 'AirLLM permite ejecutar DeepSeek V4 localmente con 12 GB de RAM';

export const AIRLLM_CONTENT: NormalizedContent = {
  source: {
    platform: 'youtube',
    creator: '@legitalgorithmswithpeter',
    url: 'https://www.youtube.com/@legitalgorithmswithpeter',
    publishedAt: '2026-09-01T00:00:00.000Z',
    contentId: 'athenasignal-src-airllm-claim',
  },
  title: 'AirLLM permite ejecutar DeepSeek V4 localmente con 12 GB de RAM',
  description:
    'Short de divulgación que afirma que AirLLM permite correr DeepSeek V4 en local con solo 12 GB de RAM.',
  transcript: AIRLLM_CLAIM,
  language: 'es',
  metadata: {
    crawler: 'vendored snapshot (offline)',
    sourceRole: 'DISCOVERY',
  },
};

export const AIRLLM_SIGNAL: Signal = {
  sourceId: 'athenasignal-src-airllm-claim',
  topic: AIRLLM_CLAIM,
  concepts: ['AirLLM', 'DeepSeek V4', 'RAM', 'Inferencia local'],
  claimsToInvestigate: [
    createClaim({
      statement: AIRLLM_CLAIM,
      provenanceSourceId: 'athenasignal-src-airllm-claim',
      id: 'claim-airllm-deepseek-12gb',
    }),
  ],
  questions: ['¿Es cierto que AirLLM ejecuta DeepSeek V4 con 12 GB de RAM?'],
  arguments: [],
  assumptions: ['La cifra de 12 GB se refiere a memoria del sistema (RAM) y no a VRAM de GPU.'],
  contradictions: [],
  createdAt: CAPTURED_AT,
};

export const AIRLLM_FIXTURE: ResearchFixture = {
  id: 'case-2-airllm-deepseek-claim',
  expectedAssessment: 'REFRAMED',
  content: AIRLLM_CONTENT,
  provenance: provenanceFromContent(AIRLLM_CONTENT, {
    sourceId: 'athenasignal-src-airllm-claim',
    role: 'DISCOVERY',
    capturedAt: CAPTURED_AT,
  }),
  signal: AIRLLM_SIGNAL,
};

export const M2_FIXTURES: ResearchFixture[] = [KAFKA_FIXTURE, AIRLLM_FIXTURE];
