import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  runM2Offline,
  DEFAULT_SOURCE_PROVENANCE_PATH,
  DEFAULT_RESEARCH_CANDIDATES_PATH,
  DEFAULT_HANDOFF_ATHENAOS_PATH,
  type M2Evidence,
} from '../src/research/offline.ts';
import { HandoffValidator } from '../src/handoff/HandoffValidator.ts';
import { AssertionAnalyzer } from '../src/research/AssertionAnalyzer.ts';
import { ResearchabilityAssessor } from '../src/research/ResearchabilityAssessor.ts';
import { M2_FIXTURES } from '../src/research/sources.ts';
import type { AthenaOsHandoff, ResearchCandidate, Signal } from '../src/domain/entities.ts';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const REQUIRED_ASSESSMENTS = ['SUPPORTED', 'UNSUPPORTED', 'AMBIGUOUS', 'REFRAMED'];
const FINDING_KINDS = ['FACT', 'EVIDENCE', 'MODEL_INTERPRETATION', 'EDITORIAL_REFRAMING'];

describe('Research Candidate E2E - Signal-to-Research-Candidate (offline)', () => {
  it('runs both minimum cases deterministically without network', async () => {
    const first: M2Evidence = (await runM2Offline()).evidence;
    const second: M2Evidence = (await runM2Offline()).evidence;

    assert.deepEqual(first, second, 'M2 evidence must be byte-deterministic across runs');
  });

  it('persists real source provenance with url, language, capture date and hash', async () => {
    const { evidence } = await runM2Offline();
    const sources = evidence.sourceProvenance.sources;

    assert.ok(sources.length >= 2, 'at least two real sources must be persisted');
    for (const source of sources) {
      assert.equal(typeof source.url, 'string');
      assert.ok(source.url.startsWith('http'), `source url must be http(s): ${source.url}`);
      assert.ok(source.language.length > 0, 'language must be preserved');
      assert.ok(!Number.isNaN(Date.parse(source.capturedAt)), 'capturedAt must be ISO-8601');
      assert.match(source.contentHash, /^[a-f0-9]{64}$/, 'contentHash must be sha256 hex');
      assert.ok(['DISCOVERY', 'EVIDENCE'].includes(source.role), 'role must be DISCOVERY|EVIDENCE');
    }
  });

  it('produces >= 2 research candidates including at least one REFRAMED', async () => {
    const { evidence } = await runM2Offline();
    const candidates = evidence.researchCandidates.candidates;

    assert.ok(candidates.length >= 2, 'at least two candidates are required');
    const assessments = candidates.map((c) => c.assessment);
    assert.ok(assessments.includes('REFRAMED'), 'CASO 2 (REFRAMED) is mandatory');
    for (const assessment of assessments) {
      assert.ok(REQUIRED_ASSESSMENTS.includes(assessment), `unexpected assessment: ${assessment}`);
    }
  });

  it('builds each candidate with the full ORDEN-006 structure', async () => {
    const { evidence } = await runM2Offline();

    for (const candidate of evidence.researchCandidates.candidates) {
      assertCandidateShape(candidate);
    }
  });

  it('does not amplify a false claim: REFRAMED keeps the original claim out of CandidateFacts', async () => {
    const { evidence } = await runM2Offline();
    const reframed = evidence.researchCandidates.candidates.find((c) => c.assessment === 'REFRAMED');

    assert.ok(reframed, 'a REFRAMED candidate must exist');
    const handoff = reframed.recommendedAthenaOsInput;

    assert.ok(handoff.origin.reframingNote && handoff.origin.reframingNote.length > 0);
    for (const original of reframed.originalClaims) {
      assert.ok(
        !handoff.proposedCandidateFacts.some((fact) => fact.statement === original),
        'the original false claim must not be proposed as a CandidateFact'
      );
    }
    assert.ok(
      handoff.proposedCandidateFacts.length >= 1,
      'a reframed candidate must still propose the underlying investigable fact'
    );
    for (const fact of handoff.proposedCandidateFacts) {
      assert.equal(fact.statusHint, 'UNVERIFIED');
    }
  });

  it('validates every AKP handoff against the vendored contract', async () => {
    const { evidence } = await runM2Offline();
    const validator = new HandoffValidator();

    for (const handoff of evidence.handoffAthenaOs.handoffs) {
      assert.equal(handoff.validation.valid, true, handoff.validation.errors.join('; '));
      assert.deepEqual(validator.validate(handoff.recommendedAthenaOsInput).errors, []);
    }
  });

  it('rejects an invalid handoff and a REFRAMED handoff proposing the original claim', () => {
    const validator = new HandoffValidator();

    const invalid = { kind: 'wrong', researchQuestion: '', outputLanguage: 'en' } as unknown as AthenaOsHandoff;
    assert.equal(validator.validate(invalid).valid, false);
    assert.ok(validator.validate(invalid).errors.length > 0);

    const reframed = buildMinimalReframedHandoff('la afirmación original');
    assert.equal(validator.validate(reframed).valid, true, validator.validate(reframed).errors.join('; '));

    const amplified = structuredClone(reframed);
    amplified.proposedCandidateFacts = [
      { statement: 'la afirmación original', provenanceUrls: ['https://example.org'], statusHint: 'UNVERIFIED' },
    ];
    assert.equal(validator.validate(amplified).valid, false);
  });

  it('separates FACT/EVIDENCE from MODEL_INTERPRETATION and EDITORIAL_REFRAMING', async () => {
    const { evidence } = await runM2Offline();

    for (const candidate of evidence.researchCandidates.candidates) {
      assert.ok(candidate.initialFindings.length > 0);
      const kinds = candidate.initialFindings.map((f) => f.kind);
      assert.ok(kinds.includes('FACT') || kinds.includes('EVIDENCE'), 'findings must include fact/evidence');
      assert.ok(kinds.includes('MODEL_INTERPRETATION'), 'findings must include model interpretation');
      for (const kind of kinds) {
        assert.ok(FINDING_KINDS.includes(kind), `unexpected finding kind: ${kind}`);
      }
    }
  });

  it('classifies the investigable Kafka case as researchable (HIGH) and supported', async () => {
    const results = await runM2Offline({ fixtures: [M2_FIXTURES[0]] });
    const candidate = results.evidence.researchCandidates.candidates[0];

    assert.equal(candidate.assessment, 'SUPPORTED');
    assert.equal(candidate.researchability.level, 'HIGH');
    assert.ok(candidate.researchability.evidenceAvailability > 0.5);
    assert.match(candidate.researchQuestion, /\?$/);
  });

  it('writes evidence files that match the returned evidence', async () => {
    const { evidence } = await runM2Offline();

    assert.ok(existsSync(DEFAULT_SOURCE_PROVENANCE_PATH));
    assert.ok(existsSync(DEFAULT_RESEARCH_CANDIDATES_PATH));
    assert.ok(existsSync(DEFAULT_HANDOFF_ATHENAOS_PATH));

    const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
    assert.deepEqual(readJson(DEFAULT_SOURCE_PROVENANCE_PATH), roundTrip(evidence.sourceProvenance));
    assert.deepEqual(readJson(DEFAULT_RESEARCH_CANDIDATES_PATH), roundTrip(evidence.researchCandidates));
    assert.deepEqual(readJson(DEFAULT_HANDOFF_ATHENAOS_PATH), roundTrip(evidence.handoffAthenaOs));
  });

  it('produces structured AssertionAnalysis and ResearchabilityAssessment (unit)', () => {
    const signal: Signal = {
      sourceId: 'unit-1',
      topic: 'Tema de prueba',
      topics: ['Tema de prueba'],
      concepts: ['AirLLM', 'VRAM'],
      claimsToInvestigate: [
        {
          statement: 'AirLLM ejecuta DeepSeek V4 con 12 GB de RAM',
          status: 'UNVERIFIED',
          provenanceSourceId: 'unit-1',
        },
      ],
      questions: ['¿Es posible?'],
      arguments: ['Argumento'],
      assumptions: ['Suposición'],
      contradictions: ['Contradicción'],
    };

    const analysis = new AssertionAnalyzer().analyze(signal.claimsToInvestigate[0].statement, signal);
    assert.equal(analysis.originalClaim, 'AirLLM ejecuta DeepSeek V4 con 12 GB de RAM');
    assert.ok(analysis.entities.includes('AirLLM'));
    assert.ok(analysis.implicitQuestions.some((q) => q.endsWith('?')));
    assert.ok(analysis.hypotheses.length > 0);
    assert.ok(analysis.uncertainties.length > 0);

    const assessment = new ResearchabilityAssessor().assess({
      researchQuestion: '¿Es posible AirLLM con 12 GB?',
      assertionAnalysis: analysis,
      findings: [{ kind: 'EVIDENCE', text: 'evidencia', refs: ['https://example.org'] }],
      assessment: 'REFRAMED',
      proposedSourcesCount: 2,
    });
    assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(assessment.level));
    for (const value of [
      assessment.evidenceAvailability,
      assessment.questionClarity,
      assessment.editorialRelevance,
      assessment.resolvableUncertainty,
    ]) {
      assert.ok(value >= 0 && value <= 1, 'researchability metrics must be bounded in [0,1]');
    }
  });
});

