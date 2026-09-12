/**
 * Worker de investigación profunda AthenaOS (stand-in operativo M6,
 * ORDEN-010 §0, §2.2, §3).
 *
 * AKP/AthenaOS no es invocable desde el worktree (motor externo en otro repo
 * con permisos bloqueados). Este worker implementa el boundary de investigación
 * profunda dentro de AthenaSignal como **stand-in documentado**: recibe el
 * handoff validado desde el inbox AKP, hace investigación multi-paso
 * (plan → búsqueda → interpretación LLM local → síntesis estructurada) y
 * devuelve un resultado con `candidate identity · research status · findings ·
 * claims · evidence · provenance · uncertainties · final assessment`.
 *
 * No simula que el motor externo consumió nada: el `worker` declara que es el
 * stand-in y la limitación queda registrada. Mantiene el boundary: AthenaSignal
 * hace triage; este worker hace investigación profunda.
 *
 * Offline es determinista: la síntesis LLM proviene de grabaciones reales y, si
 * falta, degrada a un fallback determinista seguro que nunca eleva una
 * afirmación a hecho.
 */

import type { AthenaOsHandoff, FindingKind, ResearchAssessment } from '../domain/entities.ts';
import type { LLMProvider } from '../llm/types.ts';
import { parseJson } from '../llm/parse.ts';
import type { SearchTool } from '../research/tools/SearchTool.ts';
import type { AkpHandoffEntry } from './transport.ts';
import type {
  AthenaOsResearchResult,
  ResearchClaim,
  ResearchEvidenceRef,
  ResearchFinding,
  ResearchStatus,
  ResearchVerdict,
} from './types.ts';

export const ATHENAOS_WORKER_ID = 'athenaos-research-stand-in-v1';

/**
 * Contrato del worker de investigación profunda. Permite ejecutarlo in-process
 * (worker local) o en un proceso separado (nodo cognitivo distribuido).
 */
export interface ResearchWorker {
  readonly id: string;
  research(entry: AkpHandoffEntry, runId: string, at?: string): Promise<AthenaOsResearchResult>;
}

export const SYSTEM_DEEP_RESEARCH =
  'Eres el worker de investigación profunda de AthenaOS (stand-in operativo). ' +
  'Distingues estrictamente OBSERVACIÓN, AFIRMACIÓN, EVIDENCIA, HALLAZGO DE INVESTIGACIÓN, ' +
  'INTERPRETACIÓN DEL MODELO y REFORMULACIÓN EDITORIAL. Nunca conviertes una afirmación en hecho ' +
  'por regresar de una investigación: conservas provenance, incertidumbre y evaluación. ' +
  'Respondes SIEMPRE con JSON válido, sin markdown ni texto adicional.';

export interface AthenaOsWorkerOptions {
  llm: LLMProvider;
  search: SearchTool;
  clock: () => string;
  executionMode?: 'live' | 'replay';
  workerId?: string;
}

interface SynthesisPayload {
  synthesis?: unknown;
  findings?: unknown;
  claims?: unknown;
  assessment?: unknown;
  confidence?: unknown;
  uncertainties?: unknown;
}

const ASSESSMENTS: ResearchAssessment[] = ['SUPPORTED', 'UNSUPPORTED', 'AMBIGUOUS', 'REFRAMED'];
const VERDICTS: ResearchVerdict[] = ['SUPPORTED', 'CONTRADICTED', 'UNCERTAIN'];
const FINDING_KINDS: FindingKind[] = ['FACT', 'EVIDENCE', 'MODEL_INTERPRETATION', 'EDITORIAL_REFRAMING'];

export class AthenaOsResearchWorker implements ResearchWorker {
  readonly id: string;
  private readonly llm: LLMProvider;
  private readonly search: SearchTool;
  private readonly clock: () => string;
  private readonly executionMode: 'live' | 'replay';

  constructor(options: AthenaOsWorkerOptions) {
    this.llm = options.llm;
    this.search = options.search;
    this.clock = options.clock;
    this.executionMode = options.executionMode ?? 'replay';
    this.id = options.workerId ?? ATHENAOS_WORKER_ID;
  }

