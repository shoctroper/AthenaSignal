import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClaim, type Signal } from '../src/domain/entities.ts';
import { FirecrawlAdapter } from '../src/adapters/FirecrawlAdapter.ts';
import { McpAgentReachAdapter } from '../src/adapters/McpAgentReachAdapter.ts';
import {
  ClaimVerifier,
  type ClaimSearchProvider,
} from '../src/services/ClaimVerifier.ts';
import {
  DeterministicEvidenceProvider,
  NoEvidenceProvider,
} from '../src/services/EvidenceProviders.ts';
import { EditorialScorer } from '../src/services/EditorialScorer.ts';
import { SignalExtractor } from '../src/services/SignalExtractor.ts';
import { PipelineOrchestrator } from '../src/services/PipelineOrchestrator.ts';
import {
  DEFAULT_EVIDENCE_PATH,
  OFFLINE_SOURCE_URL,
  runOfflinePipeline,
} from '../src/cli.ts';

const alwaysSupport: ClaimSearchProvider = {
  search: () => [{ supports: true, source: 'fixture', excerpt: 'La fuente confirma el enunciado.' }],
};

const alwaysRefute: ClaimSearchProvider = {
  search: () => [{ supports: false, source: 'fixture', excerpt: 'La fuente contradice el enunciado.' }],
};

function buildSingleClaimSignal(): Signal {
  return {
    sourceId: 'src-e2e-001',
    topic: 'Claim unico de prueba',
    concepts: ['Kafka'],
    claimsToInvestigate: [
      createClaim({
        statement: 'Kafka garantiza el orden por particion',
        provenanceSourceId: 'src-e2e-001',
      }),
    ],
    questions: [],
    arguments: [],
    assumptions: [],
    contradictions: [],
  };
}

function buildOrchestrator(provider?: ClaimSearchProvider): PipelineOrchestrator {
  return new PipelineOrchestrator(
    [new McpAgentReachAdapter(), new FirecrawlAdapter()],
    new SignalExtractor(),
    new ClaimVerifier(provider ?? new DeterministicEvidenceProvider()),
    new EditorialScorer()
  );
}

