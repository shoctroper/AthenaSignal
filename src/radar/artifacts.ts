/**
 * Artefactos de aceptación M4 (ORDEN-008 §8, §9, §10).
 *
 * Todos derivan del estado persistido y del timeline de eventos, de modo que
 * la evidencia es reconstruible sin depender de la narrativa del worker.
 */

import { HandoffValidator } from '../handoff/HandoffValidator.ts';
import type { Priority } from '../autonomous/types.ts';
import type { PipelineRunResult } from '../autonomous/pipeline.ts';
import type { RubricItem } from '../autonomous/types.ts';
import type {
  M4Benchmark,
  M4BenchmarkEntry,
  M4Corpus,
  M4HumanReviewPacket,
  M4Metrics,
  RadarCandidate,
  RadarCandidateReview,
  RadarCluster,
  RadarState,
  RadarTimeline,
} from './types.ts';
import { RADAR_EVENT_KINDS } from './types.ts';

export const M4_RUBRIC: RubricItem[] = [
  { id: 'P1', question: '¿El radar recordó señales entre ejecuciones/ciclos?' },
  { id: 'P2', question: '¿Distinguió material nuevo de material conocido?' },
  { id: 'P3', question: '¿Evitó duplicar fuentes y señales repetidas (idempotencia)?' },
  { id: 'P4', question: '¿Vinculó fuentes relacionadas en clusters con sentido?' },
  { id: 'P5', question: '¿Incorporó y registró evidencia nueva a lo largo del tiempo?' },
  { id: 'P6', question: '¿Reevaluó candidates cuando cambió la evidencia?' },
  { id: 'P7', question: '¿Reflejó contradicciones reales entre fuentes?' },
  { id: 'P8', question: '¿Cambió prioridades con una justificación observable?' },
  { id: 'P9', question: '¿Descartó ruido promocional/no investigable?' },
  { id: 'P10', question: '¿El candidate promovido llega a AthenaOS con handoff válido y suficiente?' },
];

export const M4_BENCHMARK_ENTRIES: M4BenchmarkEntry[] = [
  {
    id: 'bench-m4-dedup-repeat',
    description: 'Reprocesar una fuente ya vista no la duplica y registra KNOWN/DUPLICATE.',
    cycles: ['m4-cycle-1', 'm4-cycle-2'],
    expected: { eventKinds: ['DUPLICATE', 'KNOWN'] },
  },
  {
    id: 'bench-m4-cross-source-link',
    description: 'Una fuente relacionada se vincula al cluster existente y amplía la evidencia.',
    cycles: ['m4-cycle-1', 'm4-cycle-2'],
    expected: { eventKinds: ['RELATED', 'UPDATED'] },
  },
  {
    id: 'bench-m4-priority-change',
    description: 'La evidencia acumulada cambia la prioridad del candidate (MEDIUM → HIGH).',
    cycles: ['m4-cycle-1', 'm4-cycle-2'],
    expected: { eventKinds: ['PRIORITY_CHANGED'] },
  },
  {
    id: 'bench-m4-contradiction',
    description: 'Evidencia contradictoria se refleja como contradicción explícita y reevaluación.',
    cycles: ['m4-cycle-3', 'm4-cycle-4'],
    expected: { eventKinds: ['CONTRADICTED', 'REASSESSED'], contradiction: true },
  },
  {
    id: 'bench-m4-noise-discard',
    description: 'El ruido promocional terciario se descarta.',
    cycles: ['m4-cycle-5'],
    expected: { eventKinds: ['DISCARDED'], discarded: true },
  },
  {
    id: 'bench-m4-reframing',
    description: 'Un claim incorrecto se reformula y sigue siendo investigable.',
    cycles: ['m4-cycle-5'],
    expected: { eventKinds: ['NEW'] },
  },
  {
    id: 'bench-m4-promotion',
    description: 'Un candidate suficientemente sostenido se promueve a AthenaOS.',
    cycles: ['m4-cycle-1', 'm4-cycle-2', 'm4-cycle-6'],
    expected: { eventKinds: ['PROMOTED'], promoted: true },
  },
];