  /** Investigación profunda real sobre un handoff de AKP. */
  async research(entry: AkpHandoffEntry, runId: string, at?: string): Promise<AthenaOsResearchResult> {
    const handoff = entry.recommendedAthenaOsInput;
    const steps: AthenaOsResearchResult['steps'] = [];
    const stamp = at ?? this.clock();

    const plan = buildSubQuestions(handoff);
    steps.push({
      id: 'plan',
      step: 'Decomposición del problema de investigación',
      detail: `Sub-preguntas derivadas: ${plan.length}`,
    });

    const evidence = await this.gather(plan, handoff);
    steps.push({
      id: 'gather',
      step: 'Recuperación y provenance de evidencia',
      detail: `${evidence.length} referencias (${evidence.filter((ref) => ref.origin === 'HANDOFF').length} del handoff, ${evidence.filter((ref) => ref.origin === 'SEARCH').length} de búsqueda).`,
    });

    const interpretation = await this.synthesize(handoff, evidence);
    steps.push({
      id: 'interpret',
      step: 'Interpretación y evaluación de claims',
      detail: `${interpretation.findings.length} hallazgos, ${interpretation.claims.length} claims evaluados.`,
    });

    const limitations: string[] = [];
    if (interpretation.deterministic) {
      limitations.push(
        'Síntesis resuelta por fallback determinista seguro: no se disponía de respuesta cognitiva real.'
      );
    }
    if (!evidence.some((ref) => ref.origin === 'SEARCH')) {
      limitations.push(
        'Sin resultados de búsqueda en este entorno; el análisis se apoya en la evidencia del handoff.'
      );
    }
    limitations.push(
      'AKP/AthenaOS externo no invocable: este resultado proviene del worker stand-in documentado.'
    );

    steps.push({
      id: 'synthesize',
      step: 'Síntesis estructurada y evaluación final',
      detail: `Evaluación final ${interpretation.assessment} (confianza ${interpretation.confidence}).`,
    });

    const originalSignal =
      handoff.origin.originalClaims.find((claim) => claim.trim().length > 0) ?? handoff.researchQuestion;
    const researchResult = interpretation.synthesis;
    const newEvidence = evidence
      .filter((ref) => ref.origin !== 'HANDOFF')
      .map((ref) => ref.url);

    return {
      kind: 'athenasignal.m6.athenaos_result.v1',
      resultId: `aos-${entry.candidateId}`,
      candidateId: entry.candidateId,
      clusterId: entry.clusterId,
      handoffId: entry.handoffId,
      handoffContentHash: entry.contentHash,
      researchQuestion: handoff.researchQuestion,
      worker: this.id,
      executionMode: this.executionMode,
      provider: interpretation.provider,
      model: interpretation.model,
      deterministic: interpretation.deterministic,
      status: statusFor(interpretation.assessment),
      steps,
      findings: interpretation.findings,
      claims: interpretation.claims,
      evidence,
      provenance: evidence.map((ref) => ({
        url: ref.url,
        title: ref.title,
        language: handoff.outputLanguage ?? 'es',
        role: ref.role,
        accessedAt: stamp,
      })),
      uncertainties: interpretation.uncertainties,
      finalAssessment: interpretation.assessment,
      confidence: interpretation.confidence,
      layers: {
        originalSignal,
        researchQuestion: handoff.researchQuestion,
        researchResult,
        newEvidence,
        newInterpretation: researchResult,
      },
      createdAt: stamp,
      runId,
      limitations,
    };
  }

  private async gather(plan: string[], handoff: AthenaOsHandoff): Promise<ResearchEvidenceRef[]> {
    const refs = new Map<string, ResearchEvidenceRef>();
    for (const source of handoff.proposedSources) {
      if (!source.url || refs.has(source.url)) continue;
      refs.set(source.url, {
        url: source.url,
        title: source.title,
        role: source.role,
        origin: 'HANDOFF',
      });
    }

    for (const query of plan) {
      let results: Awaited<ReturnType<SearchTool['search']>>['results'] = [];
      try {
        results = (await this.search.search(query)).results ?? [];
      } catch {
        results = [];
      }
      for (const result of results.slice(0, 4)) {
        if (!result.url || refs.has(result.url)) continue;
        refs.set(result.url, {
          url: result.url,
          title: result.title,
          role: /wikipedia\.org/.test(result.url) ? 'DISCOVERY' : 'EVIDENCE',
          origin: 'SEARCH',
        });
      }
    }

    return [...refs.values()].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
  }