function assertCandidateShape(candidate: ResearchCandidate): void {
  assert.ok(candidate.candidateId.startsWith('rc-'));
  assert.ok(candidate.title.length > 0);
  assert.ok(candidate.researchQuestion.endsWith('?'));
  assert.ok(candidate.originSignalId.length > 0);
  assert.ok(Array.isArray(candidate.originalClaims) && candidate.originalClaims.length > 0);
  assert.ok(Array.isArray(candidate.context));
  assert.ok(REQUIRED_ASSESSMENTS.includes(candidate.assessment));

  const analysis = candidate.assertionAnalysis;
  assert.ok(analysis.originalClaim.length > 0);
  for (const key of ['context', 'entities', 'implicitQuestions', 'hypotheses', 'uncertainties'] as const) {
    assert.ok(Array.isArray(analysis[key]), `assertionAnalysis.${key} must be an array`);
  }

  const researchability = candidate.researchability;
  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(researchability.level));
  for (const key of [
    'evidenceAvailability',
    'questionClarity',
    'editorialRelevance',
    'resolvableUncertainty',
  ] as const) {
    assert.ok(
      typeof researchability[key] === 'number' &&
        researchability[key] >= 0 &&
        researchability[key] <= 1,
      `researchability.${key} must be bounded in [0,1]`
    );
  }
  assert.ok(researchability.reason.length > 0);

  assert.ok(Array.isArray(candidate.knownUncertainties));
  assert.ok(Array.isArray(candidate.initialFindings) && candidate.initialFindings.length > 0);
  assert.ok(candidate.reasonForSelection.length > 0);
  assert.ok(Array.isArray(candidate.sourceProvenance) && candidate.sourceProvenance.length > 0);
  assert.equal(candidate.recommendedAthenaOsInput.kind, 'athenasignal.research_candidate.handoff.v1');
  assert.ok(!Number.isNaN(Date.parse(candidate.createdAt)));
}

