/**
 * Motor de resolución epistémica M7 (ORDEN-011 §2, §3, §5).
 *
 * Formaliza los estados epistémicos y sus transiciones **evidence-driven**: una
 * transición sólo ocurre cuando la evidencia recuperada por la investigación la
 * justifica, y cada transición conserva refs + provenance + claims. El historial
 * completo se preserva y nunca se sobrescribe.
 *
 * No decide por etiqueta: la postura (`SUPPORT`/`REFUTE`/`UNCERTAIN`) se deriva
 * del resultado estructurado (assessment, verdicts y evidencia), no de un campo
 * manual. La promoción/cierre se delegan a reglas explícitas y a la corroboración
 * real del radar.
 */

import type { SourceRole } from '../domain/entities.ts';
import type { RadarCandidate, RadarState } from '../radar/types.ts';
import type { Priority } from '../autonomous/types.ts';
import type {
  EpistemicEvidenceRef,
  EpistemicResolution,
  EpistemicStance,
  EpistemicStatus,
  EpistemicTransition,
  M7ResearchResult,
  ResolutionVerdict,
} from './types.ts';

const AUTHORITATIVE_PATTERNS: RegExp[] = [
  /\.gov(\/|$|\?)/i,
  /gob\.mx/i,
  /who\.int/i,
  /cochrane/i,
  /pubmed/i,
  /ncbi\.nlm\.nih\.gov/i,
  /doi\.org/i,
  /\.edu(\/|$|\?)/i,
  /sciencedirect/i,
  /nature\.com/i,
  /springer/i,
  /ieee\.org/i,
  /acm\.org/i,
  /arxiv\.org/i,
];

export function isAuthoritativeUrl(url: string): boolean {
  return AUTHORITATIVE_PATTERNS.some((pattern) => pattern.test(url));
}

export interface EpistemicApplyInput {
  candidateId: string;
  clusterId: string;
  title: string;
  result: M7ResearchResult | null;
  wave: number;
  at: string;
  cycleId: string;
  runId: string;
  qualifiesPromotion: boolean;
  contradictionDetails: string[];
}

export interface EpistemicApplyOutcome {
  resolution: EpistemicResolution;
  transitions: EpistemicTransition[];
  noOp: boolean;
}

export class EpistemicLedger {
  private readonly resolutionsById = new Map<string, EpistemicResolution>();
  private transitionSequence = 0;

  /** Siembra un candidate sin investigación todavía (o con estado heredado del radar). */
  seed(input: {
    candidateId: string;
    clusterId: string;
    title: string;
    status: EpistemicStatus;
    at: string;
    reason: string;
    runId?: string;
  }): EpistemicResolution {
    const existing = this.resolutionsById.get(input.candidateId);
    const resolution: EpistemicResolution = existing ?? {
      kind: 'athenasignal.m7.epistemic_resolution.v1',
      candidateId: input.candidateId,
      clusterId: input.clusterId,
      title: input.title,
      currentStatus: 'RESEARCHABLE',
      verdict: 'INCONCLUSIVE',
      confidence: 0,
      statusHistory: [],
      evidenceRefs: [],
      provenance: [],
      contradictions: [],
      researchResultIds: [],
      layers: null,
      lastUpdatedAt: input.at,
      reason: 'Candidate descubierto; pendiente de investigación.',
    };
    resolution.clusterId = input.clusterId;
    resolution.title = input.title;
    resolution.lastUpdatedAt = input.at;
    if (input.status !== 'RESEARCHABLE') {
      this.pushTransition(resolution, {
        from: 'RESEARCHABLE',
        to: input.status,
        at: input.at,
        wave: 0,
        cycleId: 'm7-seed',
        runId: input.runId ?? 'm7-import',
        result: null,
        stance: 'UNCERTAIN',
        evidenceRefs: [],
        provenance: [],
        claims: [],
        reason: input.reason,
      });
    }
    resolution.currentStatus = input.status;
    resolution.verdict = verdictFor(input.status);
    this.resolutionsById.set(input.candidateId, resolution);
    return resolution;
  }

