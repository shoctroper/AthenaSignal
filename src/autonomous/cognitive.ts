/**
 * Capa cognitiva M3 (ORDEN-007 §4, §3).
 *
 * Cada etapa invoca un `LLMProvider` real (o su replay registrado) y aplica
 * saneamiento determinista: nunca promueve una afirmación a hecho y degrada a
 * MODEL_INTERPRETATION cualquier hallazgo sin referencia de autoridad.
 */

import type {
  AssertionDecomposition,
  ClaimAssessment,
  CorpusItem,
  DiscoveredSignal,
  EditorialRelevance,
  EvidenceItem,
  Reframing,
  ResearchabilityAssessment,
  InterpretedFinding,
  SourcePolicy,
} from './types.ts';
import {
  SYSTEM_COGNITIVE,
  assertionDecompositionPrompt,
  claimAssessmentPrompt,
  editorialRelevancePrompt,
  evidenceInterpretationPrompt,
  prioritizationPrompt,
  reframingPrompt,
  researchabilityPrompt,
  signalDiscoveryPrompt,
} from './prompts.ts';
import type { LLMProvider, LLMRequest } from '../llm/types.ts';
import { parseJson } from '../llm/parse.ts';
import { resolveReframing, type ReframeContext } from './epistemic.ts';

const ASSESSMENTS = ['SUPPORTED', 'UNSUPPORTED', 'AMBIGUOUS', 'REFRAMED'] as const;
const LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
const AUTHORITY_POLICIES: SourcePolicy[] = ['PRIMARY', 'EVIDENCE'];
/** Políticas que pueden sostener una afirmación (una DISCOVERY/TERTIARY no). */
const SUPPORT_POLICIES: SourcePolicy[] = ['PRIMARY', 'EVIDENCE', 'SECONDARY'];

async function call(provider: LLMProvider, request: LLMRequest): Promise<unknown> {
  const response = await provider.complete({ ...request, json: true, temperature: 0 });
  return parseJson<unknown>(response.text);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function clamp01(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Number(Math.max(0, Math.min(1, num)).toFixed(4));
}

export async function discoverSignals(
  provider: LLMProvider,
  item: CorpusItem
): Promise<DiscoveredSignal[]> {
  const parsed = asRecord(
    await call(provider, {
      stage: 'signal_discovery',
      system: SYSTEM_COGNITIVE,
      prompt: signalDiscoveryPrompt(item),
    })
  );
  const raw = Array.isArray(parsed.signals) ? parsed.signals : [];
  const signals: DiscoveredSignal[] = [];
  raw.forEach((entry, index) => {
    const record = asRecord(entry);
    const assertion = typeof record.assertion === 'string' ? record.assertion.trim() : '';
    if (!assertion) return;
    signals.push({
      signalId: `sig-${item.id}-${index + 1}`,
      corpusId: item.id,
      topic: typeof record.topic === 'string' && record.topic.trim() ? record.topic.trim() : item.title,
      assertion,
      concepts: stringArray(record.concepts),
      questions: stringArray(record.questions),
      noiseLikelihood: clamp01(record.noiseLikelihood),
      rationale: typeof record.rationale === 'string' ? record.rationale.trim() : '',
      policy: item.policy,
    });
  });
  // Tope duro por fuente: se selecciona, no se inunda.
  return signals.slice(0, 2);
}

export async function decomposeAssertion(
  provider: LLMProvider,
  signal: DiscoveredSignal,
  item: CorpusItem
): Promise<AssertionDecomposition> {
  const parsed = asRecord(
    await call(provider, {
      stage: 'assertion_decomposition',
      system: SYSTEM_COGNITIVE,
      prompt: assertionDecompositionPrompt(signal, item),
    })
  );
  return {
    signalId: signal.signalId,
    originalAssertion: signal.assertion,
    entities: stringArray(parsed.entities),
    context: stringArray(parsed.context),
    implicitQuestions: stringArray(parsed.implicitQuestions),
    hypotheses: stringArray(parsed.hypotheses),
    uncertainties: stringArray(parsed.uncertainties).length
      ? stringArray(parsed.uncertainties)
      : ['La afirmación no ha sido descompuesta: sin incertidumbres declaradas.'],
  };
}

export async function interpretEvidence(
  provider: LLMProvider,
  signal: DiscoveredSignal,
  decomposition: AssertionDecomposition,
  evidence: EvidenceItem[]
): Promise<InterpretedFinding[]> {
  const parsed = asRecord(
    await call(provider, {
      stage: 'evidence_interpretation',
      system: SYSTEM_COGNITIVE,
      prompt: evidenceInterpretationPrompt(signal, decomposition, evidence),
    })
  );
  const raw = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings: InterpretedFinding[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!text) continue;
    const refs = stringArray(record.refs);
    const kind = sanitizeKind(record.kind, refs, evidence);
    let supports = typeof record.supports === 'boolean' ? record.supports : null;
    // Una fuente de descubrimiento nunca confirma por sí sola (ORDEN-007 §6).
    if (supports === true && !hasSupportingAuthority(refs, evidence)) {
      supports = null;
    }
    findings.push({ kind, text, refs, supports });
  }
  return findings;
}

function hasSupportingAuthority(refs: string[], evidence: EvidenceItem[]): boolean {
  return refs.some((ref) => {
    const match = evidence.find((item) => item.sourceUrl === ref);
    return match ? SUPPORT_POLICIES.includes(match.policy) : false;
  });
}

