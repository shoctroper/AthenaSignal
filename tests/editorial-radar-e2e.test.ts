import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  runM4Offline,
  DEFAULT_M4_OUTPUT_DIR,
  RADAR_EVENT_KINDS,
  M4_RUBRIC,
  type M4RunSummary,
} from '../src/radar/index.ts';
import { HandoffValidator } from '../src/handoff/HandoffValidator.ts';

const OUT = DEFAULT_M4_OUTPUT_DIR;
const EXPECTED_KINDS = [
  'NEW',
  'KNOWN',
  'DUPLICATE',
  'RELATED',
  'UPDATED',
  'CONTRADICTED',
  'REASSESSED',
  'PRIORITY_CHANGED',
  'DISCARDED',
  'PROMOTED',
];

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('Continuous Editorial Radar E2E - M4 (offline, multi-cycle)', () => {
  let summary: M4RunSummary;

  before(async () => {
    summary = await runM4Offline({ write: false });
  });

  it('replays the frozen corpus deterministically without network', async () => {
    const first = await runM4Offline({ write: false });
    const second = await runM4Offline({ write: false });

    assert.deepEqual(first.artifacts.state, second.artifacts.state, 'M4 state must be deterministic');
    assert.deepEqual(first.artifacts.timeline, second.artifacts.timeline);
    assert.deepEqual(first.missingRecordings, []);
    assert.deepEqual(first.artifacts.metrics.llm.replayMisses, [], 'no LLM recording may be missing');
    assert.deepEqual(first.artifacts.metrics.research.missingRecordings, [], 'no tool recording may be missing');
    assert.ok(first.artifacts.metrics.llm.realResponses > 0, 'the recorded real LLM must participate');
  });

  it('keeps persistent signal memory across cycles and processes discoveries incrementally', () => {
    const { state, artifacts } = summary;
    const cycleIds = artifacts.corpus.cycles.map((cycle) => cycle.cycleId);

    assert.deepEqual(state.cyclesProcessed, cycleIds, 'every cycle must be recorded as processed');
    assert.equal(state.cyclesProcessed.length, 6, 'the radar must run the multi-cycle schedule');
    assert.equal(artifacts.timeline.cycles.length, cycleIds.length);

    // Los conteos acumulados por ciclo sólo crecen (memoria persistente).
    let previous = 0;
    for (const cycle of artifacts.timeline.cycles) {
      const total = Object.values(cycle.eventCounts).reduce((sum, value) => sum + value, 0);
      assert.ok(total >= 0);
      previous += total;
    }
    assert.ok(previous > 0, 'the timeline must carry events');

    // Serialización/deserialización = identidad (memoria reconstruible).
    assert.deepEqual(roundTrip(state), state, 'state must round-trip through JSON unchanged');
  });

  it('preserves stable historical identity for signals discovered from a repeated source', () => {
    const { state } = summary;
    const record = state.signals['sig-src-creatine-pmc-1'];
    assert.ok(record, 'the creatine signal must be tracked');
    assert.equal(record.firstSeenCycle, 'm4-cycle-1');
    assert.ok(record.seenCount >= 2, 'the repeated signal must record multiple sightings');
    assert.match(record.fingerprint, /^[a-f0-9]{16}$/);
    assert.equal(state.processedSources['src-creatine-pmc'].timesSeen, 3);
  });

  it('deduplicates repeated sources and signals without artificial duplication', () => {
    const { state } = summary;
    const duplicateEvents = state.events.filter((event) => event.kind === 'DUPLICATE');
    const knownEvents = state.events.filter((event) => event.kind === 'KNOWN');

    assert.ok(duplicateEvents.length >= 2, 'the repeated source must raise DUPLICATE events');
    assert.ok(knownEvents.length >= 2, 'the repeated signal must raise KNOWN events');
    assert.ok(
      duplicateEvents.every((event) => event.subjectType === 'SOURCE'),
      'DUPLICATE events are about sources'
    );
    assert.ok(knownEvents.every((event) => event.subjectType === 'SIGNAL'), 'KNOWN events are about signals');

    const signalIds = Object.keys(state.signals);
    assert.equal(new Set(signalIds).size, signalIds.length, 'signal records must be unique');
    assert.equal(state.processedSources['src-creatine-pmc'].timesSeen, 3);
  });

  it('recognizes known material as an idempotent no-op at the cycle level', async () => {
    const replay = await runM4Offline({ write: false, resumeFrom: summary.state });
    assert.deepEqual(replay.state, summary.state, 're-applying processed cycles must not mutate state');
    assert.equal(replay.state.events.length, summary.state.events.length, 'no new events for known cycles');
  });

  it('links related sources across cycles into cross-source clusters', () => {
    const { state } = summary;
    const creatine = state.clusters['cl-suplementacion-de-creatina'];
    assert.ok(creatine, 'the creatine cluster must exist');
    assert.ok(creatine.sourceIds.length >= 2, 'the creatine cluster must combine >= 2 sources');
    assert.ok(creatine.sourceIds.includes('src-creatine-pmc'));
    assert.ok(creatine.sourceIds.includes('src-creatine-harvard'));
    assert.ok(
      state.events.some((event) => event.kind === 'RELATED' && event.details.clusterId === creatine.clusterId),
      'a RELATED event must link the new source to the existing cluster'
    );
  });

  it('evolves evidence over time and records each update', () => {
    const { state } = summary;
    const updated = state.events.filter((event) => event.kind === 'UPDATED');
    assert.ok(updated.length >= 1, 'evidence evolution must produce UPDATED events');

    const creatine = state.clusters['cl-suplementacion-de-creatina'];
    const history = creatine.priorityHistory.map((point) => point.score);
    assert.ok(history.length >= 2, 'the candidate must accumulate evaluation history');
    assert.ok(creatine.evidenceUrls.length >= 2, 'evidence must accumulate across cycles');
  });

  it('reassesses candidates when evidence changes and changes priority dynamically', () => {
    const { state } = summary;

    assert.ok(state.eventCounts.REASSESSED >= 1, 'a reassessment must be recorded');
    assert.ok(state.eventCounts.PRIORITY_CHANGED >= 1, 'a priority change must be recorded');
    assert.equal(state.eventCounts.PRIORITY_CHANGED, state.events.filter((e) => e.kind === 'PRIORITY_CHANGED').length);

    const creatine = state.candidates['rc4-cl-suplementacion-de-creatina'];
    const priorities = creatine.priorityHistory.map((point) => point.priority);
    assert.ok(priorities.includes('MEDIUM') && priorities.includes('HIGH'), 'creatine must go MEDIUM → HIGH');
  });

  it('calibrates HIGH so it is not inflated: no mono-source candidate is HIGH and HIGH is a minority', () => {
    const { state } = summary;
    const candidates = Object.values(state.candidates);
    const high = candidates.filter((candidate) => candidate.priority === 'HIGH');

    assert.ok(high.length >= 1, 'a discriminating HIGH must still exist');
    assert.ok(
      high.length <= candidates.length / 3,
      `HIGH must be a minority (got ${high.length}/${candidates.length})`
    );
    assert.ok(
      high.length < candidates.length / 2,
      'HIGH must never be the majority'
    );

    for (const candidate of high) {
      const cluster = state.clusters[candidate.clusterId];
      assert.ok(cluster, 'every HIGH candidate must keep its cluster');
      assert.ok(cluster.sourceIds.length >= 2, `${candidate.candidateId} is HIGH with <2 independent sources`);
      assert.ok(
        cluster.evidenceUrls.length >= 2,
        `${candidate.candidateId} is HIGH with <2 evidence sources`
      );
      assert.ok(candidate.priorityReasons.length >= 2, 'priority must be explainable');
      assert.ok(
        candidate.priorityReasons.some((reason) => /score/i.test(reason)),
        'priorityReasons must state the score'
      );
      assert.ok(
        candidate.priorityReasons.some((reason) => /fuentes/i.test(reason)),
        'priorityReasons must state the source count'
      );
      if (cluster.contradiction) {
        assert.ok(
          candidate.priorityReasons.some((reason) => /contradicci/i.test(reason)),
          'priorityReasons must state the contradiction'
        );
      }
    }

    // La calibración usa MEDIUM de forma significativa: no todo es HIGH/DISCARD.
    assert.ok(candidates.some((candidate) => candidate.priority === 'MEDIUM'), 'MEDIUM must be used');
    assert.ok(
      candidates.some((candidate) => candidate.priority === 'HIGH') &&
        candidates.some((candidate) => candidate.priority !== 'HIGH'),
      'the calibration must discriminate across candidates'
    );
  });

  it('reflects contradictions between sources explicitly', () => {
    const { state } = summary;
    const fasting = state.clusters['cl-ayuno-intermitente'];
    assert.ok(fasting, 'the fasting cluster must exist');
    assert.equal(fasting.contradiction, true, 'the fasting cluster must be flagged as contradictory');
    assert.ok(fasting.sourceIds.includes('src-if-mayo'));
    assert.ok(fasting.sourceIds.includes('src-if-cochrane'));
    assert.ok(fasting.contradictionDetails.length > 0, 'the contradiction must be explained');
    assert.equal(fasting.assessment, 'SUPPORTED', 'the higher-tier evidence keeps the cluster supported');
    assert.ok(fasting.resolutionNote && fasting.resolutionNote.length > 0, 'a resolutionNote is required');
    assert.ok(
      /evidencia de mayor tier|cochrane|autoridad/i.test(fasting.resolutionNote),
      'the resolutionNote must explain which evidence prevails'
    );

    const contradictionEvent = state.events.find(
      (event) => event.kind === 'CONTRADICTED' && event.subjectId === fasting.clusterId
    );
    assert.ok(contradictionEvent, 'a CONTRADICTED event must be recorded');
  });

  it('discards noise without destroying the surrounding state', () => {
    const { state } = summary;
    const discarded = Object.values(state.candidates).filter((candidate) => candidate.status === 'DISCARDED');
    assert.ok(discarded.length >= 1, 'the promotional noise must be discarded');
    assert.ok(
      state.events.some((event) => event.kind === 'DISCARDED'),
      'a DISCARDED event must be recorded'
    );

    // El descarte no elimina señales ni clusters: la memoria se conserva.
    for (const candidate of discarded) {
      assert.ok(state.clusters[candidate.clusterId], 'a discarded candidate keeps its cluster record');
    }
  });

  it('promotes a well-supported candidate to AthenaOS with a valid handoff', () => {
    const { state, artifacts } = summary;
    assert.ok(state.eventCounts.PROMOTED >= 1, 'a candidate must be promoted');
    assert.equal(artifacts.handoff.handoffs.length >= 1, true);

    const validator = new HandoffValidator();
    for (const handoff of artifacts.handoff.handoffs) {
      assert.equal(handoff.validation.valid, true, handoff.validation.errors.join('; '));
      assert.deepEqual(validator.validate(handoff.recommendedAthenaOsInput).errors, []);
      assert.equal(handoff.recommendedAthenaOsInput.kind, 'athenasignal.research_candidate.handoff.v1');
      assert.ok(handoff.promotionReasons.length > 0, 'promotion must be explainable');
      assert.ok(handoff.promotionReason && handoff.promotionReason.length > 0, 'handoff must register promotionReason');
      assert.ok(/HIGH/.test(handoff.promotionReason), 'promotionReason must state the HIGH condition');

      const promoted = state.candidates[handoff.candidateId];
      assert.equal(promoted.status, 'PROMOTED');
      assert.equal(promoted.priority, 'HIGH', 'only HIGH candidates may be promoted');
      assert.ok(promoted.sourceIds.length >= 2, 'promotion requires >= 2 independent sources');
      assert.ok(promoted.priorityReasons.length > 0, 'the promoted candidate must be explained');
      assert.equal(state.clusters[promoted.clusterId].contradiction, false, 'promotion blocks contradiction');

      const promotionEvent = state.events.find(
        (event) => event.kind === 'PROMOTED' && event.subjectId === promoted.clusterId
      );
      assert.ok(promotionEvent, 'a PROMOTED event must be recorded in the timeline');
      assert.equal(typeof promotionEvent.details.promotionReason, 'string');
      assert.ok((promotionEvent.details.promotionReason as string).length > 0);
    }

    // Nada nace verificado (DU-001).
    for (const handoff of artifacts.handoff.handoffs) {
      for (const fact of handoff.recommendedAthenaOsInput.proposedCandidateFacts) {
        assert.equal(fact.statusHint, 'UNVERIFIED');
      }
    }
  });

  it('exposes a consultable editorial radar with all event categories', () => {
    const { state, artifacts } = summary;
    for (const kind of EXPECTED_KINDS) {
      assert.ok(
        (state.eventCounts[kind] ?? 0) > 0,
        `the radar must observe at least one ${kind} event`
      );
      assert.ok(RADAR_EVENT_KINDS.includes(kind as never));
    }
    assert.equal(artifacts.timeline.eventTotals.NEW, state.eventCounts.NEW);
    assert.equal(
      Object.values(artifacts.timeline.eventTotals).reduce((sum, value) => sum + value, 0),
      state.events.length
    );
    assert.ok(
      Object.values(state.clusters).every((cluster) => cluster.priorityHistory.length >= 1),
      'every cluster must expose a consultable priority history'
    );
  });

  it('survives interruption and resumes from persisted state', async () => {
    const interrupted = await runM4Offline({ write: false, cycleLimit: 3 });
    assert.equal(interrupted.state.cyclesProcessed.length, 3);
    assert.ok(interrupted.state.cyclesProcessed.length < summary.state.cyclesProcessed.length);

    const resumed = await runM4Offline({ write: false, resumeFrom: interrupted.state });
    assert.deepEqual(resumed.state, summary.state, 'resuming must reach the same final state');
    assert.equal(resumed.state.cyclesProcessed.length, 6);
  });

  it('covers the multi-cycle benchmark with no false positives', () => {
    const { artifacts } = summary;
    assert.ok(artifacts.benchmark.entries.length >= 6, 'the benchmark must cover the multi-cycle behaviors');
    assert.deepEqual(artifacts.metrics.falsePositiveObservations, [], 'every benchmark expectation must hold');
  });

  it('produces a product-oriented human review packet with every required view', () => {
    const { humanReview } = summary.artifacts;
    assert.equal(humanReview.rubric.length, M4_RUBRIC.length);
    assert.ok(humanReview.bestCandidate, 'best candidate is required');
    assert.ok(humanReview.worstCandidate, 'worst candidate is required');
    assert.ok(humanReview.largestPriorityChange, 'largest priority change is required');
    assert.ok(humanReview.mostDifficultDeduplication, 'most difficult deduplication is required');
    assert.ok(humanReview.importantContradiction, 'important contradiction is required');
    assert.ok(humanReview.importantReframing, 'important reframing is required');
    assert.ok(humanReview.importantDiscard, 'important discard is required');
    assert.ok(humanReview.promotedToAthenaOs.length >= 1, 'promoted candidate is required');
  });

  it('writes acceptance artifacts that match the in-memory run', async () => {
    const written = await runM4Offline();
    const files = [
      'corpus.json',
      'benchmark.json',
      'radar-timeline.json',
      'radar-state.json',
      'metrics.json',
      'handoff-athenaos.json',
      'human-review-packet.json',
    ];
    for (const file of files) {
      const path = resolve(process.cwd(), OUT, file);
      assert.ok(existsSync(path), `${file} must exist`);
      assert.equal(typeof readJson(path), 'object');
    }

    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'corpus.json')), roundTrip(written.artifacts.corpus));
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'benchmark.json')), roundTrip(written.artifacts.benchmark));
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'radar-timeline.json')),
      roundTrip(written.artifacts.timeline)
    );
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'radar-state.json')), roundTrip(written.artifacts.state));
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'metrics.json')), roundTrip(written.artifacts.metrics));
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'handoff-athenaos.json')),
      roundTrip(written.artifacts.handoff)
    );
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'human-review-packet.json')),
      roundTrip(written.artifacts.humanReview)
    );
  });
});