  apply(input: EpistemicApplyInput): EpistemicApplyOutcome {
    const resolution = this.resolutionsById.get(input.candidateId);
    const transitions: EpistemicTransition[] = [];
    if (!resolution) {
      throw new Error(`[EpistemicLedger] candidate no sembrado: ${input.candidateId}`);
    }
    if (!input.result) {
      return { resolution, transitions, noOp: true };
    }

    const result = input.result;
    const provenance = evidenceRefsFor(result);
    const evidenceRefs = provenance.map((ref) => ref.url);
    const stance = classifyStance(result);
    const authoritative = provenance.filter((ref) => ref.authoritative).length;

    // Idempotencia epistémica: el mismo resultado no vuelve a transicionar.
    const already = resolution.researchResultIds.includes(result.resultId);
    if (already) {
      return { resolution, transitions, noOp: true };
    }

    resolution.researchResultIds.push(result.resultId);
    resolution.evidenceRefs = union(resolution.evidenceRefs, evidenceRefs);
    resolution.provenance = unionProvenance(resolution.provenance, provenance);
    resolution.contradictions = union(resolution.contradictions, contradictionStatements(result, input.contradictionDetails));
    resolution.layers = {
      originalSignal: result.layers.originalSignal,
      researchQuestion: result.layers.researchQuestion,
      researchResult: result.layers.researchResult,
      newEvidence: [...result.layers.newEvidence],
      newInterpretation: result.layers.newInterpretation,
    };
    if (result.confidence > resolution.confidence) resolution.confidence = result.confidence;

    let previous = resolution.currentStatus;

    // Reapertura: nueva evidencia sobre un candidate descartado reabre la evaluación.
    if (previous === 'DISCARDED') {
      const reopened = this.pushTransition(resolution, {
        from: 'DISCARDED',
        to: 'REOPENED',
        at: input.at,
        wave: input.wave,
        cycleId: input.cycleId,
        runId: input.runId,
        result,
        stance,
        evidenceRefs,
        provenance,
        claims: claimsFor(result),
        reason:
          `Nueva evidencia (${result.resultId}) reabre el candidate descartado: la decisión previa ` +
          'se revisa a la luz de la investigación.',
      });
      transitions.push(reopened);
      previous = 'REOPENED';
    }

    const next = nextStatus(previous, stance, {
      authoritative,
      qualifiesPromotion: input.qualifiesPromotion,
    });

    if (next !== previous) {
      const transition = this.pushTransition(resolution, {
        from: previous,
        to: next,
        at: input.at,
        wave: input.wave,
        cycleId: input.cycleId,
        runId: input.runId,
        result,
        stance,
        evidenceRefs,
        provenance,
        claims: claimsFor(result),
        reason: transitionReason(previous, next, stance, result, authoritative),
      });
      transitions.push(transition);
      resolution.currentStatus = next;
      resolution.verdict = verdictFor(next);
      resolution.reason = transition.reason;
    } else {
      resolution.reason = `Evidencia adicional sin cambio de estado (${result.resultId}, ${stance}).`;
    }
    resolution.lastUpdatedAt = input.at;

    return { resolution, transitions, noOp: false };
  }

  /** Reaplicación segura de un resultado ya procesado (idempotencia verificable). */
  reprocess(input: EpistemicApplyInput): EpistemicApplyOutcome {
    return this.apply(input);
  }

  get(candidateId: string): EpistemicResolution | undefined {
    return this.resolutionsById.get(candidateId);
  }

  all(): EpistemicResolution[] {
    return [...this.resolutionsById.values()].sort((a, b) =>
      a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0
    );
  }

  byStatus(): Record<EpistemicStatus, string[]> {
    const board = {
      RESEARCHABLE: [],
      CONFIRMED: [],
      REFUTED: [],
      INCONCLUSIVE: [],
      CLOSED_CONFIRMED: [],
      CLOSED_REFUTED: [],
      REOPENED: [],
      DEMOTED: [],
      PROMOTED: [],
      DISCARDED: [],
    } as Record<EpistemicStatus, string[]>;
    for (const resolution of this.all()) board[resolution.currentStatus].push(resolution.candidateId);
    return board;
  }