describe('Pipeline E2E - Deep Search Vertical Slice (offline)', () => {
  it('runs the full pipeline end-to-end deterministically without network', async () => {
    const orchestrator = buildOrchestrator();

    const first = await orchestrator.run(OFFLINE_SOURCE_URL);
    const second = await orchestrator.run(OFFLINE_SOURCE_URL);

    // Las cuatro etapas auditables están presentes.
    assert.ok(first.source, 'source stage must exist');
    assert.ok(first.signal, 'signal stage must exist');
    assert.ok(first.verification, 'verification stage must exist');
    assert.ok(first.opportunity, 'opportunity stage must exist');

    // Determinismo: sin reloj, red ni aleatoriedad en la verificación.
    assert.deepEqual(first.verification, second.verification);
    assert.equal(first.opportunity.score, second.opportunity.score);

    // Oportunidad puntuada en [0.0, 1.0].
    assert.ok(first.opportunity.score >= 0.0 && first.opportunity.score <= 1.0);
  });

  it('updates every claim status with its verifier verdict', async () => {
    const { signal, verification } = await buildOrchestrator().run(OFFLINE_SOURCE_URL);

    assert.ok(signal.claimsToInvestigate.length > 0);
    assert.equal(verification.claims.length, signal.claimsToInvestigate.length);

    for (const claim of signal.claimsToInvestigate) {
      assert.notEqual(claim.status, 'UNVERIFIED', 'claim must be resolved after verification');
      assert.ok(
        ['VERIFIED', 'REFUTED', 'UNVERIFIED_AMBIGUOUS'].includes(claim.status),
        `unexpected claim status: ${claim.status}`
      );
    }

    assert.equal(signal.verification, verification);
  });

  it('extracts every claim as UNVERIFIED before verification (DU-001)', async () => {
    const content = await new McpAgentReachAdapter().acquire(OFFLINE_SOURCE_URL);
    const signal = await new SignalExtractor().extract(content);

    assert.ok(signal.claimsToInvestigate.length > 0);
    for (const claim of signal.claimsToInvestigate) {
      assert.equal(claim.status, 'UNVERIFIED');
    }
  });

  it('enforces MAX_ITERATIONS = 3 and yields UNVERIFIED_AMBIGUOUS without evidence', async () => {
    const verifier = new ClaimVerifier(new NoEvidenceProvider());
    const report = await verifier.verify(buildSingleClaimSignal());

    assert.equal(ClaimVerifier.MAX_ITERATIONS, 3);
    assert.equal(report.maxIterations, 3);
    assert.equal(report.claims[0].iterations, 3, 'must consume exactly 3 iterations');
    assert.equal(report.claims[0].verdict, 'UNVERIFIED_AMBIGUOUS');
    assert.equal(report.verdictCounts.UNVERIFIED_AMBIGUOUS, 1);
    assert.ok(report.penalty > 0, 'unresolved claims must carry a scorer penalty');
  });

  it('never exceeds MAX_ITERATIONS even if constructed with a larger value', async () => {
    const verifier = new ClaimVerifier(new NoEvidenceProvider(), 99);
    const report = await verifier.verify(buildSingleClaimSignal());

    assert.equal(report.maxIterations, 3);
    assert.ok(report.claims[0].iterations <= 3);
  });

  it('emits VERIFIED for supporting evidence and REFUTED for contradictory evidence', async () => {
    const supportReport = await new ClaimVerifier(alwaysSupport).verify(buildSingleClaimSignal());
    assert.equal(supportReport.claims[0].verdict, 'VERIFIED');

    const refuteReport = await new ClaimVerifier(alwaysRefute).verify(buildSingleClaimSignal());
    assert.equal(refuteReport.claims[0].verdict, 'REFUTED');
  });

  it('does not use Math.random in the ClaimVerifier source', () => {
    const source = readFileSync(new URL('../src/services/ClaimVerifier.ts', import.meta.url), 'utf8');
    assert.ok(!source.includes('Math.random'), 'ClaimVerifier must not use randomness');
  });

  it('produces deterministic adapter output without configured transports', async () => {
    const agentReach = new McpAgentReachAdapter();
    assert.equal(agentReach.canHandle('https://youtube.com/watch?v=abc'), true);
    assert.equal(agentReach.canHandle('https://example.com/post'), false);

    const firstYt = await agentReach.acquire('https://youtube.com/watch?v=abc');
    const secondYt = await agentReach.acquire('https://youtube.com/watch?v=abc');
    assert.deepEqual(firstYt, secondYt);

    const firecrawl = new FirecrawlAdapter();
    assert.equal(firecrawl.canHandle('https://example.com/post'), true);
    assert.equal(firecrawl.canHandle('https://youtube.com/watch?v=abc'), false);

    const firstBlog = await firecrawl.acquire('https://example.com/post');
    const secondBlog = await firecrawl.acquire('https://example.com/post');
    assert.deepEqual(firstBlog, secondBlog);
  });

  it('writes evidence/deep-search-e2e.json with source, signal, verification and opportunity', async () => {
    const { outputPath } = await runOfflinePipeline();
    const evidencePath = resolve(process.cwd(), DEFAULT_EVIDENCE_PATH);

    assert.equal(outputPath, evidencePath);
    assert.ok(existsSync(evidencePath), 'evidence file must exist');

    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    assert.equal(typeof evidence, 'object');
    assert.deepEqual(Object.keys(evidence).sort(), [
      'opportunity',
      'signal',
      'source',
      'verification',
    ]);

    assert.ok(evidence.opportunity.score >= 0.0 && evidence.opportunity.score <= 1.0);
    assert.ok(Array.isArray(evidence.verification.claims));
    assert.ok(evidence.verification.claims.length > 0);
    for (const claim of evidence.verification.claims) {
      assert.ok(['VERIFIED', 'REFUTED', 'UNVERIFIED_AMBIGUOUS'].includes(claim.verdict));
    }
  });

  it('exposes processUrl returning an EditorialOpportunity', async () => {
    const opportunity = await buildOrchestrator().processUrl(OFFLINE_SOURCE_URL);

    assert.ok(opportunity.id);
    assert.ok(opportunity.score >= 0.0 && opportunity.score <= 1.0);
    assert.ok(opportunity.metrics);
    assert.ok(opportunity.candidate);
  });
});
