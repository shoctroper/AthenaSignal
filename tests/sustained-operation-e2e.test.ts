import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  runM8Offline,
  verifyM8Corpus,
  outputPathsFor,
  loadWindowRecording,
  M8_BENCHMARK_CLASSES,
  M8_RUBRIC,
  M8_TICKS,
  type M8RunSummary,
} from '../src/sustained/index.ts';

const AKP = '.m8tmp/m8-akp-test';
const OUT = '.m8tmp/m8-write-out';
const EXPECTED_OUTPUTS = [
  'corpus.json',
  'benchmark.json',
  'scheduler.json',
  'operation-timeline.json',
  'radar-state.json',
  'akp-live.json',
  'athenaos-real.json',
  'feedback-updates.json',
  'epistemic-resolutions.json',
  'contradictions.json',
  'distributed.json',
  'recovery-events.json',
  'idempotency.json',
  'provenance.json',
  'handoff-trace.json',
  'metrics.json',
  'observability.json',
  'cost.json',
  'human-review-packet.json',
];

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

async function fresh(dir: string): Promise<M8RunSummary> {
  rmSync(resolve(process.cwd(), dir), { recursive: true, force: true });
  return runM8Offline({ write: false, akpDir: dir });
}

describe('Sustained Autonomous Editorial Operation E2E - M8 (offline, longitudinal, real engines)', () => {
  let summary: M8RunSummary;

  before(async () => {
    rmSync(resolve(process.cwd(), AKP), { recursive: true, force: true });
    summary = await runM8Offline({ write: false, akpDir: AKP });
  });

  it('runs the sustained loop deterministically without network', async () => {
    const first = await fresh('.m8tmp/m8-det-1');
    const second = await fresh('.m8tmp/m8-det-2');

    assert.deepEqual(first.scheduler, second.scheduler, 'M8 scheduler must be deterministic');
    assert.deepEqual(first.artifacts.metrics, second.artifacts.metrics);
    assert.deepEqual(first.artifacts.epistemicResolutions, second.artifacts.epistemicResolutions);
    assert.deepEqual(first.artifacts.recoveryEvents, second.artifacts.recoveryEvents);
    assert.deepEqual(first.missingRecordings, [], 'M8 replay of the enlarged window must be complete');
  });

  it('builds an M8 corpus materially larger than M7 (>= 1000 unique sources)', () => {
    const corpus = summary.artifacts.corpus;
    assert.equal(corpus.kind, 'athenasignal.m8.corpus.v1');
    assert.deepEqual(verifyM8Corpus(corpus), [], 'M8 corpus must verify offline');
    assert.ok(corpus.sources.length >= 1000, 'M8 must reach >= 1000 unique sources');
    assert.equal(corpus.baseM7SourceCount, 500, 'the M7 base must be preserved');
    assert.equal(corpus.m8SourceIds.length, 1000, 'M8 continuity channels must be material');
    const ids = corpus.sources.map((source) => source.id);
    assert.equal(new Set(ids).size, ids.length, 'source identities must be unique');
    assert.ok(
      corpus.sources.every((source) => source.url.startsWith('http') && source.contentHash.length === 64),
      'every source must carry real provenance and a content hash'
    );
    assert.ok(corpus.cycles.length > 104, 'M8 must continue beyond the M7 schedule');
  });

  it('A. sustains a prolonged scheduler window with real processes and restarts', () => {
    const scheduler = summary.artifacts.scheduler;
    assert.equal(scheduler.kind, 'athenasignal.m8.scheduler.v1');
    assert.equal(scheduler.tickCount, M8_TICKS);
    assert.equal(scheduler.ticks.length, M8_TICKS);
    assert.ok(scheduler.durationMs > 0, 'the window must have a positive duration');
    assert.ok(scheduler.ticks.every((tick) => tick.phases.length >= 8), 'every tick runs the full phase set');
    const crashed = scheduler.processes.filter((process) => process.status === 'CRASHED');
    const resumed = scheduler.processes.filter((process) => process.resumedFrom);
    assert.ok(crashed.length >= 1, 'a process must crash and be recovered');
    assert.ok(resumed.length >= 1, 'a process must resume from the crashed one');
    assert.ok(scheduler.ticks.some((tick) => tick.status === 'CRASHED'), 'the crash must be observable in the timeline');

    const hosts = new Map(scheduler.hosts.map((host) => [host.host, host]));
    assert.equal(hosts.get('athena')?.reachable, true, 'the Ubuntu node must be reported reachable');
    assert.equal(hosts.get('mac-mini')?.reachable, false, 'the Mac mini must be documented as unreachable');
  });

  it('B. uses real engines/infrastructure and documents the unavailable node', () => {
    const engines = summary.artifacts.athenaosReal.engines;
    assert.equal(engines.kind, 'athenasignal.m8.real_engines.v1');
    const ok = engines.invocations.filter((entry) => entry.status === 'OK');
    assert.ok(ok.length >= 1, 'at least one real engine invocation must succeed');
    assert.ok(ok.some((entry) => entry.engine === 'athenaos'), 'AthenaOS must be invoked for real');
    assert.ok(ok.some((entry) => entry.engine === 'ubuntu-node'), 'the Ubuntu node must be invoked for real');
    const macmini = engines.invocations.find((entry) => entry.engine === 'macmini-node');
    assert.ok(macmini, 'the Mac mini probe must be recorded');
    assert.equal(macmini!.status, 'UNREACHABLE', 'the Mac mini must be documented as unreachable, not simulated');
    for (const invocation of engines.invocations) {
      assert.equal(invocation.stdoutSha256.length, 64, 'invocations must carry a reproducible output hash');
    }
  });

  it('C. observes the enlarged universe continuously (new/known/duplicate events)', () => {
    const radar = summary.artifacts.radarState;
    assert.ok((radar.eventCounts.NEW ?? 0) > 0, 'new signals must be discovered');
    assert.ok((radar.eventCounts.KNOWN ?? 0) > 0, 'known material must reappear with identity preserved');
    assert.ok((radar.eventCounts.DUPLICATE ?? 0) > 0, 'duplicate sources must not be reprocessed');
    assert.ok(
      radar.cyclesProcessed.some((cycleId) => cycleId.startsWith('m8-cycle-')),
      'M8 cycles must be processed by the scheduler'
    );
    assert.equal(new Set(radar.cyclesProcessed).size, radar.cyclesProcessed.length, 'a cycle is never processed twice');
    assert.ok(summary.artifacts.metrics.sustained.observationCycles > 0, 'observation cycles must be non-zero');
  });

  it('D. researches candidates during the operation and returns results', () => {
    const { metrics, athenaosReal } = summary.artifacts;
    assert.ok(metrics.research.m8Results > 0, 'M8 must run new research waves during the operation');
    assert.ok(
      athenaosReal.m8Results.every((result) => result.resultId.startsWith('aos-m8-w')),
      'M8 results must be traced as M8 waves'
    );
    assert.ok(metrics.sustained.researchWaves >= 2, 'research must be sustained across waves');
    assert.ok(metrics.sustained.candidatesResearched > 0, 'candidates must be researched during the operation');
    for (const result of athenaosReal.m8Results) {
      assert.ok(result.handoffContentHash.length === 64, 'every handoff must carry a content hash');
      assert.ok(result.evidenceBalance !== undefined, 'every result must carry an evidence balance');
    }
  });

  it('E. produces coherent, evidence-driven epistemic states without overwriting history', () => {
    const resolutions = summary.artifacts.epistemicResolutions.resolutions;
    assert.ok(resolutions.length >= 7, 'every candidate must have an epistemic resolution');
    for (const resolution of resolutions) {
      assert.equal(resolution.kind, 'athenasignal.m7.epistemic_resolution.v1');
      assert.ok(resolution.statusHistory.length >= 1, `${resolution.candidateId} must preserve status history`);
      for (let i = 1; i < resolution.statusHistory.length; i += 1) {
        assert.equal(
          resolution.statusHistory[i].from,
          resolution.statusHistory[i - 1].to,
          `${resolution.candidateId} history must chain without gaps`
        );
      }
      for (const transition of resolution.statusHistory) {
        assert.ok(transition.reason.length > 0, 'transitions must explain the why');
        assert.ok(transition.evidenceRefs.length > 0 || transition.wave === 0, 'transitions must cite evidence');
        assert.ok(transition.provenance.length > 0 || transition.wave === 0, 'transitions must carry provenance');
      }
    }
    const byStatus = summary.artifacts.epistemicResolutions.byStatus;
    assert.ok(byStatus.CLOSED_REFUTED.includes('rc4-cl-ketobig'), 'the established refutation must be preserved');
    assert.ok(byStatus.CLOSED_CONFIRMED.length >= 1, 'a confirmed closure must be preserved');
    assert.ok(byStatus.PROMOTED.length >= 1, 'a promotion must be preserved');
    assert.ok((byStatus.INCONCLUSIVE.length + byStatus.DEMOTED.length) >= 1, 'open candidates must remain tracked');
    assert.ok(summary.artifacts.metrics.epistemic.transitions > 0);
    assert.ok(summary.artifacts.metrics.epistemic.evidenceDriven > 0, 'transitions must be evidence-driven');
  });

  it('F. represents contradictions and keeps complete provenance', () => {
    const { contradictions, provenance, handoffTrace } = summary.artifacts;
    assert.ok(contradictions.contradictions.length > 0, 'contradictions must be represented');
    assert.ok(contradictions.resolved >= 1, 'a contradiction must be resolved');
    assert.ok(contradictions.conserved >= 1, 'a contradiction must be conserved');
    for (const contradiction of contradictions.contradictions) {
      assert.ok(contradiction.statements.length > 0, 'contradictions must state the tension');
      assert.ok(['RESOLVED', 'CONSERVED'].includes(contradiction.kind));
    }
    assert.ok(provenance.edges.length > 0);
    assert.deepEqual(provenance.missingChains, [], 'every candidate must have a complete provenance chain');
    assert.ok(provenance.completeChains >= 7);
    assert.equal(handoffTrace.delivered, handoffTrace.consumed);
    assert.equal(handoffTrace.consumed, handoffTrace.returned);
    for (const entry of handoffTrace.trace) {
      assert.ok(entry.handoffId.length > 0);
      assert.ok(entry.researchResultId.length > 0);
      assert.ok(entry.feedbackUpdateId.length > 0);
      assert.ok(entry.contentHash.length === 64);
    }
  });

  it('G. recovers from failures and is idempotent without corrupting memory', () => {
    const recovery = summary.artifacts.recoveryEvents;
    const kinds = new Set(recovery.events.map((event) => event.kind));
    for (const expected of ['PROCESS_RESTART', 'PARTIAL_RUN', 'NODE_DOWN', 'LLM_FALLBACK', 'TIMEOUT', 'INVALID_RESPONSE']) {
      assert.ok(kinds.has(expected as never), `recovery must cover ${expected}`);
    }
    const idempotency = summary.artifacts.idempotency;
    assert.ok(idempotency.noOps > 0, 'idempotent no-ops must be recorded');
    assert.ok(idempotency.attempted > idempotency.noOps, 'there must be real applications too');
    assert.deepEqual(roundTrip(summary.artifacts.metrics), summary.artifacts.metrics, 'metrics must round-trip JSON');
  });

  it('H. covers every M8 benchmark class with no false positives', () => {
    const { benchmark } = summary.artifacts;
    assert.equal(benchmark.entries.length, M8_BENCHMARK_CLASSES.length);
    assert.equal(benchmark.coverage, 1, benchmark.falsePositiveObservations.join('; '));
    assert.deepEqual(benchmark.falsePositiveObservations, []);
    for (const definition of M8_BENCHMARK_CLASSES) {
      const entry = benchmark.entries.find((candidate) => candidate.id === definition.id);
      assert.ok(entry, `benchmark must include ${definition.id}`);
      assert.equal(entry!.observed, true, `benchmark must observe ${definition.id}`);
    }
  });

  it('I. produces an editorial human-review packet and metrics', () => {
    const { humanReview, metrics, cost } = summary.artifacts;
    assert.equal(humanReview.kind, 'athenasignal.m8.human_review_packet.v1');
    assert.equal(humanReview.rubric.length, M8_RUBRIC.length);
    assert.ok(humanReview.durationMs > 0);
    assert.ok(humanReview.timeline.length > 0);
    assert.ok(humanReview.bestStory.length > 0);
    assert.ok(humanReview.worstStory.length > 0);
    assert.ok(humanReview.confirmedCase, 'the confirmed case must be documented');
    assert.ok(humanReview.refutedCase, 'the refuted case must be documented');
    assert.ok(humanReview.closure, 'a closure must be documented');
    assert.ok(humanReview.ubuntuExecution.length > 0, 'Ubuntu execution must be documented');
    assert.ok(humanReview.akpToAthenaOsToAkpTrace.length === summary.artifacts.handoffTrace.trace.length);
    assert.ok(metrics.quality.resolutionCoverage > 0);
    assert.ok(metrics.performance.avgTickMs > 0);
    assert.equal(cost.kind, 'athenasignal.m8.cost.v1');
    assert.ok(cost.llmCalls >= 0);
  });

  it('J. runs the scheduler on a real-clock operation window with verifiable timestamps', () => {
    const recording = loadWindowRecording();
    assert.ok(recording, 'the real-clock window recording must exist');
    assert.equal(recording!.mode, 'real-clock');
    assert.ok(recording!.ticks.length >= 1);
    assert.ok(
      recording!.durationMs >= 20 * 60 * 1000,
      `the real window must last >= 20 minutes (got ${(recording!.durationMs / 60000).toFixed(1)} min)`
    );
    assert.equal(summary.artifacts.scheduler.startedAt, recording!.startedAt);
    assert.equal(summary.artifacts.scheduler.endedAt, recording!.endedAt);
    assert.equal(summary.artifacts.scheduler.tickCount, recording!.ticks.length);
    for (const tick of summary.artifacts.scheduler.ticks) {
      const started = Date.parse(tick.startedAt);
      const ended = Date.parse(tick.endedAt);
      assert.ok(Number.isFinite(started) && Number.isFinite(ended), 'tick timestamps must be real ISO instants');
      assert.ok(ended >= started, 'tick end must not precede its start');
      assert.ok(tick.durationMs >= 0);
    }
    const crashed = summary.artifacts.scheduler.processes.filter((process) => process.status === 'CRASHED');
    assert.ok(crashed.length >= 1, 'the real window must include a process crash');
    assert.ok(
      summary.artifacts.scheduler.processes.some((process) => process.resumedFrom),
      'a process must resume after the crash'
    );
  });

  it('K. captures a real AthenaOS research job and a real AKP ingestion end-to-end', () => {
    const research = summary.artifacts.athenaosReal.realResearch;
    assert.ok(research, 'the real AthenaOS research recording must be surfaced');
    assert.match(research!.caseId, /^[0-9a-f-]{36}$/);
    assert.ok(research!.claims > 0, 'the real AthenaOS case must contain claims');
    assert.ok(research!.knowledgeFacts > 0, 'the AKP knowledge bridge must feed AthenaOS');
    assert.ok(research!.provider.length > 0);
    assert.ok(
      summary.artifacts.athenaosReal.engines.invocations.some(
        (entry) => entry.engine === 'athenaos' && entry.command.includes(' run ')
      ),
      'AthenaOS must be invoked with a real research run'
    );
    const ingestion = summary.artifacts.akpLive.ingestion;
    assert.ok(ingestion, 'the real AKP ingestion recording must be surfaced');
    assert.ok(ingestion!.documentsImported > 0 && ingestion!.knownFactsWritten > 0);
    assert.ok(ingestion!.bridgedFacts > 0, 'AKP facts must be bridged to AthenaOS');
    assert.ok(summary.artifacts.humanReview.realResearch, 'human review must include the real research');
    assert.ok(summary.artifacts.humanReview.akpIngestion, 'human review must include the AKP ingestion');
  });

  it('writes all acceptance artifacts that match the in-memory run', async () => {
    rmSync(resolve(process.cwd(), OUT), { recursive: true, force: true });
    const written = await runM8Offline({
      write: true,
      outputDir: OUT,
      akpDir: '.m8tmp/m8-write-akp',
    });
    for (const file of EXPECTED_OUTPUTS) {
      const path = resolve(process.cwd(), OUT, file);
      assert.ok(existsSync(path), `${file} must exist`);
      assert.equal(typeof readJson(path), 'object', `${file} must be a JSON object`);
    }
    const paths = outputPathsFor(OUT);
    assert.deepEqual(readJson(paths.corpus), roundTrip(written.artifacts.corpus));
    assert.deepEqual(readJson(paths.benchmark), roundTrip(written.artifacts.benchmark));
    assert.deepEqual(readJson(paths.scheduler), roundTrip(written.artifacts.scheduler));
    assert.deepEqual(readJson(paths.operationTimeline), roundTrip(written.artifacts.operationTimeline));
    assert.deepEqual(readJson(paths.radarState), roundTrip(written.artifacts.radarState));
    assert.deepEqual(readJson(paths.akpLive), roundTrip(written.artifacts.akpLive));
    assert.deepEqual(readJson(paths.athenaosReal), roundTrip(written.artifacts.athenaosReal));
    assert.deepEqual(readJson(paths.feedbackUpdates), roundTrip(written.artifacts.feedbackUpdates));
    assert.deepEqual(readJson(paths.epistemicResolutions), roundTrip(written.artifacts.epistemicResolutions));
    assert.deepEqual(readJson(paths.contradictions), roundTrip(written.artifacts.contradictions));
    assert.deepEqual(readJson(paths.distributed), roundTrip(written.artifacts.distributed));
    assert.deepEqual(readJson(paths.recoveryEvents), roundTrip(written.artifacts.recoveryEvents));
    assert.deepEqual(readJson(paths.idempotency), roundTrip(written.artifacts.idempotency));
    assert.deepEqual(readJson(paths.provenance), roundTrip(written.artifacts.provenance));
    assert.deepEqual(readJson(paths.handoffTrace), roundTrip(written.artifacts.handoffTrace));
    assert.deepEqual(readJson(paths.metrics), roundTrip(written.artifacts.metrics));
    assert.deepEqual(readJson(paths.observability), roundTrip(written.artifacts.observability));
    assert.deepEqual(readJson(paths.cost), roundTrip(written.artifacts.cost));
    assert.deepEqual(readJson(paths.humanReview), roundTrip(written.artifacts.humanReview));
  });
});