function sanitizeKind(rawKind: unknown, refs: string[], evidence: EvidenceItem[]): InterpretedFinding['kind'] {
  const kind = typeof rawKind === 'string' ? rawKind.toUpperCase() : '';
  const allowed = ['FACT', 'EVIDENCE', 'MODEL_INTERPRETATION', 'EDITORIAL_REFRAMING'];
  const normalized = (allowed.includes(kind) ? kind : 'MODEL_INTERPRETATION') as InterpretedFinding['kind'];
  if (normalized === 'FACT') {
    const hasAuthority = refs.some((ref) => {
      const match = evidence.find((item) => item.sourceUrl === ref);
      return match ? AUTHORITY_POLICIES.includes(match.policy) : false;
    });
    // Una inferencia o una fuente de descubrimiento nunca se eleva a FACT.
    if (!hasAuthority) return 'MODEL_INTERPRETATION';
  }
  return normalized;
}

export async function assessClaim(
  provider: LLMProvider,
  signal: DiscoveredSignal,
  decomposition: AssertionDecomposition,
  findings: InterpretedFinding[]
): Promise<ClaimAssessment> {
  const parsed = asRecord(
    await call(provider, {
      stage: 'claim_assessment',
      system: SYSTEM_COGNITIVE,
      prompt: claimAssessmentPrompt(signal, decomposition, findings),
    })
  );
  const rawAssessment = typeof parsed.assessment === 'string' ? parsed.assessment.toUpperCase() : '';
  const assessment = (ASSESSMENTS as readonly string[]).includes(rawAssessment)
    ? (rawAssessment as ClaimAssessment['assessment'])
    : 'AMBIGUOUS';
  return {
    signalId: signal.signalId,
    assessment,
    confidence: clamp01(parsed.confidence),
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.trim() : '',
    contradictions: stringArray(parsed.contradictions),
    uncertainties: stringArray(parsed.uncertainties).length
      ? stringArray(parsed.uncertainties)
      : ['Evaluación no concluyente.'],
  };
}

export async function assessResearchability(
  provider: LLMProvider,
  signal: DiscoveredSignal,
  assessment: string,
  evidenceCount: number
): Promise<ResearchabilityAssessment> {
  const parsed = asRecord(
    await call(provider, {
      stage: 'researchability',
      system: SYSTEM_COGNITIVE,
      prompt: researchabilityPrompt(signal, assessment, evidenceCount),
    })
  );
  const rawLevel = typeof parsed.level === 'string' ? parsed.level.toUpperCase() : '';
  const level = (LEVELS as readonly string[]).includes(rawLevel)
    ? (rawLevel as ResearchabilityAssessment['level'])
    : 'LOW';
  return {
    level,
    evidenceAvailability: clamp01(parsed.evidenceAvailability),
    questionClarity: clamp01(parsed.questionClarity),
    editorialRelevance: clamp01(parsed.editorialRelevance),
    resolvableUncertainty: clamp01(parsed.resolvableUncertainty),
    reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : 'Sin evaluación.',
  };
}

export async function reframe(
  provider: LLMProvider,
  signal: DiscoveredSignal,
  assessmentReason: string,
  context?: ReframeContext
): Promise<Reframing> {
  const parsed = asRecord(
    await call(provider, {
      stage: 'reframing',
      system: SYSTEM_COGNITIVE,
      prompt: reframingPrompt(signal, assessmentReason),
    })
  );
  const researchQuestion = typeof parsed.researchQuestion === 'string' ? parsed.researchQuestion.trim() : '';
  const note = typeof parsed.reframingNote === 'string' ? parsed.reframingNote.trim() : '';
  const candidateFact = typeof parsed.candidateFact === 'string' ? parsed.candidateFact.trim() : '';

  if (context) {
    // Saneamiento determinista: el claim no reaparece como hecho, la pregunta
    // es realmente investigable y la nota se completa con provenance real.
    return resolveReframing(
      signal,
      { researchQuestion, reframingNote: note || null, candidateFact: candidateFact || null },
      context
    );
  }

  return {
    signalId: signal.signalId,
    required: researchQuestion.length > 0,
    researchQuestion,
    reframingNote: note || null,
    candidateFact: candidateFact.length ? candidateFact : null,
  };
}

export async function assessEditorialRelevance(
  provider: LLMProvider,
  signal: DiscoveredSignal,
  assessment: string
): Promise<EditorialRelevance> {
  const parsed = asRecord(
    await call(provider, {
      stage: 'editorial_relevance',
      system: SYSTEM_COGNITIVE,
      prompt: editorialRelevancePrompt(signal, assessment),
    })
  );
  return {
    signalId: signal.signalId,
    score: clamp01(parsed.score),
    reasons: stringArray(parsed.reasons),
  };
}

export interface PrioritySuggestion {
  signalId: string;
  suggestedPriority: string;
  reasons: string[];
}

export async function suggestPriorities(
  provider: LLMProvider,
  items: Array<{ signal: DiscoveredSignal; assessment: string; researchability: string; evidenceCount: number }>
): Promise<Map<string, PrioritySuggestion>> {
  const parsed = asRecord(
    await call(provider, {
      stage: 'prioritization',
      system: SYSTEM_COGNITIVE,
      prompt: prioritizationPrompt(
        items.map((item) => ({
          signalId: item.signal.signalId,
          signal: item.signal,
          assessment: item.assessment,
          researchability: item.researchability,
          evidenceCount: item.evidenceCount,
        }))
      ),
    })
  );
  const map = new Map<string, PrioritySuggestion>();
  const raw = Array.isArray(parsed.items) ? parsed.items : [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const signalId = typeof record.signalId === 'string' ? record.signalId : '';
    if (!signalId) continue;
    map.set(signalId, {
      signalId,
      suggestedPriority: typeof record.suggestedPriority === 'string' ? record.suggestedPriority.toUpperCase() : '',
      reasons: stringArray(record.reasons),
    });
  }
  return map;
}
