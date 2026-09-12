/**
 * Construcción del Research Candidate M3 (ORDEN-007 §10, §11).
 *
 * Preserva el contrato AKP `athenasignal.research_candidate.handoff.v1` y las
 * reglas duras: `statusHint` siempre UNVERIFIED; una afirmación reformulada
 * nunca reaparece como hecho.
 */

import type {
  AssertionAnalysis,
  AthenaOsHandoff,
  AthenaOsProposedCandidateFact,
  AthenaOsProposedSource,
  InitialFinding,
  Provenance,
  ResearchCandidate,
  ResearchAssessment,
  SourceRole,
} from '../domain/entities.ts';
import type {
  AssertionDecomposition,
  AutonomousCandidate,
  ClaimAssessment,
  CorpusItem,
  DiscoveredSignal,
  EditorialRelevance,
  EvidenceItem,
  Reframing,
  ResearchabilityAssessment,
} from './types.ts';
import type { InterpretedFinding } from './prompts.ts';
import { buildProvenance } from '../research/provenance.ts';
import {
  isClaimEcho,
  isNullLike,
  normalizeCandidateFact,
  resolveHypotheses,
  uniqueStrings,
} from './epistemic.ts';

export interface CandidateBuildInput {
  signal: DiscoveredSignal;
  item: CorpusItem;
  decomposition: AssertionDecomposition;
  evidence: EvidenceItem[];
  findings: InterpretedFinding[];
  assessment: ClaimAssessment;
  reframing: Reframing | null;
  researchability: ResearchabilityAssessment;
  editorialRelevance: EditorialRelevance;
  createdAt: string;
}

export type CandidateBase = Omit<AutonomousCandidate, 'priority' | 'priorityReasons' | 'scores'>;

export function buildCandidate(input: CandidateBuildInput): CandidateBase {
  const { signal, item, decomposition, evidence, findings, assessment, reframing } = input;

  const researchQuestion = resolveResearchQuestion(signal, assessment.assessment, reframing);
  const reframed = assessment.assessment === 'REFRAMED';
  const initialFindings = toInitialFindings(findings, reframing, reframed, signal.assertion);
  const knownUncertainties = uniqueStrings([
    ...decomposition.uncertainties,
    ...assessment.uncertainties,
    ...findings.filter((f) => f.kind === 'MODEL_INTERPRETATION').map((f) => f.text),
  ]);
  if (knownUncertainties.length === 0) {
    knownUncertainties.push('No se declaran incertidumbres; cobertura limitada.');
  }

  const proposedSources = buildProposedSources(input);
  const proposedCandidateFacts = buildCandidateFacts(input);
  const originalClaims = [signal.assertion];

  const recommendedAthenaOsInput: AthenaOsHandoff = {
    kind: 'athenasignal.research_candidate.handoff.v1',
    researchQuestion,
    outputLanguage: 'es',
    viableBase: {
      format: 'article',
      factsRequired: Math.max(3, initialFindings.filter((f) => f.kind === 'FACT' || f.kind === 'EVIDENCE').length),
      sourcesMinimum: Math.max(1, proposedSources.length),
    },
    proposedSources,
    proposedCandidateFacts,
    knownUncertainties,
    initialFindings,
    origin: {
      signalId: signal.signalId,
      originalClaims,
      assessment: assessment.assessment,
      reframingNote: reframingNote(input.reframing, assessment.assessment),
    },
  };

  const assertionAnalysis: AssertionAnalysis = {
    originalClaim: signal.assertion,
    context: uniqueStrings(decomposition.context),
    entities: uniqueStrings(decomposition.entities),
    implicitQuestions: uniqueStrings(decomposition.implicitQuestions),
    hypotheses: resolveHypotheses(decomposition.hypotheses, signal.assertion, researchQuestion, reframed),
    uncertainties: uniqueStrings(decomposition.uncertainties),
  };

  const sourceProvenance = buildSourceProvenance(input);
  const candidateId = `rc-${signal.signalId}`;
  const score = Number(
    (
      (input.researchability.evidenceAvailability +
        input.researchability.questionClarity +
        input.researchability.editorialRelevance +
        input.researchability.resolvableUncertainty) /
      4
    ).toFixed(4)
  );

  const candidate: CandidateBase = {
    candidateId,
    title: signal.topic.trim() || signal.assertion.trim() || 'Research candidate',
    researchQuestion,
    originSignalId: signal.signalId,
    originalClaims,
    context: decomposition.context,
    assessment: assessment.assessment,
    assertionAnalysis,
    researchability: input.researchability,
    knownUncertainties,
    initialFindings,
    reasonForSelection: reasonForSelection(assessment, researchQuestion),
    sourceProvenance,
    recommendedAthenaOsInput,
    createdAt: input.createdAt,

    // M1 compatibilidad
    id: candidateId,
    signalId: signal.signalId,
    hypothesis: researchQuestion,
    score,
    claims: [],
    primarySourcesToCheck: proposedSources.map((source) => source.url),

    // M3
    editorialRelevance: input.editorialRelevance,
    originSignalIds: [signal.signalId],
    evidence,
  };

  return candidate;
}

