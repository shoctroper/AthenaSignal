/**
 * Métricas M3 (ORDEN-007 §12). Derivadas de señales observables del batch.
 */

import type { Benchmark, Corpus, M3Metrics, Priority, ResearchAssessment } from './types.ts';
import type { PipelineRunResult } from './pipeline.ts';

export interface MetricsInput {
  pipeline: PipelineRunResult;
  corpus: Corpus;
  benchmark: Benchmark;
  generatedAt: string;
  missingRecordings: string[];
}

export function buildMetrics(input: MetricsInput): M3Metrics {
  const { pipeline, corpus, benchmark } = input;
  const candidates = pipeline.candidates;

  const priorityDistribution: Record<Priority, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    DISCARD: pipeline.discarded.length,
  };
  for (const candidate of candidates) priorityDistribution[candidate.priority] += 1;

  // Distribución explícita (ORDEN-007 §9): todas las categorías observables,
  // incluso con valor 0.
  const assessmentDistribution: Record<string, number> = {
    SUPPORTED: 0,
    UNSUPPORTED: 0,
    AMBIGUOUS: 0,
    REFRAMED: 0,
    DISCARDED: 0,
  };
  for (const assessment of pipeline.assessments) {
    assessmentDistribution[assessment.assessment] = (assessmentDistribution[assessment.assessment] ?? 0) + 1;
  }
  assessmentDistribution['DISCARDED'] = pipeline.discarded.length;

  const evidenceSourcesPerCandidate: Record<string, number> = {};
  for (const candidate of candidates) {
    const urls = new Set(candidate.evidence.map((item) => item.sourceUrl));
    evidenceSourcesPerCandidate[candidate.candidateId] = urls.size;
  }

  const dupRate = duplicateRate(pipeline.signals.map((signal) => signal.assertion));
  const nearDupRate = nearDuplicateRate(candidates.map((candidate) => candidate.researchQuestion));

  return {
    kind: 'athenasignal.m3.metrics.v1',
    generatedAt: input.generatedAt,
    sourcesProcessed: corpus.sources.length,
    signalsExtracted: pipeline.signals.length,
    candidatesGenerated: candidates.length,
    candidatesDiscarded: pipeline.discarded.length,
    highPriority: priorityDistribution.HIGH,
    mediumPriority: priorityDistribution.MEDIUM,
    lowPriority: priorityDistribution.LOW,
    reframed: pipeline.assessments.filter((a) => a.assessment === 'REFRAMED').length,
    unsupported: pipeline.assessments.filter((a) => a.assessment === 'UNSUPPORTED').length,
    supported: pipeline.assessments.filter((a) => a.assessment === 'SUPPORTED').length,
    ambiguous: pipeline.assessments.filter((a) => a.assessment === 'AMBIGUOUS').length,
    evidenceSourcesPerCandidate,
    duplicateRate: dupRate,
    nearDuplicateRate: nearDupRate,
    falsePositiveObservations: falsePositives(input),
    humanAcceptanceRate: null,
    priorityDistribution,
    assessmentDistribution,
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
  };
}

function falsePositives(input: MetricsInput): string[] {
  const observations: string[] = [];
  const signalByCorpus = new Map<string, string[]>();
  for (const signal of input.pipeline.signals) {
    const list = signalByCorpus.get(signal.corpusId) ?? [];
    list.push(signal.signalId);
    signalByCorpus.set(signal.corpusId, list);
  }
  const discardedCorpus = new Set(input.pipeline.discarded.map((entry) => entry.corpusId));
  const assessmentBySignal = new Map(input.pipeline.assessments.map((a) => [a.signalId, a.assessment] as const));
  const candidateSignalIds = new Set(input.pipeline.candidates.flatMap((candidate) => candidate.originSignalIds));
  const candidateBySignal = new Map(
    input.pipeline.candidates.map((candidate) => [candidate.originSignalIds[0], candidate.priority] as const)
  );

  const hasAssessment = (corpusIds: string[], assessment: string): boolean =>
    corpusIds.some((id) => (signalByCorpus.get(id) ?? []).some((signalId) => assessmentBySignal.get(signalId) === assessment));
  const hasCandidate = (corpusIds: string[]): boolean =>
    corpusIds.some((id) => (signalByCorpus.get(id) ?? []).some((signalId) => candidateSignalIds.has(signalId)));

  for (const entry of input.benchmark.entries) {
    const label = entry.corpusIds.join(', ');
    if (entry.expected.discarded && !entry.corpusIds.some((id) => discardedCorpus.has(id))) {
      observations.push(`Benchmark ${entry.id}: se esperaba descartar ruido de ${label} y no se descartó.`);
    }
    if (entry.expected.notDiscarded && !hasCandidate(entry.corpusIds)) {
      observations.push(
        `Benchmark ${entry.id}: se esperaba al menos un candidate no descartado de ${label} y no se observó.`
      );
    }
    if (entry.expected.reframed && !hasAssessment(entry.corpusIds, 'REFRAMED')) {
      observations.push(`Benchmark ${entry.id}: se esperaba una reformulación de ${label} y no se observó.`);
    }
    if (entry.expected.assessment && !hasAssessment(entry.corpusIds, entry.expected.assessment)) {
      observations.push(
        `Benchmark ${entry.id}: se esperaba ${entry.expected.assessment} en ${label} y no se observó.`
      );
    }
    if (entry.expected.priority) {
      const observed = entry.corpusIds.some((id) =>
        (signalByCorpus.get(id) ?? []).some((signalId) => candidateBySignal.get(signalId) === entry.expected.priority)
      );
      if (!observed) {
        observations.push(`Benchmark ${entry.id}: se esperaba prioridad ${entry.expected.priority} en ${label}.`);
      }
    }
  }
  return observations;
}

function duplicateRate(values: string[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const value of values) {
    const key = normalize(value);
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return values.length ? Number((duplicates / values.length).toFixed(4)) : 0;
}

function nearDuplicateRate(values: string[]): number {
  let pairs = 0;
  let near = 0;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      pairs += 1;
      if (jaccard(tokens(values[i]), tokens(values[j])) >= 0.8) near += 1;
    }
  }
  return pairs ? Number((near / pairs).toFixed(4)) : 0;
}

function tokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(' ')
      .filter((token) => token.length > 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union ? intersection / union : 0;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type { ResearchAssessment };
