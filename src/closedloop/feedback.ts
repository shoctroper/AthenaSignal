/**
 * Motor de feedback/radar M6 (ORDEN-010 §2.3, §2.9, §3, §4).
 *
 * Toma el resultado estructurado que regresó de AthenaOS vía AKP y muta el
 * estado editorial del radar: amplía evidencia, reevalúa, registra
 * contradicción, actualiza interpretación, recalcula prioridad y promueve/cierra
 * candidates. **Nunca sobrescribe el pasado**: conserva la identidad, el
 * historial de prioridad y separa explícitamente
 * `original signal · research question · research result · new evidence ·
 * new interpretation`.
 *
 * Un resultado de investigación no se convierte en hecho: sólo informa la
 * evaluación y la decisión editorial, preservando provenance y assessment.
 */

import type { ResearchAssessment } from '../domain/entities.ts';
import type { Priority } from '../autonomous/types.ts';
import {
  buildPriorityReasons,
  computePriorityScore,
  contradictionResolutionNote,
  promotionReason,
  promotionReasons,
  priorityFromScore,
  qualifiesForDiscard,
  qualifiesForPromotion,
} from '../radar/engine.ts';
import type { RadarCandidate, RadarCluster, RadarState } from '../radar/types.ts';
import type {
  AthenaOsResearchResult,
  FeedbackChange,
  FeedbackSnapshot,
  FeedbackUpdate,
  ResearchLayers,
} from './types.ts';

export interface FeedbackContext {
  at: string;
  cycleId: string;
  cycleNumber: number;
  runId: string;
}

export interface FeedbackResult {
  update: FeedbackUpdate;
  promoted: boolean;
  closed: boolean;
  reopened: boolean;
  priorityChanged: boolean;
  contradictionAdded: boolean;
  evidenceAdded: number;
}

const ASSESSMENT_DELTA: Record<ResearchAssessment, number> = {
  SUPPORTED: 0.06,
  REFRAMED: 0.03,
  AMBIGUOUS: 0,
  UNSUPPORTED: -0.18,
};

/**
 * Aplica un resultado al radar (mutación in-place) y devuelve la evidencia de
 * la mutación. Devuelve `null` si el candidate ya no existe (no inventa estado).
 */