  private async synthesize(
    handoff: AthenaOsHandoff,
    evidence: ResearchEvidenceRef[]
  ): Promise<{
    synthesis: string;
    findings: ResearchFinding[];
    claims: ResearchClaim[];
    assessment: ResearchAssessment;
    confidence: number;
    uncertainties: string[];
    provider: string;
    model: string;
    deterministic: boolean;
  }> {
    const prompt = JSON.stringify({
      researchQuestion: handoff.researchQuestion,
      candidateFacts: handoff.proposedCandidateFacts.map((fact) => fact.statement),
      uncertainties: handoff.knownUncertainties,
      evidence: evidence.map((ref) => ({ url: ref.url, title: ref.title, role: ref.role })),
      instructions: [
        'Haz investigación profunda sobre la pregunta usando la evidencia y tus conocimientos.',
        'Devuelve "findings" (>=2) con kind EVIDENCE|FACT|MODEL_INTERPRETATION y "text" interpretativo.',
        'Devuelve "claims": uno por cada candidateFact y, si no hay, 1-2 claims clave derivados de la pregunta.',
        'Cada claim lleva "verdict": SUPPORTED si la evidencia lo sostiene, CONTRADICTED si la refuta o si hay evidencia en conflicto, UNCERTAIN si es insuficiente.',
        'Devuelve "assessment": SUPPORTED | UNSUPPORTED | AMBIGUOUS | REFRAMED. Usa REFRAMED si la afirmación es exagerada pero hay una pregunta investigable más estrecha. Usa UNSUPPORTED si la evidencia contradice la afirmación. Usa AMBIGUOUS si la evidencia es mixta o insuficiente.',
        'Devuelve "confidence" en [0,1] y "uncertainties" (lista).',
        'Responde SOLO con JSON: {"synthesis":"...","findings":[...],"claims":[...],"assessment":"...","confidence":0.0,"uncertainties":["..."]}',
      ].join(' '),
    });

    let response;
    try {
      response = await this.llm.complete({
        stage: 'deep_research',
        system: SYSTEM_DEEP_RESEARCH,
        prompt,
        json: true,
        temperature: 0,
      });
    } catch (error) {
      return {
        ...deriveFallback(handoff, evidence),
        provider: 'deterministic',
        model: 'deep-research-fallback',
        deterministic: true,
        synthesis:
          `No fue posible completar la síntesis cognitiva (${String((error as Error)?.message ?? error)}); ` +
          'la evidencia permanece sin interpretar.',
      };
    }

    const parsed = parseJson<SynthesisPayload>(response.text);
    if (!parsed) {
      const fallback = deriveFallback(handoff, evidence);
      return {
        ...fallback,
        provider: response.provider,
        model: response.model,
        deterministic: response.deterministic,
      };
    }

    const synthesis =
      typeof parsed.synthesis === 'string' && parsed.synthesis.trim().length > 0
        ? parsed.synthesis.trim()
        : deriveFallback(handoff, evidence).synthesis;
    const findings = normalizeFindings(parsed.findings, evidence);
    const claims = normalizeClaims(parsed.claims, handoff, evidence);
    const assessment = ASSESSMENTS.includes(parsed.assessment as ResearchAssessment)
      ? (parsed.assessment as ResearchAssessment)
      : deriveFallback(handoff, evidence).assessment;
    const confidence = clamp01(
      typeof parsed.confidence === 'number' ? parsed.confidence : deriveFallback(handoff, evidence).confidence
    );
    const uncertainties = stringArray(parsed.uncertainties);

    return {
      synthesis,
      findings: findings.length ? findings : deriveFallback(handoff, evidence).findings,
      claims: claims.length ? claims : deriveFallback(handoff, evidence).claims,
      assessment,
      confidence,
      uncertainties: uncertainties.length ? uncertainties : handoff.knownUncertainties,
      provider: response.provider,
      model: response.model,
      deterministic: response.deterministic,
    };
  }
}

export function buildSubQuestions(handoff: AthenaOsHandoff): string[] {
  const questions: string[] = [];
  const push = (value: string): void => {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed.length >= 6 && !questions.includes(trimmed)) questions.push(trimmed);
  };
  push(handoff.researchQuestion);
  for (const uncertainty of handoff.knownUncertainties.slice(0, 2)) {
    push(`¿${uncertainty.replace(/\?+$/, '')}?`);
  }
  for (const fact of handoff.proposedCandidateFacts.slice(0, 2)) {
    push(`¿Qué evidencia sostiene o refuta que ${fact.statement.replace(/\.$/, '')}?`);
  }
  return questions.slice(0, 4);
}

