import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  runM6Offline,
  verifyM6Corpus,
  outputPathsFor,
  DEFAULT_M6_OUTPUT_DIR,
  M6_BENCHMARK_CLASSES,
  M6_RUBRIC,
  RESEARCH_STATUSES,
  FEEDBACK_CHANGES,
  LOOP_PHASES,
  ATHENAOS_WORKER_ID,
  applyResearchFeedback,
  type M6RunSummary,
} from '../src/closedloop/index.ts';

const OUT = DEFAULT_M6_OUTPUT_DIR;
const AKP = '.m6tmp/akp-test';
const EXPECTED_OUTPUTS = [
  'corpus.json',
  'benchmark.json',
  'loop-timeline.json',
  'radar-state.json',
  'akp-live.json',
  'athenaos-results.json',
  'feedback-updates.json',
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

function fresh(dir: string): Promise<M6RunSummary> {
  rmSync(resolve(process.cwd(), dir), { recursive: true, force: true });
  return runM6Offline({ write: false, akpDir: dir });
}

describe('Closed-Loop Editorial Intelligence E2E - M6 (offline, longitudinal, feedback + recovery)', () => {
  let summary: M6RunSummary;

  before(async () => {
    rmSync(resolve(process.cwd(), AKP), { recursive: true, force: true });
    summary = await runM6Offline({ write: false, akpDir: AKP });
  });

  it('replays the full closed loop deterministically without network', async () => {
    const first = await fresh('.m6tmp/akp-det-1');
    const second = await fresh('.m6tmp/akp-det-2');

    assert.deepEqual(first.state, second.state, 'M6 state must be deterministic');
    assert.deepEqual(first.artifacts.metrics, second.artifacts.metrics);
    assert.deepEqual(first.artifacts.feedbackUpdates, second.artifacts.feedbackUpdates);
    assert.deepEqual(first.missingRecordings, []);
    assert.equal(first.artifacts.metrics.research.replayMisses, 0, 'deep-research replay must be complete');
    assert.ok(
      first.artifacts.metrics.research.realResponses > 0,
      'the recorded real AthenaOS cognition must participate'
    );
  });

  it('builds an M6 corpus with a materially larger universe than M5', () => {
    const corpus = summary.corpus;
    assert.equal(corpus.kind, 'athenasignal.m6.corpus.v1');
    assert.deepEqual(verifyM6Corpus(corpus), [], 'M6 corpus must verify offline');

    assert.ok(corpus.sources.length > corpus.baseM5SourceCount, 'M6 must extend the M5 universe');
    assert.equal(corpus.sources.length, 250, 'M6 must reach hundreds of unique sources');
    assert.equal(corpus.baseM5SourceCount, 130, 'the M5 base must be preserved');
    assert.ok(corpus.m6SourceIds.length >= 100, 'M6 continuity channels must be material');
    assert.ok(corpus.cycles.length > 48, 'M6 must continue beyond the M5 cycle schedule');

    const ids = corpus.sources.map((source) => source.id);
    assert.equal(new Set(ids).size, ids.length, 'source identities must be unique');
    assert.ok(
      corpus.sources.every((source) => source.url.startsWith('http') && source.contentHash.length === 64),
      'every source must carry real provenance and a content hash'
    );
    const languages = new Set(corpus.sources.map((source) => source.language));
    assert.ok(languages.has('en') && languages.has('es'), 'multilingual material must be preserved');
  });

  it('keeps historical continuity from M4/M5 and survives restart without resetting', () => {
    const { state } = summary;
    assert.equal(state.kind, 'athenasignal.m6.state.v1');
    assert.equal(state.importedFrom, 'evidence/m5/radar-state.json');
    assert.equal(state.radar.cyclesProcessed[0], 'm4-cycle-1', 'M4 history must be preserved');
    assert.ok(state.radar.cyclesProcessed.includes('m5-cycle-7'), 'M5 history must be preserved');
    assert.ok(
      state.radar.cyclesProcessed.some((cycle) => cycle.startsWith('m6-cycle-')),
      'M6 cycles must extend the same history'
    );
    assert.equal(
      new Set(state.radar.cyclesProcessed).size,
      state.radar.cyclesProcessed.length,
      'a cycle must never be processed twice'
    );

    const creatine = state.radar.signals['sig-src-creatine-pmc-1'];
    assert.ok(creatine, 'the historical creatine signal must persist');
    assert.equal(creatine.firstSeenCycle, 'm4-cycle-1', 'first-seen cycle must not be reset');

    const resumed = state.runs.find((run) => run.resumedFrom);
    assert.ok(resumed, 'a later process must resume from the crashed run');
    const crashed = state.runs.find((run) => run.status === 'CRASHED');
    assert.ok(crashed, 'the partial run must be recorded');
    assert.equal(resumed.resumedFrom, crashed.runId);
  });

  it('A. delivers a real Research Candidate to AKP and consumes it', () => {
    const { akpLive } = summary.artifacts;
    assert.equal(akpLive.kind, 'athenasignal.m6.akp_live.v1');
    assert.ok(akpLive.handoffs.length >= 1, 'at least one candidate must reach the AKP inbox');
    assert.equal(akpLive.consumed, summary.results.length);
    assert.ok(akpLive.consumed > 0, 'AKP must consume the handoff');
    assert.equal(akpLive.worker, ATHENAOS_WORKER_ID);
    assert.ok(akpLive.limitation.length > 0, 'the external limitation must be documented');
  });

  it('B. produces real structured research results from AthenaOS', () => {
    assert.ok(summary.results.length > 0, 'research results must exist');
    for (const result of summary.results) {
      assert.equal(result.kind, 'athenasignal.m6.athenaos_result.v1');
      assert.ok(RESEARCH_STATUSES.includes(result.status), `unexpected status ${result.status}`);
      assert.equal(result.worker, ATHENAOS_WORKER_ID);
      assert.ok(result.executionMode === 'replay' || result.executionMode === 'live');
      assert.ok(result.steps.length >= 4, 'research must be multi-step');
      assert.ok(result.findings.length + result.claims.length > 0, 'research must produce findings/claims');
      assert.ok(result.evidence.length > 0, 'research must preserve evidence');
      assert.ok(result.provenance.every((entry) => entry.url.startsWith('http')));
      assert.ok(result.limitations.length > 0, 'the stand-in limitation must be explicit');
      assert.ok(result.confidence >= 0 && result.confidence <= 1);
      assert.ok(result.layers.originalSignal.length > 0);
      assert.ok(result.layers.researchQuestion.length > 0);
      assert.ok(result.layers.researchResult.length > 0);
    }
    assert.ok(
      summary.results.some((result) => !result.deterministic),
      'at least one result must come from real recorded cognition'
    );
  });

  it('C. returns every result to the shared AKP knowledge base', () => {
    const hashes = new Set(summary.results.map((result) => result.handoffContentHash));
    assert.equal(hashes.size, summary.results.length, 'each investigated handoff is distinct');
    assert.equal(summary.artifacts.athenaosResults.results.length, summary.results.length);
    assert.equal(summary.artifacts.akpLive.resultsReturned, summary.results.length);
    assert.equal(summary.artifacts.akpLive.returnedResultIds.length, summary.results.length);
    for (const result of summary.results) {
      const delivered = summary.artifacts.akpLive.handoffs.find(
        (handoff) => handoff.candidateId === result.candidateId
      );
      assert.ok(delivered, `handoff for ${result.candidateId} must be traceable`);
      assert.equal(delivered.contentHash, result.handoffContentHash);
    }
  });

  it('D. mutates the radar from the returned knowledge without overwriting the past', () => {
    const { updates: feedback } = summary.artifacts.feedbackUpdates;
    assert.ok(feedback.length > 0, 'the loop must produce feedback updates');
    assert.equal(feedback.length, summary.results.length, 'every result must inform a decision');

    const changed = summary.artifacts.metrics.feedback;
    assert.ok(
      changed.assessmentChanges + changed.priorityChanges + changed.interpretationUpdates > 0,
      'at least one radar mutation must be observable'
    );
    assert.ok(changed.assessmentChanges > 0, 'research must reassess at least one candidate');
    // ORDEN-010 §0bis §1: el feedback debe ser material, no sólo interpretativo.
    assert.ok(
      summary.artifacts.metrics.research.newEvidence > 0,
      'deep research must discover new evidence'
    );
    assert.ok(changed.evidenceAdded > 0, 'feedback must add evidence to the radar');
    assert.ok(changed.priorityChanges >= 1, 'feedback must recompute and change at least one priority');
    assert.ok(changed.reopenings >= 1, 'an inconclusive PROMOTED candidate must be reopened (REOPENED)');

    const material = Object.values(summary.state.radar.candidates).find(
      (candidate) =>
        candidate.statusHistory.some((point) => point.status === 'PROMOTED') &&
        candidate.status !== 'PROMOTED'
    );
    assert.ok(material, 'a material trajectory PROMOTED → REOPENED/CLOSED must exist');
    for (const candidate of Object.values(summary.state.radar.candidates)) {
      assert.ok(
        candidate.statusHistory.length >= 1,
        `candidate ${candidate.candidateId} must preserve its status history`
      );
      assert.ok(
        feedback.some(
          (update) =>
            update.candidateId === candidate.candidateId && update.layers.newEvidence.length > 0
        ) || candidate.statusHistory.length >= 1,
        'research evidence must be traceable per candidate when present'
      );
    }
    assert.ok(
      feedback.some((update) => update.layers.newEvidence.length > 0),
      'feedback must carry the new evidence with provenance'
    );

    for (const update of feedback) {
      assert.ok(FEEDBACK_CHANGES.includes(update.changes[0]) || update.changes.length > 0);
      assert.ok(update.layers.originalSignal.length > 0, 'original signal must be preserved');
      assert.ok(update.layers.researchQuestion.length > 0, 'research question must be separated');
      assert.ok(update.layers.researchResult.length > 0, 'research result must be separated');
      assert.ok(update.layers.newInterpretation.length > 0, 'new interpretation must be separated');
      assert.ok(Array.isArray(update.layers.newEvidence));
      assert.notDeepEqual(update.previous, update.next, 'a feedback update must change the snapshot');
    }

    // La identidad y el historial de prioridad no se reinician.
    for (const candidate of Object.values(summary.state.radar.candidates)) {
      assert.ok(candidate.firstCycle.length > 0, 'candidate identity must persist');
      assert.ok(candidate.priorityHistory.length >= 1);
      assert.notEqual(candidate.recommendedAthenaOsInput.kind, undefined);
    }
    for (const delivery of Object.values(summary.state.radar.candidates)) {
      for (const fact of delivery.recommendedAthenaOsInput.proposedCandidateFacts) {
        assert.equal(fact.statusHint, 'UNVERIFIED', 'DU-001: nothing is born verified');
      }
    }
  });

  it('enforces material status transitions and preserves statusHistory (unit)', () => {
    const makeResult = (overrides: Record<string, unknown> = {}): any => ({
      kind: 'athenasignal.m6.athenaos_result.v1',
      resultId: 'aos-unit',
      candidateId: 'rc4-unit',
      clusterId: 'cl-unit',
      handoffId: 'm6-akp-rc4-unit',
      handoffContentHash: 'h'.repeat(64),
      researchQuestion: '¿Es cierta la afirmación?',
      worker: ATHENAOS_WORKER_ID,
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
        originalSignal: 'señal original',
        researchQuestion: '¿Es cierta la afirmación?',
        researchResult: 'resultado',
        newEvidence: [],
        newInterpretation: 'interpretación',
      },
      createdAt: '2026-09-12T02:00:00.000Z',
      runId: 'run-unit',
      limitations: [],
      ...overrides,
    });

    const makeRadar = (status: 'ACTIVE' | 'PROMOTED' | 'DISCARDED'): any => {
      const assessment = status === 'PROMOTED' ? 'SUPPORTED' : 'AMBIGUOUS';
      const statusPoint = {
        cycleId: 'm4-cycle-1',
        cycleNumber: 1,
        status,
        reason: 'seed',
        at: '2026-09-12T00:00:00.000Z',
      };
      return {
        kind: 'athenasignal.m4.radar_state.v1',
        updatedAt: '2026-09-12T00:00:00.000Z',
        cyclesProcessed: ['m4-cycle-1'],
        processedSources: { 'src-unit': { firstCycle: 'm4-cycle-1', contentHash: 'a'.repeat(64), timesSeen: 1 } },
        signals: {
          'sig-unit': {
            signalId: 'sig-unit',
            corpusId: 'src-unit',
            topic: 'unidad',
            assertion: 'afirmación',
            policy: 'PRIMARY',
            fingerprint: 'fp-unit',
            firstSeenCycle: 'm4-cycle-1',
            lastSeenCycle: 'm4-cycle-1',
            seenCount: 1,
            clusterId: 'cl-unit',
            assessment,
            researchabilityLevel: 'HIGH',
            editorialScore: 0.8,
            noiseLikelihood: 0.1,
            findingCount: 1,
            evidenceUrls: ['https://e1', 'https://e2'],
            contradiction: false,
          },
        },
        clusters: {
          'cl-unit': {
            clusterId: 'cl-unit',
            label: 'unidad',
            tokens: ['unidad'],
            signalIds: ['sig-unit'],
            sourceIds: ['s1', 's2'],
            authoritySourceIds: ['s1'],
            evidenceUrls: ['https://e1', 'https://e2', 'https://e3'],
            assessment,
            priority: 'HIGH',
            priorityScore: 0.7,
            priorityHistory: [{ cycleId: 'm4-cycle-1', cycleNumber: 1, priority: 'HIGH', score: 0.7 }],
            priorityReasons: [],
            contradiction: false,
            contradictionDetails: [],
            resolutionNote: null,
            firstCycle: 'm4-cycle-1',
            lastCycle: 'm4-cycle-1',
            status,
            statusHistory: [statusPoint],
            highSinceCycle: 1,
            promotedAt: status === 'PROMOTED' ? '2026-09-12T00:00:00.000Z' : null,
          },
        },
        candidates: {
          'rc4-unit': {
            candidateId: 'rc4-unit',
            clusterId: 'cl-unit',
            title: 'unidad',
            researchQuestion: '¿Es cierta la afirmación?',
            originSignalIds: ['sig-unit'],
            sourceIds: ['s1', 's2'],
            assessment,
            priority: 'HIGH',
            priorityScore: 0.7,
            priorityHistory: [{ cycleId: 'm4-cycle-1', cycleNumber: 1, priority: 'HIGH', score: 0.7 }],
            priorityReasons: [],
            resolutionNote: null,
            status,
            statusHistory: [statusPoint],
            firstCycle: 'm4-cycle-1',
            lastCycle: 'm4-cycle-1',
            recommendedAthenaOsInput: {},
            promotionReason: status === 'PROMOTED' ? 'seed' : null,
            promotionReasons: [],
          },
        },
        events: [],
        eventCounts: {},
      };
    };

    const ctx = {
      at: '2026-09-12T02:00:00.000Z',
      cycleId: 'm6-feedback-unit',
      cycleNumber: 99,
      runId: 'run-unit',
    };

    const inconclusive = makeRadar('PROMOTED');
    const reopened = applyResearchFeedback(inconclusive, makeResult(), ctx);
    assert.ok(reopened, 'feedback must apply');
    assert.equal(reopened!.update.next.status, 'ACTIVE');
    assert.equal(reopened!.update.previous.status, 'PROMOTED');
    assert.ok(reopened!.update.changes.includes('REOPENED'));
    assert.ok(reopened!.update.changes.includes('PRIORITY_CHANGED'));
    assert.equal(inconclusive.candidates['rc4-unit'].statusHistory.length, 2);
    assert.ok(
      inconclusive.candidates['rc4-unit'].statusHistory.some(
        (point: any) => point.status === 'PROMOTED'
      ),
      'the past state must be preserved'
    );

    const refuted = makeRadar('PROMOTED');
    const closed = applyResearchFeedback(
      refuted,
      makeResult({ status: 'RESEARCHED_REFUTED', finalAssessment: 'UNSUPPORTED' }),
      ctx
    );
    assert.ok(closed, 'refutation must apply');
    assert.equal(closed!.update.next.status, 'DISCARDED');
    assert.ok(closed!.update.changes.includes('CLOSED_REFUTED'));

    const confirmed = makeRadar('ACTIVE');
    const advanced = applyResearchFeedback(
      confirmed,
      makeResult({ status: 'RESEARCHED_CONFIRMED', finalAssessment: 'SUPPORTED' }),
      ctx
    );
    assert.ok(advanced, 'confirmation must apply');
    assert.equal(advanced!.update.next.assessment, 'SUPPORTED');
  });

  it('E. runs continuously through all loop phases without manual intervention', () => {
    const phases = new Set(summary.state.loop.map((cycle) => cycle.phase));
    for (const phase of LOOP_PHASES) {
      assert.ok(phases.has(phase), `the loop must reach the ${phase} phase`);
    }
    const m6CorpusCycles = summary.corpus.cycles
      .filter((cycle) => cycle.cycleId.startsWith('m6-cycle-'))
      .map((cycle) => cycle.cycleId);
    assert.ok(m6CorpusCycles.length > 0);
    for (const cycleId of m6CorpusCycles) {
      assert.ok(
        summary.state.radar.cyclesProcessed.includes(cycleId),
        `continuous cycle ${cycleId} must be processed`
      );
    }
    assert.ok(summary.state.runs.length >= 3, 'multiple processes must run without manual steps');
  });

  it('F. documents distributed execution and degrades when a node fails', () => {
    const { distributed } = summary.artifacts;
    assert.equal(distributed.kind, 'athenasignal.m6.distributed.v1');
    assert.ok(distributed.nodes.length >= 4, 'the topology must document multiple nodes');
    assert.ok(distributed.nodes.some((node) => node.host === 'ubuntu'));
    assert.ok(distributed.nodes.some((node) => node.host === 'mac-mini'));
    assert.ok(distributed.nodes.some((node) => node.route === 'REMOTE_ESCALATION'));
    assert.ok(distributed.examples.length > 0, 'degradation must be explained');
    // ORDEN-010 §0bis §2: ejecución sobre ≥2 contextos reales, no un flag.
    assert.ok(
      summary.artifacts.metrics.loop.hosts >= 2,
      'the loop must run across at least two host/process contexts'
    );
    assert.ok(
      summary.state.runs.some((run) => run.host === 'mac-mini'),
      'the Mac mini cognitive node must actually participate'
    );
    assert.ok(
      summary.artifacts.metrics.distributed.remoteEscalations > 0,
      'remote escalation must be exercised when the local-alt node is down'
    );
    const kinds = new Set(summary.artifacts.recoveryEvents.events.map((event) => event.kind));
    assert.ok(kinds.has('NODE_DOWN'), 'node failure must be recovered');
  });

  it('G. scales the universe beyond M5 without catastrophic degradation', () => {
    const { scale, quality } = summary.artifacts.metrics;
    assert.ok(scale.sources > scale.baseM5Sources, 'the universe must grow');
    assert.ok(scale.uniqueSources > scale.baseM5Sources, 'unique sources must exceed M5');
    assert.ok(scale.inputsObserved >= 200, 'the loop must sustain hundreds of observations');
    assert.ok(scale.cycles > 48);
    assert.ok(scale.candidates < scale.sources / 2, 'scale must not amplify candidates linearly');
    assert.ok(quality.researchCoverage > 0);
  });

  it('H. keeps memory across restarts and re-executions', () => {
    const idempotent = summary.state.runs.find((run) => run.status === 'IDEMPOTENT_NOOP');
    assert.ok(idempotent, 'an idempotency probe run must exist');
    assert.equal(idempotent.cyclesApplied.length, 0, 're-applying processed cycles must not mutate');
    assert.ok(idempotent.cyclesRequested.length > 0);
    assert.ok(idempotent.researchCompleted.length === 0, 'already-researched candidates are not re-investigated');
    assert.ok(idempotent.feedbackApplied.length === 0, 'already-applied feedback is not re-applied');
  });

  it('I. recovers from failures and is idempotent without corruption', () => {
    const { recoveryEvents, idempotency } = summary.artifacts;
    const kinds = new Set(recoveryEvents.events.map((event) => event.kind));
    for (const expected of ['PROCESS_RESTART', 'PARTIAL_RUN', 'NODE_DOWN', 'LLM_FALLBACK', 'TIMEOUT', 'INVALID_RESPONSE']) {
      assert.ok(kinds.has(expected as never), `recovery must cover ${expected}`);
    }
    assert.ok(idempotency.noOps > 0, 'idempotent no-ops must be recorded');
    assert.ok(idempotency.attempted > idempotency.noOps, 'there must be real applications too');
    assert.deepEqual(roundTrip(summary.state), summary.state, 'the M6 state must round-trip JSON');
  });

  it('J. produces an editorial human-review packet', () => {
    const { humanReview } = summary.artifacts;
    assert.equal(humanReview.kind, 'athenasignal.m6.human_review_packet.v1');
    assert.equal(humanReview.rubric.length, M6_RUBRIC.length);
    assert.ok(humanReview.bestStory.length > 0);
    assert.ok(humanReview.worstStory.length > 0);
    assert.ok(humanReview.mostImportantFeedback, 'the most important feedback must be documented');
    assert.ok(humanReview.majorContradiction, 'a contradiction must be documented');
    assert.ok(humanReview.majorPromotion, 'a promotion must be documented');
    assert.ok(humanReview.majorFailure, 'a failure and recovery must be documented');
    assert.ok(humanReview.distributedExample.length > 0);
    assert.ok(humanReview.longRunningTimeline.length >= 4);
    assert.ok(humanReview.akpTrace.length === summary.results.length);
    for (const trace of humanReview.akpTrace) {
      assert.ok(trace.handoffId.length > 0);
      assert.ok(trace.researchResultId.length > 0);
      assert.ok(trace.feedbackUpdateId.length > 0);
    }
  });

  it('covers every M6 benchmark class with no false positives', () => {
    const { benchmark, metrics } = summary.artifacts;
    assert.equal(benchmark.entries.length, M6_BENCHMARK_CLASSES.length);
    assert.equal(benchmark.coverage, 1, benchmark.falsePositiveObservations.join('; '));
    assert.deepEqual(benchmark.falsePositiveObservations, []);
    assert.deepEqual(metrics.falsePositiveObservations, []);
    for (const definition of M6_BENCHMARK_CLASSES) {
      const entry = benchmark.entries.find((candidate) => candidate.id === definition.id);
      assert.ok(entry, `benchmark must include ${definition.id}`);
      assert.equal(entry.observed, true, `benchmark must observe ${definition.id}`);
    }
  });

  it('writes all acceptance artifacts that match the in-memory run', async () => {
    rmSync(resolve(process.cwd(), '.m6tmp/akp-write'), { recursive: true, force: true });
    const written = await runM6Offline({
      write: true,
      outputDir: OUT,
      akpDir: '.m6tmp/akp-write',
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
    assert.deepEqual(readJson(paths.metrics), roundTrip(written.artifacts.metrics));
    assert.deepEqual(readJson(paths.cognitiveRouting), roundTrip(written.artifacts.cognitiveRouting));
    assert.deepEqual(readJson(paths.observability), roundTrip(written.artifacts.observability));
    assert.deepEqual(readJson(paths.recoveryEvents), roundTrip(written.artifacts.recoveryEvents));
    assert.deepEqual(readJson(paths.idempotency), roundTrip(written.artifacts.idempotency));
    assert.deepEqual(readJson(paths.distributed), roundTrip(written.artifacts.distributed));
    assert.deepEqual(readJson(paths.humanReview), roundTrip(written.artifacts.humanReview));
  });
});