export function buildTimeline(
  state: RadarState,
  corpus: M4Corpus,
  generatedAt: string
): RadarTimeline {
  const cycles = corpus.cycles.map((cycle) => {
    const events = state.events.filter((event) => event.cycleId === cycle.cycleId);
    const eventCounts: Record<string, number> = {};
    for (const event of events) eventCounts[event.kind] = (eventCounts[event.kind] ?? 0) + 1;
    return {
      cycleId: cycle.cycleId,
      cycleNumber: cycle.cycleNumber,
      occurredAt: cycle.occurredAt,
      sourceIds: [...cycle.sourceIds],
      events,
      eventCounts,
    };
  });

  const eventTotals: Record<string, number> = {};
  for (const kind of RADAR_EVENT_KINDS) {
    eventTotals[kind] = state.events.filter((event) => event.kind === kind).length;
  }

  return {
    kind: 'athenasignal.m4.radar_timeline.v1',
    generatedAt,
    cycles,
    eventTotals,
  };
}

export function buildMetrics(input: {
  state: RadarState;
  corpus: M4Corpus;
  pipeline: PipelineRunResult;
  generatedAt: string;
  missingRecordings: string[];
}): M4Metrics {
  const { state, corpus, pipeline } = input;
  const candidates = Object.values(state.candidates);
  const clusters = Object.values(state.clusters);
  const benchmark = buildBenchmark(input.generatedAt);

  return {
    kind: 'athenasignal.m4.metrics.v1',
    generatedAt: input.generatedAt,
    cycles: state.cyclesProcessed.length,
    sourcesIngested: Object.keys(state.processedSources).length,
    signalsTracked: Object.keys(state.signals).length,
    clusters: clusters.length,
    candidates: candidates.length,
    promoted: candidates.filter((candidate) => candidate.status === 'PROMOTED').length,
    discarded: candidates.filter((candidate) => candidate.status === 'DISCARDED').length,
    eventCounts: { ...state.eventCounts },
    eventTotals: state.events.length,
    dedup: {
      repeatedSources: Object.values(state.processedSources).filter((source) => source.timesSeen > 1).length,
      knownSignals: state.events.filter((event) => event.kind === 'KNOWN').length,
      uniqueSignals: Object.keys(state.signals).length,
    },
    contradictions: clusters.filter((cluster) => cluster.contradiction).length,
    reassessments: state.events.filter((event) => event.kind === 'REASSESSED').length,
    priorityChanges: state.events.filter((event) => event.kind === 'PRIORITY_CHANGED').length,
    llm: {
      providerChain: pipeline.llm.providerChain,
      realResponses: pipeline.llm.realResponses,
      deterministicResponses: pipeline.llm.deterministicResponses,
      replayMisses: [...input.missingRecordings].sort(),
    },
    research: {
      queries: new Set(pipeline.queries).size,
      evidenceItems: Object.values(pipeline.evidence).reduce((sum, items) => sum + items.length, 0),
      missingRecordings: [...input.missingRecordings].sort(),
    },
    falsePositiveObservations: falsePositives(state, corpus, benchmark),
  };
}

export function buildBenchmark(generatedAt: string): M4Benchmark {
  return {
    kind: 'athenasignal.m4.benchmark.v1',
    generatedAt,
    entries: M4_BENCHMARK_ENTRIES.map((entry) => ({
      ...entry,
      cycles: [...entry.cycles],
      expected: { ...entry.expected, eventKinds: entry.expected.eventKinds ? [...entry.expected.eventKinds] : undefined },
    })),
  };
}

function falsePositives(state: RadarState, corpus: M4Corpus, benchmark: M4Benchmark): string[] {
  const observations: string[] = [];
  const cycleIds = new Set(corpus.cycles.map((cycle) => cycle.cycleId));
  const allCycleIds = new Set(state.cyclesProcessed);

  for (const entry of benchmark.entries) {
    const relevantCycleIds = entry.cycles.filter((cycleId) => cycleIds.has(cycleId));
    const scoped = state.events.filter((event) => relevantCycleIds.includes(event.cycleId));
    const kinds = new Set(scoped.map((event) => event.kind));
    for (const expected of entry.expected.eventKinds ?? []) {
      if (!kinds.has(expected)) {
        observations.push(`Benchmark ${entry.id}: se esperaba evento ${expected} y no se observó.`);
      }
    }
    if (entry.expected.contradiction && !Object.values(state.clusters).some((cluster) => cluster.contradiction)) {
      observations.push(`Benchmark ${entry.id}: se esperaba una contradicción y no se observó.`);
    }
    if (entry.expected.discarded && !Object.values(state.candidates).some((candidate) => candidate.status === 'DISCARDED')) {
      observations.push(`Benchmark ${entry.id}: se esperaba un candidate descartado y no se observó.`);
    }
    if (entry.expected.promoted && !Object.values(state.candidates).some((candidate) => candidate.status === 'PROMOTED')) {
      observations.push(`Benchmark ${entry.id}: se esperaba un candidate promovido y no se observó.`);
    }
  }

  if (allCycleIds.size !== corpus.cycles.length) {
    observations.push(
      `Se esperaba procesar ${corpus.cycles.length} ciclos y se procesaron ${allCycleIds.size}.`
    );
  }
  return observations;
}

