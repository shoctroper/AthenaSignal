/**
 * Punto de entrada del subsistema autónomo M3.
 */

export * from './types.ts';
export { CORPUS_SEEDS, buildCorpusLive, corpusById, verifyCorpus } from './corpus.ts';
export type { CorpusSeed } from './corpus.ts';
export { AutonomousPipeline } from './pipeline.ts';
export type { PipelineDeps, PipelineRunResult, DiscardedSignal } from './pipeline.ts';
export { buildCandidate, trustTier } from './candidateBuilder.ts';
export { prioritize } from './prioritizer.ts';
export { buildBenchmark, M3_BENCHMARK_ENTRIES, BENCHMARK_CLASSES } from './benchmark.ts';
export { buildMetrics } from './metrics.ts';
export { buildHumanReviewPacket, M3_RUBRIC } from './humanReview.ts';
export {
  runM3Offline,
  loadCorpus,
  buildArtifacts,
  DEFAULT_M3_CORPUS_PATH,
  DEFAULT_M3_LLM_RECORDING_PATH,
  DEFAULT_M3_TOOL_RECORDING_PATH,
  DEFAULT_M3_OUTPUT_DIR,
} from './offline.ts';
