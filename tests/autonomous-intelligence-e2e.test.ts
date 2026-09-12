import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  runM3Offline,
  verifyCorpus,
  BENCHMARK_CLASSES,
  M3_RUBRIC,
  DEFAULT_M3_OUTPUT_DIR,
} from '../src/autonomous/index.ts';
import { HandoffValidator } from '../src/handoff/HandoffValidator.ts';
import { DeterministicLLMProvider } from '../src/llm/DeterministicLLMProvider.ts';
import { parseJson } from '../src/llm/parse.ts';

const OUT = DEFAULT_M3_OUTPUT_DIR;
const CANDIDATE_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];
const FINDING_KINDS = ['FACT', 'EVIDENCE', 'MODEL_INTERPRETATION', 'EDITORIAL_REFRAMING'];
const AUTHORITY_POLICIES = ['PRIMARY', 'EVIDENCE'];
const SOURCE_POLICIES = ['DISCOVERY', 'EVIDENCE', 'PRIMARY', 'SECONDARY', 'TERTIARY', 'BLOCKED'];
const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, DISCARD: 3 };

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function normalized(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Comprobación independiente (no usa el helper de producción) de eco del claim. */
function echoes(text: string, claim: string): boolean {
  const a = normalized(text);
  const b = normalized(claim);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

describe('Autonomous Signal Intelligence E2E - M3 (offline replay)', () => {
  it('replays the frozen real corpus deterministically without network', async () => {
    const first = (await runM3Offline({ write: false })).artifacts;
    const second = (await runM3Offline({ write: false })).artifacts;

    assert.deepEqual(first, second, 'M3 artifacts must be byte-deterministic across runs');
  });

  it('loads a frozen real corpus with valid provenance and explicit source policy', async () => {
    const { artifacts } = await runM3Offline({ write: false });
    const { corpus } = artifacts;

    assert.equal(corpus.kind, 'athenasignal.m3.corpus.v1');
    assert.deepEqual(verifyCorpus(corpus), [], 'corpus hashes must verify offline');
    assert.ok(corpus.sources.length >= 8, 'corpus must contain multiple real sources');

    const policies = new Set(corpus.sources.map((source) => source.policy));
    for (const expected of ['DISCOVERY', 'EVIDENCE', 'PRIMARY', 'SECONDARY', 'TERTIARY']) {
      assert.ok(policies.has(expected), `corpus must include source policy ${expected}`);
    }

    for (const source of corpus.sources) {
      assert.ok(SOURCE_POLICIES.includes(source.policy), `unexpected policy: ${source.policy}`);
      assert.ok(source.url.startsWith('http'), `source url must be http(s): ${source.id}`);
      assert.ok(source.language.length > 0, 'language must be preserved');
      assert.match(source.contentHash, /^[a-f0-9]{64}$/, 'contentHash must be sha256 hex');
      assert.ok(source.content.length > 0, 'source snapshot must not be empty');
    }
  });

  it('discovers signals autonomously across the batch with the real cognitive layer', async () => {
    const { artifacts, pipeline } = await runM3Offline({ write: false });
    const corpusIds = new Set(artifacts.corpus.sources.map((source) => source.id));

    assert.ok(pipeline.signals.length > 0, 'at least one signal must be discovered');
    for (const signal of pipeline.signals) {
      assert.ok(corpusIds.has(signal.corpusId), `signal ${signal.signalId} must trace to a corpus source`);
      assert.ok(signal.assertion.trim().length > 0, 'every signal must carry an assertion');
    }

    assert.ok(artifacts.metrics.llm.realResponses > 0, 'the real LLM must participate');
    assert.deepEqual(artifacts.metrics.llm.replayMisses, [], 'no LLM recording may be missing');
    assert.deepEqual(artifacts.metrics.research.missingRecordings, [], 'no tool recording may be missing');
    assert.ok(artifacts.signals.queries.length > 0, 'initial research must issue real queries');
  });

  it('rejects noise: M signals produce C candidates with explainable discards', async () => {
    const { artifacts, pipeline } = await runM3Offline({ write: false });
    const { metrics } = artifacts;

    assert.equal(metrics.sourcesProcessed, artifacts.corpus.sources.length);
    assert.equal(metrics.signalsExtracted, pipeline.signals.length);
    assert.equal(metrics.candidatesGenerated, pipeline.candidates.length);
    assert.ok(pipeline.candidates.length < pipeline.signals.length, 'not every signal may become a candidate');
    assert.ok(pipeline.discarded.length > 0, 'inviable/noise signals must be discarded');
    assert.equal(metrics.priorityDistribution.DISCARD, pipeline.discarded.length);

    for (const entry of pipeline.discarded) {
      assert.ok(entry.assertion.trim().length > 0, 'a discarded signal must keep its assertion');
      assert.ok(entry.reason.trim().length > 0, 'a discard must be explainable');
    }
    assert.deepEqual(metrics.falsePositiveObservations, [], 'every benchmark expectation must hold');
  });

  it('keeps assertions epistemically safe: no FACT without authority, facts stay UNVERIFIED', async () => {
    const { pipeline } = await runM3Offline({ write: false });
    const allowed = new Set<string>(FINDING_KINDS);

    for (const [signalId, findings] of Object.entries(pipeline.findings)) {
      const evidence = pipeline.evidence[signalId] ?? [];
      for (const finding of findings) {
        assert.ok(allowed.has(finding.kind), `unexpected finding kind: ${finding.kind}`);
        if (finding.kind === 'FACT') {
          const hasAuthority = finding.refs.some((ref) => {
            const match = evidence.find((item) => item.sourceUrl === ref);
            return match ? AUTHORITY_POLICIES.includes(match.policy) : false;
          });
          assert.ok(hasAuthority, `FACT must cite a primary/evidence source: ${finding.text}`);
        }
      }
    }

    for (const candidate of pipeline.candidates) {
      for (const fact of candidate.recommendedAthenaOsInput.proposedCandidateFacts) {
        assert.equal(fact.statusHint, 'UNVERIFIED', 'nothing is born verified (DU-001)');
      }
      const kinds = candidate.initialFindings.map((finding) => finding.kind);
      assert.ok(
        kinds.includes('MODEL_INTERPRETATION'),
        'model interpretation must be explicitly labeled, never presented as evidence'
      );
    }
  });

  it('reframes incorrect claims into investigable questions without repeating them as facts', async () => {
    const { pipeline } = await runM3Offline({ write: false });
    const reframed = pipeline.candidates.filter((candidate) => candidate.assessment === 'REFRAMED');

    assert.ok(reframed.length > 0, 'at least one claim must be reframed');
    assert.ok(pipeline.reframings.length > 0, 'reframing steps must be preserved');

    for (const candidate of reframed) {
      const handoff = candidate.recommendedAthenaOsInput;
      assert.ok(
        handoff.origin.reframingNote && handoff.origin.reframingNote.length > 0,
        'a reframed candidate needs a reframing note'
      );
      assert.ok(candidate.researchQuestion.endsWith('?'), 'the reframed idea must be a question');
      for (const original of candidate.originalClaims) {
        assert.ok(
          !handoff.proposedCandidateFacts.some((fact) => fact.statement === original),
          'the original claim must not reappear as a CandidateFact'
        );
      }
    }
  });

  it('prioritizes with observable reasons and a stable, explainable order', async () => {
    const { pipeline } = await runM3Offline({ write: false });

    let previousRank = -1;
    for (const candidate of pipeline.candidates) {
      assert.ok(CANDIDATE_PRIORITIES.includes(candidate.priority), `unexpected priority: ${candidate.priority}`);
      assert.ok(candidate.priorityReasons.length > 0, 'priority must be explainable');
      assert.ok(
        candidate.priorityReasons.join(' ').includes('Score compuesto'),
        'priority must expose its observable score breakdown'
      );
      const rank = PRIORITY_RANK[candidate.priority];
      assert.ok(rank >= previousRank, 'candidates must be ordered HIGH -> MEDIUM -> LOW');
      previousRank = rank;
    }
  });

  it('validates every AthenaOS handoff against the vendored contract', async () => {
    const { artifacts } = await runM3Offline({ write: false });
    const validator = new HandoffValidator();

    assert.ok(artifacts.handoff.handoffs.length > 0, 'a handoff is required per candidate');
    for (const handoff of artifacts.handoff.handoffs) {
      assert.equal(handoff.validation.valid, true, handoff.validation.errors.join('; '));
      assert.deepEqual(validator.validate(handoff.recommendedAthenaOsInput).errors, []);
      assert.equal(handoff.recommendedAthenaOsInput.kind, 'athenasignal.research_candidate.handoff.v1');
    }
  });

  it('preserves Candidate -> Signal -> Source and Candidate -> Assertions -> Evidence provenance', async () => {
    const { artifacts, pipeline } = await runM3Offline({ write: false });
    const signalById = new Map(pipeline.signals.map((signal) => [signal.signalId, signal]));
    const corpusIds = new Set(artifacts.corpus.sources.map((source) => source.id));

    for (const candidate of pipeline.candidates) {
      assert.ok(candidate.originSignalIds.length > 0, 'a candidate must cite its origin signals');
      for (const signalId of candidate.originSignalIds) {
        const signal = signalById.get(signalId);
        assert.ok(signal, `origin signal ${signalId} must exist`);
        assert.ok(corpusIds.has(signal.corpusId), 'origin signal must trace to the frozen corpus');
      }

      assert.ok(candidate.sourceProvenance.length > 0, 'a candidate must carry source provenance');
      for (const source of candidate.sourceProvenance) {
        assert.ok(source.url.startsWith('http'), 'provenance url must be http(s)');
        assert.ok(!Number.isNaN(Date.parse(source.capturedAt)), 'capturedAt must be ISO-8601');
        assert.match(source.contentHash, /^[a-f0-9]{64}$/, 'provenance must be hashed');
        assert.ok(['DISCOVERY', 'EVIDENCE'].includes(source.role), 'provenance role must be explicit');
      }
    }
  });

  it('covers every benchmark class and reports consistent metrics and human review', async () => {
    const { artifacts } = await runM3Offline({ write: false });
    const classes = new Set(artifacts.benchmark.entries.map((entry) => entry.class));

    for (const expected of BENCHMARK_CLASSES) {
      assert.ok(classes.has(expected), `benchmark must cover ${expected}`);
    }
    assert.ok(
      artifacts.benchmark.entries.some((entry) => entry.origin === 'real'),
      'the benchmark must include entries from real sources'
    );

    const { metrics } = artifacts;
    assert.equal(metrics.candidatesDiscarded, artifacts.candidates.discarded.length);
    assert.equal(metrics.reframed, artifacts.signals.assessments.filter((a) => a.assessment === 'REFRAMED').length);
    assert.equal(artifacts.humanReview.rubric.length, M3_RUBRIC.length);
    assert.ok(artifacts.humanReview.sample.length > 0, 'human review needs a meaningful sample');
    assert.equal(artifacts.humanReview.discovered, artifacts.signals.signals.length);
    assert.equal(artifacts.humanReview.discarded, artifacts.candidates.discarded.length);

    for (const candidate of artifacts.candidates.candidates) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(metrics.evidenceSourcesPerCandidate, candidate.candidateId),
        `metrics must count evidence sources for ${candidate.candidateId}`
      );
    }
  });

  it('writes acceptance artifacts that match the in-memory run', async () => {
    const { artifacts } = await runM3Offline();

    const files = [
      'corpus.json',
      'signals.json',
      'candidates.json',
      'metrics.json',
      'benchmark.json',
      'handoff-athenaos.json',
      'human-review-packet.json',
    ];
    for (const file of files) {
      const path = resolve(process.cwd(), OUT, file);
      assert.ok(existsSync(path), `${file} must exist`);
      assert.equal(typeof readJson(path), 'object');
    }

    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'corpus.json')), roundTrip(artifacts.corpus));
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'signals.json')), roundTrip(artifacts.signals));
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'candidates.json')), roundTrip(artifacts.candidates));
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'metrics.json')), roundTrip(artifacts.metrics));
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'benchmark.json')), roundTrip(artifacts.benchmark));
    assert.deepEqual(readJson(resolve(process.cwd(), OUT, 'handoff-athenaos.json')), roundTrip(artifacts.handoff));
    assert.deepEqual(
      readJson(resolve(process.cwd(), OUT, 'human-review-packet.json')),
      roundTrip(artifacts.humanReview)
    );
  });

  it('selects a small candidate set (M << N) with explicit, explainable discards', async () => {
    const { artifacts, pipeline } = await runM3Offline({ write: false });

    assert.ok(
      pipeline.candidates.length * 2 <= pipeline.signals.length,
      `candidates (${pipeline.candidates.length}) must be far fewer than signals (${pipeline.signals.length})`
    );
    assert.ok(
      pipeline.candidates.length < artifacts.corpus.sources.length,
      'candidates must be fewer than sources'
    );
    assert.ok(
      pipeline.discarded.length >= pipeline.candidates.length,
      'discard must be a meaningful fraction of the batch'
    );
    for (const entry of pipeline.discarded) {
      assert.ok(entry.reason.trim().length > 0, 'every discard must be explainable');
    }

    const high = pipeline.candidates.filter((candidate) => candidate.priority === 'HIGH');
    assert.ok(high.length > 0, 'at least one candidate must deserve HIGH');
    for (const candidate of high) {
      assert.ok(candidate.evidence.length >= 3, 'HIGH requires a strong evidence base');
      assert.ok(
        candidate.priorityReasons.some((reason) => /Base de evidencia fuerte/.test(reason)),
        'HIGH must expose its strong-evidence justification'
      );
    }
  });

  it('enforces the AirLLM anti-amplification invariant after reframing', async () => {
    const { pipeline } = await runM3Offline({ write: false });
    const candidate = pipeline.candidates.find((c) => c.candidateId.includes('airllm'));
    assert.ok(candidate, 'the AirLLM claim must remain a (reframed) candidate');
    assert.equal(candidate.assessment, 'REFRAMED');
    assert.ok(
      !echoes(candidate.researchQuestion, candidate.originalClaims[0]),
      'the research question must not be the original claim turned into a question'
    );

    const note = candidate.recommendedAthenaOsInput.origin.reframingNote;
    assert.ok(note && note.trim().length > 0, 'a reframed candidate needs a non-empty reframing note');
    assert.match(note, /VRAM/i, 'the note must record the VRAM/RAM confusion');
    assert.match(note, /RAM/, 'the note must record the VRAM/RAM confusion');
    assert.match(note, /V3/, 'the note must record the actually documented model version');

    for (const finding of candidate.initialFindings) {
      if (finding.kind === 'EVIDENCE' || finding.kind === 'FACT') {
        assert.ok(
          !echoes(finding.text, candidate.originalClaims[0]),
          'the original claim must not reappear as EVIDENCE/FACT'
        );
      }
    }
    for (const fact of candidate.recommendedAthenaOsInput.proposedCandidateFacts) {
      assert.notEqual(fact.statement, candidate.originalClaims[0]);
      assert.ok(fact.statement.trim().length > 0 && !/^null$/i.test(fact.statement));
    }
    for (const hypothesis of candidate.assertionAnalysis.hypotheses) {
      assert.ok(
        !echoes(hypothesis, candidate.originalClaims[0]),
        'the original claim must not be presented as a viable hypothesis'
      );
    }
  });

  it('produces AKP-consumable candidates without null or empty fields', async () => {
    const { pipeline } = await runM3Offline({ write: false });

    for (const candidate of pipeline.candidates) {
      assert.ok(candidate.title.trim().length > 0, 'title must be non-empty');
      assert.ok(candidate.researchQuestion.trim().endsWith('?'), 'researchQuestion must be a question');
      assert.ok(candidate.reasonForSelection.trim().length > 0, 'reasonForSelection must be non-empty');
      assert.ok(
        candidate.priorityReasons.length > 0 && candidate.priorityReasons.every((reason) => reason.trim().length > 0),
        'priorityReasons must be non-empty'
      );
      assert.ok(
        candidate.knownUncertainties.length > 0 &&
          candidate.knownUncertainties.every((item) => item.trim().length > 0),
        'knownUncertainties must be non-empty'
      );
      if (candidate.assessment === 'REFRAMED') {
        const note = candidate.recommendedAthenaOsInput.origin.reframingNote;
        assert.ok(note && note.trim().length > 0 && !/^null$/i.test(note), 'REFRAMED needs a valid note');
      }
      for (const fact of candidate.recommendedAthenaOsInput.proposedCandidateFacts) {
        assert.ok(
          fact.statement.trim().length > 0 && !/^null$/i.test(fact.statement),
          'candidate facts must be well-formed'
        );
        assert.equal(fact.statusHint, 'UNVERIFIED');
      }
      for (const finding of candidate.initialFindings) {
        assert.ok(finding.text.trim().length > 0, 'findings must have text');
      }
    }
  });

  it('degrades safely without a model: no signals, no SUPPORTED, no FACT', async () => {
    const provider = new DeterministicLLMProvider();

    for (const stage of [
      'signal_discovery',
      'evidence_interpretation',
      'claim_assessment',
      'reframing',
      'editorial_relevance',
      'prioritization',
    ]) {
      const response = await provider.complete({
        stage,
        system: 'test',
        prompt: 'test',
        json: true,
        temperature: 0,
      } as never);
      assert.equal(response.deterministic, true, `stage ${stage} must use the deterministic fallback`);
      const parsed = parseJson<Record<string, unknown>>(response.text);
      if (stage === 'signal_discovery') assert.deepEqual(parsed.signals, []);
      if (stage === 'claim_assessment') {
        assert.equal(parsed.assessment, 'AMBIGUOUS', 'without a model a claim can never be SUPPORTED');
      }
    }
  });
});