export function buildHandoff(input: { state: RadarState; generatedAt: string }): {
  kind: 'athenasignal.handoff_bundle.v1';
  generatedAt: string;
  handoffs: Array<{
    candidateId: string;
    clusterId: string;
    priority: Priority;
    assessment: RadarCandidate['assessment'];
    promotedAt: string | null;
    promotionReason: string | null;
    promotionReasons: string[];
    validation: { valid: boolean; errors: string[] };
    recommendedAthenaOsInput: RadarCandidate['recommendedAthenaOsInput'];
  }>;
} {
  const validator = new HandoffValidator();
  const promoted = Object.values(input.state.candidates)
    .filter((candidate) => candidate.status === 'PROMOTED')
    .sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));

  return {
    kind: 'athenasignal.handoff_bundle.v1',
    generatedAt: input.generatedAt,
    handoffs: promoted.map((candidate) => {
      const cluster = input.state.clusters[candidate.clusterId];
      return {
        candidateId: candidate.candidateId,
        clusterId: candidate.clusterId,
        priority: candidate.priority,
        assessment: candidate.assessment,
        promotedAt: cluster?.promotedAt ?? null,
        promotionReason: candidate.promotionReason,
        promotionReasons: [...candidate.promotionReasons],
        validation: validator.validate(candidate.recommendedAthenaOsInput),
        recommendedAthenaOsInput: candidate.recommendedAthenaOsInput,
      };
    }),
  };
}

export function buildHumanReviewPacket(input: {
  state: RadarState;
  generatedAt: string;
  falsePositiveObservations: string[];
}): M4HumanReviewPacket {
  const { state } = input;
  const candidates = Object.values(state.candidates);
  const clusters = Object.values(state.clusters);

  const reviews = candidates.map((candidate) => toReview(candidate, state));
  const viable = reviews.filter((review) => review.status !== 'DISCARDED');
  const bestPool = viable.length ? viable : reviews;
  const activePool = reviews.filter((review) => review.status === 'ACTIVE');

  const best = [...bestPool].sort(
    (a, b) => b.score - a.score || (a.candidateId < b.candidateId ? -1 : 1)
  )[0] ?? null;
  const worst = [...(activePool.length ? activePool : bestPool)].sort(
    (a, b) => a.score - b.score || (a.candidateId < b.candidateId ? -1 : 1)
  )[0] ?? null;

  const largest = largestPriorityChange(candidates);
  const dedup = mostDifficultDeduplication(state);
  const contradictionCluster = clusters
    .filter((cluster) => cluster.contradiction)
    .sort((a, b) => (a.clusterId < b.clusterId ? -1 : 1))[0];
  const reframingCandidate = candidates
    .filter((candidate) => candidate.recommendedAthenaOsInput.origin.assessment === 'REFRAMED')
    .sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1))[0];
  const discardedCandidate = candidates
    .filter((candidate) => candidate.status === 'DISCARDED')
    .sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1))[0];
  const discardEvent = state.events.find(
    (event) => event.kind === 'DISCARDED' && discardedCandidate && event.subjectId === discardedCandidate.clusterId
  );

  return {
    kind: 'athenasignal.m4.human_review_packet.v1',
    generatedAt: input.generatedAt,
    rubric: M4_RUBRIC.map((item) => ({ ...item })),
    bestCandidate: best,
    worstCandidate: worst,
    largestPriorityChange: largest,
    mostDifficultDeduplication: dedup,
    importantContradiction: contradictionCluster
      ? {
          clusterId: contradictionCluster.clusterId,
          details: [...contradictionCluster.contradictionDetails],
          resolutionNote: contradictionCluster.resolutionNote,
          why: `El cluster ${contradictionCluster.label} reúne fuentes con posturas opuestas; la tensión es material editorial.`,
        }
      : null,
    importantReframing:
      reframingCandidate && reframingCandidate.recommendedAthenaOsInput.origin.reframingNote
        ? {
            candidateId: reframingCandidate.candidateId,
            note: reframingCandidate.recommendedAthenaOsInput.origin.reframingNote,
            why: 'El claim original no se acepta como hecho y se conserva la idea subyacente como pregunta investigable.',
          }
        : null,
    importantDiscard:
      discardedCandidate && discardEvent
        ? {
            candidateId: discardedCandidate.candidateId,
            reason: Array.isArray(discardEvent.details.reasons)
              ? (discardEvent.details.reasons as string[]).join(' ')
              : discardEvent.message,
            why: 'Ruido promocional sin realidad investigable; se descartó sin destruir el estado.',
          }
        : null,
    promotedToAthenaOs: reviews.filter((review) => review.status === 'PROMOTED'),
  };
}