export function resolveResearchQuestion(
  signal: DiscoveredSignal,
  assessment: ResearchAssessment,
  reframing: Reframing | null
): string {
  if (assessment === 'REFRAMED' && reframing?.researchQuestion) {
    return ensureQuestion(reframing.researchQuestion);
  }
  const candidate = signal.questions.find((question) => question.trim().endsWith('?'));
  if (candidate) return candidate.trim();
  return ensureQuestion(`¿Qué evidencia sostiene que ${signal.assertion}`);
}

function ensureQuestion(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '¿Qué evidencia sostiene la afirmación?';
  return trimmed.endsWith('?') ? trimmed : `${trimmed.replace(/[.]+$/, '')}?`;
}

function toInitialFindings(
  findings: InterpretedFinding[],
  reframing: Reframing | null,
  isReframed: boolean,
  claim: string
): InitialFinding[] {
  const seen = new Set<string>();
  const result: InitialFinding[] = [];
  for (const finding of findings) {
    if (isNullLike(finding.text)) continue;
    // El claim original NUNCA puede reaparecer como EVIDENCE/FACT (anti-amplificación).
    if ((finding.kind === 'EVIDENCE' || finding.kind === 'FACT') && isClaimEcho(finding.text, claim)) {
      continue;
    }
    if (seen.has(finding.text)) continue;
    seen.add(finding.text);
    result.push({
      kind: finding.kind as InitialFinding['kind'],
      text: finding.text,
      refs: uniqueStrings(finding.refs),
    });
  }
  if (isReframed && reframing?.reframingNote && !isNullLike(reframing.reframingNote)) {
    result.push({
      kind: 'EDITORIAL_REFRAMING',
      text: reframing.reframingNote,
      refs: [],
    });
  }
  if (!result.some((finding) => finding.kind === 'MODEL_INTERPRETATION')) {
    result.push({
      kind: 'MODEL_INTERPRETATION',
      text: 'La interpretación editorial de esta fuente es una inferencia del modelo, no evidencia.',
      refs: [],
    });
  }
  return result;
}

function buildProposedSources(input: CandidateBuildInput): AthenaOsProposedSource[] {
  const seen = new Set<string>();
  const sources: AthenaOsProposedSource[] = [];
  const push = (url: string, title: string, language: string, role: SourceRole, trust: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    sources.push({
      url,
      title: title || url,
      language: language || 'en',
      role,
      eligibility: {
        hasIdentifiableOrigin: true,
        hasTraceableLocation: true,
        hasTemporalContext: true,
        hasRecoverableEvidence: true,
      },
      proposedTrustTier: trust,
      accessedAt: input.createdAt,
    });
  };

  const itemRole: SourceRole =
    input.item.policy === 'DISCOVERY' || input.item.policy === 'TERTIARY' || input.item.policy === 'BLOCKED'
      ? 'DISCOVERY'
      : 'EVIDENCE';
  push(input.item.url, input.item.title, input.item.language, itemRole, trustTier(input.item.policy));

  for (const evidence of input.evidence) {
    push(evidence.sourceUrl, evidence.title, 'en', evidence.role, trustTier(evidence.policy));
  }
  return sources.slice(0, 8);
}

