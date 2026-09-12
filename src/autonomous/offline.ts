/**
 * Runner offline determinista de M3 (ORDEN-007 §5, §14).
 *
 * Carga el corpus real congelado y las grabaciones (LLM + herramientas) y
 * reproduce el pipeline completo sin red. Genera los artefactos de aceptación
 * en `evidence/m3/`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { LLMRecording } from '../llm/RecordReplay.ts';
import { readLLMRecording } from '../llm/RecordReplay.ts';
import { DeterministicLLMProvider } from '../llm/DeterministicLLMProvider.ts';
import { ReplayLLMProvider } from '../llm/RecordReplay.ts';
import type { ToolRecording } from '../research/tools/RecordReplay.ts';
import { readToolRecording, ReplayFetchTool, ReplaySearchTool } from '../research/tools/RecordReplay.ts';
import { HandoffValidator } from '../handoff/HandoffValidator.ts';
import { AutonomousPipeline, type PipelineRunResult } from './pipeline.ts';
import { buildBenchmark } from './benchmark.ts';
import { buildMetrics } from './metrics.ts';
import { buildHumanReviewPacket } from './humanReview.ts';
import { verifyCorpus } from './corpus.ts';
import type { Corpus, M3Artifacts } from './types.ts';

export const DEFAULT_M3_CORPUS_PATH = 'evidence/m3/corpus.json';
export const DEFAULT_M3_LLM_RECORDING_PATH = 'evidence/m3/recordings/llm.json';
export const DEFAULT_M3_TOOL_RECORDING_PATH = 'evidence/m3/recordings/tools.json';
export const DEFAULT_M3_OUTPUT_DIR = 'evidence/m3';

export interface M3RunOptions {
  outputDir?: string;
  corpus?: Corpus;
  llmRecording?: LLMRecording;
  toolRecording?: ToolRecording;
  write?: boolean;
}

export interface M3RunSummary {
  artifacts: M3Artifacts;
  pipeline: PipelineRunResult;
  missingRecordings: string[];
  outputPaths: {
    corpus: string;
    signals: string;
    candidates: string;
    metrics: string;
    benchmark: string;
    handoff: string;
    humanReview: string;
  };
}

export async function runM3Offline(options: M3RunOptions = {}): Promise<M3RunSummary> {
  const outputDir = options.outputDir ?? DEFAULT_M3_OUTPUT_DIR;
  const corpus = options.corpus ?? loadCorpus(options.outputDir);
  const llmRecording = options.llmRecording ?? readLLMRecording(resolve(process.cwd(), DEFAULT_M3_LLM_RECORDING_PATH));
  const toolRecording = options.toolRecording ?? readToolRecording(resolve(process.cwd(), DEFAULT_M3_TOOL_RECORDING_PATH));

  const corpusErrors = verifyCorpus(corpus);
  if (corpusErrors.length) {
    throw new Error(`[runM3Offline] corpus inválido: ${corpusErrors.join('; ')}`);
  }

  const generatedAt = corpus.generatedAt;
  const llm = new ReplayLLMProvider(llmRecording, { fallback: new DeterministicLLMProvider() });
  const search = new ReplaySearchTool(toolRecording);
  const fetch = new ReplayFetchTool(toolRecording);

  const pipeline = new AutonomousPipeline({ llm, search, fetch, createdAt: generatedAt });
  const result = await pipeline.run(corpus);

  const missingRecordings = [...llm.missingKeys(), ...search.missingKeys(), ...fetch.missingKeys()].sort();
  const artifacts = buildArtifacts(result, corpus, generatedAt, missingRecordings);

  const outputPaths = {
    corpus: resolve(process.cwd(), outputDir, 'corpus.json'),
    signals: resolve(process.cwd(), outputDir, 'signals.json'),
    candidates: resolve(process.cwd(), outputDir, 'candidates.json'),
    metrics: resolve(process.cwd(), outputDir, 'metrics.json'),
    benchmark: resolve(process.cwd(), outputDir, 'benchmark.json'),
    handoff: resolve(process.cwd(), outputDir, 'handoff-athenaos.json'),
    humanReview: resolve(process.cwd(), outputDir, 'human-review-packet.json'),
  };

  if (options.write ?? true) {
    writeJson(outputPaths.signals, artifacts.signals);
    writeJson(outputPaths.candidates, artifacts.candidates);
    writeJson(outputPaths.metrics, artifacts.metrics);
    writeJson(outputPaths.benchmark, artifacts.benchmark);
    writeJson(outputPaths.handoff, artifacts.handoff);
    writeJson(outputPaths.humanReview, artifacts.humanReview);
  }

  return { artifacts, pipeline: result, missingRecordings, outputPaths };
}

export function loadCorpus(outputDir: string = DEFAULT_M3_OUTPUT_DIR): Corpus {
  const path = resolve(process.cwd(), outputDir, 'corpus.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Corpus;
}

export function buildArtifacts(
  pipeline: PipelineRunResult,
  corpus: Corpus,
  generatedAt: string,
  missingRecordings: string[]
): M3Artifacts {
  const benchmark = buildBenchmark(generatedAt);
  const metrics = buildMetrics({ pipeline, corpus, benchmark, generatedAt, missingRecordings });

  const validator = new HandoffValidator();
  const handoffs = pipeline.candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    priority: candidate.priority,
    researchQuestion: candidate.researchQuestion,
    assessment: candidate.assessment,
    validation: validator.validate(candidate.recommendedAthenaOsInput),
    recommendedAthenaOsInput: candidate.recommendedAthenaOsInput,
  }));

  const priorityDistribution: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, DISCARD: pipeline.discarded.length };
  const assessmentDistribution: Record<string, number> = {
    SUPPORTED: 0,
    UNSUPPORTED: 0,
    AMBIGUOUS: 0,
    REFRAMED: 0,
    DISCARDED: 0,
  };
  for (const candidate of pipeline.candidates) {
    priorityDistribution[candidate.priority] = (priorityDistribution[candidate.priority] ?? 0) + 1;
  }
  for (const assessment of pipeline.assessments) {
    assessmentDistribution[assessment.assessment] = (assessmentDistribution[assessment.assessment] ?? 0) + 1;
  }
  assessmentDistribution['DISCARDED'] = pipeline.discarded.length;

  const signals = {
    kind: 'athenasignal.m3.signals.v1' as const,
    generatedAt,
    signals: pipeline.signals,
    decompositions: pipeline.decompositions,
    assessments: pipeline.assessments,
    researchability: pipeline.researchability,
    reframings: pipeline.reframings,
    evidence: pipeline.evidence,
    findings: pipeline.findings,
    queries: [...new Set(pipeline.queries)].sort(),
  };

  const candidates = {
    kind: 'athenasignal.m3.candidates.v1' as const,
    generatedAt,
    candidates: pipeline.candidates,
    discarded: pipeline.discarded,
    distribution: {
      priority: priorityDistribution as M3Artifacts['candidates']['distribution']['priority'],
      assessment: assessmentDistribution,
    },
  };

  return {
    corpus,
    signals,
    candidates,
    handoff: {
      kind: 'athenasignal.handoff_bundle.v1',
      generatedAt,
      handoffs,
    },
    benchmark,
    metrics,
    humanReview: buildHumanReviewPacket({
      pipeline,
      generatedAt,
      falsePositiveObservations: metrics.falsePositiveObservations,
    }),
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
