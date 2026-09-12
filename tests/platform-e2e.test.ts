import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  runM5Offline,
  verifyM5Corpus,
  DEFAULT_M5_OUTPUT_DIR,
  M5_BENCHMARK_CLASSES,
  M5_RUBRIC,
  COGNITIVE_ROUTES,
  DEFAULT_ROUTE_POLICY,
  AkpHandoffSink,
  AkpInboxConsumer,
  AKP_CONSUMER_ID,
  LocalEmbeddingProvider,
  hashEmbedding,
  cosineSimilarity,
  type M5RunSummary,
} from '../src/platform/index.ts';
import { HandoffValidator } from '../src/handoff/HandoffValidator.ts';

const OUT = DEFAULT_M5_OUTPUT_DIR;
const EXPECTED_OUTPUTS = [
  'corpus.json',
  'benchmark.json',
  'run-timeline.json',
  'radar-state.json',
  'metrics.json',
  'cognitive-routing.json',
  'observability.json',
  'recovery-events.json',
  'idempotency.json',
  'akp-handoff.json',
  'human-review-packet.json',
];

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('Autonomous Editorial Intelligence Platform E2E - M5 (offline, longitudinal, multi-process)', () => {
  let summary: M5RunSummary;

  before(async () => {
    summary = await runM5Offline({ write: false });
  });

  it('replays the frozen corpus deterministically without network across restarts', async () => {
    const first = await runM5Offline({ write: false });
    const second = await runM5Offline({ write: false });

    assert.deepEqual(first.state, second.state, 'M5 platform state must be deterministic');
    assert.deepEqual(first.artifacts.metrics, second.artifacts.metrics);
    assert.deepEqual(first.missingRecordings, second.missingRecordings);
    assert.deepEqual(first.missingRecordings, [], 'the offline replay must be complete (ORDEN-009 §0bis.2)');
    assert.equal(first.artifacts.metrics.llm.replayMisses, 0, 'llm.replayMisses must be zero');
    assert.ok(
      first.artifacts.metrics.llm.realResponses > 0,
      'the recorded real cognition must participate'
    );
  });

  it('builds an M5 corpus that extends M4 with multi-source and multilingual material', async () => {
    const { corpus } = summary.artifacts;
    assert.equal(corpus.kind, 'athenasignal.m5.corpus.v1');
    assert.deepEqual(verifyM5Corpus(corpus), [], 'M5 corpus must verify offline');

    assert.ok(corpus.cycles.length > 6, 'M5 must continue beyond the 6 M4 cycles');
    assert.equal(corpus.cycles.length, 48, 'M5 must run a long-term cycle schedule');
    assert.ok(corpus.sources.length > 10, 'M5 must observe more sources than M4');
    assert.ok(corpus.sources.length >= 50, 'M5 must reach material scale in unique real sources');
    assert.ok(corpus.extendedSourceIds.length >= 40, 'M5 must add many extended real observation channels');

    const extended = new Set(corpus.extendedSourceIds);
    assert.equal(extended.size, corpus.extendedSourceIds.length, 'extended source ids must be unique');
    assert.ok(
      corpus.sources.every((source) => source.url.startsWith('http') && source.contentHash.length === 64),
      'every extended source must carry real provenance and a content hash'
    );

    const languages = new Set(corpus.sources.map((source) => source.language));
    assert.ok(languages.has('en') && languages.has('es'), 'multilingual material must be preserved');

    for (const cycle of corpus.cycles) {
      assert.ok(cycle.sourceIds.length > 0, `cycle ${cycle.cycleId} must observe at least one source`);
    }
  });

  it('keeps long-term memory: historical identity survives restart without resetting the universe', () => {
    const state = summary.state;
    assert.equal(state.importedFrom, 'evidence/m4/radar-state.json', 'M5 must import the M4 radar state');
    assert.equal(state.radar.cyclesProcessed[0], 'm4-cycle-1', 'historical cycles must be preserved');
    assert.equal(new Set(state.radar.cyclesProcessed).size, state.radar.cyclesProcessed.length);

    const creatine = state.radar.signals['sig-src-creatine-pmc-1'];
    assert.ok(creatine, 'the M4 creatine signal must survive');
    assert.equal(creatine.firstSeenCycle, 'm4-cycle-1', 'first-seen cycle must not be reset');
    assert.ok(creatine.seenCount > 3, 'the known signal must accumulate sightings over time');
    assert.ok(creatine.lastSeenCycle.startsWith('m5-cycle-'), 'the signal must be re-observed in M5');

    const candidate = state.radar.candidates['rc4-cl-suplementacion-de-creatina'];
    assert.ok(candidate, 'the promoted M4 candidate identity must persist');
    assert.equal(candidate.firstCycle, 'm4-cycle-1');
    assert.equal(candidate.status, 'PROMOTED');
  });

  it('runs a multi-process lifecycle: START → CRASH → RESTART → RESUME → IDEMPOTENT', () => {
    const state = summary.state;
    assert.equal(state.runs.length, 4, 'the platform must show multiple process runs');

    const crashed = state.runs.find((run) => run.status === 'CRASHED');
    assert.ok(crashed, 'a simulated process death must be recorded');
    assert.ok(crashed.crashAt, 'the crash must record when it happened');
    assert.ok(crashed.cyclesApplied.length < 6, 'the crashed run must have applied only a partial slice');

    const resumed = state.runs.find((run) => run.resumedFrom === crashed.runId);
    assert.ok(resumed, 'a later process must resume from the crashed run');
    assert.equal(resumed.status, 'COMPLETED');
    assert.ok(resumed.cyclesApplied.length > 0);

    const idempotent = state.runs.find((run) => run.status === 'IDEMPOTENT_NOOP');
    assert.ok(idempotent, 'an idempotency probe run must exist');
    assert.equal(idempotent.cyclesApplied.length, 0, 're-applying processed cycles must not mutate state');
    assert.ok(idempotent.cyclesRequested.length > 0);

    const processes = new Set(state.runs.map((run) => run.processId));
    assert.ok(processes.size >= 3, 'several processes must share the persistent state');
  });

  it('persists the state atomically and survives JSON round-trip', () => {
    const state = summary.state;
    assert.equal(state.kind, 'athenasignal.m5.platform_state.v1');
    assert.deepEqual(roundTrip(state), state, 'the platform state must round-trip through JSON');
    const serialized = JSON.stringify(state);
    assert.ok(serialized.length > 0);
  });

  it('deduplicates sources/signals idempotently and never duplicates identity', () => {
    const state = summary.state;
    const events = state.radar.eventCounts;
    assert.ok((events.DUPLICATE ?? 0) > 0, 'repeated sources must raise DUPLICATE');
    assert.ok((events.KNOWN ?? 0) > 0, 'known signals must raise KNOWN');

    const cycleIds = state.radar.cyclesProcessed;
    assert.equal(new Set(cycleIds).size, cycleIds.length, 'cycles must never be processed twice');

    const signalIds = Object.keys(state.radar.signals);
    assert.equal(new Set(signalIds).size, signalIds.length, 'signal identities must be unique');
    const candidateIds = Object.keys(state.radar.candidates);
    assert.equal(new Set(candidateIds).size, candidateIds.length, 'candidate identities must be unique');
  });

  it('records explicit idempotency evidence at the cycle and handoff levels', () => {
    const { idempotency } = summary.artifacts;
    assert.ok(idempotency.noOps > 0, 'idempotent no-ops must be recorded');
    assert.ok(idempotency.attempted > idempotency.noOps, 'there must be real applications too');
    assert.ok(idempotency.records.every((record) => record.attempts >= 1));

    const cycleRecords = idempotency.records.filter((record) => record.kind === 'CYCLE');
    assert.ok(cycleRecords.length >= 12, 'each requested cycle must be recorded');
  });

  it('recovers from node failure, timeout, invalid response, partial run and process death', () => {
    const { recoveryEvents } = summary.artifacts;
    const kinds = new Set(recoveryEvents.events.map((event) => event.kind));
    for (const expected of ['PROCESS_RESTART', 'PARTIAL_RUN', 'LLM_FALLBACK', 'NODE_DOWN', 'TIMEOUT', 'INVALID_RESPONSE']) {
      assert.ok(kinds.has(expected as never), `recovery must cover ${expected}`);
    }
    assert.ok(recoveryEvents.events.every((event) => event.detail.trim().length > 0));
  });

  it('routes cognition by stage with local-first policy, escalation and safe fallback', () => {
    const { cognitiveRouting } = summary.artifacts;
    for (const stage of Object.keys(DEFAULT_ROUTE_POLICY)) {
      assert.ok(cognitiveRouting.policy[stage], `routing policy must cover ${stage}`);
      assert.ok(cognitiveRouting.policy[stage].length > 0);
    }
    assert.ok(cognitiveRouting.decisions.length > 0, 'routing decisions must be observable');
    assert.ok(cognitiveRouting.byRoute.LOCAL > 0, 'the local node must be used');
    assert.ok(cognitiveRouting.byRoute.LOCAL_ALT > 0, 'the local-alt node must be used for judgement');
    assert.ok(cognitiveRouting.byRoute.REMOTE_ESCALATION >= 1, 'justified remote escalation must be exercised');
    assert.ok(cognitiveRouting.fallbackReasons.length > 0, 'fallbacks must be explainable');

    for (const decision of cognitiveRouting.decisions) {
      assert.ok(COGNITIVE_ROUTES.includes(decision.route), `unexpected route ${decision.route}`);
      assert.ok(decision.reason.trim().length > 0);
      assert.ok(decision.runId.length > 0);
    }
  });

  it('isolates the embedding provider locally and reproducibly', () => {
    const a = hashEmbedding('creatina y salud renal');
    const b = hashEmbedding('creatina y salud renal');
    assert.deepEqual(a, b, 'embeddings must be deterministic');
    assert.equal(cosineSimilarity(a, b), 1, 'identical texts must be maximally similar');
    const c = hashEmbedding('kafka frente a rabbitmq');
    assert.ok(cosineSimilarity(a, c) < 0.99, 'different topics must not collapse to identical vectors');
  });

  it('delivers validated AKP handoffs to a real sink and suppresses duplicates', () => {
    const { akpHandoff } = summary.artifacts;
    assert.equal(akpHandoff.kind, 'athenasignal.m5.akp_handoff.v1');
    assert.ok(akpHandoff.deliveries.length >= 1, 'at least one handoff must be delivered');
    assert.ok(akpHandoff.deliveries.some((delivery) => delivery.status === 'DELIVERED_TO_SINK'));
    assert.ok(akpHandoff.deliveries.some((delivery) => delivery.status === 'DUPLICATE_SUPPRESSED'));

    const validator = new HandoffValidator();
    for (const delivery of akpHandoff.deliveries) {
      assert.equal(delivery.validation.valid, true, delivery.validation.errors.join('; '));
      assert.deepEqual(validator.validate(delivery.recommendedAthenaOsInput).errors, []);
      assert.equal(
        delivery.recommendedAthenaOsInput.kind,
        'athenasignal.research_candidate.handoff.v1'
      );
      if (delivery.status === 'DELIVERED_TO_SINK') {
        assert.equal(delivery.consumption.consumer, AKP_CONSUMER_ID, 'AKP must consume the handoff');
        assert.ok(delivery.consumption.consumedAt, 'the consumption must be timestamped');
      } else {
        assert.equal(delivery.consumption.consumer, null, 'a suppressed duplicate is never consumed');
      }
      assert.ok(delivery.consumption.limitation.length > 0, 'the AKP limitation must be documented');
    }

    assert.ok(akpHandoff.consumed > 0, 'the AKP consumer must ingest real handoffs (ORDEN-009 §0bis.3)');
    assert.ok(akpHandoff.consumption, 'the consumption artifact must be present');
    assert.equal(akpHandoff.consumption.consumer, AKP_CONSUMER_ID);
    assert.equal(akpHandoff.consumption.consumed, akpHandoff.consumed);
    assert.equal(
      akpHandoff.consumption.records.filter((record) => record.status === 'INGESTED').length,
      akpHandoff.consumption.ingested
    );

    // Un handoff idéntico reenviado se suprime sin degradar el original.
    const sink = new AkpHandoffSink({
      sinkDir: resolve(process.cwd(), '.m5tmp', 'sink-test'),
      embedding: new LocalEmbeddingProvider(),
      limitation: 'test',
      write: false,
    });
    const handoff = akpHandoff.deliveries[0].recommendedAthenaOsInput;
    const first = sink.deliver({
      handoffId: 'test-1',
      candidateId: 'test',
      clusterId: 'test',
      version: 1,
      deliveredAt: '2026-09-12T00:00:00.000Z',
      runId: 'test-run',
      recommendedAthenaOsInput: handoff,
    });
    const second = sink.deliver({
      handoffId: 'test-2',
      candidateId: 'test',
      clusterId: 'test',
      version: 2,
      deliveredAt: '2026-09-12T00:00:01.000Z',
      runId: 'test-run',
      recommendedAthenaOsInput: handoff,
    });
    assert.equal(first.delivery.status, 'DELIVERED_TO_SINK');
    assert.equal(second.delivery.status, 'DUPLICATE_SUPPRESSED');
    assert.equal(sink.deliverables()[0].status, 'DELIVERED_TO_SINK', 'the original must not be mutated');
  });

  it('ingests validated handoffs into a local AKP inbox with idempotent re-consumption', () => {
    const inbox = resolve(process.cwd(), '.m5tmp', 'akp-inbox-test');
    rmSync(inbox, { recursive: true, force: true });

    const consumer = new AkpInboxConsumer({ inboxDir: inbox, write: true });
    const result = consumer.consume(
      summary.artifacts.akpHandoff.deliveries,
      '2026-09-12T00:00:00.000Z'
    );
    assert.equal(result.consumer, AKP_CONSUMER_ID);
    assert.equal(result.consumed, summary.artifacts.akpHandoff.consumed);
    assert.ok(result.ingested > 0, 'the consumer must write handoffs to the AKP inbox');

    const index = JSON.parse(readFileSync(resolve(inbox, 'index.json'), 'utf8'));
    assert.equal(index.entries.length, result.ingested);

    const validator = new HandoffValidator();
    for (const entry of index.entries) {
      const file = JSON.parse(readFileSync(entry.inboxPath, 'utf8'));
      assert.deepEqual(validator.validate(file.recommendedAthenaOsInput).errors, []);
      assert.equal(file.kind, 'athenasignal.akp.inbox_entry.v1');
    }

    const again = new AkpInboxConsumer({ inboxDir: inbox, write: true }).consume(
      summary.artifacts.akpHandoff.deliveries,
      '2026-09-12T00:00:00.000Z'
    );
    assert.equal(again.consumed, result.consumed, 're-consuming must not change the consumed set');
    assert.equal(again.ingested, 0, 'idempotent re-consumption must not rewrite the inbox');
    assert.equal(again.duplicates, result.consumed);
  });

  it('never amplifies unsupported claims: nothing is born verified', () => {
    const state = summary.state;
    for (const delivery of state.akp.deliveries) {
      for (const fact of delivery.recommendedAthenaOsInput.proposedCandidateFacts) {
        assert.equal(fact.statusHint, 'UNVERIFIED', 'DU-001: nothing is born verified');
      }
      assert.notEqual(delivery.recommendedAthenaOsInput.origin.assessment, 'UNSUPPORTED');
    }
    for (const candidate of Object.values(state.radar.candidates)) {
      if (candidate.status === 'PROMOTED') {
        const cluster = state.radar.clusters[candidate.clusterId];
        assert.equal(cluster.contradiction, false, 'a promoted candidate must not have an open contradiction');
        assert.ok(cluster.sourceIds.length >= 2, 'promotion requires >= 2 independent sources');
      }
    }
  });

  it('covers every benchmark class with no false positives', () => {
    const { benchmark, metrics } = summary.artifacts;
    assert.equal(benchmark.entries.length, M5_BENCHMARK_CLASSES.length);
    assert.equal(benchmark.coverage, 1, `all classes must be observed: ${benchmark.falsePositiveObservations.join('; ')}`);
    assert.deepEqual(benchmark.falsePositiveObservations, []);
    assert.deepEqual(metrics.falsePositiveObservations, []);

    const observed = new Set(benchmark.entries.filter((entry) => entry.observed).map((entry) => entry.id));
    for (const expected of [
      'NEW',
      'KNOWN',
      'DUPLICATE',
      'RELATED',
      'AMBIGUOUS',
      'SUPPORTED',
      'UNSUPPORTED',
      'REFRAMED',
      'CONTRADICTED',
      'DISCARD',
      'PROMOTION',
      'PRIORITY_CHANGE',
      'MULTILINGUAL',
      'CROSS_SOURCE',
      'RECOVERED',
    ]) {
      assert.ok(observed.has(expected), `benchmark must cover ${expected}`);
    }
  });

  it('reports coherent scale and quality metrics', () => {
    const { metrics, state } = summary.artifacts;
    assert.equal(metrics.kind, 'athenasignal.m5.metrics.v1');
    assert.ok(metrics.inputsObserved >= 200, `M5 must sustain hundreds of inputs (got ${metrics.inputsObserved})`);
    assert.ok(metrics.uniqueSources >= 50, `M5 must observe >= 50 unique real sources (got ${metrics.uniqueSources})`);
    assert.ok(metrics.sources >= 50, 'the M5 corpus must carry a materially larger universe');
    assert.ok(metrics.extendedSources >= 40, 'extended real sources must be material');
    assert.ok(metrics.cycles >= 48, 'M5 must run far beyond M4 cycles');
    assert.equal(metrics.newSignals, state.radar.eventCounts.NEW ?? 0);
    assert.equal(metrics.knownSignals, state.radar.eventCounts.KNOWN ?? 0);
    assert.equal(metrics.duplicates, state.radar.eventCounts.DUPLICATE ?? 0);
    assert.equal(metrics.signalsTracked, Object.keys(state.radar.signals).length);
    assert.ok(metrics.multiSourceClusters >= 1, 'cross-source clusters must exist');
    assert.ok(metrics.averageSourcesPerCandidate > 0);
    assert.ok(metrics.languages.en > 0 && metrics.languages.es > 0);
    assert.ok(metrics.recovery.events >= 6);
    assert.ok(metrics.idempotency.noOps > 0);
    assert.ok(metrics.akp.delivered > 0 && metrics.akp.consumed > 0);
    assert.ok(
      metrics.candidates < metrics.sources / 2,
      'scale must not amplify candidates linearly (noise control)'
    );
    assert.ok(metrics.unsupported > 0 && metrics.ambiguous > 0 && metrics.reframed > 0);
  });

  it('exposes operational observability of what processed, failed and remains pending', () => {
    const { observability, state } = summary.artifacts;
    assert.equal(observability.kind, 'athenasignal.m5.observability.v1');
    assert.ok(observability.topology.nodes.length >= 3, 'the node topology must be documented');
    assert.ok(observability.topology.nodes.some((node) => node.route === 'LOCAL'));
    assert.ok(observability.runs.length === state.runs.length);
    assert.ok(observability.processed.cycles.length >= 48);
    assert.deepEqual(observability.pending.cycles, [], 'all scheduled cycles must be processed');
    assert.ok(observability.routing.decisions > 0);
    assert.ok(observability.cost.llmCalls > 0);
    assert.ok(observability.promoted.length >= 1);
  });

  it('produces a product-oriented human review packet', () => {
    const { humanReview } = summary.artifacts;
    assert.equal(humanReview.kind, 'athenasignal.m5.human_review_packet.v1');
    assert.equal(humanReview.rubric.length, M5_RUBRIC.length);
    assert.ok(humanReview.longitudinalStory.length >= 4, 'the packet must tell the longitudinal story');
    assert.ok(humanReview.bestCandidate, 'a best candidate is required');
    assert.ok(humanReview.newestDiscovery, 'a newest discovery is required');
    assert.ok(humanReview.priorityEvolution.length >= 1, 'priority evolution must be documented');
    assert.ok(humanReview.recovered.length >= 1, 'recoveries must be documented');
    assert.ok(humanReview.akpConsumption.consumed > 0, 'the packet must report real AKP consumption');
    assert.equal(humanReview.akpConsumption.consumer, AKP_CONSUMER_ID);
    assert.ok(humanReview.akpConsumption.limitation.length > 0);
    assert.ok(humanReview.promoted.length >= 1);
  });

  it('writes all acceptance artifacts that match the in-memory run', async () => {
    const written = await runM5Offline({ write: true });
    for (const file of EXPECTED_OUTPUTS) {
      const path = resolve(process.cwd(), OUT, file);
      assert.ok(existsSync(path), `${file} must exist`);
      assert.equal(typeof readJson(path), 'object', `${file} must be a JSON object`);
    }

    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'corpus.json')), roundTrip(written.artifacts.corpus));
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'benchmark.json')), roundTrip(written.artifacts.benchmark));
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'run-timeline.json')),
      roundTrip(written.artifacts.runTimeline)
    );
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'radar-state.json')), roundTrip(written.artifacts.state));
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'metrics.json')), roundTrip(written.artifacts.metrics));
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'cognitive-routing.json')),
      roundTrip(written.artifacts.cognitiveRouting)
    );
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'observability.json')),
      roundTrip(written.artifacts.observability)
    );
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'recovery-events.json')),
      roundTrip(written.artifacts.recoveryEvents)
    );
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'idempotency.json')),
      roundTrip(written.artifacts.idempotency)
    );
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'akp-handoff.json')),
      roundTrip(written.artifacts.akpHandoff)
    );
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'human-review-packet.json')),
      roundTrip(written.artifacts.humanReview)
    );
  });
});
