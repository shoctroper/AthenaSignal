/**
 * Runner offline determinista de M4 (ORDEN-008 §1, §5, §6, §10).
 *
 * Reutiliza la capa cognitiva y las grabaciones de M3 (corre el pipeline una
 * sola vez sobre el corpus congelado) y aplica encima los ciclos del radar.
 * No accede a red: toda la aceptación es reproducible con record/replay.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { DeterministicLLMProvider } from '../llm/DeterministicLLMProvider.ts';
import { ReplayLLMProvider, readLLMRecording } from '../llm/RecordReplay.ts';
import type { LLMRecording } from '../llm/RecordReplay.ts';
import { ReplaySearchTool, ReplayFetchTool, readToolRecording } from '../research/tools/RecordReplay.ts';
import type { ToolRecording } from '../research/tools/RecordReplay.ts';
import { AutonomousPipeline, type PipelineRunResult } from '../autonomous/pipeline.ts';
import { buildCandidate } from '../autonomous/candidateBuilder.ts';
import type { Corpus, CorpusItem } from '../autonomous/types.ts';
import { verifyCorpus } from '../autonomous/corpus.ts';
import { buildM4Corpus, verifyM4Corpus } from './corpus.ts';
import { ContinuousEditorialRadar } from './engine.ts';
import { buildTimeline, buildMetrics, buildBenchmark, buildHandoff, buildHumanReviewPacket } from './artifacts.ts';
import type {
  M4Artifacts,
  M4Corpus,
  RadarCycleResult,
  RadarState,
  SignalObservation,
} from './types.ts';

export const DEFAULT_M3_CORPUS_PATH = 'evidence/m3/corpus.json';
export const DEFAULT_M3_LLM_RECORDING_PATH = 'evidence/m3/recordings/llm.json';
export const DEFAULT_M3_TOOL_RECORDING_PATH = 'evidence/m3/recordings/tools.json';
export const DEFAULT_M4_OUTPUT_DIR = 'evidence/m4';
export const M4_GENERATED_AT = '2026-09-12T00:00:00.000Z';

export interface M4RunOptions {
  outputDir?: string;
  generatedAt?: string;
  m3Corpus?: Corpus;
  corpus?: M4Corpus;
  llmRecording?: LLMRecording;
  toolRecording?: ToolRecording;
  write?: boolean;
  cycleLimit?: number;
  resumeFrom?: RadarState;
}

export interface M4OutputPaths {
  corpus: string;
  benchmark: string;
  timeline: string;
  state: string;
  metrics: string;
  handoff: string;
  humanReview: string;
}

export interface M4RunSummary {
  artifacts: M4Artifacts;
  state: RadarState;
  pipeline: PipelineRunResult;
  missingRecordings: string[];
  cycleResults: RadarCycleResult[];
  outputPaths: M4OutputPaths;
}

export async function runM4Offline(options: M4RunOptions = {}): Promise<M4RunSummary> {
  const outputDir = options.outputDir ?? DEFAULT_M4_OUTPUT_DIR;
  const generatedAt = options.generatedAt ?? M4_GENERATED_AT;
  const m3Corpus = options.m3Corpus ?? loadM3Corpus();
  const corpus = options.corpus ?? buildM4Corpus(m3Corpus, generatedAt);

  const corpusErrors = verifyM4Corpus(corpus);
  if (corpusErrors.length) {
    throw new Error(`[runM4Offline] corpus M4 inválido: ${corpusErrors.join('; ')}`);
  }

  const llmRecording =
    options.llmRecording ?? readLLMRecording(resolve(process.cwd(), DEFAULT_M3_LLM_RECORDING_PATH));
  const toolRecording =
    options.toolRecording ?? readToolRecording(resolve(process.cwd(), DEFAULT_M3_TOOL_RECORDING_PATH));

  const llm = new ReplayLLMProvider(llmRecording, { fallback: new DeterministicLLMProvider() });
  const search = new ReplaySearchTool(toolRecording);
  const fetch = new ReplayFetchTool(toolRecording);

  const cognitiveCorpus: Corpus = {
    kind: 'athenasignal.m3.corpus.v1',
    generatedAt,
    sources: corpus.sources,
  };
  const readyErrors = verifyCorpus(cognitiveCorpus);
  if (readyErrors.length) {
    throw new Error(`[runM4Offline] corpus cognitivo inválido: ${readyErrors.join('; ')}`);
  }

  const pipeline = new AutonomousPipeline({ llm, search, fetch, createdAt: generatedAt });
  const result = await pipeline.run(cognitiveCorpus);

  const observations = buildObservations(result, corpus, generatedAt);
  const observationsByCorpus = groupObservations(observations);

  const radarOptions = { generatedAt, observations };
  const engine = options.resumeFrom
    ? ContinuousEditorialRadar.fromSnapshot(options.resumeFrom, radarOptions)
    : new ContinuousEditorialRadar(radarOptions);

  const pending = corpus.cycles.filter((cycle) => !engine.hasProcessedCycle(cycle.cycleId));
  const cycles = typeof options.cycleLimit === 'number' ? pending.slice(0, options.cycleLimit) : pending;

  const cycleResults: RadarCycleResult[] = [];
  for (const cycle of cycles) {
    cycleResults.push(engine.ingestCycle(cycle, observationsByCorpus));
  }

  const state = engine.snapshot();
  const missingRecordings = [...llm.missingKeys(), ...search.missingKeys(), ...fetch.missingKeys()].sort();

  const artifacts: M4Artifacts = {
    corpus,
    benchmark: buildBenchmark(generatedAt),
    timeline: buildTimeline(state, corpus, generatedAt),
    state,
    metrics: buildMetrics({ state, corpus, pipeline: result, generatedAt, missingRecordings }),
    handoff: buildHandoff({ state, generatedAt }),
    humanReview: buildHumanReviewPacket({
      state,
      generatedAt,
      falsePositiveObservations: buildMetrics({
        state,
        corpus,
        pipeline: result,
        generatedAt,
        missingRecordings,
      }).falsePositiveObservations,
    }),
  };

  const outputPaths: M4OutputPaths = {
    corpus: resolve(process.cwd(), outputDir, 'corpus.json'),
    benchmark: resolve(process.cwd(), outputDir, 'benchmark.json'),
    timeline: resolve(process.cwd(), outputDir, 'radar-timeline.json'),
    state: resolve(process.cwd(), outputDir, 'radar-state.json'),
    metrics: resolve(process.cwd(), outputDir, 'metrics.json'),
    handoff: resolve(process.cwd(), outputDir, 'handoff-athenaos.json'),
    humanReview: resolve(process.cwd(), outputDir, 'human-review-packet.json'),
  };

  if (options.write ?? true) {
    writeJson(outputPaths.corpus, artifacts.corpus);
    writeJson(outputPaths.benchmark, artifacts.benchmark);
    writeJson(outputPaths.timeline, artifacts.timeline);
    writeJson(outputPaths.state, artifacts.state);
    writeJson(outputPaths.metrics, artifacts.metrics);
    writeJson(outputPaths.handoff, artifacts.handoff);
    writeJson(outputPaths.humanReview, artifacts.humanReview);
  }

  return { artifacts, state, pipeline: result, missingRecordings, cycleResults, outputPaths };
}

export function loadM3Corpus(path: string = DEFAULT_M3_CORPUS_PATH): Corpus {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as Corpus;
}

export function buildObservations(
  result: PipelineRunResult,
  corpus: M4Corpus,
  generatedAt: string
): Record<string, SignalObservation> {
  const itemById = new Map<string, CorpusItem>(corpus.sources.map((item) => [item.id, item]));
  const assessmentBySignal = new Map(result.assessments.map((entry) => [entry.signalId, entry]));
  const reframingBySignal = new Map(result.reframings.map((entry) => [entry.signalId, entry]));
  const editorialBySignal = new Map(result.editorial.map((entry) => [entry.signalId, entry]));

  const observations: Record<string, SignalObservation> = {};
  for (const signal of result.signals) {
    const item = itemById.get(signal.corpusId);
    const decomposition = result.decompositions.find((entry) => entry.signalId === signal.signalId);
    const assessment = assessmentBySignal.get(signal.signalId);
    const researchability = result.researchability[signal.signalId];
    const editorialRelevance = editorialBySignal.get(signal.signalId);
    if (!item || !decomposition || !assessment || !researchability || !editorialRelevance) continue;

    const reframing = reframingBySignal.get(signal.signalId) ?? null;
    const evidence = result.evidence[signal.signalId] ?? [];
    const findings = result.findings[signal.signalId] ?? [];

    const candidateBase = buildCandidate({
      signal,
      item,
      decomposition,
      evidence,
      findings,
      assessment,
      reframing,
      researchability,
      editorialRelevance,
      createdAt: generatedAt,
    });

    observations[signal.signalId] = {
      signal,
      item,
      evidence,
      findings,
      assessment: assessment.assessment,
      reasoning: assessment.reasoning,
      contradictions: assessment.contradictions,
      researchability,
      editorialScore: editorialRelevance.score,
      reframingNote: reframing?.reframingNote ?? null,
      candidateBase,
    };
  }
  return observations;
}

export function groupObservations(
  observations: Record<string, SignalObservation>
): Map<string, SignalObservation[]> {
  const byCorpus = new Map<string, SignalObservation[]>();
  for (const observation of Object.values(observations)) {
    const key = observation.item.id;
    const list = byCorpus.get(key) ?? [];
    list.push(observation);
    byCorpus.set(key, list);
  }
  for (const list of byCorpus.values()) {
    list.sort((a, b) => (a.signal.signalId < b.signal.signalId ? -1 : 1));
  }
  return byCorpus;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
