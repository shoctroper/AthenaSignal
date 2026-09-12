/**
 * Runner offline determinista del loop M6 (ORDEN-010 §0, §7).
 *
 * Reproduce el closed loop completo sin red:
 *
 *   M5 (radar + handoffs) → AKP durable → worker AthenaOS (investigación
 *   profunda real grabada) → resultado → AKP → feedback → radar mutado →
 *   siguiente ciclo → restart/recovery/idempotencia.
 *
 * Dos corridas producen bytes idénticos: reloj determinista, sin red y sin
 * aleatoriedad. La grabación real de la síntesis de investigación vive en
 * `evidence/m6/recordings/llm.json`; si falta, degrada al fallback determinista.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { DeterministicLLMProvider } from '../llm/DeterministicLLMProvider.ts';
import { LLM_RECORDING_KIND, ReplayLLMProvider, readLLMRecording } from '../llm/RecordReplay.ts';
import type { LLMProvider, LLMRecording } from '../llm/types.ts';
import { ReplaySearchTool, readToolRecording } from '../research/tools/RecordReplay.ts';
import { CompositeSearchTool, LocalCorpusSearchTool } from './corpusSearch.ts';
import { buildObservations, groupObservations } from '../radar/offline.ts';
import { ContinuousEditorialRadar } from '../radar/engine.ts';
import type { M4Corpus, RadarState } from '../radar/types.ts';
import {
  DEFAULT_M3_LLM_RECORDING_PATH,
  DEFAULT_M3_TOOL_RECORDING_PATH,
  runM5Offline,
  runRecoveryDrills,
} from '../platform/offline.ts';
import { CognitiveRouter } from '../platform/routing.ts';
import type { CognitiveNode, IdempotencyRecord, RecoveryEvent, RoutingDecision } from '../platform/types.ts';
import { buildM6Corpus, verifyM6Corpus } from './corpus.ts';
import { ClosedLoopEngine } from './engine.ts';
import { ATHENAOS_WORKER_ID, AthenaOsResearchWorker, type ResearchWorker } from './athenaosWorker.ts';
import { ChildCognitiveNode, FailoverResearchWorker } from './nodeProcess.ts';
import { AkpLiveTransport } from './transport.ts';
import { buildM6Artifacts, type M6ArtifactInput } from './artifacts.ts';
import type {
  AthenaOsResearchResult,
  FeedbackUpdate,
  M6Artifacts,
  M6Corpus,
  M6State,
  TopologyNode,
} from './types.ts';

export const DEFAULT_M6_OUTPUT_DIR = 'evidence/m6';
export const DEFAULT_M6_AKP_DIR = 'data/akp-live';
export const DEFAULT_M6_LLM_RECORDING_PATH = 'evidence/m6/recordings/llm.json';
export const M6_GENERATED_AT = '2026-09-12T00:00:00.000Z';
export const M6_AKP_CONSUMER_ID = 'akp-live-ingestor-v2';

interface RecordableProvider extends LLMProvider {
  toRecording?: () => LLMRecording;
}

export interface M6RunOptions {
  outputDir?: string;
  akpDir?: string;
  generatedAt?: string;
  write?: boolean;
  llmRecordingPath?: string;
  /** Proveedor real/envuelto para grabar la investigación (modo live). */
  workerLlm?: LLMProvider;
  /** Grabación ya cargada (evita releer disco en tests). */
  workerRecording?: LLMRecording;
  onWorkerRecording?: (recording: LLMRecording) => void;
  /**
   * Ejecuta el nodo cognitivo Mac mini como proceso OS separado con failover
   * real. Se desactiva automáticamente al grabar en vivo con `workerLlm`.
   */
  distributed?: boolean;
}

export interface M6OutputPaths {
  corpus: string;
  benchmark: string;
  loopTimeline: string;
  radarState: string;
  akpLive: string;
  athenaosResults: string;
  feedbackUpdates: string;
  metrics: string;
  cognitiveRouting: string;
  observability: string;
  recoveryEvents: string;
  idempotency: string;
  distributed: string;
  humanReview: string;
}

