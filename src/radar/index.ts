/**
 * Punto de entrada del subsistema Continuous Editorial Radar M4.
 */

export * from './types.ts';
export { M4_CYCLE_SEEDS, buildM4Corpus, verifyM4Corpus } from './corpus.ts';
export type { M4CycleSeed } from './corpus.ts';
export {
  ContinuousEditorialRadar,
  aggregateAssessment,
  buildPriorityReasons,
  computePriorityScore,
  contradictionResolutionNote,
  detectContradictions,
  hasSufficientSupport,
  priorityFromScore,
  promotionReason,
  promotionReasons,
  qualifiesForDiscard,
  qualifiesForPromotion,
  HIGH_PRIORITY_SCORE,
  MEDIUM_PRIORITY_SCORE,
  LOW_PRIORITY_SCORE,
  MIN_INDEPENDENT_SOURCES,
  MIN_EVIDENCE_URLS,
} from './engine.ts';
export type { PrioritySupport, RadarEngineOptions } from './engine.ts';
export {
  M4_RUBRIC,
  M4_BENCHMARK_ENTRIES,
  buildTimeline,
  buildMetrics,
  buildBenchmark,
  buildHandoff,
  buildHumanReviewPacket,
} from './artifacts.ts';
export {
  runM4Offline,
  loadM3Corpus,
  buildObservations,
  groupObservations,
  DEFAULT_M3_CORPUS_PATH,
  DEFAULT_M3_LLM_RECORDING_PATH,
  DEFAULT_M3_TOOL_RECORDING_PATH,
  DEFAULT_M4_OUTPUT_DIR,
  M4_GENERATED_AT,
} from './offline.ts';
export type { M4RunOptions, M4RunSummary, M4OutputPaths } from './offline.ts';
export {
  RadarStore,
  MemoryRadarStore,
  emptyState,
  serializeState,
  deserializeState,
  cloneState,
  normalizeRadarState,
} from './store.ts';
export {
  assertionPolarity,
  clusterIdFor,
  clusterLabel,
  clusterStems,
  sameCluster,
  signalFingerprint,
} from './identity.ts';
