/**
 * Runner offline determinista de M5 (ORDEN-009 §1, §4, §7, §10).
 *
 * Reproduce la plataforma completa sin red: reutiliza las grabaciones reales de
 * M3 y el estado persistido de M4, ejecuta el pipeline cognitivo a través del
 * `CognitiveRouter`, y corre el ciclo de vida multi-proceso con reinicio,
 * idempotencia, socket AKP y recuperación de nodos.
 *
 * Dos corridas producen bytes idénticos: reloj determinista, sin red y sin
 * aleatoriedad.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { AutonomousPipeline } from '../autonomous/pipeline.ts';
import type { Corpus } from '../autonomous/types.ts';
import { verifyCorpus } from '../autonomous/corpus.ts';
import { DeterministicLLMProvider } from '../llm/DeterministicLLMProvider.ts';
import { ReplayLLMProvider, readLLMRecording, mergeLLMRecordings } from '../llm/RecordReplay.ts';
import type { LLMProvider, LLMRequest, LLMResponse } from '../llm/types.ts';
import {
  ReplayFetchTool,
  ReplaySearchTool,
  readToolRecording,
} from '../research/tools/RecordReplay.ts';
import { buildObservations, groupObservations } from '../radar/offline.ts';
import type { SignalObservation } from '../radar/types.ts';
import { ContinuousEditorialRadar } from '../radar/engine.ts';
import type { RadarState } from '../radar/types.ts';
import { serializeState } from '../radar/store.ts';
import { buildM5Corpus, verifyM5Corpus } from './corpus.ts';
import { AutonomousEditorialPlatform } from './engine.ts';
import { MemoryPlatformStore } from './store.ts';
import { emptyPlatformState } from './store.ts';
import { AkpHandoffSink } from './sink.ts';
import { AkpInboxConsumer, annotateConsumption } from './akpConsumer.ts';
import { LocalEmbeddingProvider } from './embedding.ts';
import { CognitiveRouter, DEFAULT_ROUTE_POLICY, describeTopology } from './routing.ts';
import type {
  CognitiveNode,
  M5Artifacts,
  M5Corpus,
  M5PlatformState,
  RecoveryEvent,
  RoutingDecision,
} from './types.ts';
import {
  buildAkpHandoff,
  buildBenchmark,
  buildCognitiveRouting,
  buildHumanReview,
  buildIdempotency,
  buildMetrics,
  buildObservability,
  buildRecovery,
  buildRunTimeline,
  type ArtifactInput,
} from './artifacts.ts';

export const DEFAULT_M3_CORPUS_PATH = 'evidence/m3/corpus.json';
export const DEFAULT_M3_LLM_RECORDING_PATH = 'evidence/m3/recordings/llm.json';
export const DEFAULT_M3_TOOL_RECORDING_PATH = 'evidence/m3/recordings/tools.json';
export const DEFAULT_M5_LLM_RECORDING_PATH = 'evidence/m5/recordings/llm.json';
export const DEFAULT_M4_STATE_PATH = 'evidence/m4/radar-state.json';
export const DEFAULT_M5_OUTPUT_DIR = 'evidence/m5';
export const DEFAULT_AKP_INBOX_DIR = 'data/akp-inbox';
export const M5_GENERATED_AT = '2026-09-12T00:00:00.000Z';
export const M5_TEMP_DIR = '.m5tmp';

export interface M5RunOptions {
  outputDir?: string;
  akpInboxDir?: string;
  generatedAt?: string;
  write?: boolean;
  m3Corpus?: Corpus;
  m4State?: RadarState;
  m4StatePath?: string;
  llmRecording?: ReturnType<typeof readLLMRecording>;
  toolRecording?: ReturnType<typeof readToolRecording>;
}

export interface M5OutputPaths {
  corpus: string;
  benchmark: string;
  runTimeline: string;
  state: string;
  metrics: string;
  cognitiveRouting: string;
  observability: string;
  recoveryEvents: string;
  idempotency: string;
  akpHandoff: string;
  humanReview: string;
}

export interface M5RunSummary {
  artifacts: ReturnType<typeof buildArtifacts>;
  state: M5PlatformState;
  pipeline: Awaited<ReturnType<AutonomousPipeline['run']>>;
  missingRecordings: string[];
  runOutcomes: Array<{ runId: string; status: string; applied: number; skipped: number }>;
  outputPaths: M5OutputPaths;
}

export async function runM5Offline(options: M5RunOptions = {}): Promise<M5RunSummary> {
  const outputDir = options.outputDir ?? DEFAULT_M5_OUTPUT_DIR;
  const generatedAt = options.generatedAt ?? M5_GENERATED_AT;

  const m3Corpus = options.m3Corpus ?? loadM3Corpus();
  const m4State =
    options.m4State ?? (JSON.parse(readFileSync(resolve(process.cwd(), options.m4StatePath ?? DEFAULT_M4_STATE_PATH), 'utf8')) as RadarState);
  const m5Corpus = buildM5Corpus(m3Corpus, generatedAt);
  const corpusErrors = verifyM5Corpus(m5Corpus);
  if (corpusErrors.length) throw new Error(`[runM5Offline] corpus M5 inválido: ${corpusErrors.join('; ')}`);

  const llmRecording =
    options.llmRecording ??
    readLLMRecording(resolve(process.cwd(), DEFAULT_M3_LLM_RECORDING_PATH));
  const supplementalPath = resolve(process.cwd(), DEFAULT_M5_LLM_RECORDING_PATH);
  const fullLlmRecording = existsSync(supplementalPath)
    ? mergeLLMRecordings(llmRecording, readLLMRecording(supplementalPath))
    : llmRecording;
  const toolRecording =
    options.toolRecording ?? readToolRecording(resolve(process.cwd(), DEFAULT_M3_TOOL_RECORDING_PATH));

  const replay = new ReplayLLMProvider(fullLlmRecording, { fallback: new DeterministicLLMProvider() });
  const search = new ReplaySearchTool(toolRecording);
  const fetch = new ReplayFetchTool(toolRecording);

  const audits: { assessments: Record<string, number> } = { assessments: {} };
  const pipelineRunId = 'm5-pipeline';
  const pipelineRecovery: RecoveryEvent[] = [];
  const pipelineDecisions: RoutingDecision[] = [];
  let recoverySequence = 0;
  const pipelineRouter = new CognitiveRouter({
    runId: pipelineRunId,
    nodes: defaultNodes(replay),
    deterministic: new DeterministicLLMProvider(),
    timeoutMs: 3000,
    clock: fixedClock(generatedAt),
    onDecision: (decision) => pipelineDecisions.push(decision),
    onRecovery: (event) => {
      recoverySequence += 1;
      pipelineRecovery.push({
        recoveryId: `rec-${pipelineRunId}-${String(recoverySequence).padStart(3, '0')}`,
        runId: pipelineRunId,
        at: generatedAt,
        kind: event.kind,
        subject: event.subject,
        action: event.action,
        detail: event.detail,
      });
    },
  });

  const audited = new AuditingLLMProvider(pipelineRouter, audits);
  const pipeline = new AutonomousPipeline({
    llm: audited,
    search,
    fetch,
    createdAt: generatedAt,
  });
  const result = await pipeline.run(asM4Corpus(m5Corpus));

  const observations: Record<string, SignalObservation> = buildObservations(
    result,
    asM4Corpus(m5Corpus),
    generatedAt
  );
  const observationsByCorpus = groupObservations(observations);
  const missingRecordings = [...replay.missingKeys(), ...search.missingKeys(), ...fetch.missingKeys()].sort();

  // Drill de recuperación: nodo caído, timeout y respuesta inválida.
  const drills = await runRecoveryDrills(llmRecording, generatedAt);
  const allRouting = [...pipelineDecisions, ...drills.decisions];
  const allRecovery = [...pipelineRecovery, ...drills.recovery];

  const sinkDir = resolve(process.cwd(), outputDir, 'akp-sink');
  if (options.write ?? true) rmSync(sinkDir, { recursive: true, force: true });
  const sink = new AkpHandoffSink({
    sinkDir,
    embedding: new LocalEmbeddingProvider(),
    limitation:
      'AKP/AthenaOS no expone endpoint vivo; el handoff se persiste validado en el sink de archivo.',
    write: options.write ?? true,
  });

  const tempStoreDir = resolve(process.cwd(), M5_TEMP_DIR);
  const akpInboxDir = options.akpInboxDir ?? DEFAULT_AKP_INBOX_DIR;
  if (options.write ?? true) {
    rmSync(tempStoreDir, { recursive: true, force: true });
    rmSync(resolve(process.cwd(), akpInboxDir), { recursive: true, force: true });
  }
  const platformStore = new MemoryPlatformStore();
  const imported = emptyPlatformState({
    updatedAt: generatedAt,
    radar: m4State,
    importedFrom: DEFAULT_M4_STATE_PATH,
    sink: 'evidence/m5/akp-sink',
  });

  const clock = fixedClock('2026-09-12T01:00:00.000Z', 60000);
  const sourceMetadata = new Map(m5Corpus.sources.map((source) => [source.id, source.contentHash] as const));
  const platform = new AutonomousEditorialPlatform({
    generatedAt,
    clock,
    observationsByCorpus,
    importedState: imported,
    radarFactory: (snapshot) =>
      ContinuousEditorialRadar.fromSnapshot(snapshot, { generatedAt, observations }),
    store: platformStore,
    sink,
    routingDecisions: allRouting,
    pipelineRecovery: allRecovery,
    sourceMetadata,
  });

  const m5Cycles = m5Corpus.cycles.filter((cycle) => cycle.cycleId.startsWith('m5-'));
  const runOutcomes: M5RunSummary['runOutcomes'] = [];

  const runA = platform.startProcess('m5-proc-a');
  const outcomeA = platform.ingestUntil(runA, m5Cycles.slice(0, 6), 'm5-cycle-9');
  runOutcomes.push(summarize(outcomeA));

  const runB = platform.startProcess('m5-proc-b', { resumedFrom: runA.runId });
  const outcomeB = platform.ingest(runB, m5Cycles.slice(3, 12));
  platform.completeRun(runB);
  platform.deliverPromoted(runB.runId);
  runOutcomes.push(summarize(outcomeB));

  const runC = platform.startProcess('m5-proc-c');
  const outcomeC = platform.ingest(runC, m5Cycles.slice(0, 12));
  platform.completeRun(runC, 'IDEMPOTENT_NOOP');
  platform.deliverPromoted(runC.runId);
  runOutcomes.push(summarize(outcomeC));

  const runD = platform.startProcess('m5-proc-d');
  const outcomeD = platform.ingest(runD, m5Cycles.slice(12));
  platform.completeRun(runD);
  platform.deliverPromoted(runD.runId);
  runOutcomes.push(summarize(outcomeD));

  const state = platform.snapshot();
  state.akp.deliveries = sink.deliverables();

  // Consumidor AKP real: valida y ingiere el sink en un repositorio local
  // AKP-compatible. No se simula que AthenaOS consumió: consume el ingestor.
  const akpConsumer = new AkpInboxConsumer({ inboxDir: akpInboxDir, write: options.write ?? true });
  const akpConsumption = akpConsumer.consume(state.akp.deliveries, generatedAt);
  state.akp.consumption = akpConsumption;
  state.akp.consumed = akpConsumption.consumed;
  state.akp.deliveries = annotateConsumption(state.akp.deliveries, akpConsumption, state.akp.limitation);

  const pipelineSummary = {
    llm: {
      providerChain: result.llm.providerChain,
      realResponses: result.llm.realResponses,
      deterministicResponses: result.llm.deterministicResponses,
    },
    research: {
      queries: new Set(result.queries).size,
      evidenceItems: Object.values(result.evidence).reduce((sum, items) => sum + items.length, 0),
    },
  };

  const artifacts = buildArtifacts({
    generatedAt,
    corpus: m5Corpus,
    state,
    topology: describeTopology({
      nodes: defaultNodes(replay).map((node) => ({
        node: node.node,
        route: node.route,
        model: node.model,
        reason: node.reason,
        healthy: node.healthy(),
      })),
    }),
    rawAssessments: audits.assessments,
    missingRecordings,
    llm: pipelineSummary.llm,
    research: pipelineSummary.research,
  });
  artifacts.state.radar = state.radar;

  const outputPaths = outputPathsFor(outputDir);
  if (options.write ?? true) {
    writeJson(outputPaths.corpus, artifacts.corpus);
    writeJson(outputPaths.benchmark, artifacts.benchmark);
    writeJson(outputPaths.runTimeline, artifacts.runTimeline);
    writeJson(outputPaths.state, artifacts.state);
    writeJson(outputPaths.metrics, artifacts.metrics);
    writeJson(outputPaths.cognitiveRouting, artifacts.cognitiveRouting);
    writeJson(outputPaths.observability, artifacts.observability);
    writeJson(outputPaths.recoveryEvents, artifacts.recoveryEvents);
    writeJson(outputPaths.idempotency, artifacts.idempotency);
    writeJson(outputPaths.akpHandoff, artifacts.akpHandoff);
    writeJson(outputPaths.humanReview, artifacts.humanReview);
  }

  return {
    artifacts,
    state: artifacts.state,
    pipeline: result,
    missingRecordings,
    runOutcomes,
    outputPaths,
  };
}

export function defaultNodes(replay: LLMProvider): CognitiveNode[] {
  return [
    {
      node: 'ubuntu-ollama',
      route: 'LOCAL',
      provider: replay,
      model: 'qwen2.5:7b-instruct',
      healthy: () => true,
      reason: 'Nodo local de orquestación/ingesta (Ollama base).',
    },
    {
      node: 'macmini-ollama',
      route: 'LOCAL_ALT',
      provider: replay,
      model: 'gpt-oss:20b',
      healthy: () => true,
      reason: 'Nodo local alternativo para juicio/reasoning.',
    },
    {
      node: 'remote-deepseek',
      route: 'REMOTE_ESCALATION',
      provider: {
        id: 'remote-escalation',
        async complete(): Promise<LLMResponse> {
          throw new Error('remote node unavailable in offline replay');
        },
      },
      model: 'deepseek-v4-flash',
      healthy: () => false,
      reason: 'Escalado remoto sólo si está disponible y justificado.',
    },
  ];
}

export interface DrillResult {
  decisions: RoutingDecision[];
  recovery: RecoveryEvent[];
}

export async function runRecoveryDrills(
  llmRecording: ReturnType<typeof readLLMRecording>,
  generatedAt: string
): Promise<DrillResult> {
  const decisions: RoutingDecision[] = [];
  const recovery: RecoveryEvent[] = [];
  const replay = new ReplayLLMProvider(llmRecording, { fallback: new DeterministicLLMProvider() });

  const makeRouter = (runId: string, nodes: CognitiveNode[], timeoutMs: number) => {
    let sequence = 0;
    return new CognitiveRouter({
      runId,
      nodes,
      deterministic: new DeterministicLLMProvider(),
      timeoutMs,
      clock: fixedClock(generatedAt),
      onDecision: (decision) => decisions.push(decision),
      onRecovery: (event) => {
        sequence += 1;
        recovery.push({
          recoveryId: `rec-${runId}-${String(sequence).padStart(3, '0')}`,
          runId,
          at: generatedAt,
          kind: event.kind,
          subject: event.subject,
          action: event.action,
          detail: event.detail,
        });
      },
    });
  };

  // 1. Nodo local caído: escala a remoto (que sí responde) de forma justificada.
  const nodeDown = makeRouter('m5-drill-nodedown', [
    { node: 'ubuntu-ollama', route: 'LOCAL', provider: replay, model: 'local', healthy: () => false, reason: 'nodo caído (drill)' },
    { node: 'macmini-ollama', route: 'LOCAL_ALT', provider: replay, model: 'local-alt', healthy: () => false, reason: 'nodo caído (drill)' },
    { node: 'remote-deepseek', route: 'REMOTE_ESCALATION', provider: replay, model: 'remote', healthy: () => true, reason: 'escalado disponible' },
  ], 3000);
  await nodeDown.complete(drillRequest('claim_assessment'));

  // 2. Timeout del nodo local: degrada al alterno local.
  const slow: LLMProvider = {
    id: 'slow-local',
    complete: () =>
      new Promise<LLMResponse>((resolvePromise) => {
        const timer = setTimeout(
          () => resolvePromise({ text: '{}', provider: 'slow-local', model: 'slow', deterministic: false }),
          50
        );
        (timer as { unref?: () => void }).unref?.();
      }),
  };
  const timeoutDrill = makeRouter('m5-drill-timeout', [
    { node: 'ubuntu-ollama', route: 'LOCAL', provider: slow, model: 'slow', healthy: () => true, reason: 'nodo lento (drill)' },
    { node: 'macmini-ollama', route: 'LOCAL_ALT', provider: replay, model: 'local-alt', healthy: () => true, reason: 'alterno local disponible' },
  ], 2);
  await timeoutDrill.complete(drillRequest('signal_discovery'));

  // 3. Respuesta inválida del nodo de juicio: cae al nodo local base.
  const invalid: LLMProvider = {
    id: 'invalid-local',
    async complete(): Promise<LLMResponse> {
      throw new Error('invalid JSON response from model');
    },
  };
  const invalidDrill = makeRouter('m5-drill-invalid', [
    { node: 'macmini-ollama', route: 'LOCAL_ALT', provider: invalid, model: 'invalid', healthy: () => true, reason: 'respuesta inválida (drill)' },
    { node: 'ubuntu-ollama', route: 'LOCAL', provider: replay, model: 'local', healthy: () => true, reason: 'fallback local' },
  ], 3000);
  await invalidDrill.complete(drillRequest('claim_assessment'));

  return { decisions, recovery };
}

function drillRequest(stage: string): LLMRequest {
  return { stage: stage as LLMRequest['stage'], system: 'drill', prompt: 'drill', json: true, temperature: 0 };
}

export function buildArtifacts(input: ArtifactInput): M5Artifacts {
  const benchmark = buildBenchmark(input);
  const metrics = buildMetrics(input);
  metrics.falsePositiveObservations = [...benchmark.falsePositiveObservations];
  return {
    corpus: input.corpus,
    benchmark,
    runTimeline: buildRunTimeline(input),
    state: input.state,
    metrics,
    cognitiveRouting: buildCognitiveRouting(input),
    observability: buildObservability(input),
    recoveryEvents: buildRecovery(input),
    idempotency: buildIdempotency(input),
    akpHandoff: buildAkpHandoff(input),
    humanReview: buildHumanReview(input),
  };
}

class AuditingLLMProvider implements LLMProvider {
  readonly id: string;
  private readonly inner: LLMProvider;
  private readonly audits: { assessments: Record<string, number> };

  constructor(inner: LLMProvider, audits: { assessments: Record<string, number> }) {
    this.inner = inner;
    this.audits = audits;
    this.id = `audit(${inner.id})`;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.inner.complete(request);
    if (request.stage === 'claim_assessment') {
      try {
        const parsed = JSON.parse(response.text) as { assessment?: string };
        const key = typeof parsed.assessment === 'string' ? parsed.assessment : 'AMBIGUOUS';
        this.audits.assessments[key] = (this.audits.assessments[key] ?? 0) + 1;
      } catch {
        this.audits.assessments['INVALID'] = (this.audits.assessments['INVALID'] ?? 0) + 1;
      }
    }
    return response;
  }
}

function asM4Corpus(corpus: M5Corpus): Corpus & { cycles: M5Corpus['cycles'] } {
  return { ...corpus, kind: 'athenasignal.m3.corpus.v1' } as Corpus & { cycles: M5Corpus['cycles'] };
}

export function loadM3Corpus(path: string = DEFAULT_M3_CORPUS_PATH): Corpus {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as Corpus;
}

function fixedClock(start: string, stepMs = 0): () => string {
  let current = Date.parse(start);
  return () => {
    const value = new Date(current).toISOString();
    current += stepMs;
    return value;
  };
}

function summarize(outcome: { run: { runId: string; status: string }; applied: string[]; skipped: string[] }) {
  return {
    runId: outcome.run.runId,
    status: outcome.run.status,
    applied: outcome.applied.length,
    skipped: outcome.skipped.length,
  };
}

export function outputPathsFor(outputDir: string): M5OutputPaths {
  return {
    corpus: resolve(process.cwd(), outputDir, 'corpus.json'),
    benchmark: resolve(process.cwd(), outputDir, 'benchmark.json'),
    runTimeline: resolve(process.cwd(), outputDir, 'run-timeline.json'),
    state: resolve(process.cwd(), outputDir, 'radar-state.json'),
    metrics: resolve(process.cwd(), outputDir, 'metrics.json'),
    cognitiveRouting: resolve(process.cwd(), outputDir, 'cognitive-routing.json'),
    observability: resolve(process.cwd(), outputDir, 'observability.json'),
    recoveryEvents: resolve(process.cwd(), outputDir, 'recovery-events.json'),
    idempotency: resolve(process.cwd(), outputDir, 'idempotency.json'),
    akpHandoff: resolve(process.cwd(), outputDir, 'akp-handoff.json'),
    humanReview: resolve(process.cwd(), outputDir, 'human-review-packet.json'),
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export { serializeState, verifyCorpus, DEFAULT_ROUTE_POLICY };