export interface M6RunSummary {
  artifacts: M6Artifacts;
  state: M6State;
  corpus: M6Corpus;
  results: AthenaOsResearchResult[];
  feedback: FeedbackUpdate[];
  missingRecordings: string[];
  outputPaths: M6OutputPaths;
  /** Observaciones cognitivas reales reutilizables por milestones posteriores. */
  observations: Record<string, import('../radar/types.ts').SignalObservation>;
  observationsByCorpus: Map<string, import('../radar/types.ts').SignalObservation[]>;
  pipeline: import('../autonomous/pipeline.ts').PipelineRunResult;
}

export async function runM6Offline(options: M6RunOptions = {}): Promise<M6RunSummary> {
  const outputDir = options.outputDir ?? DEFAULT_M6_OUTPUT_DIR;
  const generatedAt = options.generatedAt ?? M6_GENERATED_AT;
  const write = options.write ?? true;

  // 1. Universo M5: radar persistente + handoffs promovidos.
  const m5 = await runM5Offline({ write: false });
  const m6Corpus = buildM6Corpus(m5.artifacts.corpus, generatedAt);
  const corpusErrors = verifyM6Corpus(m6Corpus);
  if (corpusErrors.length) throw new Error(`[runM6Offline] corpus M6 inválido: ${corpusErrors.join('; ')}`);

  // 2. Observaciones cognitivas reales (replay M3/M5) para el universo M5.
  const observations = buildObservations(
    m5.pipeline,
    m5.artifacts.corpus as unknown as M4Corpus,
    generatedAt
  );
  const observationsByCorpus = groupObservations(observations);

  // 3. Proveedor de investigación profunda: grabación real o fallback seguro.
  const recordingPath = resolve(process.cwd(), options.llmRecordingPath ?? DEFAULT_M6_LLM_RECORDING_PATH);
  const workerRecording =
    options.workerRecording ??
    (existsSync(recordingPath) ? readLLMRecording(recordingPath) : emptyRecording());
  const workerProvider: RecordableProvider =
    options.workerLlm ?? new ReplayLLMProvider(workerRecording, { fallback: new DeterministicLLMProvider() });

  const toolRecording = readToolRecording(resolve(process.cwd(), DEFAULT_M3_TOOL_RECORDING_PATH));
  // Investigación profunda: búsquedas grabadas + índice del corpus real
  // (nunca se fabrica evidencia; sólo se descubre provenance existente).
  const baseSources = m6Corpus.sources.filter(
    (source) => !m6Corpus.m6SourceIds.includes(source.id)
  );
  const search = new CompositeSearchTool([
    new ReplaySearchTool(toolRecording),
    new LocalCorpusSearchTool(baseSources, 5),
  ]);
  const clock = fixedClock('2026-09-12T02:00:00.000Z', 60_000);

  // 4. Topología distribuida + router cognitivo (local-first → remoto → fallback).
  const nodeHealth = { ubuntu: true, macmini: true, remote: false };
  const topology: TopologyNode[] = [
    {
      node: 'ubuntu-orchestrator',
      role: 'ORCHESTRATION',
      route: 'LOCAL',
      host: 'ubuntu',
      model: 'qwen2.5:7b-instruct',
      status: 'UP',
      reason: 'Nodo de orquestación/ingesta/persistencia del loop.',
    },
    {
      node: 'ubuntu-scheduler',
      role: 'SCHEDULER',
      route: 'LOCAL',
      host: 'ubuntu',
      model: 'qwen2.5:7b-instruct',
      status: 'UP',
      reason: 'Scheduler del loop (discover→triage→handoff).',
    },
    {
      node: 'macmini-cognitive',
      role: 'COGNITIVE',
      route: 'LOCAL_ALT',
      host: 'mac-mini',
      model: 'gpt-oss:20b',
      status: 'UP',
      reason:
        'Nodo cognitivo para juicio/investigación profunda. Se ejecuta como proceso OS separado ' +
        '(stand-in local con heartbeat+PID): el host físico Mac mini no es alcanzable desde el worktree.',
    },
    {
      node: 'remote-deepseek',
      role: 'RESEARCH',
      route: 'REMOTE_ESCALATION',
      host: 'remote',
      model: 'deepseek-v4-flash',
      status: 'DOWN',
      reason: 'Escalado remoto opcional; sólo si está disponible y justificado.',
    },
  ];

  const routingLog: RoutingDecision[] = [];
  const recoveryLog: RecoveryEvent[] = [];
  let recoverySeq = 0;
  const router = new CognitiveRouter({
    runId: 'm6-research',
    nodes: buildCognitiveNodes(workerProvider, nodeHealth),
    deterministic: new DeterministicLLMProvider(),
    policy: { deep_research: ['LOCAL_ALT', 'REMOTE_ESCALATION', 'LOCAL'] },
    timeoutMs: 120_000,
    clock,
    onDecision: (decision) => routingLog.push(decision),
    onRecovery: (input) => {
      recoverySeq += 1;
      recoveryLog.push({
        recoveryId: `rec-m6-research-${String(recoverySeq).padStart(3, '0')}`,
        runId: 'm6-research',
        at: generatedAt,
        kind: input.kind,
        subject: input.subject,
        action: input.action,
        detail: input.detail,
      });
    },
  });

  const worker = new AthenaOsResearchWorker({
    llm: router,
    search,
    clock,
    executionMode: options.workerLlm ? 'live' : 'replay',
    workerId: ATHENAOS_WORKER_ID,
  });

  // 5. Transporte AKP durable.
  const akpDir = options.akpDir ?? DEFAULT_M6_AKP_DIR;
  if (write) rmSync(resolve(process.cwd(), akpDir), { recursive: true, force: true });
  const transport = new AkpLiveTransport({ dir: akpDir, write });

  const imported = emptyM6State(generatedAt, m5.artifacts.state.radar);
  const engine = new ClosedLoopEngine({
    generatedAt,
    clock,
    observations,
    observationsByCorpus,
    imported,
    transport,
    worker,
    radarFactory: (snapshot) =>
      ContinuousEditorialRadar.fromSnapshot(snapshot, { generatedAt, observations }),
    nodes: topology,
    routingLog,
    recoveryLog,
    sourceMetadata: new Map(m6Corpus.sources.map((source) => [source.id, source.contentHash] as const)),
  });

  const m6Cycles = m6Corpus.cycles.filter((cycle) => cycle.cycleId.startsWith('m6-cycle-'));

  // 6. Distribución real: el nodo cognitivo Mac mini corre como proceso OS
  // separado con health-check propio (heartbeat + PID). Se le mata (SIGKILL)
  // tras su primer resultado para forzar un fallo real y demostrar failover.
  const distributedEnabled = options.distributed ?? !options.workerLlm;
  let macNode: ChildCognitiveNode | null = null;
  let runBWorker: ResearchWorker = worker;
  let runBHost = 'ubuntu';
  if (distributedEnabled) {
    const nodeDir = resolve(process.cwd(), akpDir, 'node');
    mkdirSync(nodeDir, { recursive: true });
    const evidenceIndexPath = resolve(nodeDir, 'evidence-index.json');
    writeFileSync(evidenceIndexPath, `${JSON.stringify({ sources: baseSources })}\n`, 'utf8');
    macNode = new ChildCognitiveNode({
      id: 'macmini-cognitive',
      host: 'mac-mini',
      scriptPath: 'scripts/m6-node.ts',
      heartbeatPath: `${akpDir}/node/mac-mini.heartbeat.json`,
      evidenceIndexPath: `${akpDir}/node/evidence-index.json`,
      llmRecordingPath: options.llmRecordingPath ?? DEFAULT_M6_LLM_RECORDING_PATH,
      toolRecordingPath: DEFAULT_M3_TOOL_RECORDING_PATH,
    });
    await macNode.start();
    runBWorker = new FailoverResearchWorker({
      primary: macNode,
      fallback: worker,
      killAfter: 1,
      onFailure: (event) => {
        recoverySeq += 1;
        recoveryLog.push({
          recoveryId: `rec-m6-research-${String(recoverySeq).padStart(3, '0')}`,
          runId: 'm6-research',
          at: generatedAt,
          kind: 'NODE_DOWN',
          subject: `${event.nodeId}:${event.host}`,
          action: 'FALLBACK',
          detail: `${event.detail} El loop hace failover a la ruta remota/local restante sin detener la operación.`,
        });
      },
    });
    runBHost = 'mac-mini';
  }

  // 7. Run A: entrega + investigación local + feedback; luego crash parcial.
  const runA = engine.startProcess('m6-proc-a', 'ubuntu');
  engine.deliverResearchable(runA);
  await engine.researchPending(runA, 3);
  engine.applyReturnedFeedback(runA);
  engine.ingestUntil(runA, m6Cycles, 'm6-cycle-56');

  // 8. Run B (degradado): el nodo cognitivo Mac mini muere → escalado remoto.
  nodeHealth.macmini = false;
  nodeHealth.remote = true;
  const runB = engine.startProcess('m6-proc-b', runBHost, { resumedFrom: runA.runId });
  await engine.researchPending(runB, Number.POSITIVE_INFINITY, runBWorker);
  engine.applyReturnedFeedback(runB);
  engine.ingest(runB, m6Cycles.slice(8));
  engine.completeRun(runB);
  if (macNode) await macNode.close();

  // 9. Run C: reintento idempotente (todo ya aplicado).
  const runC = engine.startProcess('m6-proc-c', 'ubuntu');
  engine.deliverResearchable(runC);
  engine.ingest(runC, m6Cycles);
  await engine.researchPending(runC);
  engine.applyReturnedFeedback(runC);
  engine.completeRun(runC, 'IDEMPOTENT_NOOP');

  // 10. Drills de fallo de LLM/timeout/respuesta inválida (observabilidad).
  const m3Recording = readLLMRecording(resolve(process.cwd(), DEFAULT_M3_LLM_RECORDING_PATH));
  const drills = await runRecoveryDrills(m3Recording, generatedAt);
  routingLog.push(...drills.decisions);
  recoveryLog.push(...drills.recovery);

  topology[2].status = nodeHealth.macmini ? 'UP' : 'DOWN';
  topology[3].status = nodeHealth.remote ? 'UP' : 'DOWN';

  const state = engine.snapshot();
  state.distribution = engine.buildDistribution();
  state.routed = [...routingLog];
  state.recovery = [...recoveryLog];

  const results = state.research;
  const feedback = state.feedback;
  const missingRecordings =
    workerProvider instanceof ReplayLLMProvider ? workerProvider.missingKeys() : [];
  if (workerProvider.toRecording) {
    options.onWorkerRecording?.(workerProvider.toRecording());
  }

  const input: M6ArtifactInput = {
    generatedAt,
    corpus: m6Corpus,
    state,
    results,
    feedback,
    routing: routingLog,
    recovery: recoveryLog,
    idempotency: state.idempotency,
    nodes: topology,
    llm: {
      providerChain: 'cognitive-router(deep_research)',
      realResponses: results.filter((result) => !result.deterministic).length,
      deterministicResponses: results.filter((result) => result.deterministic).length,
      replayMisses: missingRecordings.length,
    },
    transport: {
      inboxDir: `${akpDir.replace(/\/+$/, '')}/inbox`,
      returnDir: `${akpDir.replace(/\/+$/, '')}/returns`,
      consumer: M6_AKP_CONSUMER_ID,
      worker: ATHENAOS_WORKER_ID,
      limitation:
        'AKP/AthenaOS externo no invocable desde el worktree: el transporte es una cola durable ' +
        'en disco y el worker de investigación es el stand-in documentado.',
    },
    m5SourceCount: m5.artifacts.corpus.sources.length,
    returnIds: transport.returnedResults().map((result) => result.resultId),
  };

  const artifacts = buildM6Artifacts(input);
  const outputPaths = outputPathsFor(outputDir);
  if (write) writeArtifacts(outputPaths, artifacts);

  return {
    artifacts,
    state,
    corpus: m6Corpus,
    results,
    feedback,
    missingRecordings,
    outputPaths,
    observations,
    observationsByCorpus,
    pipeline: m5.pipeline,
  };
}

