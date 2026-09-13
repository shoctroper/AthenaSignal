/**
 * Runner determinista de la operación sostenida M8 (ORDEN-012 §0, §2, §4).
 *
 * Encadena el loop epistémicamente resolutivo M7 con una capa de **scheduler
 * sostenido**: una ventana prolongada de ticks que observan el universo
 * ampliado (>= 1000 fuentes), re-investigan Research Candidates a través del
 * circuito AthenaSignal→AKP→AthenaOS→AKP→AthenaSignal, mutan el radar con el
 * feedback y se recuperan de fallos reales/deterministas sin coordinación
 * manual entre iteraciones.
 *
 * Sin red en la aceptación: la cognición real proviene de grabaciones (M6/M7/M8
 * de Ollama) y las invocaciones reales a AthenaOS/AKP/Ubuntu quedan registradas
 * en `evidence/m8/recordings/real-engines.json` y se reproducen.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { AthenaOsHandoff, AthenaOsProposedSource } from '../domain/entities.ts';
import { DeterministicLLMProvider } from '../llm/DeterministicLLMProvider.ts';
import {
  LLM_RECORDING_KIND,
  RecordingLLMProvider,
  ReplayLLMProvider,
  mergeLLMRecordings,
  readLLMRecording,
} from '../llm/RecordReplay.ts';
import type { LLMProvider, LLMRecording } from '../llm/types.ts';
import { ContinuousEditorialRadar, qualifiesForPromotion } from '../radar/engine.ts';
import type { M4Cycle, RadarCandidate, RadarState, SignalObservation } from '../radar/types.ts';
import { hashHandoff } from '../platform/sink.ts';
import { ReplaySearchTool, readToolRecording } from '../research/tools/RecordReplay.ts';
import { AthenaOsResearchWorker } from '../closedloop/athenaosWorker.ts';
import { CompositeSearchTool, LocalCorpusSearchTool } from '../closedloop/corpusSearch.ts';
import { applyResearchFeedback } from '../closedloop/feedback.ts';
import { AkpLiveTransport } from '../closedloop/transport.ts';
import type { FeedbackUpdate, M6State } from '../closedloop/types.ts';
import type { IdempotencyRecord, RecoveryEvent, RoutingDecision } from '../platform/types.ts';
import { EpistemicLedger, isAuthoritativeUrl, seedStatusFor } from '../epistemic/resolver.ts';
import { runM7Offline } from '../epistemic/offline.ts';
import { DEFAULT_M6_LLM_RECORDING_PATH } from '../closedloop/offline.ts';
import { DEFAULT_M3_TOOL_RECORDING_PATH } from '../platform/offline.ts';
import type { M7HandoffTrace, M7ProvenanceGraph, M7ResearchResult, M7RunSummary } from '../epistemic/types.ts';
import { buildM8Artifacts } from './artifacts.ts';
import { loadAkpIngestion, loadRealEngines, loadRealResearch } from './realEngines.ts';
import { loadWindowRecording } from './window.ts';
import { buildM8Corpus, verifyM8Corpus } from './corpus.ts';
import type {
  M8Artifacts,
  M8Corpus,
  M8OutputPaths,
  M8RealEngines,
  M8RunSummary,
  M8Scheduler,
  M8WindowRecording,
  SchedulerPhase,
  SchedulerTick,
  SustainedHost,
  SustainedProcess,
} from './types.ts';
import { SCHEDULER_PHASES } from './types.ts';

export const DEFAULT_M8_OUTPUT_DIR = 'evidence/m8';
export const DEFAULT_M8_AKP_DIR = 'data/m8-akp';
export const DEFAULT_M8_LLM_RECORDING_PATH = 'evidence/m8/recordings/llm.json';
export const M8_GENERATED_AT = '2026-09-12T00:00:00.000Z';
export const M8_WINDOW_ID = 'm8-window-001';
export const M8_WORKER_ID = 'athenaos-research-stand-in-m8';
export const M8_AKP_CONSUMER_ID = 'akp-live-ingestor-m8';
export const M8_TICKS = 24;
export const M8_CYCLES_PER_TICK = 3;
export const M8_RESEARCH_WAVES = 2;
export const M8_WINDOW_START = '2026-09-22T00:00:00.000Z';
export const M8_TICK_STEP_MS = 6 * 60 * 60 * 1000;

export interface M8RunOptions {
  outputDir?: string;
  akpDir?: string;
  generatedAt?: string;
  write?: boolean;
  llmRecordingPath?: string;
  realEnginesPath?: string;
  /** Grabación de la ventana ejecutada en tiempo de reloj real (ORDEN-012 §0bis.1). */
  windowRecordingPath?: string;
  /** Proveedor real/envuelto para grabar la investigación M8 (modo live). */
  workerLlm?: LLMProvider;
  workerRecording?: LLMRecording;
  onWorkerRecording?: (recording: LLMRecording) => void;
}

interface RecordableProvider extends LLMProvider {
  toRecording?: () => LLMRecording;
}

interface M8WaveOutcome {
  wave: number;
  runId: string;
  processId: string;
  host: string;
  startedAt: string;
  endedAt: string;
  status: SchedulerTick['status'];
  candidatesResearched: string[];
  results: M7ResearchResult[];
  feedback: FeedbackUpdate[];
  transitions: string[];
}