  private pushTransition(
    resolution: EpistemicResolution,
    input: {
      from: EpistemicStatus;
      to: EpistemicStatus;
      at: string;
      wave: number;
      cycleId: string;
      runId: string;
      result: M7ResearchResult | null;
      stance: EpistemicStance;
      evidenceRefs: string[];
      provenance: EpistemicEvidenceRef[];
      claims: EpistemicTransition['claims'];
      reason: string;
    }
  ): EpistemicTransition {
    this.transitionSequence += 1;
    const transition: EpistemicTransition = {
      transitionId: `et-${input.result?.candidateId ?? resolution.candidateId}-${String(this.transitionSequence).padStart(3, '0')}`,
      candidateId: resolution.candidateId,
      sequence: resolution.statusHistory.length + 1,
      wave: input.wave,
      from: input.from,
      to: input.to,
      at: input.at,
      cycleId: input.cycleId,
      runId: input.runId,
      researchResultId: input.result?.resultId ?? null,
      stance: input.stance,
      evidenceRefs: [...input.evidenceRefs],
      provenance: input.provenance.map((ref) => ({ ...ref })),
      claims: input.claims.map((claim) => ({ ...claim })),
      reason: input.reason,
    };
    resolution.statusHistory.push(transition);
    return transition;
  }
}

export function classifyStance(result: M7ResearchResult): EpistemicStance {
  const contradicted = result.claims.filter((claim) => claim.verdict === 'CONTRADICTED');
  const supported = result.claims.filter((claim) => claim.verdict === 'SUPPORTED');
  const refute =
    result.status === 'RESEARCHED_REFUTED' ||
    result.finalAssessment === 'UNSUPPORTED' ||
    contradicted.length > 0;
  if (refute) return 'REFUTE';
  const support =
    result.status === 'RESEARCHED_CONFIRMED' ||
    result.finalAssessment === 'SUPPORTED' ||
    (result.finalAssessment === 'REFRAMED' && (supported.length > 0 || result.evidence.length > 0));
  if (support && (supported.length > 0 || result.evidence.length > 0)) return 'SUPPORT';
  return 'UNCERTAIN';
}

