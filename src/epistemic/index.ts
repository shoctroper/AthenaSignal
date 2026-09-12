/**
 * Punto de entrada del milestone M7 — Epistemically Resolutive Closed Loop
 * (ORDEN-011).
 */

export * from './types.ts';
export {
  EpistemicLedger,
  classifyStance,
  evidenceRefsFor,
  isAuthoritativeUrl,
  nextStatus,
  seedStatusFor,
  verdictFor,
  type EpistemicApplyInput,
  type EpistemicApplyOutcome,
} from './resolver.ts';
export { buildM7Corpus, buildM7Cycles, verifyM7Corpus, M7_CYCLE_COUNT, M7_SOURCES_PER_CYCLE } from './corpus.ts';
export {
  buildM7Artifacts,
  M7_BENCHMARK_CLASSES,
  M7_RUBRIC,
  type M7ArtifactInput,
} from './artifacts.ts';
export {
  runM7Offline,
  outputPathsFor,
  DEFAULT_M7_OUTPUT_DIR,
  DEFAULT_M7_AKP_DIR,
  DEFAULT_M7_LLM_RECORDING_PATH,
  M7_GENERATED_AT,
  M7_AKP_CONSUMER_ID,
  M7_WORKER_ID,
  type M7RunSummary,
} from './offline.ts';