function buildCandidateFacts(input: CandidateBuildInput): AthenaOsProposedCandidateFact[] {
  const { assessment, reframing, signal, evidence, findings, item } = input;
  const provenanceUrls = unique([item.url, ...evidence.map((entry) => entry.sourceUrl)]);

  // Un claim original jamás se propone como hecho, en ningún assessment.
  const isEcho = (statement: string): boolean =>
    statement === signal.assertion || isClaimEcho(statement, signal.assertion);

  if (assessment.assessment === 'REFRAMED') {
    const statement = normalizeCandidateFact(reframing?.candidateFact, signal.assertion);
    return statement ? [{ statement, provenanceUrls, statusHint: 'UNVERIFIED' }] : [];
  }

  if (assessment.assessment === 'UNSUPPORTED') {
    return [];
  }

  const supported = findings.filter(
    (finding) => finding.supports === true && !isNullLike(finding.text) && !isEcho(finding.text)
  );
  return uniqueStrings(supported.map((finding) => finding.text))
    .slice(0, 4)
    .map((statement) => ({ statement, provenanceUrls, statusHint: 'UNVERIFIED' }));
}

function buildSourceProvenance(input: CandidateBuildInput): Provenance[] {
  const itemRole: SourceRole =
    input.item.policy === 'DISCOVERY' || input.item.policy === 'TERTIARY' || input.item.policy === 'BLOCKED'
      ? 'DISCOVERY'
      : 'EVIDENCE';
  const provenance: Provenance[] = [
    buildProvenance({
      sourceId: `corpus-${input.item.id}`,
      url: input.item.url,
      platform: input.item.platform,
      language: input.item.language,
      title: input.item.title,
      role: itemRole,
      capturedAt: input.createdAt,
      content: input.item.content,
    }),
  ];
  for (const evidence of input.evidence) {
    provenance.push(
      buildProvenance({
        sourceId: `ev-${slug(evidence.sourceUrl)}`,
        url: evidence.sourceUrl,
        platform: 'web',
        language: 'en',
        title: evidence.title,
        role: evidence.role,
        capturedAt: input.createdAt,
        content: evidence.excerpt || evidence.title,
      })
    );
  }
  return provenance;
}

function reasonForSelection(assessment: ClaimAssessment, researchQuestion: string): string {
  switch (assessment.assessment) {
    case 'REFRAMED':
      return `La afirmación original no se acepta como hecho; la idea subyacente es investigable: "${researchQuestion}".`;
    case 'SUPPORTED':
      return 'La afirmación central está sustentada por evidencia de autoridad y abre una comparación editorialmente relevante.';
    case 'UNSUPPORTED':
      return 'La afirmación central no está sustentada por la evidencia inicial; solo procede si se reformula.';
    default:
      return 'La evidencia inicial es ambigua; la pregunta es investigable pero requiere verificación adicional.';
  }
}

function reframingNote(reframing: Reframing | null, assessment: string): string | null {
  const note = reframing?.reframingNote;
  if (note && !isNullLike(note)) return note;
  if (assessment === 'REFRAMED') {
    return 'La afirmación original no se acepta como hecho; se conserva la idea subyacente como pregunta investigable.';
  }
  return null;
}

export function trustTier(policy: string): string {
  switch (policy) {
    case 'PRIMARY':
      return 'primary_source';
    case 'EVIDENCE':
      return 'official_documentation';
    case 'SECONDARY':
      return 'secondary_press';
    case 'DISCOVERY':
      return 'discovery_only';
    case 'TERTIARY':
      return 'low_trust_tertiary';
    case 'BLOCKED':
      return 'blocked';
    default:
      return 'unknown';
  }
}

function slug(value: string): string {
  return value
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 80);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}