function toReview(candidate: RadarCandidate, state: RadarState): RadarCandidateReview {
  const cluster = state.clusters[candidate.clusterId];
  return {
    candidateId: candidate.candidateId,
    title: candidate.title,
    researchQuestion: candidate.researchQuestion,
    priority: candidate.priority,
    assessment: candidate.assessment,
    status: candidate.status,
    score: candidate.priorityScore,
    sourceCount: candidate.sourceIds.length,
    evidenceCount: cluster?.evidenceUrls.length ?? 0,
    cycles: candidate.priorityHistory.map((point) => point.cycleId),
    priorityReasons: [...candidate.priorityReasons],
    resolutionNote: candidate.resolutionNote,
    promotionReason: candidate.promotionReason,
    why: buildWhy(candidate, cluster),
  };
}

function buildWhy(candidate: RadarCandidate, cluster: RadarCluster | undefined): string {
  const parts: string[] = [];
  parts.push(`${candidate.sourceIds.length} fuentes, ${cluster?.evidenceUrls.length ?? 0} evidencias.`);
  if (cluster?.contradiction) parts.push('Contiene contradicción abierta.');
  if (candidate.status === 'PROMOTED') parts.push('Promovido a AthenaOS.');
  if (candidate.status === 'DISCARDED') parts.push('Descartado.');
  parts.push(`Evaluación ${candidate.assessment} con prioridad ${candidate.priority}.`);
  return parts.join(' ');
}

const PRIORITY_VALUE: Record<Priority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, DISCARD: 0 };

function largestPriorityChange(candidates: RadarCandidate[]): M4HumanReviewPacket['largestPriorityChange'] {
  let best: M4HumanReviewPacket['largestPriorityChange'] = null;
  for (const candidate of candidates) {
    if (candidate.priorityHistory.length < 2) continue;
    const values = candidate.priorityHistory.map((point) => PRIORITY_VALUE[point.priority]);
    const delta = Math.max(...values) - Math.min(...values);
    if (delta <= 0) continue;
    const first = candidate.priorityHistory[0];
    const last = candidate.priorityHistory[candidate.priorityHistory.length - 1];
    if (!best || delta > best.delta) {
      best = {
        candidateId: candidate.candidateId,
        from: first.priority,
        to: last.priority,
        delta,
        cycles: candidate.priorityHistory.map((point) => point.cycleId),
        why: `La prioridad evolucionó de ${first.priority} a ${last.priority} al acumular evidencia/contradicción.`,
      };
    }
  }
  return best;
}

function mostDifficultDeduplication(state: RadarState): M4HumanReviewPacket['mostDifficultDeduplication'] {
  const sources = Object.entries(state.processedSources)
    .filter(([, value]) => value.timesSeen > 1)
    .sort((a, b) => b[1].timesSeen - a[1].timesSeen || (a[0] < b[0] ? -1 : 1));
  if (!sources.length) return null;
  const [sourceId, value] = sources[0];
  const cycles = state.events
    .filter((event) => event.subjectId === sourceId && (event.kind === 'DUPLICATE' || event.kind === 'KNOWN'))
    .map((event) => event.cycleId);
  return {
    subjectId: sourceId,
    seenCount: value.timesSeen,
    cycles,
    why: `La fuente ${sourceId} reapareció ${value.timesSeen} veces; el radar la reconoció sin duplicar señales ni evidencia.`,
  };
}