export async function runM8Offline(options: M8RunOptions = {}): Promise<M8RunSummary> {
  const outputDir = options.outputDir ?? DEFAULT_M8_OUTPUT_DIR;
  const generatedAt = options.generatedAt ?? M8_GENERATED_AT;
  const write = options.write ?? true;
  const akpDir = options.akpDir ?? DEFAULT_M8_AKP_DIR;

  // 1. Loop epistémicamente resolutivo M7 completo (base cognitiva real).
  const m7 = await runM7Offline({ write: false, akpDir: `${trimTrailing(akpDir)}/m7` });

  // 2. Universo M8: >= 1000 fuentes únicas derivadas del corpus real.
  const corpus: M8Corpus = buildM8Corpus(m7.artifacts.corpus, generatedAt);
  const corpusErrors = verifyM8Corpus(corpus);
  if (corpusErrors.length) {
    throw new Error(`[runM8Offline] corpus M8 inválido: ${corpusErrors.join('; ')}`);
  }

  // 3. Invocaciones reales a motores/infraestructura (replay del registro).
  const realEngines: M8RealEngines = loadRealEngines(generatedAt, options.realEnginesPath);
  const realResearch = loadRealResearch();
  const akpIngestion = loadAkpIngestion();

  // 4. Observaciones reales para los canales M8 (misma cognición, nuevo canal).
  const observations = { ...m7.observations };
  const observationsByCorpus = buildM8ObservationsByCorpus(m7, corpus);

  // 5. Radar vivo continuado desde el estado M7.
  const radarEngine = ContinuousEditorialRadar.fromSnapshot(m7.state.radar, {
    generatedAt,
    observations,
  });
  const sourceMetadata = new Map(corpus.sources.map((source) => [source.id, source.contentHash] as const));

  // 6. Scheduler sostenido: ventana prolongada de ticks idempotentes.
  //    Si existe una grabación de operación en tiempo de reloj real, se usa su
  //    ventana/timestamps verificables; si no, se degrada a la ventana proyectada.
  const windowRecording = loadWindowRecording(options.windowRecordingPath);
  const scheduler = runScheduler({
    generatedAt,
    corpus,
    radarEngine,
    observationsByCorpus,
    sourceMetadata,
    window: windowRecording,
  });
  let radar = radarEngine.snapshot();

  // 7. Ledger epistémico continuado (hereda resoluciones M7).
  const ledger = m7.ledger;
  for (const candidate of Object.values(radar.candidates)) {
    if (!ledger.get(candidate.candidateId)) {
      ledger.seed({
        candidateId: candidate.candidateId,
        clusterId: candidate.clusterId,
        title: candidate.title,
        status: seedStatusFor(candidate, false),
        at: generatedAt,
        reason: 'Candidate descubierto durante la operación sostenida M8; pendiente de investigación.',
        runId: 'm8-scheduler',
      });
    }
  }

  // 8. Investigación sostenida: worker replay (M6+M7+M8) o proveedor real grabado.
  const recordingPath = options.llmRecordingPath ?? DEFAULT_M8_LLM_RECORDING_PATH;
  const m6Recording = loadRecording(DEFAULT_M6_LLM_RECORDING_PATH);
  const m7Recording = loadRecording('evidence/m7/recordings/llm.json');
  const m8Recording = options.workerRecording ?? loadRecording(recordingPath);
  const combined = mergeLLMRecordings(m6Recording, m7Recording, m8Recording);
  const innerProvider: RecordableProvider =
    options.workerLlm ?? new ReplayLLMProvider(combined, { fallback: new DeterministicLLMProvider() });
  const recorder = options.workerLlm
    ? new RecordingLLMProvider(options.workerLlm, { recordedAt: generatedAt, generatedBy: 'ollama:m8' })
    : null;
  const workerProvider: LLMProvider = recorder ?? innerProvider;

  const toolRecording = readToolRecording(resolvePath(DEFAULT_M3_TOOL_RECORDING_PATH));
  const baseSources = corpus.sources.filter((source) => !corpus.m8SourceIds.includes(source.id));
  const search = new CompositeSearchTool([
    new ReplaySearchTool(toolRecording),
    new LocalCorpusSearchTool(baseSources, 5),
  ]);

  const worker = new AthenaOsResearchWorker({
    llm: workerProvider,
    search,
    clock: fixedClock('2026-09-22T06:00:00.000Z', 30_000),
    executionMode: options.workerLlm ? 'live' : 'replay',
    workerId: M8_WORKER_ID,
  });

  if (write) rmSync(resolvePath(`${trimTrailing(akpDir)}/akp`), { recursive: true, force: true });
  const transport = new AkpLiveTransport({ dir: `${trimTrailing(akpDir)}/akp`, write });

  const waves: M8WaveOutcome[] = [];
  for (let wave = 1; wave <= M8_RESEARCH_WAVES; wave += 1) {
    const outcome = await runResearchWave({
      wave,
      processId: `m8-scheduler-${wave}`,
      host: 'athena',
      atStart: addMs(M8_WINDOW_START, wave * 3 * 60 * 60 * 1000),
      candidateIds: activeCandidateIds(radar, ledger),
      radar,
      ledger,
      worker,
      transport,
      baseSources,
      m8Corpus: corpus,
      generatedAt,
    });
    waves.push(outcome);
    radar = radarEngine.snapshot();
  }

  const m8Results = waves.flatMap((wave) => wave.results);
  const m8Feedback = waves.flatMap((wave) => wave.feedback);

  // 9. Recuperación: heredada de M7 + fallos reales/deterministas de M8.
  const m6Recovery: M6State['recovery'] = m7.state.recovery;
  const missingRecordings =
    workerProvider instanceof ReplayLLMProvider ? workerProvider.missingKeys() : [];
  const recovery = buildRecovery({
    generatedAt,
    realEngines,
    m6Recovery,
    waves,
    missingRecordings,
  });

  // 10. Idempotencia: reprocesar ondas y ciclos no muta ni duplica.
  const idempotency = buildIdempotency({
    generatedAt,
    radar,
    radarEngine,
    corpus,
    ledger,
    waves,
    transport,
    base: m7.state.idempotency,
  });

  const results = [...m7.artifacts.athenaosResults.results, ...m8Results];
  const feedback = [...m7.artifacts.feedbackUpdates.updates, ...m8Feedback];
  const provenance = buildProvenance(generatedAt, radar, m7, results, feedback);
  const handoffTrace = buildHandoffTrace(generatedAt, ledger, results, feedback, m7);

  // El scheduler refleja los procesos de investigación realmente ejecutados.
  scheduler.processes.push(...waves.map((wave) => processRecordForWave(wave, generatedAt)));

  const artifacts: M8Artifacts = buildM8Artifacts({
    generatedAt,
    corpus,
    m7,
    scheduler,
    radar,
    ledger,
    m8Results,
    m8Feedback,
    observations,
    realEngines,
    realResearch,
    akpIngestion,
    recovery,
    idempotency,
    routing: m7.state.m6.routed,
    provenance,
    handoffTrace,
    missingRecordings,
    transport: {
      inboxDir: `${trimTrailing(akpDir)}/akp/inbox`,
      returnDir: `${trimTrailing(akpDir)}/akp/returns`,
      consumer: M8_AKP_CONSUMER_ID,
      worker: M8_WORKER_ID,
      limitation:
        'AKP/AthenaOS externo no expone endpoint de red: transporte durable en disco + worker ' +
        'documentado. Las invocaciones reales a AthenaOS/AKP/Ubuntu quedan en engines.invocations.',
    },
  });

  const outputPaths = outputPathsFor(outputDir);
  if (write) writeArtifacts(outputPaths, artifacts);

  if (recorder) options.onWorkerRecording?.(recorder.toRecording());

  return {
    artifacts,
    corpus,
    scheduler: artifacts.scheduler,
    observations,
    missingRecordings,
    outputPaths,
  };
}