export function evidenceRefsFor(result: M7ResearchResult): EpistemicEvidenceRef[] {
  const refs = new Map<string, EpistemicEvidenceRef>();
  for (const evidence of result.evidence) {
    if (!evidence.url || refs.has(evidence.url)) continue;
    refs.set(evidence.url, {
      url: evidence.url,
      title: evidence.title,
      role: evidence.role as SourceRole,
      origin: evidence.origin,
      authoritative: isAuthoritativeUrl(evidence.url),
      researchResultId: result.resultId,
    });
  }
  for (const entry of result.provenance) {
    if (!entry.url || refs.has(entry.url)) continue;
    refs.set(entry.url, {
      url: entry.url,
      title: entry.title,
      role: entry.role as SourceRole,
      origin: 'RECORDING',
      authoritative: isAuthoritativeUrl(entry.url),
      researchResultId: result.resultId,
    });
  }
  return [...refs.values()].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

export function nextStatus(
  previous: EpistemicStatus,
  stance: EpistemicStance,
  context: { authoritative: number; qualifiesPromotion: boolean }
): EpistemicStatus {
  if (stance === 'REFUTE') {
    return context.authoritative >= 1 ? 'CLOSED_REFUTED' : 'REFUTED';
  }
  if (stance === 'SUPPORT') {
    if (previous === 'CONFIRMED' && context.qualifiesPromotion) return 'PROMOTED';
    if (previous === 'CONFIRMED') return 'CLOSED_CONFIRMED';
    if (previous === 'PROMOTED' || previous === 'CLOSED_CONFIRMED') return previous;
    return 'CONFIRMED';
  }
  // UNCERTAIN
  if (previous === 'CONFIRMED' || previous === 'PROMOTED' || previous === 'CLOSED_CONFIRMED') {
    return 'DEMOTED';
  }
  if (previous === 'DEMOTED') return 'DEMOTED';
  if (previous === 'REFUTED' || previous === 'CLOSED_REFUTED') return 'INCONCLUSIVE';
  return 'INCONCLUSIVE';
}

export function verdictFor(status: EpistemicStatus): ResolutionVerdict {
  if (status === 'CONFIRMED' || status === 'PROMOTED' || status === 'CLOSED_CONFIRMED') {
    return 'CONFIRMED';
  }
  if (status === 'REFUTED' || status === 'CLOSED_REFUTED') return 'REFUTED';
  return 'INCONCLUSIVE';
}

function transitionReason(
  from: EpistemicStatus,
  to: EpistemicStatus,
  stance: EpistemicStance,
  result: M7ResearchResult,
  authoritative: number
): string {
  const base = `AthenaOS ${result.resultId} (${result.finalAssessment}, postura ${stance})`;
  if (to === 'CLOSED_REFUTED') {
    return `${base}: evidencia autoritativa (${authoritative} refs) contradice la afirmación; cierre por refutación.`;
  }
  if (to === 'REFUTED') {
    return `${base}: la evidencia recuperada contradice la afirmación.`;
  }
  if (to === 'PROMOTED') {
    return `${base}: confirmación reiterada con corroboración suficiente para promoción editorial.`;
  }
  if (to === 'CLOSED_CONFIRMED') {
    return `${base}: segunda ola de evidencia confirma de nuevo; cierre por confirmación.`;
  }
  if (to === 'CONFIRMED') {
    return `${base}: evidencia suficiente sostiene la afirmación.`;
  }
  if (to === 'DEMOTED') {
    return `${base}: nueva evidencia introduce incertidumbre sobre un candidate confirmado; se degrada.`;
  }
  if (to === 'INCONCLUSIVE') {
    return `${base}: evidencia mixta/insuficiente; se conserva la incertidumbre (${from} → ${to}).`;
  }
  return `${base}: transición ${from} → ${to}.`;
}

export function seedStatusFor(
  candidate: RadarCandidate,
  hasResult: boolean
): EpistemicStatus {
  if (candidate.status === 'DISCARDED') return 'DISCARDED';
  if (candidate.status === 'PROMOTED') return 'PROMOTED';
  return hasResult ? 'RESEARCHABLE' : 'RESEARCHABLE';
}

export function candidateRecords(radar: RadarState, candidate: RadarCandidate): RadarState['signals'][string][] {
  const cluster = radar.clusters[candidate.clusterId];
  if (!cluster) return [];
  return cluster.signalIds
    .map((signalId) => radar.signals[signalId])
    .filter((record): record is RadarState['signals'][string] => Boolean(record));
}

function claimsFor(result: M7ResearchResult): EpistemicTransition['claims'] {
  return result.claims.slice(0, 8).map((claim) => ({
    claimId: claim.claimId,
    statement: claim.statement,
    verdict: claim.verdict,
  }));
}

function contradictionStatements(result: M7ResearchResult, extra: string[]): string[] {
  const fromClaims = result.claims
    .filter((claim) => claim.verdict === 'CONTRADICTED')
    .map((claim) => `AthenaOS contradice: ${claim.statement}`);
  return [...fromClaims, ...extra];
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

function unionProvenance(
  a: EpistemicEvidenceRef[],
  b: EpistemicEvidenceRef[]
): EpistemicEvidenceRef[] {
  const byUrl = new Map<string, EpistemicEvidenceRef>();
  for (const ref of [...a, ...b]) {
    if (!byUrl.has(ref.url)) byUrl.set(ref.url, { ...ref });
    else if (ref.authoritative) byUrl.get(ref.url)!.authoritative = true;
  }
  return [...byUrl.values()].sort((x, y) => (x.url < y.url ? -1 : x.url > y.url ? 1 : 0));
}

export type { Priority };
