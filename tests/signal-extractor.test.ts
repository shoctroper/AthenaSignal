import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Claim } from '../src/domain/entities.ts';
import {
  SignalExtractor,
  type ISignalExtractor,
  type NormalizedContent,
} from '../src/services/SignalExtractor.ts';

describe('SignalExtractor Service - AthenaSignal', () => {
  it('implements ISignalExtractor interface and extracts Signals from NormalizedContent (RabbitMQ vs Kafka)', async () => {
    const extractor: ISignalExtractor = new SignalExtractor();

    const sampleContent: NormalizedContent = {
      source: {
        platform: 'youtube',
        creator: 'TechArchitectureLab',
        url: 'https://youtube.com/watch?v=rabbitmq-vs-kafka-example',
        publishedAt: '2026-09-05T10:00:00Z',
        contentId: 'yt-rabbitmq-kafka-001',
      },
      title: 'RabbitMQ vs Kafka: Comparativa de Arquitectura',
      description: 'Análisis profundo entre RabbitMQ y Apache Kafka. ¿Cuál es la mejor opción para sistemas distribuidos?',
      transcript: `
        En este episodio analizo RabbitMQ vs Kafka.
        RabbitMQ es un broker de mensajes basado en AMQP que ofrece enrutamiento complejo mediante exchanges.
        Kafka es una plataforma de streaming distribuido basada en un commit log apendizado.
        RabbitMQ garantiza baja latencia y entrega individual de mensajes.
        Kafka ofrece alto throughput para el procesamiento de eventos masivos.
        ¿Cuándo deberías usar RabbitMQ en lugar de Kafka?
        Asumimos que el consumo de almacenamiento en disco no es la limitante principal.
        RabbitMQ destaca en arquitectura de colas tradicionales mientras que Kafka sobresale en event sourcing.
        Existe una contradicción entre la latencia instantánea de RabbitMQ y el throughput masivo de Kafka.
      `,
      language: 'es',
    };

    const signal = await extractor.extract(sampleContent);

    // Verify signal properties
    assert.equal(signal.sourceId, 'yt-rabbitmq-kafka-001');
    assert.equal(signal.topic, 'RabbitMQ vs Kafka: Comparativa de Arquitectura');
    assert.ok(signal.topics && signal.topics.length > 0);
    assert.ok(signal.topics.some((t) => t.includes('RabbitMQ vs Kafka')));

    // Concepts
    assert.ok(signal.concepts.includes('RabbitMQ'));
    assert.ok(signal.concepts.includes('Kafka'));

    // Claims to Investigate
    assert.ok(signal.claimsToInvestigate.length > 0);
    for (const claim of signal.claimsToInvestigate) {
      assert.ok(claim instanceof Claim, 'Each claim should be an instance of Claim');
      assert.equal(claim.status, 'UNVERIFIED', 'All extracted claims must strictly be UNVERIFIED');
      assert.equal(claim.provenanceSourceId, 'yt-rabbitmq-kafka-001');
      assert.ok(claim.statement.length > 0);
    }

    // Questions
    assert.ok(signal.questions.length > 0);
    assert.ok(signal.questions.some((q) => q.includes('¿')));

    // Arguments
    assert.ok(signal.arguments.length > 0);

    // Assumptions
    assert.ok(signal.assumptions.length > 0);
    assert.ok(signal.assumptions.some((a) => a.toLowerCase().includes('asum')));

    // Contradictions
    assert.ok(signal.contradictions.length > 0);
    assert.ok(signal.contradictions.some((c) => c.toLowerCase().includes('contradicci')));

    // Potential Angles
    assert.ok(signal.potentialAngles && signal.potentialAngles.length > 0);
  });

  it('supports custom extractor engine and guarantees UNVERIFIED status on all claims', async () => {
    const customExtractor = new SignalExtractor(async (content) => {
      return {
        topic: 'Custom Kafka Extraction',
        concepts: ['Kafka', 'Partition'],
        claimsToInvestigate: [
          new Claim('Kafka scales horizontally per partition', content.source.contentId, 'c-1', 'UNVERIFIED'),
        ],
        questions: ['How do partitions scale?'],
        arguments: ['Kafka partitioning allows high parallelism'],
        assumptions: ['Consumers are evenly distributed across consumer groups'],
        contradictions: ['Ordering guarantee vs dynamic partition rebalancing'],
      };
    });

    const sampleContent: NormalizedContent = {
      source: {
        platform: 'blog',
        creator: 'DevBlog',
        url: 'https://dev.example.com/kafka-scaling',
        publishedAt: '2026-09-05T11:00:00Z',
        contentId: 'blog-kafka-002',
      },
      title: 'Kafka Partition Scaling',
      description: 'Understanding partition scaling',
      transcript: 'Partition scaling details...',
      language: 'en',
    };

    const signal = await customExtractor.extract(sampleContent);

    assert.equal(signal.topic, 'Custom Kafka Extraction');
    assert.equal(signal.sourceId, 'blog-kafka-002');
    assert.equal(signal.claimsToInvestigate.length, 1);
    assert.equal(signal.claimsToInvestigate[0].status, 'UNVERIFIED');
    assert.equal(signal.claimsToInvestigate[0].provenanceSourceId, 'blog-kafka-002');
  });
});
