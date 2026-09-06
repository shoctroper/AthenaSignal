import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClaim, type Signal } from '../src/domain/entities.ts';
import {
  EditorialScorer,
  type IEditorialScorer,
} from '../src/services/EditorialScorer.ts';

describe('EditorialScorer Service - AthenaSignal', () => {
  const sampleSignal: Signal = {
    sourceId: 'yt-rabbitmq-kafka-001',
    topic: 'RabbitMQ vs Kafka: Comparativa de Arquitectura',
    topics: ['RabbitMQ vs Kafka', 'RabbitMQ', 'Kafka'],
    concepts: ['RabbitMQ', 'Kafka', 'AMQP', 'Commit Log'],
    claimsToInvestigate: [
      createClaim({
        statement: 'RabbitMQ ofrece menor latencia que Kafka en mensajes individuales',
        provenanceSourceId: 'yt-rabbitmq-kafka-001',
      }),
      createClaim({
        statement: 'Kafka escala con mayor throughput por partición apendizada',
        provenanceSourceId: 'yt-rabbitmq-kafka-001',
      }),
    ],
    questions: ['¿Cuándo deberías usar RabbitMQ en lugar de Kafka?'],
    arguments: [
      'RabbitMQ destaca en arquitectura de colas tradicionales mientras que Kafka sobresale en event sourcing',
    ],
    assumptions: ['El consumo de almacenamiento en disco no es la limitante principal'],
    contradictions: [
      'Tensión entre latencia instantánea de RabbitMQ y throughput masivo de Kafka',
    ],
    potentialAngles: [
      'Tensión técnica: Tensión entre latencia instantánea de RabbitMQ y throughput masivo de Kafka',
      'Análisis comparativo de RabbitMQ vs Kafka vs AMQP',
    ],
    createdAt: new Date().toISOString(),
  };

  it('implements IEditorialScorer interface and computes EditorialMetrics correctly', () => {
    const scorer: IEditorialScorer = new EditorialScorer();
    const metrics = scorer.score(sampleSignal);

    // Verify metrics exist and are between 0.0 and 1.0
    assert.ok(typeof metrics.novelty === 'number');
    assert.ok(metrics.novelty >= 0.0 && metrics.novelty <= 1.0);

    assert.ok(typeof metrics.researchability === 'number');
    assert.ok(metrics.researchability >= 0.0 && metrics.researchability <= 1.0);

    assert.ok(typeof metrics.audienceRelevance === 'number');
    assert.ok(metrics.audienceRelevance >= 0.0 && metrics.audienceRelevance <= 1.0);

    assert.ok(typeof metrics.contradictionTension === 'number');
    assert.ok(metrics.contradictionTension >= 0.0 && metrics.contradictionTension <= 1.0);

    assert.ok(typeof metrics.evidenceDensity === 'number');
    assert.ok(metrics.evidenceDensity >= 0.0 && metrics.evidenceDensity <= 1.0);

    assert.ok(typeof metrics.athenaPotential === 'number');
    assert.ok(metrics.athenaPotential >= 0.0 && metrics.athenaPotential <= 1.0);

    assert.ok(typeof metrics.timeliness === 'number');
    assert.ok(metrics.timeliness >= 0.0 && metrics.timeliness <= 1.0);

    // Specific domain expectation: high tension and high researchability for rich signal
    assert.ok(metrics.contradictionTension > 0.0);
    assert.ok(metrics.researchability > 0.0);
  });

  it('calculates global score bounded in range [0.0, 1.0]', () => {
    const scorer: IEditorialScorer = new EditorialScorer();
    const metrics = scorer.score(sampleSignal);
    const globalScore = scorer.calculateGlobalScore(metrics);

    assert.ok(typeof globalScore === 'number');
    assert.ok(globalScore >= 0.0 && globalScore <= 1.0);
  });

  it('evaluates opportunity building complete EditorialOpportunity entity', () => {
    const scorer = new EditorialScorer();
    const opportunity = scorer.evaluateOpportunity(sampleSignal, 'opp-test-123');

    assert.equal(opportunity.id, 'opp-test-123');
    assert.equal(opportunity.topic, 'RabbitMQ vs Kafka: Comparativa de Arquitectura');
    assert.ok(opportunity.score >= 0.0 && opportunity.score <= 1.0);
    assert.equal(opportunity.candidate, sampleSignal);
    assert.ok(opportunity.narrativeAngle && opportunity.narrativeAngle.includes('Tensión técnica'));
    assert.ok(opportunity.createdAt);
  });

  it('supports custom weights configuration and normalizes properly', () => {
    const customScorer = new EditorialScorer({
      contradictionTension: 0.50,
      researchability: 0.50,
    });

    const metrics = customScorer.score(sampleSignal);
    const score = customScorer.calculateGlobalScore(metrics);

    assert.ok(score >= 0.0 && score <= 1.0);
  });
});