export function applyResearchFeedback(
  radar: RadarState,
  result: AthenaOsResearchResult,
  ctx: FeedbackContext
): FeedbackResult | null {
  const candidate = radar.candidates[result.candidateId];
  if (!candidate) return null;
  const cluster = radar.clusters[candidate.clusterId];
  if (!cluster) return null;

  const previous = snapshot(candidate, cluster);
  const changes: FeedbackChange[] = [];

  const evidenceAdded = mergeEvidence(cluster, result.layers.newEvidence);
  if (evidenceAdded > 0) changes.push('EVIDENCE_ADDED');

  if (cluster.assessment !== result.finalAssessment || candidate.assessment !== result.finalAssessment) {
    cluster.assessment = result.finalAssessment;
    candidate.assessment = result.finalAssessment;
    changes.push('ASSESSMENT_CHANGED');
  }

  const contradictionAdded = mergeContradictions(cluster, result);
  if (contradictionAdded) changes.push('CONTRADICTION_ADDED');

  const note = `AthenaOS (${result.resultId}): ${result.layers.newInterpretation}`.slice(0, 1500);
  if (candidate.resolutionNote !== note) {
    candidate.resolutionNote = note;
    changes.push('INTERPRETATION_UPDATED');
  }

  const records = cluster.signalIds
    .map((signalId) => radar.signals[signalId])
    .filter((record): record is NonNullable<typeof record> => Boolean(record));

  const baseScore = computePriorityScore(cluster, records);
  const delta = ASSESSMENT_DELTA[result.finalAssessment] + (contradictionAdded ? -0.04 : 0);
  const score = clamp01(baseScore + delta);
  cluster.priorityScore = score;

  const wasStatus = candidate.status;
  const refuted = result.status === 'RESEARCHED_REFUTED';
  const inconclusive = result.status === 'RESEARCHED_INCONCLUSIVE';
  const confirmed = result.status === 'RESEARCHED_CONFIRMED';
  const discard = refuted || qualifiesForDiscard(cluster, records) || result.finalAssessment === 'UNSUPPORTED';

  let priority: Priority = discard
    ? 'DISCARD'
    : priorityFromScore(score, {
        sources: cluster.sourceIds.length,
        evidence: cluster.evidenceUrls.length,
      });
  let nextStatus: RadarCandidate['status'] = wasStatus;
  let transitionReason = '';

  if (discard) {
    nextStatus = 'DISCARDED';
    transitionReason = refuted
      ? 'AthenaOS refutó la afirmación → CLOSED_REFUTED (prioridad DISCARD).'
      : 'La evidencia/assessment descartan el candidate → CLOSED.';
  } else if (inconclusive && wasStatus === 'PROMOTED') {
    // ORDEN-010 §0bis: un AMBIGUOUS/INCONCLUSIVE sobre un PROMOTED no puede
    // seguir PROMOTED; se reabre y se acota la prioridad.
    nextStatus = 'ACTIVE';
    transitionReason = 'AthenaOS no confirmó un candidate PROMOTED → REOPENED con prioridad acotada.';
    if (priority === 'HIGH') priority = 'MEDIUM';
  } else if (confirmed) {
    nextStatus = qualifiesForPromotion(cluster, records)
      ? 'PROMOTED'
      : wasStatus === 'DISCARDED'
        ? 'ACTIVE'
        : wasStatus;
    if (nextStatus === 'PROMOTED' && wasStatus !== 'PROMOTED') {
      transitionReason = 'AthenaOS confirmó la afirmación → consolidación/promoción editorial.';
    }
  } else if (wasStatus === 'DISCARDED') {
    nextStatus = 'ACTIVE';
    transitionReason = 'Nueva investigación reabre un candidate descartado → REOPENED.';
  }

  const priorityChanged = cluster.priority !== priority;
  cluster.priority = priority;
  cluster.priorityReasons = buildPriorityReasons(cluster, records);
  cluster.resolutionNote = contradictionResolutionNote(cluster, records);
  cluster.lastCycle = ctx.cycleId;

  if (nextStatus !== wasStatus) {
    if (nextStatus === 'DISCARDED') changes.push(refuted ? 'CLOSED_REFUTED' : 'CLOSED');
    else if (nextStatus === 'PROMOTED') changes.push('PROMOTED');
    else if (nextStatus === 'ACTIVE') changes.push('REOPENED');

    cluster.statusHistory = Array.isArray(cluster.statusHistory) ? cluster.statusHistory : [];
    cluster.statusHistory.push({
      cycleId: ctx.cycleId,
      cycleNumber: ctx.cycleNumber,
      status: nextStatus,
      reason: transitionReason,
      at: ctx.at,
    });
  }
  if (priorityChanged) changes.push('PRIORITY_CHANGED');

  candidate.status = nextStatus;
  cluster.status = nextStatus;
  candidate.priorityHistory = cluster.priorityHistory.map((point) => ({ ...point }));
  candidate.statusHistory = cluster.statusHistory.map((point) => ({ ...point }));
  if (nextStatus === 'PROMOTED') {
    cluster.promotedAt = cluster.promotedAt ?? ctx.at;
    candidate.promotionReason = promotionReason(cluster);
    candidate.promotionReasons = promotionReasons(cluster);
  }

  candidate.priority = priority;
  candidate.priorityScore = score;
  candidate.priorityReasons = [...cluster.priorityReasons];
  candidate.lastCycle = ctx.cycleId;

  // El historial registra la revisita de investigación, incluso si no cambia la
  // prioridad: deja traza de que AthenaOS informó la decisión.
  cluster.priorityHistory.push({
    cycleId: ctx.cycleId,
    cycleNumber: ctx.cycleNumber,
    priority,
    score,
  });
  candidate.priorityHistory = cluster.priorityHistory.map((point) => ({ ...point }));

  if (!changes.length) changes.push('INTERPRETATION_UPDATED');

  const layers: ResearchLayers = {
    originalSignal: result.layers.originalSignal,
    researchQuestion: result.layers.researchQuestion,
    researchResult: result.layers.researchResult,
    newEvidence: [...result.layers.newEvidence],
    newInterpretation: result.layers.newInterpretation,
  };

  const next = snapshot(candidate, cluster);
  const update: FeedbackUpdate = {
    kind: 'athenasignal.m6.feedback_update.v1',
    updateId: `fb-${result.resultId}`,
    resultId: result.resultId,
    candidateId: candidate.candidateId,
    clusterId: cluster.clusterId,
    runId: ctx.runId,
    at: ctx.at,
    cycleId: ctx.cycleId,
    cycleNumber: ctx.cycleNumber,
    previous,
    next,
    changes: dedupe(changes),
    layers,
    reason:
      `AthenaOS (${result.status}, ${result.finalAssessment}) informó la decisión editorial: ` +
      describeChanges(dedupe(changes)),
  };

  return {
    update,
    promoted: nextStatus === 'PROMOTED' && wasStatus !== 'PROMOTED',
    closed: nextStatus === 'DISCARDED' && wasStatus !== 'DISCARDED',
    reopened: nextStatus === 'ACTIVE' && wasStatus === 'DISCARDED',
    priorityChanged,
    contradictionAdded,
    evidenceAdded,
  };
}

function snapshot(candidate: RadarCandidate, cluster: RadarCluster): FeedbackSnapshot {
  return {
    assessment: cluster.assessment,
    priority: cluster.priority,
    score: cluster.priorityScore,
    status: cluster.status,
    evidence: cluster.evidenceUrls.length,
    contradiction: cluster.contradiction,
  };
}

function mergeEvidence(cluster: RadarCluster, urls: string[]): number {
  let added = 0;
  for (const url of urls) {
    if (!url || cluster.evidenceUrls.includes(url)) continue;
    cluster.evidenceUrls.push(url);
    added += 1;
  }
  if (added) cluster.evidenceUrls.sort();
  return added;
}

function mergeContradictions(cluster: RadarCluster, result: AthenaOsResearchResult): boolean {
  const contradicting = result.claims.filter((claim) => claim.verdict === 'CONTRADICTED');
  if (!contradicting.length) return false;
  let added = false;
  for (const claim of contradicting) {
    const detail = `AthenaOS contradice: ${claim.statement}`;
    if (!cluster.contradictionDetails.includes(detail)) {
      cluster.contradictionDetails.push(detail);
      added = true;
    }
  }
  cluster.contradiction = cluster.contradictionDetails.length > 0;
  return added;
}

function describeChanges(changes: FeedbackChange[]): string {
  return changes
    .map((change) => change.toLowerCase().replace(/_/g, ' '))
    .join(', ');
}

function dedupe(values: FeedbackChange[]): FeedbackChange[] {
  return [...new Set(values)];
}

function clamp01(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}