function buildMinimalReframedHandoff(originalClaim: string): AthenaOsHandoff {
  return {
    kind: 'athenasignal.research_candidate.handoff.v1',
    researchQuestion: '¿Cuál es la pregunta reformulada?',
    outputLanguage: 'es',
    viableBase: { format: 'article', factsRequired: 3, sourcesMinimum: 1 },
    proposedSources: [
      {
        url: 'https://example.org',
        title: 'Fuente',
        language: 'es',
        role: 'EVIDENCE',
        eligibility: {
          hasIdentifiableOrigin: true,
          hasTraceableLocation: true,
          hasTemporalContext: true,
          hasRecoverableEvidence: true,
        },
        proposedTrustTier: 'official_documentation',
        accessedAt: '2026-09-11T00:00:00.000Z',
      },
    ],
    proposedCandidateFacts: [
      { statement: 'hecho reformulado', provenanceUrls: ['https://example.org'], statusHint: 'UNVERIFIED' },
    ],
    knownUncertainties: ['incertidumbre'],
    initialFindings: [{ kind: 'MODEL_INTERPRETATION', text: 'interpretación', refs: ['https://example.org'] }],
    origin: {
      signalId: 'unit-reframe',
      originalClaims: [originalClaim],
      assessment: 'REFRAMED',
      reframingNote: 'nota de reformulación',
    },
  };
}