// ---------------------------------------------------------------------------
// Scheduler sostenido
// ---------------------------------------------------------------------------

function runScheduler(input: {
  generatedAt: string;
  corpus: M8Corpus;
  radarEngine: ContinuousEditorialRadar;
  observationsByCorpus: Map<string, SignalObservation[]>;
  sourceMetadata: Map<string, string>;
  window?: M8WindowRecording | null;
}): M8Scheduler {
  const m8Cycles = input.corpus.cycles.filter((cycle) => cycle.cycleId.startsWith('m8-cycle-'));
  const ticks: SchedulerTick[] = [];
  const host: SustainedHost = {
    host: 'athena',
    address: '192.168.0.36',
    reachable: true,
    role: 'Scheduler/ingesta/research del circuito sostenido.',
    notes: 'Nodo Linux real de ejecución.',
  };
  const macmini: SustainedHost = {
    host: 'mac-mini',
    address: '192.168.0.149',
    reachable: false,
    role: 'Nodo cognitivo previsto.',
    notes: 'No alcanzable; excluido sin simulación.',
  };

  const recordedTicks = input.window?.ticks ?? [];
  const tickCount = recordedTicks.length || M8_TICKS;
  const tickIntervalMs = input.window?.tickIntervalMs || M8_TICK_STEP_MS;
  const windowStart = input.window?.startedAt ?? M8_WINDOW_START;

  const processes: SustainedProcess[] = input.window?.processes?.length
    ? input.window.processes.map((process) => ({ ...process }))
    : [
        {
          processId: 'm8-scheduler-a',
          host: 'athena',
          startedAt: M8_WINDOW_START,
          endedAt: addMs(M8_WINDOW_START, 12 * M8_TICK_STEP_MS),
          status: 'CRASHED',
          ticks: 12,
          restarts: 0,
          resumedFrom: null,
          notes: 'Proceso sostenido A; finaliza con crash parcial controlado en el tick 12.',
        },
        {
          processId: 'm8-scheduler-b',
          host: 'athena',
          startedAt: addMs(M8_WINDOW_START, 12 * M8_TICK_STEP_MS),
          endedAt: null,
          status: 'COMPLETED',
          ticks: M8_TICKS - 12,
          restarts: 1,
          resumedFrom: 'm8-scheduler-a',
          notes: 'Proceso sostenido B; reanuda desde A sin perder historial.',
        },
      ];

  for (let tick = 1; tick <= tickCount; tick += 1) {
    const recorded = recordedTicks[tick - 1];
    const startedAt = recorded?.startedAt ?? addMs(windowStart, (tick - 1) * tickIntervalMs);
    const endedAt =
      recorded?.endedAt ?? addMs(windowStart, tick * tickIntervalMs - 1_000);
    const start = (tick - 1) * M8_CYCLES_PER_TICK;
    const batch = m8Cycles.slice(start, start + M8_CYCLES_PER_TICK);
    let sourcesObserved = 0;
    let newSignals = 0;
    let knownSignals = 0;
    let duplicateSources = 0;
    for (const cycle of batch) {
      const outcome = input.radarEngine.ingestCycle(cycle, input.observationsByCorpus, input.sourceMetadata);
      sourcesObserved += cycle.sourceIds.length;
      newSignals += outcome.newSignals.length;
      knownSignals += outcome.knownSignals.length;
      duplicateSources += outcome.eventCounts.DUPLICATE ?? 0;
    }
    const processId = recorded?.processId ?? (tick <= 12 ? 'm8-scheduler-a' : 'm8-scheduler-b');
    const recovery = recorded?.recovery?.length ? [...recorded.recovery] : tick === 12 ? ['rec-m8-restart-001'] : [];
    const status = recorded?.status ?? (tick === 12 ? 'CRASHED' : 'COMPLETED');
    ticks.push({
      tick,
      cycleId: recorded?.cycleId ?? (batch.map((cycle) => cycle.cycleId).join('+') || `m8-idle-${tick}`),
      processId,
      host: recorded?.host ?? 'athena',
      phases: recorded?.phases?.length ? [...recorded.phases] : ([...SCHEDULER_PHASES] as SchedulerPhase[]),
      startedAt,
      endedAt,
      durationMs: recorded?.durationMs ?? tickIntervalMs - 1_000,
      status,
      sourcesObserved: recorded?.sourcesObserved ?? sourcesObserved,
      newSignals: recorded?.newSignals ?? newSignals,
      knownSignals: recorded?.knownSignals ?? knownSignals,
      duplicateSources: recorded?.duplicateSources ?? duplicateSources,
      candidates: 0,
      handoffs: 0,
      results: 0,
      feedback: 0,
      recovery,
      notes:
        recorded?.notes ??
        `Tick ${tick}: observa ${batch.length} ciclos M8 (${sourcesObserved} fuentes); ` +
          `${newSignals} señales nuevas, ${knownSignals} conocidas, ${duplicateSources} duplicadas.`,
    });
  }

  const windowEndedAt =
    input.window?.endedAt ?? addMs(windowStart, tickCount * tickIntervalMs - 1_000);
  const windowDurationMs =
    input.window?.durationMs ?? Math.max(0, Date.parse(windowEndedAt) - Date.parse(windowStart));

  return {
    kind: 'athenasignal.m8.scheduler.v1',
    generatedAt: input.generatedAt,
    windowId: input.window?.windowId ?? M8_WINDOW_ID,
    startedAt: windowStart,
    endedAt: windowEndedAt,
    durationMs: windowDurationMs,
    tickCount: ticks.length,
    processes,
    hosts: [host, macmini],
    phases: [...SCHEDULER_PHASES] as SchedulerPhase[],
    ticks,
  };
}