function buildCognitiveNodes(
  provider: LLMProvider,
  health: { ubuntu: boolean; macmini: boolean; remote: boolean }
): CognitiveNode[] {
  return [
    {
      node: 'ubuntu-ollama',
      route: 'LOCAL',
      provider,
      model: 'qwen2.5:7b-instruct',
      healthy: () => health.ubuntu,
      reason: 'Nodo local de orquestación/ingesta.',
    },
    {
      node: 'macmini-ollama',
      route: 'LOCAL_ALT',
      provider,
      model: 'gpt-oss:20b',
      healthy: () => health.macmini,
      reason: 'Nodo cognitivo Mac mini (juicio/investigación).',
    },
    {
      node: 'remote-deepseek',
      route: 'REMOTE_ESCALATION',
      provider,
      model: 'deepseek-v4-flash',
      healthy: () => health.remote,
      reason: 'Escalado remoto justificado.',
    },
  ];
}

function emptyM6State(updatedAt: string, radar: RadarState): M6State {
  return {
    kind: 'athenasignal.m6.state.v1',
    schemaVersion: 1,
    updatedAt,
    importedFrom: 'evidence/m5/radar-state.json',
    radar: JSON.parse(JSON.stringify(radar)) as RadarState,
    runs: [],
    loop: [],
    research: [],
    feedback: [],
    recovery: [],
    idempotency: [] as IdempotencyRecord[],
    routed: [],
    distribution: {
      kind: 'athenasignal.m6.distributed.v1',
      generatedAt: updatedAt,
      nodes: [],
      degradedRuns: [],
      examples: [],
      fallbackRoutes: 0,
      remoteEscalations: 0,
    },
    counters: {
      inputsObserved: 0,
      cyclesProcessed: radar.cyclesProcessed.length,
      runs: 0,
      handoffs: 0,
      researchResults: 0,
      feedbackUpdates: 0,
      promotionsTriggeredByFeedback: 0,
      closuresTriggeredByFeedback: 0,
      contradictionsRaised: 0,
      priorityChangesFromFeedback: 0,
      routingDecisions: 0,
      recoveryEvents: 0,
      idempotencyNoops: 0,
    },
  };
}

