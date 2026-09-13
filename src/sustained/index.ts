/**
 * Punto de entrada del milestone M8 — Sustained Autonomous Editorial Operation
 * (ORDEN-012).
 */

export * from './types.ts';
export {
  buildM8Corpus,
  buildM8Cycles,
  verifyM8Corpus,
  M8_CHANNELS_PER_SOURCE,
  M8_CYCLE_COUNT,
  M8_SOURCES_PER_CYCLE,
  M8_MIN_SOURCES,
} from './corpus.ts';
export {
  loadRealEngines,
  loadRealResearch,
  loadAkpIngestion,
  builtinRealEngines,
  realEnginesPath,
  invocation,
  sha256,
  M8_REAL_ENGINES_KIND,
  M8_REAL_RESEARCH_KIND,
  M8_AKP_INGESTION_KIND,
  DEFAULT_M8_REAL_ENGINES_PATH,
  DEFAULT_M8_REAL_RESEARCH_PATH,
  DEFAULT_M8_AKP_INGESTION_PATH,
  UBUNTU_ATHENA,
  MACMINI,
} from './realEngines.ts';
export {
  buildM8Artifacts,
  M8_BENCHMARK_CLASSES,
  M8_RUBRIC,
  type M8ArtifactInput,
} from './artifacts.ts';
export {
  runM8Offline,
  prepareM8SustainInputs,
  outputPathsFor,
  DEFAULT_M8_OUTPUT_DIR,
  DEFAULT_M8_AKP_DIR,
  DEFAULT_M8_LLM_RECORDING_PATH,
  M8_GENERATED_AT,
  M8_WINDOW_ID,
  M8_WORKER_ID,
  M8_AKP_CONSUMER_ID,
  M8_TICKS,
  M8_CYCLES_PER_TICK,
  M8_RESEARCH_WAVES,
  M8_WINDOW_START,
  M8_TICK_STEP_MS,
  type M8RunOptions,
  type M8SustainInputs,
} from './offline.ts';
export {
  loadWindowRecording,
  writeWindowRecording,
  windowRecordingPath,
  M8_WINDOW_RECORDING_KIND,
  DEFAULT_M8_WINDOW_RECORDING_PATH,
} from './window.ts';