function statusFor(assessment: ResearchAssessment): ResearchStatus {
  if (assessment === 'SUPPORTED' || assessment === 'REFRAMED') return 'RESEARCHED_CONFIRMED';
  if (assessment === 'UNSUPPORTED') return 'RESEARCHED_REFUTED';
  return 'RESEARCHED_INCONCLUSIVE';
}

function deriveFallback(
  handoff: AthenaOsHandoff,
  evidence: ResearchEvidenceRef[]
): {
  synthesis: string;
  findings: ResearchFinding[];
  claims: ResearchClaim[];
  assessment: ResearchAssessment;
  confidence: number;
  uncertainties: string[];
} {
  const verdict: ResearchVerdict = VERDICTS.includes(handoff.origin.assessment as ResearchVerdict)
    ? (handoff.origin.assessment as ResearchVerdict)
    : 'UNCERTAIN';
  const assessment: ResearchAssessment = ASSESSMENTS.includes(handoff.origin.assessment)
    ? handoff.origin.assessment
    : 'AMBIGUOUS';
  const refs = evidence.map((ref) => ref.url).slice(0, 4);
  const claims: ResearchClaim[] = handoff.proposedCandidateFacts.map((fact, index) => ({
    claimId: `cl-${index + 1}`,
    statement: fact.statement,
    verdict,
    confidence: 0.5,
    evidenceRefs: refs,
  }));
  const findings: ResearchFinding[] = refs.slice(0, 3).map((url, index) => ({
    kind: 'EVIDENCE' as FindingKind,
    text: `Evidencia recuperada ${index + 1} para la pregunta de investigación.`,
    refs: [url],
  }));
  return {
    synthesis:
      'La investigación no pudo sintetizarse con cognición real; se conserva la evidencia y la ' +
      'incertidumbre sin elevar ninguna afirmación a hecho.',
    findings,
    claims,
    assessment,
    confidence: 0.3,
    uncertainties: handoff.knownUncertainties,
  };
}

function normalizeFindings(value: unknown, evidence: ResearchEvidenceRef[]): ResearchFinding[] {
  if (!Array.isArray(value)) return [];
  const validRefs = new Set(evidence.map((ref) => ref.url));
  const findings: ResearchFinding[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!text) continue;
    const kind = FINDING_KINDS.includes(record.kind as FindingKind)
      ? (record.kind as FindingKind)
      : 'MODEL_INTERPRETATION';
    const refs = stringArray(record.refs).filter((ref) => validRefs.has(ref));
    findings.push({ kind, text, refs });
  }
  return findings;
}

function normalizeClaims(
  value: unknown,
  handoff: AthenaOsHandoff,
  evidence: ResearchEvidenceRef[]
): ResearchClaim[] {
  if (!Array.isArray(value)) return [];
  const validRefs = new Set(evidence.map((ref) => ref.url));
  const allRefs = [...validRefs].slice(0, 4);
  const claims: ResearchClaim[] = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const record = raw as Record<string, unknown>;
    const statement = typeof record.statement === 'string' ? record.statement.trim() : '';
    if (!statement) return;
    const verdict = VERDICTS.includes(record.verdict as ResearchVerdict)
      ? (record.verdict as ResearchVerdict)
      : 'UNCERTAIN';
    const evidenceRefs = stringArray(record.evidenceRefs).filter((ref) => validRefs.has(ref));
    claims.push({
      claimId: typeof record.claimId === 'string' ? record.claimId : `cl-${index + 1}`,
      statement,
      verdict,
      confidence: clamp01(record.confidence),
      evidenceRefs: evidenceRefs.length ? evidenceRefs : allRefs,
    });
  });
  if (!claims.length && handoff.proposedCandidateFacts.length) {
    return handoff.proposedCandidateFacts.map((fact, index) => ({
      claimId: `cl-${index + 1}`,
      statement: fact.statement,
      verdict: 'UNCERTAIN' as ResearchVerdict,
      confidence: 0.3,
      evidenceRefs: allRefs,
    }));
  }
  return claims;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function clamp01(value: unknown): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0.3;
  return Number(Math.max(0, Math.min(1, num)).toFixed(4));
}
