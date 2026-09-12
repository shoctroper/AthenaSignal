/**
 * Punto de entrada del milestone M6 — Closed-Loop Editorial Intelligence
 * (ORDEN-010).
 */

export * from './types.ts';
export { buildM6Corpus, buildM6Cycles, verifyM6Corpus, M6_CYCLE_COUNT, M6_SOURCES_PER_CYCLE } from './corpus.ts';
export {
  AkpLiveTransport,
  AKP_LIVE_STATE_KIND,
  AKP_LIVE_ENTRY_KIND,
  AKP_LIVE_RETURN_KIND,
  type AkpHandoffEntry,
  type AkpLiveState,
  type HandoffPublishInput,
  type AkpLiveTransportOptions,
} from './transport.ts';
export {
  AthenaOsResearchWorker,
  buildSubQuestions,
  ATHENAOS_WORKER_ID,
  SYSTEM_DEEP_RESEARCH,
  type AthenaOsWorkerOptions,
} from './athenaosWorker.ts';
export { applyResearchFeedback, type FeedbackContext, type FeedbackResult } from './feedback.ts';
export { ClosedLoopEngine, type ClosedLoopOptions, type IngestOutcome, type LoopOutcome } from './engine.ts';
export {
  buildM6Artifacts,
  M6_BENCHMARK_CLASSES,
  M6_RUBRIC,
  type M6ArtifactInput,
} from './artifacts.ts';
export {
  runM6Offline,
  outputPathsFor,
  DEFAULT_M6_OUTPUT_DIR,
  DEFAULT_M6_AKP_DIR,
  DEFAULT_M6_LLM_RECORDING_PATH,
  M6_GENERATED_AT,
  M6_AKP_CONSUMER_ID,
  type M6RunOptions,
  type M6OutputPaths,
  type M6RunSummary,
} from './offline.ts';