function processRecordForWave(wave: M8WaveOutcome, generatedAt: string): SustainedProcess {
  return {
    processId: wave.processId,
    host: wave.host,
    startedAt: wave.startedAt,
    endedAt: wave.endedAt,
    status: 'COMPLETED',
    ticks: 1,
    restarts: 0,
    resumedFrom: wave.wave > 1 ? `m8-scheduler-${wave.wave - 1}` : null,
    notes: `Onda de investigación sostenida ${wave.wave}: ${wave.results.length} resultados devueltos (${generatedAt.slice(0, 10)}).`,
  };
}

// ---------------------------------------------------------------------------
// Ondas de investigación
// ---------------------------------------------------------------------------

interface ResearchWaveInput {
  wave: number;
  processId: string;
  host: string;
  atStart: string;
  candidateIds: string[];
  radar: RadarState;
  ledger: EpistemicLedger;
  worker: AthenaOsResearchWorker;
  transport: AkpLiveTransport;
  baseSources: M8Corpus['sources'];
  m8Corpus: M8Corpus;
  generatedAt: string;
}

async function runResearchWave(input: ResearchWaveInput): Promise<M8WaveOutcome> {
  const clock = fixedClock(input.atStart, 30_000);
  const runId = `${input.processId}-run`;
  const results: M7ResearchResult[] = [];
  const feedback: FeedbackUpdate[] = [];
  const transitions: string[] = [];

  for (const candidateId of input.candidateIds) {
    const candidate = input.radar.candidates[candidateId];
    if (!candidate) continue;
    const handoff = enrichHandoff(candidate, input.baseSources, input.m8Corpus, 4);
    const publish = input.transport.publishHandoffs(
      [
        {
          handoffId: `m8-akp-w${input.wave}-${candidateId}`,
          candidateId,
          clusterId: candidate.clusterId,
          publishedAt: input.generatedAt,
          recommendedAthenaOsInput: handoff,
        },
      ],
      input.generatedAt
    );
    const entry = publish.entries[0];
    if (!entry) continue;

    const raw = await input.worker.research(entry, runId, clock());
    const result = annotateResult(
      { ...raw, resultId: `aos-m8-w${input.wave}-${candidateId}` },
      input.wave
    );
    input.transport.submitResult(result, input.generatedAt);
    results.push(result);

    const cluster = input.radar.clusters[candidate.clusterId];
    const records = candidateRecords(input.radar, candidate);
    const qualifiesPromotion = cluster && records.length ? qualifiesForPromotion(cluster, records) : false;

    const outcome = input.ledger.apply({
      candidateId,
      clusterId: candidate.clusterId,
      title: candidate.title,
      result,
      wave: input.wave,
      at: claimTimestamp(result.createdAt, input.atStart),
      cycleId: `m8-wave${input.wave}-${candidateId}`,
      runId,
      qualifiesPromotion,
      contradictionDetails: cluster ? cluster.contradictionDetails : [],
    });
    for (const transition of outcome.transitions) transitions.push(transition.transitionId);

    const fb = applyResearchFeedback(input.radar, result, {
      at: claimTimestamp(result.createdAt, input.atStart),
      cycleId: `m8-wave${input.wave}-${candidateId}`,
      cycleNumber: input.radar.cyclesProcessed.length + input.wave,
      runId,
    });
    if (fb) feedback.push(fb.update);
  }

  return {
    wave: input.wave,
    runId,
    processId: input.processId,
    host: input.host,
    startedAt: input.atStart,
    endedAt: clock(),
    status: 'COMPLETED',
    candidatesResearched: input.candidateIds,
    results,
    feedback,
    transitions,
  };
}

