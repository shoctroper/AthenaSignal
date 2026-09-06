import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Claim, createClaim } from '../src/domain/entities.ts';
import type {
  Source,
  Content,
  Transcript,
  Signal,
  ResearchCandidate,
  Knowledge,
  EditorialOpportunity,
  EditorialMetrics,
} from '../src/domain/entities.ts';

describe('Domain Entities - AthenaSignal', () => {
  it('instantiates a Claim with status UNVERIFIED by default using new Claim()', () => {
    const claim = new Claim('Kafka partition log guarantees ordering per partition', 'src-123');

    assert.equal(claim.statement, 'Kafka partition log guarantees ordering per partition');
    assert.equal(claim.provenanceSourceId, 'src-123');
    assert.equal(claim.status, 'UNVERIFIED');
  });

  it('instantiates a Claim with status UNVERIFIED by default using createClaim()', () => {
    const claim = createClaim({
      statement: 'Kafka partition log guarantees ordering per partition',
      provenanceSourceId: 'src-123',
    });

    assert.equal(claim.statement, 'Kafka partition log guarantees ordering per partition');
    assert.equal(claim.provenanceSourceId, 'src-123');
    assert.equal(claim.status, 'UNVERIFIED');
  });

  it('allows overriding status if explicitly provided to Claim constructor or createClaim', () => {
    const verifiedClaim = new Claim('PostgreSQL provides ACID compliance', 'src-456', undefined, 'VERIFIED');
    assert.equal(verifiedClaim.status, 'VERIFIED');

    const factoryClaim = createClaim({
      statement: 'PostgreSQL provides ACID compliance',
      provenanceSourceId: 'src-456',
      status: 'VERIFIED',
    });
    assert.equal(factoryClaim.status, 'VERIFIED');
  });

  it('instantiates Source entity correctly', () => {
    const source: Source = {
      platform: 'youtube',
      creator: 'Tech Channel',
      url: 'https://youtube.com/watch?v=123',
      publishedAt: '2026-09-05T12:00:00Z',
      contentId: 'yt-123',
    };
    assert.equal(source.platform, 'youtube');
    assert.equal(source.contentId, 'yt-123');
  });

  it('instantiates Transcript entity correctly', () => {
    const transcript: Transcript = {
      text: 'Sample transcript content',
      sourceType: 'captions',
      language: 'es',
    };
    assert.equal(transcript.sourceType, 'captions');
    assert.equal(transcript.language, 'es');
  });

  it('instantiates Content entity correctly', () => {
    const source: Source = {
      platform: 'tiktok',
      creator: 'dev_user',
      url: 'https://tiktok.com/@dev_user/video/999',
      publishedAt: '2026-09-05T10:00:00Z',
      contentId: 'tt-999',
    };
    const content: Content = {
      source,
      title: 'Architecture Overview',
      description: 'Quick explanation of event sourcing',
      transcript: 'Full transcript here',
      language: 'en',
    };
    assert.equal(content.title, 'Architecture Overview');
    assert.equal(content.source.platform, 'tiktok');
  });

  it('instantiates Signal entity with claims', () => {
    const claim = new Claim('Redis is single-threaded for command execution', 'tt-999');
    const signal: Signal = {
      topic: 'Redis Concurrency Model',
      concepts: ['Single-threading', 'Event Loop'],
      claimsToInvestigate: [claim],
      questions: ['How does Redis 6+ handle multi-threading?'],
      arguments: ['Redis avoids lock contention by using event loop'],
      assumptions: ['Workload fits in memory'],
      contradictions: ['Multi-threaded I/O vs single-threaded execution'],
    };

    assert.equal(signal.topic, 'Redis Concurrency Model');
    assert.equal(signal.claimsToInvestigate.length, 1);
    assert.equal(signal.claimsToInvestigate[0].status, 'UNVERIFIED');
  });

  it('instantiates ResearchCandidate, Knowledge, and EditorialOpportunity', () => {
    const claim = new Claim('SQLite supports JSON operations', 'rss-01');

    const candidate: ResearchCandidate = {
      signalId: 'sig-01',
      hypothesis: 'SQLite JSON1 extension enables document store patterns',
      score: 0.85,
      claims: [claim],
    };
    assert.equal(candidate.score, 0.85);

    const knowledge: Knowledge = {
      claimId: 'claim-01',
      statement: 'SQLite JSON functions are built-in since version 3.38.0',
      evidence: ['SQLite official documentation v3.38.0 release notes'],
      verifiedAt: '2026-09-05T12:00:00Z',
      confidenceScore: 0.98,
      references: ['https://sqlite.org/json1.html'],
    };
    assert.equal(knowledge.confidenceScore, 0.98);

    const metrics: EditorialMetrics = {
      novelty: 0.8,
      researchability: 0.9,
      audienceRelevance: 0.85,
      contradictionTension: 0.7,
      evidenceDensity: 0.9,
      athenaPotential: 0.88,
      timeliness: 0.8,
    };

    const opportunity: EditorialOpportunity = {
      id: 'opp-01',
      topic: 'SQLite as Document Store',
      score: 0.86,
      metrics,
      candidate: {
        topic: 'SQLite as Document Store',
        concepts: ['SQLite', 'JSON'],
        claimsToInvestigate: [claim],
        questions: [],
        arguments: [],
        assumptions: [],
        contradictions: [],
      },
    };
    assert.equal(opportunity.score, 0.86);
  });
});