function emptyRecording(): LLMRecording {
  return {
    kind: LLM_RECORDING_KIND,
    generatedBy: 'm6-empty',
    entries: [],
  };
}

function fixedClock(start: string, stepMs = 0): () => string {
  let current = Date.parse(start);
  return () => {
    const value = new Date(current).toISOString();
    current += stepMs;
    return value;
  };
}

export function outputPathsFor(outputDir: string): M6OutputPaths {
  return {
    corpus: resolve(process.cwd(), outputDir, 'corpus.json'),
    benchmark: resolve(process.cwd(), outputDir, 'benchmark.json'),
    loopTimeline: resolve(process.cwd(), outputDir, 'loop-timeline.json'),
    radarState: resolve(process.cwd(), outputDir, 'radar-state.json'),
    akpLive: resolve(process.cwd(), outputDir, 'akp-live.json'),
    athenaosResults: resolve(process.cwd(), outputDir, 'athenaos-results.json'),
    feedbackUpdates: resolve(process.cwd(), outputDir, 'feedback-updates.json'),
    metrics: resolve(process.cwd(), outputDir, 'metrics.json'),
    cognitiveRouting: resolve(process.cwd(), outputDir, 'cognitive-routing.json'),
    observability: resolve(process.cwd(), outputDir, 'observability.json'),
    recoveryEvents: resolve(process.cwd(), outputDir, 'recovery-events.json'),
    idempotency: resolve(process.cwd(), outputDir, 'idempotency.json'),
    distributed: resolve(process.cwd(), outputDir, 'distributed.json'),
    humanReview: resolve(process.cwd(), outputDir, 'human-review-packet.json'),
  };
}

function writeArtifacts(paths: M6OutputPaths, artifacts: M6Artifacts): void {
  writeJson(paths.corpus, artifacts.corpus);
  writeJson(paths.benchmark, artifacts.benchmark);
  writeJson(paths.loopTimeline, artifacts.loopTimeline);
  writeJson(paths.radarState, artifacts.radarState);
  writeJson(paths.akpLive, artifacts.akpLive);
  writeJson(paths.athenaosResults, artifacts.athenaosResults);
  writeJson(paths.feedbackUpdates, artifacts.feedbackUpdates);
  writeJson(paths.metrics, artifacts.metrics);
  writeJson(paths.cognitiveRouting, artifacts.cognitiveRouting);
  writeJson(paths.observability, artifacts.observability);
  writeJson(paths.recoveryEvents, artifacts.recoveryEvents);
  writeJson(paths.idempotency, artifacts.idempotency);
  writeJson(paths.distributed, artifacts.distributed);
  writeJson(paths.humanReview, artifacts.humanReview);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