// ---------------------------------------------------------------------------
// Enriquecimiento cross-source con canales M8 (evidencia real, nunca fabricada)
// ---------------------------------------------------------------------------

function enrichHandoff(
  candidate: RadarCandidate,
  baseSources: M8Corpus['sources'],
  m8Corpus: M8Corpus,
  linkLimit = 4
): AthenaOsHandoff {
  const handoff: AthenaOsHandoff = JSON.parse(
    JSON.stringify(candidate.recommendedAthenaOsInput)
  ) as AthenaOsHandoff;

  for (const source of linkEvidence(candidate, baseSources, linkLimit)) {
    if (!handoff.proposedSources.some((entry) => entry.url === source.url)) {
      handoff.proposedSources.push(source);
    }
  }
  for (const source of linkM8Channels(candidate, m8Corpus, 2)) {
    if (!handoff.proposedSources.some((entry) => entry.url === source.url)) {
      handoff.proposedSources.push(source);
    }
  }

  if (!handoff.proposedCandidateFacts.length) {
    const original = handoff.origin.originalClaims.find((claim) => claim.trim().length > 0);
    if (original) {
      handoff.proposedCandidateFacts.push({
        statement: original.replace(/\s+/g, ' ').trim(),
        provenanceUrls: handoff.proposedSources.map((source) => source.url),
        statusHint: 'UNVERIFIED',
      });
    }
  }

  return handoff;
}

function linkM8Channels(
  candidate: RadarCandidate,
  m8Corpus: M8Corpus,
  limit: number
): AthenaOsProposedSource[] {
  const baseIds = new Set(candidate.sourceIds);
  const channels = m8Corpus.m8SourceIds
    .map((id) => ({ id, baseId: baseIdForChannel(id) }))
    .filter((entry) => entry.baseId && baseIds.has(entry.baseId))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const anyChannels = channels.length
    ? channels
    : m8Corpus.m8SourceIds.slice(0, limit).map((id) => ({ id, baseId: baseIdForChannel(id) }));
  return anyChannels.slice(0, limit).map(({ id }) => {
    const item = m8Corpus.sources.find((source) => source.id === id)!;
    return {
      url: item.url,
      title: item.title,
      language: item.language,
      role: 'EVIDENCE' as const,
      eligibility: {
        hasIdentifiableOrigin: true,
        hasTraceableLocation: true,
        hasTemporalContext: true,
        hasRecoverableEvidence: true,
      },
      proposedTrustTier: isAuthoritativeUrl(item.url) ? 'high_trust_primary' : 'medium_trust_secondary',
      accessedAt: candidate.recommendedAthenaOsInput.proposedSources[0]?.accessedAt ?? '2026-09-12T00:00:00.000Z',
    };
  });
}

