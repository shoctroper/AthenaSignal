/**
 * Punto de entrada de la plataforma editorial autónoma M5 (ORDEN-009).
 */

export * from './types.ts';
export {
  buildM5Corpus,
  verifyM5Corpus,
  M5_CYCLE_SEEDS,
  M5_MIRROR_SEEDS,
  buildTailCycleSeeds,
  M5_TAIL_SOURCES_PER_CYCLE,
} from './corpus.ts';
export {
  buildExtendedSources,
  sourceIdForUrl,
  platformForUrl,
  detectLanguage,
  M5_RAW_CAPTURE_DIR,
  M5_RAW_CAPTURED_AT,
  type ExtendedSourceOptions,
  type ExtendedSourceSet,
} from './extendedSources.ts';
export {
  AutonomousEditorialPlatform,
  type PlatformOptions,
  type PlatformStoreLike,
  type IngestOutcome,
} from './engine.ts';
export {
  emptyPlatformState,
  serializePlatformState,
  deserializePlatformState,
  clonePlatformState,
  PlatformStore,
  MemoryPlatformStore,
} from './store.ts';
export {
  AkpHandoffSink,
  hashHandoff,
  stableStringify,
  type DeliverInput,
  type DeliverResult,
  type AkpSinkOptions,
} from './sink.ts';
export {
  AkpInboxConsumer,
  annotateConsumption,
  AKP_CONSUMER_ID,
  AKP_INBOX_INDEX_KIND,
  AKP_INBOX_ENTRY_KIND,
  type AkpConsumerOptions,
  type AkpInboxIndex,
  type AkpInboxIndexEntry,
} from './akpConsumer.ts';
export {
  hashEmbedding,
  cosineSimilarity,
  LocalEmbeddingProvider,
  DeterministicEmbeddingProvider,
  defaultEmbeddingProvider,
  EMBEDDING_DIMENSION,
  NEAR_DUPLICATE_THRESHOLD,
  type Embedding,
  type EmbeddingProvider,
} from './embedding.ts';
export {
  CognitiveRouter,
  DEFAULT_ROUTE_POLICY,
  describeTopology,
  routeCounts,
  type CognitiveRouterOptions,
  type RouterRecoveryInput,
} from './routing.ts';
export {
  M5_BENCHMARK_CLASSES,
  M5_RUBRIC,
  buildMetrics,
  buildBenchmark,
  buildObservability,
  buildCognitiveRouting,
  buildHumanReview,
  buildRecovery,
  buildIdempotency,
  buildAkpHandoff,
  buildRunTimeline,
  type ArtifactInput,
  type M5BenchmarkEntryDefinition,
} from './artifacts.ts';
export {
  runM5Offline,
  buildArtifacts,
  defaultNodes,
  runRecoveryDrills,
  loadM3Corpus,
  outputPathsFor,
  DEFAULT_M3_CORPUS_PATH,
  DEFAULT_M3_LLM_RECORDING_PATH,
  DEFAULT_M3_TOOL_RECORDING_PATH,
  DEFAULT_M4_STATE_PATH,
  DEFAULT_M5_OUTPUT_DIR,
  DEFAULT_M5_LLM_RECORDING_PATH,
  DEFAULT_AKP_INBOX_DIR,
  M5_GENERATED_AT,
  M5_TEMP_DIR,
  type M5RunOptions,
  type M5OutputPaths,
  type M5RunSummary,
  type DrillResult,
} from './offline.ts';
