import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  runM7Offline,
  verifyM7Corpus,
  outputPathsFor,
  EPISTEMIC_STATUSES,
  M7_BENCHMARK_CLASSES,
  M7_RUBRIC,
  classifyStance,
  isAuthoritativeUrl,
  nextStatus,
  type M7RunSummary,
} from '../src/epistemic/index.ts';

const OUT = '.m7tmp/m7-write-out';
const AKP = '.m7tmp/m7-akp-test';
const EXPECTED_OUTPUTS = [
  'corpus.json',
  'benchmark.json',
  'loop-timeline.json',
  'radar-state.json',
  'akp-live.json',
  'athenaos-results.json',
  'feedback-updates.json',
  'epistemic-resolutions.json',
  'contradictions.json',
  'provenance.json',
  'handoff-trace.json',
  'metrics.json',
  'cognitive-routing.json',
  'observability.json',
  'recovery-events.json',
  'idempotency.json',
  'distributed.json',
  'human-review-packet.json',
];

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

async function fresh(dir: string): Promise<M7RunSummary> {
  rmSync(resolve(process.cwd(), dir), { recursive: true, force: true });
  return runM7Offline({ write: false, akpDir: dir });
}

describe('Epistemically Resolutive Closed Loop E2E - M7 (offline, longitudinal, evidence-driven)', () => {
  let summary: M7RunSummary;

  before(async () => {
    rmSync(resolve(process.cwd(), AKP), { recursive: true, force: true });
    summary = await runM7Offline({ write: false, akpDir: AKP });
  });

  it('replays the full M7 loop deterministically without network', async () => {
    const first = await fresh('.m7tmp/m7-det-1');
    const second = await fresh('.m7tmp/m7-det-2');

    assert.deepEqual(first.state, second.state, 'M7 state must be deterministic');
    assert.deepEqual(first.artifacts.metrics, second.artifacts.metrics);
    assert.deepEqual(first.artifacts.epistemicResolutions, second.artifacts.epistemicResolutions);
    assert.deepEqual(first.artifacts.contradictions, second.artifacts.contradictions);
    assert.deepEqual(first.missingRecordings, [], 'M7 replay must be complete');
    assert.equal(first.artifacts.metrics.research.replayMisses, 0);
    assert.ok(first.artifacts.metrics.research.realResponses > 0, 'recorded real cognition must participate');
  });

  it('builds an M7 corpus materially larger than M6 (>= 400 unique sources)', () => {
    const corpus = summary.artifacts.corpus;
    assert.equal(corpus.kind, 'athenasignal.m7.corpus.v1');
    assert.deepEqual(verifyM7Corpus(corpus), [], 'M7 corpus must verify offline');
    assert.ok(corpus.sources.length >= 400, 'M7 must reach hundreds of unique sources');
    assert.equal(corpus.sources.length, 500, 'M7 must extend M6 with material continuity channels');
    assert.equal(corpus.baseM6SourceCount, 250, 'the M6 base must be preserved');
    assert.ok(corpus.m7SourceIds.length >= 150, 'M7 continuity channels must be material');
    assert.ok(corpus.cycles.length > 72, 'M7 must continue beyond the M6 schedule');
    const ids = corpus.sources.map((source) => source.id);
    assert.equal(new Set(ids).size, ids.length, 'source identities must be unique');
    assert.ok(
      corpus.sources.every((source) => source.url.startsWith('http') && source.contentHash.length === 64),
      'every source must carry real provenance and a content hash'
    );
  });

  it('formalizes epistemic states with evidence-driven statusHistory (never overwritten)', () => {
    const resolutions = summary.artifacts.epistemicResolutions.resolutions;
    assert.ok(resolutions.length >= 7, 'every candidate must have an epistemic resolution');
    for (const status of EPISTEMIC_STATUSES) {
      assert.ok(typeof status === 'string');
    }
    for (const resolution of resolutions) {
      assert.equal(resolution.kind, 'athenasignal.m7.epistemic_resolution.v1');
      assert.ok(EPISTEMIC_STATUSES.includes(resolution.currentStatus), `unknown status ${resolution.currentStatus}`);
      assert.ok(resolution.statusHistory.length >= 1, `${resolution.candidateId} must preserve status history`);
      // La secuencia conserva el pasado: los `from` encadenan con los `to` previos.
      for (let i = 1; i < resolution.statusHistory.length; i += 1) {
        assert.equal(
          resolution.statusHistory[i].from,
          resolution.statusHistory[i - 1].to,
          `${resolution.candidateId} history must chain without gaps`
        );
      }
      for (const transition of resolution.statusHistory) {
        assert.ok(transition.evidenceRefs.length > 0 || transition.wave === 0, 'transitions must cite evidence');
        assert.ok(transition.provenance.length > 0 || transition.wave === 0, 'transitions must carry provenance');
        assert.ok(transition.reason.length > 0, 'transitions must explain the why');
      }
    }
    const transitions = summary.artifacts.metrics.epistemic;
    assert.ok(transitions.transitions > 0);
    const researchTransitions = resolutions
      .flatMap((resolution) => resolution.statusHistory)
      .filter((transition) => transition.wave >= 1);
    assert.ok(researchTransitions.length > 0);
    assert.ok(researchTransitions.every((transition) => transition.evidenceRefs.length > 0));
    assert.equal(transitions.evidenceDriven, researchTransitions.length);
  });

  it('A. resolves at least one CONFIRMED and one REFUTED case based on evidence', () => {
    const metrics = summary.artifacts.metrics.epistemic;
    assert.ok(metrics.byVerdict.CONFIRMED >= 1, 'there must be at least one confirmed resolution');
    assert.ok(metrics.byVerdict.REFUTED >= 1, 'there must be at least one refuted resolution');
    assert.ok(
      metrics.byVerdict.CONFIRMED + metrics.byVerdict.REFUTED + metrics.byVerdict.INCONCLUSIVE ===
        metrics.resolutions
    );

    const confirmed = summary.artifacts.humanReview.confirmedCase;
    const refuted = summary.artifacts.humanReview.refutedCase;
    assert.ok(confirmed, 'a confirmed case must be documented');
    assert.ok(refuted, 'a refuted case must be documented');
    assert.ok(confirmed!.evidenceRefs.length > 0, 'confirmation must cite evidence');
    assert.ok(refuted!.evidenceRefs.length > 0, 'refutation must cite evidence');

    const refutedResolution = summary.artifacts.epistemicResolutions.resolutions.find(
      (resolution) => resolution.verdict === 'REFUTED'
    );
    assert.ok(refutedResolution, 'refuted resolution must exist');
    assert.ok(
      refutedResolution!.provenance.some((ref) => ref.authoritative),
      'the refutation must rest on authoritative evidence'
    );
    assert.ok(
      refutedResolution!.statusHistory.some((transition) => transition.stance === 'REFUTE'),
      'the refutation must record a REFUTE stance derived from the result'
    );
  });

  it('B. lets new evidence materially change a candidate state (closure/reopening/demotion/promotion)', () => {
    const transitions = summary.artifacts.epistemicResolutions.resolutions.flatMap(
      (resolution) => resolution.statusHistory
    );
    const material = transitions.filter(
      (transition) => transition.wave >= 1 && transition.from !== transition.to && transition.evidenceRefs.length > 0
    );
    assert.ok(material.length >= 3, 'multiple evidence-driven material transitions must exist');

    const statuses = summary.artifacts.metrics.epistemic.byStatus as Record<string, number>;
    assert.ok((statuses.CLOSED_REFUTED ?? 0) >= 1, 'a candidate must close by refutation');
    assert.ok(
      (statuses.CLOSED_CONFIRMED ?? 0) >= 1 || (statuses.PROMOTED ?? 0) >= 1,
      'a candidate must close/promote by confirmation'
    );
    assert.ok(transitions.some((transition) => transition.to === 'REOPENED'), 'a candidate must reopen');
    assert.ok(transitions.some((transition) => transition.to === 'DEMOTED' || transition.to === 'PROMOTED'));

    // El estado inicial del pasado permanece visible en el historial.
    const refuted = summary.artifacts.epistemicResolutions.resolutions.find(
      (resolution) => resolution.currentStatus === 'CLOSED_REFUTED'
    );
    assert.ok(refuted, 'a closed-refuted candidate must exist');
    assert.ok(
      refuted!.statusHistory.some((transition) => transition.to === 'DISCARDED'),
      'the prior discarded state must be preserved in history'
    );
  });

  it('C. represents contradictions explicitly (resolved or conserved)', () => {
    const { contradictions } = summary.artifacts.contradictions as {
      contradictions: Array<{ kind: string; candidateId: string; statements: string[]; contradictingRefs: string[] }>;
    };
    assert.ok(contradictions.length > 0, 'contradictions must be represented');
    assert.equal(
      contradictions.filter((entry) => entry.kind === 'RESOLVED').length +
        contradictions.filter((entry) => entry.kind === 'CONSERVED').length,
      contradictions.length
    );
    assert.ok(contradictions.some((entry) => entry.kind === 'RESOLVED'), 'a contradiction must be resolved');
    assert.ok(contradictions.some((entry) => entry.kind === 'CONSERVED'), 'a contradiction must be conserved');
    for (const contradiction of contradictions) {
      assert.ok(contradiction.statements.length > 0, 'contradictions must state the tension');
    }
  });

  it('D. keeps complete provenance source → signal → candidate → evidence → result → radar', () => {
    const { provenance, handoffTrace } = summary.artifacts;
    assert.equal(provenance.kind, 'athenasignal.m7.provenance.v1');
    assert.ok(provenance.edges.length > 0);
    assert.deepEqual(provenance.missingChains, [], 'every candidate must have a complete provenance chain');
    assert.ok(provenance.completeChains >= 7);
    for (const chain of provenance.chain) {
      assert.ok(chain.includes('→'), 'chains must be traceable');
    }
    assert.equal(handoffTrace.kind, 'athenasignal.m7.handoff_trace.v1');
    assert.equal(handoffTrace.delivered, handoffTrace.consumed);
    assert.equal(handoffTrace.consumed, handoffTrace.returned);
    for (const entry of handoffTrace.trace) {
      assert.ok(entry.handoffId.length > 0);
      assert.ok(entry.researchResultId.length > 0);
      assert.ok(entry.feedbackUpdateId.length > 0);
      assert.ok(entry.contentHash.length === 64);
    }
  });

  it('E. runs continuously through M6 + M7 cycles without manual intervention', () => {
    const cycles = summary.state.radar.cyclesProcessed;
    assert.ok(cycles.includes('m4-cycle-1'), 'M4 history must be preserved');
    assert.ok(cycles.some((cycle) => cycle.startsWith('m6-cycle-')), 'M6 continuity must be preserved');
    assert.ok(cycles.some((cycle) => cycle.startsWith('m7-cycle-')), 'M7 continuity must be processed');
    assert.equal(new Set(cycles).size, cycles.length, 'a cycle must never be processed twice');
    assert.ok(summary.artifacts.metrics.loop.waves >= 3, 'multiple waves must run');
    assert.ok(summary.artifacts.metrics.scale.inputsObserved >= 400, 'the loop must sustain hundreds of observations');
  });

  it('F. recovers from failures, degrades on node failure and is idempotent', () => {
    const recovery = summary.artifacts.recoveryEvents;
    const kinds = new Set(recovery.events.map((event) => event.kind));
    for (const expected of ['PROCESS_RESTART', 'PARTIAL_RUN', 'NODE_DOWN', 'LLM_FALLBACK', 'TIMEOUT', 'INVALID_RESPONSE']) {
      assert.ok(kinds.has(expected as never), `recovery must cover ${expected}`);
    }
    const idempotency = summary.artifacts.idempotency;
    assert.ok(idempotency.noOps > 0, 'idempotent no-ops must be recorded');
    assert.ok(idempotency.attempted > idempotency.noOps, 'there must be real applications too');

    const distributed = summary.artifacts.distributed;
    assert.ok(distributed.nodes.length >= 4, 'the topology must document multiple nodes');
    assert.ok(distributed.degraded, 'a node failure must degrade the loop');
    assert.ok(
      summary.artifacts.metrics.distributed.realNodeParticipation,
      'the Mac mini cognitive node must actually participate'
    );
    assert.ok(summary.artifacts.metrics.distributed.remoteEscalations > 0, 'failover must escalate');
    assert.deepEqual(roundTrip(summary.state), summary.state, 'the M7 state must round-trip JSON');
  });

  it('G. covers every M7 benchmark class with no false positives', () => {
    const { benchmark, metrics } = summary.artifacts;
    assert.equal(benchmark.entries.length, M7_BENCHMARK_CLASSES.length);
    assert.equal(benchmark.coverage, 1, benchmark.falsePositiveObservations.join('; '));
    assert.deepEqual(benchmark.falsePositiveObservations, []);
    assert.deepEqual(metrics.falsePositiveObservations, []);
    for (const definition of M7_BENCHMARK_CLASSES) {
      const entry = benchmark.entries.find((candidate) => candidate.id === definition.id);
      assert.ok(entry, `benchmark must include ${definition.id}`);
      assert.equal(entry.observed, true, `benchmark must observe ${definition.id}`);
    }
  });

  it('H. produces an editorial human-review packet', () => {
    const { humanReview } = summary.artifacts;
    assert.equal(humanReview.kind, 'athenasignal.m7.human_review_packet.v1');
    assert.equal(humanReview.rubric.length, M7_RUBRIC.length);
    assert.ok(humanReview.bestClosedLoopStory.length > 0);
    assert.ok(humanReview.worstClosedLoopStory.length > 0);
    assert.ok(humanReview.confirmedCase, 'the confirmed case must be documented');
    assert.ok(humanReview.refutedCase, 'the refuted case must be documented');
    assert.ok(humanReview.evidenceDrivenTransition, 'an evidence-driven transition must be documented');
    assert.ok(humanReview.contradictionHandling, 'contradiction handling must be documented');
    assert.ok(humanReview.majorClosure, 'a closure must be documented');
    assert.ok(humanReview.majorReopening, 'a reopening must be documented');
    assert.ok(humanReview.failureAndRecovery, 'a failure and recovery must be documented');
    assert.ok(humanReview.akpToAthenaOsToAkpTrace.length === summary.artifacts.handoffTrace.trace.length);
  });

  it('enforces the evidence-driven state machine (unit)', () => {
    assert.equal(isAuthoritativeUrl('https://www.gob.mx/cofepris'), true);
    assert.equal(isAuthoritativeUrl('https://es.cochrane.org/news/x'), true);
    assert.equal(isAuthoritativeUrl('https://k-state.com/plketobig'), false);

    const makeResult = (overrides: Record<string, unknown> = {}): any => ({
      kind: 'athenasignal.m6.athenaos_result.v1',
      resultId: 'aos-m7-unit',
      candidateId: 'rc7-unit',
      clusterId: 'cl-unit',
      handoffId: 'm7-akp-unit',
      handoffContentHash: 'h'.repeat(64),
      researchQuestion: '¿Es cierta la afirmación?',
      worker: 'unit',
      executionMode: 'replay',
      provider: 'unit',
      model: 'unit',
      deterministic: true,
      status: 'RESEARCHED_INCONCLUSIVE',
      steps: [],
      findings: [],
      claims: [],
      evidence: [],
      provenance: [],
      uncertainties: [],
      finalAssessment: 'AMBIGUOUS',
      confidence: 0.5,
      layers: {
        originalSignal: 'señal',
        researchQuestion: '¿Es cierta la afirmación?',
        researchResult: 'resultado',
        newEvidence: [],
        newInterpretation: 'interpretación',
      },
      createdAt: '2026-09-12T02:00:00.000Z',
      runId: 'run-unit',
      limitations: [],
      wave: 2,
      evidenceBalance: { supporting: 0, contradicting: 0, uncertain: 0, authoritative: 0 },
      ...overrides,
    });

    const refuting = makeResult({
      status: 'RESEARCHED_REFUTED',
      finalAssessment: 'UNSUPPORTED',
      evidence: [{ url: 'https://www.gob.mx/x', title: 'Alerta', role: 'EVIDENCE', origin: 'SEARCH' }],
      provenance: [
        { url: 'https://www.gob.mx/x', title: 'Alerta', language: 'es', role: 'EVIDENCE', accessedAt: 'x' },
      ],
    });
    assert.equal(classifyStance(refuting), 'REFUTE');
    assert.equal(nextStatus('INCONCLUSIVE', 'REFUTE', { authoritative: 1, qualifiesPromotion: false }), 'CLOSED_REFUTED');
    assert.equal(nextStatus('INCONCLUSIVE', 'REFUTE', { authoritative: 0, qualifiesPromotion: false }), 'REFUTED');

    const supporting = makeResult({
      status: 'RESEARCHED_CONFIRMED',
      finalAssessment: 'SUPPORTED',
      evidence: [{ url: 'https://example.org/a', title: 'A', role: 'EVIDENCE', origin: 'SEARCH' }],
    });
    assert.equal(classifyStance(supporting), 'SUPPORT');
    assert.equal(nextStatus('INCONCLUSIVE', 'SUPPORT', { authoritative: 0, qualifiesPromotion: false }), 'CONFIRMED');
    assert.equal(nextStatus('CONFIRMED', 'SUPPORT', { authoritative: 0, qualifiesPromotion: true }), 'PROMOTED');
    assert.equal(nextStatus('CONFIRMED', 'SUPPORT', { authoritative: 0, qualifiesPromotion: false }), 'CLOSED_CONFIRMED');
    assert.equal(nextStatus('CONFIRMED', 'UNCERTAIN', { authoritative: 0, qualifiesPromotion: false }), 'DEMOTED');
  });

  it('writes all acceptance artifacts that match the in-memory run', async () => {
    rmSync(resolve(process.cwd(), OUT), { recursive: true, force: true });
    const written = await runM7Offline({
      write: true,
      outputDir: OUT,
      akpDir: '.m7tmp/m7-write-akp',
    });
    for (const file of EXPECTED_OUTPUTS) {
      const path = resolve(process.cwd(), OUT, file);
      assert.ok(existsSync(path), `${file} must exist`);
      assert.equal(typeof readJson(path), 'object', `${file} must be a JSON object`);
    }
    const paths = outputPathsFor(OUT);
    assert.deepEqual(readJson(paths.corpus), roundTrip(written.artifacts.corpus));
    assert.deepEqual(readJson(paths.benchmark), roundTrip(written.artifacts.benchmark));
    assert.deepEqual(readJson(paths.loopTimeline), roundTrip(written.artifacts.loopTimeline));
    assert.deepEqual(readJson(paths.radarState), roundTrip(written.artifacts.radarState));
    assert.deepEqual(readJson(paths.akpLive), roundTrip(written.artifacts.akpLive));
    assert.deepEqual(readJson(paths.athenaosResults), roundTrip(written.artifacts.athenaosResults));
    assert.deepEqual(readJson(paths.feedbackUpdates), roundTrip(written.artifacts.feedbackUpdates));
    assert.deepEqual(readJson(paths.epistemicResolutions), roundTrip(written.artifacts.epistemicResolutions));
    assert.deepEqual(readJson(paths.contradictions), roundTrip(written.artifacts.contradictions));
    assert.deepEqual(readJson(paths.provenance), roundTrip(written.artifacts.provenance));
    assert.deepEqual(readJson(paths.handoffTrace), roundTrip(written.artifacts.handoffTrace));
    assert.deepEqual(readJson(paths.metrics), roundTrip(written.artifacts.metrics));
    assert.deepEqual(readJson(paths.recoveryEvents), roundTrip(written.artifacts.recoveryEvents));
    assert.deepEqual(readJson(paths.idempotency), roundTrip(written.artifacts.idempotency));
    assert.deepEqual(readJson(paths.distributed), roundTrip(written.artifacts.distributed));
    assert.deepEqual(readJson(paths.humanReview), roundTrip(written.artifacts.humanReview));
  });
});