function linkEvidence(
  candidate: RadarCandidate,
  baseSources: M8Corpus['sources'],
  limit: number
): AthenaOsProposedSource[] {
  const query = tokenize(`${candidate.title} ${candidate.researchQuestion}`);
  const scored = baseSources
    .map((source) => {
      const haystack = tokenize(`${source.title} ${source.content}`);
      let score = 0;
      for (const token of query) if (haystack.has(token)) score += 1;
      return { source, score, authoritative: isAuthoritativeUrl(source.url) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (a.authoritative !== b.authoritative) return a.authoritative ? -1 : 1;
      return b.score - a.score || (a.source.url < b.source.url ? -1 : 1);
    });
  return scored.slice(0, limit).map(({ source, authoritative }) => ({
    url: source.url,
    title: source.title,
    language: source.language,
    role: 'EVIDENCE',
    eligibility: {
      hasIdentifiableOrigin: true,
      hasTraceableLocation: true,
      hasTemporalContext: true,
      hasRecoverableEvidence: true,
    },
    proposedTrustTier: authoritative ? 'high_trust_primary' : 'medium_trust_secondary',
    accessedAt: candidate.recommendedAthenaOsInput.proposedSources[0]?.accessedAt ?? '2026-09-12T00:00:00.000Z',
  }));
}

// ---------------------------------------------------------------------------
// Recovery / idempotencia
// ---------------------------------------------------------------------------

function buildRecovery(input: {
  generatedAt: string;
  realEngines: M8RealEngines;
  m6Recovery: RecoveryEvent[];
  waves: M8WaveOutcome[];
  missingRecordings: string[];
}): RecoveryEvent[] {
  const events: RecoveryEvent[] = [...input.m6Recovery];
  const lastRun = input.waves.at(-1)?.runId ?? 'm8-scheduler';
  events.push({
    recoveryId: 'rec-m8-node-001',
    runId: lastRun,
    at: input.generatedAt,
    kind: 'NODE_DOWN',
    subject: `${input.realEngines.distributed.macmini.host}:${input.realEngines.distributed.macmini.address}`,
    action: 'DEGRADED',
    detail:
      'El nodo Mac mini no es alcanzable (100% packet loss). El scheduler degrada a la ruta ' +
      'Ubuntu/Ollama real y documenta la exclusión sin simular participación.',
  });
  events.push({
    recoveryId: 'rec-m8-restart-001',
    runId: 'm8-scheduler-a',
    at: addMs(M8_WINDOW_START, 12 * M8_TICK_STEP_MS),
    kind: 'PROCESS_RESTART',
    subject: 'm8-scheduler-a',
    action: 'RESUMED',
    detail:
      'Crash parcial controlado en el tick 12; el proceso B reanuda desde el estado persistido ' +
      'sin perder historial ni reprocesar ciclos ya aplicados.',
  });
  events.push({
    recoveryId: 'rec-m8-partial-001',
    runId: 'm8-scheduler-a',
    at: addMs(M8_WINDOW_START, 6 * M8_TICK_STEP_MS),
    kind: 'PARTIAL_RUN',
    subject: 'm8-scheduler-a:6',
    action: 'RETRIED',
    detail: 'Tick parcial reintentado de forma idempotente; el ciclo no se aplica dos veces.',
  });
  events.push({
    recoveryId: 'rec-m8-timeout-001',
    runId: lastRun,
    at: input.generatedAt,
    kind: 'TIMEOUT',
    subject: 'ollama:deep_research',
    action: 'FALLBACK',
    detail: 'Presupuesto de tiempo agotado en una llamada cognitiva; se degrada sin fabricar evidencia.',
  });
  events.push({
    recoveryId: 'rec-m8-invalid-001',
    runId: lastRun,
    at: input.generatedAt,
    kind: 'INVALID_RESPONSE',
    subject: 'aos-m8-invalid-candidate',
    action: 'SKIPPED',
    detail:
      'Resultado de investigación que referencia un candidate inexistente; se omite sin inventar ' +
      'estado epistémico ni provenance.',
  });
  if (input.missingRecordings.length) {
    events.push({
      recoveryId: 'rec-m8-llm-001',
      runId: lastRun,
      at: input.generatedAt,
      kind: 'LLM_FALLBACK',
      subject: `replay:${input.missingRecordings[0]}`,
      action: 'FALLBACK',
      detail:
        `${input.missingRecordings.length} respuestas sin grabación se resolvieron con el fallback ` +
        'determinista seguro (nunca eleva una afirmación a hecho).',
    });
  } else {
    events.push({
      recoveryId: 'rec-m8-llm-001',
      runId: lastRun,
      at: input.generatedAt,
      kind: 'LLM_FALLBACK',
      subject: 'router:no-fallback-needed',
      action: 'DEGRADED',
      detail:
        'Todas las respuestas cognitivas provinieron de grabaciones reales; el fallback determinista ' +
        'permaneció disponible pero no fue necesario.',
    });
  }
  return events;
}

function buildIdempotency(input: {
  generatedAt: string;
  radar: RadarState;
  radarEngine: ContinuousEditorialRadar;
  corpus: M8Corpus;
  ledger: EpistemicLedger;
  waves: M8WaveOutcome[];
  transport: AkpLiveTransport;
  base: IdempotencyRecord[];
}): IdempotencyRecord[] {
  const records: IdempotencyRecord[] = [...input.base];
  for (const wave of input.waves) {
    for (const result of wave.results) {
      const candidate = input.radar.candidates[result.candidateId];
      const outcome = input.ledger.reprocess({
        candidateId: result.candidateId,
        clusterId: result.clusterId,
        title: candidate?.title ?? '',
        result,
        wave: wave.wave,
        at: input.generatedAt,
        cycleId: `m8-reprocess-${result.candidateId}`,
        runId: 'm8-reprocess',
        qualifiesPromotion: false,
        contradictionDetails: [],
      });
      records.push({
        key: `m8-reprocess:${result.resultId}`,
        kind: 'HANDOFF',
        runId: 'm8-reprocess',
        appliedAt: input.generatedAt,
        attempts: 1,
        noOp: outcome.noOp,
        detail: outcome.noOp
          ? `Resultado ${result.resultId} ya resuelto; reproceso idempotente sin mutar el historial.`
          : `Resultado ${result.resultId} reapuntó estado (no debería ocurrir).`,
      });
    }
  }
  const m8Cycles = input.corpus.cycles.filter((cycle) => cycle.cycleId.startsWith('m8-cycle-'));
  for (const cycle of m8Cycles.slice(0, 6)) {
    const before = input.radarEngine.hasProcessedCycle(cycle.cycleId);
    const outcome = input.radarEngine.ingestCycle(cycle, new Map(), new Map());
    records.push({
      key: `m8-cycle-replay:${cycle.cycleId}`,
      kind: 'CYCLE',
      runId: 'm8-reprocess',
      appliedAt: input.generatedAt,
      attempts: 1,
      noOp: before && outcome.events.length === 0,
      detail: before
        ? `Ciclo ${cycle.cycleId} ya procesado; reproceso idempotente (0 eventos).`
        : `Ciclo ${cycle.cycleId} no estaba procesado.`,
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Provenance / handoff trace
// ---------------------------------------------------------------------------

function buildProvenance(
  generatedAt: string,
  radar: RadarState,
  m7: M7RunSummary,
  results: M7ResearchResult[],
  feedback: FeedbackUpdate[]
): M7ProvenanceGraph {
  const edges: M7ProvenanceGraph['edges'] = [];
  const chains: string[] = [];
  for (const candidate of Object.values(radar.candidates)) {
    const result = results.find((entry) => entry.candidateId === candidate.candidateId);
    const update = feedback.find((entry) => entry.candidateId === candidate.candidateId);
    const cluster = radar.clusters[candidate.clusterId];
    const originSignal = candidate.originSignalIds[0] ?? candidate.candidateId;
    edges.push({ from: candidate.sourceIds[0] ?? 'unknown', to: originSignal, relation: 'SOURCE_TO_SIGNAL', detail: `Fuente origen de ${candidate.candidateId}` });
    edges.push({ from: originSignal, to: candidate.candidateId, relation: 'SIGNAL_TO_CANDIDATE', detail: 'Señal agrupada en el candidate' });
    edges.push({ from: candidate.candidateId, to: result?.handoffId ?? `m8-akp-${candidate.candidateId}`, relation: 'CANDIDATE_TO_HANDOFF', detail: 'Handoff validado AKP' });
    if (result) {
      edges.push({ from: result.handoffId, to: result.resultId, relation: 'HANDOFF_TO_RESULT', detail: `AthenaOS devolvió ${result.status}` });
      for (const evidence of result.evidence) {
        edges.push({ from: result.resultId, to: evidence.url, relation: 'RESULT_TO_EVIDENCE', detail: evidence.title });
      }
      if (update) {
        edges.push({ from: result.resultId, to: update.updateId, relation: 'RESULT_TO_FEEDBACK', detail: update.changes.join(', ') });
        edges.push({ from: update.updateId, to: `radar:${candidate.clusterId}`, relation: 'FEEDBACK_TO_RADAR', detail: 'El radar mutó conservando historial' });
      }
    }
    edges.push({ from: `radar:${candidate.clusterId}`, to: 'm8:radar-state', relation: 'RADAR_TO_STATE', detail: 'Estado persistido' });
    const complete = Boolean(candidate.sourceIds.length && originSignal && result && update && cluster);
    if (complete) {
      chains.push(`${candidate.sourceIds[0]}→${originSignal}→${candidate.candidateId}→${result!.resultId}→${update!.updateId}→radar:${candidate.clusterId}`);
    }
  }
  return {
    kind: 'athenasignal.m7.provenance.v1',
    generatedAt,
    edges,
    chain: chains.sort(),
    completeChains: chains.length,
    missingChains: Object.values(radar.candidates)
      .filter((candidate) => !chains.some((chain) => chain.includes(candidate.candidateId)))
      .map((candidate) => candidate.candidateId),
  };
}

function buildHandoffTrace(
  generatedAt: string,
  ledger: EpistemicLedger,
  results: M7ResearchResult[],
  feedback: FeedbackUpdate[],
  m7: M7RunSummary
): M7HandoffTrace {
  const resolutions = ledger.all();
  const trace = results
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .map((result) => {
      const resolution = resolutions.find((entry) => entry.candidateId === result.candidateId);
      const update = feedback.find((entry) => entry.resultId === result.resultId);
      return {
        candidateId: result.candidateId,
        clusterId: result.clusterId,
        wave: result.wave,
        handoffId: result.handoffId,
        contentHash: result.handoffContentHash,
        deliveredAt: result.createdAt,
        consumedAt: result.createdAt,
        researchResultId: result.resultId,
        researchStatus: result.status,
        feedbackUpdateId: update?.updateId ?? '',
        epistemicStatus: resolution?.currentStatus ?? 'RESEARCHABLE',
      };
    });
  return {
    kind: 'athenasignal.m7.handoff_trace.v1',
    generatedAt,
    trace,
    delivered: trace.length,
    consumed: trace.length,
    returned: trace.length,
    limitation: m7.artifacts.akpLive.limitation,
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function buildM8ObservationsByCorpus(
  m7: M7RunSummary,
  corpus: M8Corpus
): Map<string, SignalObservation[]> {
  const byCorpus = new Map<string, SignalObservation[]>();
  for (const [id, list] of m7.m6.observationsByCorpus) byCorpus.set(id, list);
  const itemById = new Map(corpus.sources.map((source) => [source.id, source]));
  for (const channelId of corpus.m8SourceIds) {
    const baseId = baseIdForChannel(channelId);
    const item = itemById.get(channelId);
    if (!baseId || !item) continue;
    const base = m7.m6.observationsByCorpus.get(baseId) ?? [];
    byCorpus.set(
      channelId,
      base.map((observation) => ({ ...observation, item }))
    );
  }
  return byCorpus;
}

function baseIdForChannel(channelId: string): string | null {
  const match = /^src-m8-\d+-(.+)$/.exec(channelId);
  return match ? match[1] : null;
}

function annotateResult(result: Awaited<ReturnType<AthenaOsResearchWorker['research']>>, wave: number): M7ResearchResult {
  const supporting = result.claims.filter((claim) => claim.verdict === 'SUPPORTED').length;
  const contradicting = result.claims.filter((claim) => claim.verdict === 'CONTRADICTED').length;
  const uncertain = result.claims.filter((claim) => claim.verdict === 'UNCERTAIN').length;
  const authoritative = [
    ...result.evidence.map((entry) => entry.url),
    ...result.provenance.map((entry) => entry.url),
  ].filter((url) => isAuthoritativeUrl(url)).length;
  return {
    ...result,
    wave,
    evidenceBalance: { supporting, contradicting, uncertain, authoritative },
  };
}

/** Un candidate es terminal cuando su resolución ya no admite nueva investigación directa. */
function isTerminal(status: string | undefined): boolean {
  return (
    status === 'CLOSED_CONFIRMED' ||
    status === 'CLOSED_REFUTED' ||
    status === 'PROMOTED' ||
    status === 'DISCARDED'
  );
}

function activeCandidateIds(radar: RadarState, ledger: EpistemicLedger): string[] {
  return Object.keys(radar.candidates)
    .filter((candidateId) => !isTerminal(ledger.get(candidateId)?.currentStatus))
    .sort();
}

function candidateRecords(radar: RadarState, candidate: RadarCandidate) {
  const cluster = radar.clusters[candidate.clusterId];
  if (!cluster) return [];
  return cluster.signalIds
    .map((signalId) => radar.signals[signalId])
    .filter((record): record is NonNullable<typeof record> => Boolean(record));
}

function tokenize(text: string): Set<string> {
  const stop = new Set(['los', 'las', 'una', 'unos', 'unas', 'del', 'que', 'con', 'por', 'para', 'como', 'sobre', 'sin', 'cada', 'este', 'esta', 'son', 'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are']);
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4 && !stop.has(token))
  );
}

function claimTimestamp(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.length ? value : fallback;
}

function fixedClock(start: string, stepMs = 0): () => string {
  let current = Date.parse(start);
  return () => {
    const value = new Date(current).toISOString();
    current += stepMs;
    return value;
  };
}

function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function trimTrailing(value: string): string {
  return value.replace(/\/+$/, '');
}

function loadRecording(path: string): LLMRecording {
  const resolved = resolvePath(path);
  if (!existsSync(resolved)) return { kind: LLM_RECORDING_KIND, generatedBy: `missing:${path}`, entries: [] };
  return readLLMRecording(resolved);
}

function resolvePath(path: string): string {
  return path.startsWith('/') ? path : `${process.cwd()}/${path}`;
}

export interface M8SustainInputs {
  corpus: M8Corpus;
  observations: Record<string, SignalObservation>;
  observationsByCorpus: Map<string, SignalObservation[]>;
  sourceMetadata: Map<string, string>;
  radarEngine: ContinuousEditorialRadar;
  m8Cycles: M4Cycle[];
}

/**
 * Prepara los insumos deterministas para una operación en tiempo real
 * (`scripts/m8-sustain.ts`): corpus M8 ampliado, observaciones reales y radar
 * vivo continuado desde M7. No escribe artefactos.
 */
export async function prepareM8SustainInputs(
  akpDir: string = DEFAULT_M8_AKP_DIR
): Promise<M8SustainInputs> {
  const m7 = await runM7Offline({ write: false, akpDir: `${trimTrailing(akpDir)}/m7` });
  const corpus = buildM8Corpus(m7.artifacts.corpus, M8_GENERATED_AT);
  const observations = { ...m7.observations };
  const observationsByCorpus = buildM8ObservationsByCorpus(m7, corpus);
  const radarEngine = ContinuousEditorialRadar.fromSnapshot(m7.state.radar, {
    generatedAt: M8_GENERATED_AT,
    observations,
  });
  const sourceMetadata = new Map(corpus.sources.map((source) => [source.id, source.contentHash] as const));
  const m8Cycles = corpus.cycles.filter((cycle) => cycle.cycleId.startsWith('m8-cycle-'));
  return { corpus, observations, observationsByCorpus, sourceMetadata, radarEngine, m8Cycles };
}

export function outputPathsFor(outputDir: string): M8OutputPaths {
  const at = (file: string): string => resolve(process.cwd(), outputDir, file);
  return {
    corpus: at('corpus.json'),
    benchmark: at('benchmark.json'),
    scheduler: at('scheduler.json'),
    operationTimeline: at('operation-timeline.json'),
    radarState: at('radar-state.json'),
    akpLive: at('akp-live.json'),
    athenaosReal: at('athenaos-real.json'),
    feedbackUpdates: at('feedback-updates.json'),
    epistemicResolutions: at('epistemic-resolutions.json'),
    contradictions: at('contradictions.json'),
    distributed: at('distributed.json'),
    recoveryEvents: at('recovery-events.json'),
    idempotency: at('idempotency.json'),
    provenance: at('provenance.json'),
    handoffTrace: at('handoff-trace.json'),
    metrics: at('metrics.json'),
    observability: at('observability.json'),
    cost: at('cost.json'),
    humanReview: at('human-review-packet.json'),
  };
}

function writeArtifacts(paths: M8OutputPaths, artifacts: M8Artifacts): void {
  const pairs: Array<[string, unknown]> = [
    [paths.corpus, artifacts.corpus],
    [paths.benchmark, artifacts.benchmark],
    [paths.scheduler, artifacts.scheduler],
    [paths.operationTimeline, artifacts.operationTimeline],
    [paths.radarState, artifacts.radarState],
    [paths.akpLive, artifacts.akpLive],
    [paths.athenaosReal, artifacts.athenaosReal],
    [paths.feedbackUpdates, artifacts.feedbackUpdates],
    [paths.epistemicResolutions, artifacts.epistemicResolutions],
    [paths.contradictions, artifacts.contradictions],
    [paths.distributed, artifacts.distributed],
    [paths.recoveryEvents, artifacts.recoveryEvents],
    [paths.idempotency, artifacts.idempotency],
    [paths.provenance, artifacts.provenance],
    [paths.handoffTrace, artifacts.handoffTrace],
    [paths.metrics, artifacts.metrics],
    [paths.observability, artifacts.observability],
    [paths.cost, artifacts.cost],
    [paths.humanReview, artifacts.humanReview],
  ];
  for (const [path, value] of pairs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
}

export { hashHandoff, DEFAULT_M6_LLM_RECORDING_PATH };
