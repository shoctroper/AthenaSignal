/**
 * Runner offline determinista del loop M7 (ORDEN-011 §0, §3, §5, §7).
 *
 * Encadena el closed loop M6 (AthenaSignal → AKP → AthenaOS → AKP →
 * AthenaSignal) con la capa de resolución epistémica: dos ondas longitudinales
 * de evidencia, transiciones evidence-driven, cierre/reapertura/degradación por
 * nueva evidencia, contradicciones explícitas, provenance completa e
 * idempotencia. Sin red: la cognición real proviene de grabaciones (M6 + M7).
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

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
import type { RadarCandidate, RadarState } from '../radar/types.ts';
import { hashHandoff } from '../platform/sink.ts';
import { ReplaySearchTool, readToolRecording } from '../research/tools/RecordReplay.ts';
import { AthenaOsResearchWorker, ATHENAOS_WORKER_ID } from '../closedloop/athenaosWorker.ts';
import { CompositeSearchTool, LocalCorpusSearchTool } from '../closedloop/corpusSearch.ts';
import { applyResearchFeedback } from '../closedloop/feedback.ts';
import {
  AKP_LIVE_ENTRY_KIND,
  AkpLiveTransport,
  type AkpHandoffEntry,
} from '../closedloop/transport.ts';
import { runM6Offline, DEFAULT_M6_LLM_RECORDING_PATH } from '../closedloop/offline.ts';
import { DEFAULT_M3_TOOL_RECORDING_PATH } from '../platform/offline.ts';
import type {
  AthenaOsResearchResult,
  FeedbackUpdate,
  M6State,
  TopologyNode,
} from '../closedloop/types.ts';
import { EpistemicLedger, isAuthoritativeUrl, seedStatusFor } from './resolver.ts';
import { buildM7Artifacts } from './artifacts.ts';
import type {
  M7Artifacts,
  M7Corpus,
  M7OutputPaths,
  M7ResearchResult,
  M7RunOptions,
  M7RunSummary,
  M7State,
  M7Wave,
} from './types.ts';
import { buildM7Corpus, verifyM7Corpus } from './corpus.ts';

export const DEFAULT_M7_OUTPUT_DIR = 'evidence/m7';
export const DEFAULT_M7_AKP_DIR = 'data/m7-akp';
export const DEFAULT_M7_LLM_RECORDING_PATH = 'evidence/m7/recordings/llm.json';
export const M7_GENERATED_AT = '2026-09-12T00:00:00.000Z';
export const M7_AKP_CONSUMER_ID = 'akp-live-ingestor-m7';
export const M7_WORKER_ID = 'athenaos-research-stand-in-m7';

interface RecordableProvider extends LLMProvider {
  toRecording?: () => LLMRecording;
}

export async function runM7Offline(options: M7RunOptions = {}): Promise<M7RunSummary> {
  const outputDir = options.outputDir ?? DEFAULT_M7_OUTPUT_DIR;
  const generatedAt = options.generatedAt ?? M7_GENERATED_AT;
  const write = options.write ?? true;
  const akpDir = options.akpDir ?? DEFAULT_M7_AKP_DIR;

  // 1. Loop M6 completo (radar vivo + resultados + feedback + recovery).
  const m6 = await runM6Offline({
    write: false,
    akpDir: `${akpDir.replace(/\/+$/, '')}/m6`,
  });

  // 2. Universo M7 (>= 400 fuentes únicas) derivado del corpus M6 real.
  const m7Corpus: M7Corpus = buildM7Corpus(m6.corpus, generatedAt);
  const corpusErrors = verifyM7Corpus(m7Corpus);
  if (corpusErrors.length) {
    throw new Error(`[runM7Offline] corpus M7 inválido: ${corpusErrors.join('; ')}`);
  }

  // 3. Investigación M7: grabación real o replay determinista.
  const m7RecordingPath = options.llmRecordingPath ?? DEFAULT_M7_LLM_RECORDING_PATH;
  const m6Recording = loadRecording(DEFAULT_M6_LLM_RECORDING_PATH);
  const m7Recording = options.workerRecording ?? loadRecording(m7RecordingPath);
  const combined = mergeLLMRecordings(m6Recording, m7Recording);
  const innerProvider: RecordableProvider =
    options.workerLlm ??
    new ReplayLLMProvider(combined, { fallback: new DeterministicLLMProvider() });
  const recorder = options.workerLlm
    ? new RecordingLLMProvider(options.workerLlm, {
        recordedAt: generatedAt,
        generatedBy: `ollama:m7`,
      })
    : null;
  const workerProvider: LLMProvider = recorder ?? innerProvider;

  const toolRecording = readToolRecording(resolvePath(DEFAULT_M3_TOOL_RECORDING_PATH));
  const baseSources = m6.corpus.sources.filter(
    (source) => !m6.corpus.m6SourceIds.includes(source.id)
  );
  const search = new CompositeSearchTool([
    new ReplaySearchTool(toolRecording),
    new LocalCorpusSearchTool(baseSources, 5),
  ]);

  const clock2 = fixedClock('2026-09-21T02:00:00.000Z', 60_000);
  const worker = new AthenaOsResearchWorker({
    llm: workerProvider,
    search,
    clock: clock2,
    executionMode: options.workerLlm ? 'live' : 'replay',
    workerId: M7_WORKER_ID,
  });

  // 4. Radar y ledger epistémico sembrados desde el estado M6 persistido.
  let radar: RadarState = JSON.parse(JSON.stringify(m6.state.radar)) as RadarState;
  const ledger = new EpistemicLedger();
  const m6ResultByCandidate = new Map(m6.results.map((result) => [result.candidateId, result]));
  for (const candidate of Object.values(radar.candidates)) {
    ledger.seed({
      candidateId: candidate.candidateId,
      clusterId: candidate.clusterId,
      title: candidate.title,
      status: seedStatusFor(candidate, m6ResultByCandidate.has(candidate.candidateId)),
      at: generatedAt,
      reason:
        candidate.status === 'DISCARDED'
          ? 'Estado heredado del radar M6: candidato descartado por ruido/no investigable.'
          : 'Estado heredado del radar M6; listo para resolución epistémica.',
      runId: 'm6-import',
    });
  }

  // 5. Onda 1: conocimiento que ya regresó en M6 (replay determinista).
  const wave1: M7Wave = newWave(1, 'm7-proc-w1', 'ubuntu', generatedAt, 'm6-import');
  const wave1Results = m6.results.map((result) => annotateResult(result, 1));
  for (const result of wave1Results) {
    const outcome = ledger.apply({
      candidateId: result.candidateId,
      clusterId: result.clusterId,
      title: '',
      result,
      wave: 1,
      at: claimTimestamp(result.createdAt, generatedAt),
      cycleId: `m7-wave1-${result.candidateId}`,
      runId: wave1.runId,
      qualifiesPromotion: qualifies(result, radar),
      contradictionDetails: contradictionDetailsFor(radar, result),
    });
    wave1.resultsReturned.push(result.resultId);
    for (const transition of outcome.transitions) wave1.transitions.push(transition.transitionId);
  }
  wave1.endedAt = clock2();
  wave1.status = 'COMPLETED';
  wave1.notes =
    `Onda 1: se re-ingiere la investigación M6 (${wave1Results.length} resultados) y se formaliza ` +
    'el estado epistémico inicial con provenance.';

  // 6. Onda 2: nueva evidencia real (cross-source) investigada en vivo/grabada.
  if (write) rmSync(resolvePath(akpDir), { recursive: true, force: true });
  const transport = new AkpLiveTransport({ dir: akpDir, write: write });
  const wave2 = await runResearchWave({
    wave: 2,
    processId: 'm7-proc-w2',
    host: 'ubuntu',
    resumedFrom: null,
    atStart: '2026-09-21T03:00:00.000Z',
    candidateIds: Object.keys(radar.candidates).sort(),
    radar,
    ledger,
    worker,
    transport,
    baseSources,
    generatedAt,
    notes:
      'Onda 2: nueva evidencia cross-source (corpus real enlazado) investigada por el worker; ' +
      'los resultados pueden confirmar, refutar, cerrar o reabrir candidates.',
  });

  // 7. Onda 3: re-evaluación con la evidencia acumulada (cierre/degradación).
  const wave3 = await runResearchWave({
    wave: 3,
    processId: 'm7-proc-w3',
    host: 'ubuntu',
    resumedFrom: wave2.runId,
    atStart: '2026-09-21T04:00:00.000Z',
    candidateIds: [...m6ResultByCandidate.keys()].filter((id) => id !== 'rc4-cl-ketobig').sort(),
    radar,
    ledger,
    worker,
    transport,
    baseSources,
    generatedAt,
    includePriorResults: m6.results,
    linkLimit: 10,
    notes:
      'Onda 3: re-evaluación longitudinal con la evidencia acumulada; consolida el historial ' +
      'epistémico sin sobrescribir el pasado.',
  });

  // 8. Continuidad M7: observación desatendida de los ciclos M7 ampliados.
  const radarEngine = ContinuousEditorialRadar.fromSnapshot(radar, {
    generatedAt,
    observations: m6.observations,
  });
  const m7Cycles = m7Corpus.cycles.filter((cycle) => cycle.cycleId.startsWith('m7-cycle-'));
  const sourceMetadata = new Map(
    m7Corpus.sources.map((source) => [source.id, source.contentHash] as const)
  );
  let m7CyclesApplied = 0;
  for (const cycle of m7Cycles) {
    if (radarEngine.hasProcessedCycle(cycle.cycleId)) continue;
    radarEngine.ingestCycle(cycle, m6.observationsByCorpus, sourceMetadata);
    m7CyclesApplied += 1;
  }
  radar = radarEngine.snapshot();
  for (const candidate of Object.values(radar.candidates)) {
    if (!ledger.get(candidate.candidateId)) {
      ledger.seed({
        candidateId: candidate.candidateId,
        clusterId: candidate.clusterId,
        title: candidate.title,
        status: seedStatusFor(candidate, false),
        at: generatedAt,
        reason: 'Candidate descubierto durante la continuidad M7; pendiente de investigación.',
        runId: 'm7-continuity',
      });
    }
  }
  const continuityWave = newWave(0, 'm7-continuity', 'ubuntu', generatedAt, null);
  continuityWave.endedAt = generatedAt;
  continuityWave.notes =
    `Continuidad M7: ${m7CyclesApplied}/${m7Cycles.length} ciclos observados sobre ` +
    `${m7Corpus.sources.length} fuentes sin intervención manual.`;

  // 9. Prueba de idempotencia: reprocesar la onda 2 no debe mutar ni duplicar.
  const idempotency = reprocessWave({ wave: 2, radar, ledger, results: wave2.results, generatedAt });

  // 10. Drill de respuesta inválida (no inventa estado).
  const invalidResult = invalidDrillResult(generatedAt);
  const invalidOutcome = ledger.get(invalidResult.candidateId)
    ? { skipped: false }
    : { skipped: true };
  const recovery = [
    ...m6.state.recovery,
  ];
  if (invalidOutcome.skipped) {
    recovery.push({
      recoveryId: 'rec-m7-invalid-001',
      runId: wave3.runId,
      at: generatedAt,
      kind: 'INVALID_RESPONSE',
      subject: invalidResult.resultId,
      action: 'SKIPPED',
      detail:
        'Resultado de investigación que referencia un candidate inexistente; se omite sin inventar ' +
        'estado epistémico ni provenance.',
    });
  }

  const state = buildState({
    generatedAt,
    radar,
    m6,
    waves: [continuityWave, wave1, wave2, wave3],
    ledger,
    results: [...wave1Results, ...wave2.results, ...wave3.results],
    feedback: [...m6.feedback, ...wave2.feedback, ...wave3.feedback],
    recovery,
    idempotency: [...m6.state.idempotency, ...idempotency.records],
    m7Corpus,
  });

  const missingRecordings =
    workerProvider instanceof ReplayLLMProvider ? workerProvider.missingKeys() : [];

  const artifacts = buildM7Artifacts({
    generatedAt,
    corpus: m7Corpus,
    state,
    ledger,
    results: state.results,
    feedback: state.feedback,
    routing: m6.state.routed,
    recovery: state.recovery,
    idempotency: state.idempotency,
    nodes: m6.artifacts.distributed.nodes,
    transport: {
      inboxDir: `${akpDir.replace(/\/+$/, '')}/inbox`,
      returnDir: `${akpDir.replace(/\/+$/, '')}/returns`,
      consumer: M7_AKP_CONSUMER_ID,
      worker: M7_WORKER_ID,
      limitation:
        'AKP/AthenaOS externo no invocable desde el worktree: transporte durable en disco + ' +
        'worker stand-in documentado (mismo boundary que M6, ampliado con resolución epistémica).',
    },
    m6SourceCount: m6.corpus.sources.length,
    m6Results: m6.results,
    missingRecordings,
  });

  const outputPaths = outputPathsFor(outputDir);
  state.contradictions = artifacts.contradictions.contradictions;
  if (write) writeArtifacts(outputPaths, artifacts);

  if (recorder) {
    options.onWorkerRecording?.(recorder.toRecording());
  }

  return {
    artifacts,
    state,
    missingRecordings,
    outputPaths,
    ledger,
    observations: m6.observations,
    m6,
  };
}

interface WaveInput {
  wave: number;
  processId: string;
  host: string;
  resumedFrom: string | null;
  atStart: string;
  candidateIds: string[];
  radar: RadarState;
  ledger: EpistemicLedger;
  worker: AthenaOsResearchWorker;
  transport: AkpLiveTransport;
  baseSources: M7Corpus['sources'];
  generatedAt: string;
  notes: string;
  includePriorResults?: AthenaOsResearchResult[];
  linkLimit?: number;
}

interface WaveOutcome extends M7Wave {
  results: M7ResearchResult[];
  feedback: FeedbackUpdate[];
}

async function runResearchWave(input: WaveInput): Promise<WaveOutcome> {
  const clock = fixedClock(input.atStart, 45_000);
  const wave = newWave(input.wave, input.processId, input.host, input.atStart, input.resumedFrom);
  const results: M7ResearchResult[] = [];
  const feedback: FeedbackUpdate[] = [];

  for (const candidateId of input.candidateIds) {
    const candidate = input.radar.candidates[candidateId];
    if (!candidate) continue;
    const handoff = enrichHandoff(candidate, input.baseSources, input.includePriorResults, input.linkLimit ?? 4);
    const publish = input.transport.publishHandoffs(
      [
        {
          handoffId: `m7-akp-w${input.wave}-${candidateId}`,
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

    const raw = await input.worker.research(entry, wave.runId, clock());
    const result = annotateResult(
      { ...raw, resultId: `aos-w${input.wave}-${candidateId}` },
      input.wave
    );
    input.transport.submitResult(result, input.generatedAt);
    wave.candidatesResearched.push(candidateId);
    wave.resultsReturned.push(result.resultId);
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
      cycleId: `m7-wave${input.wave}-${candidateId}`,
      runId: wave.runId,
      qualifiesPromotion,
      contradictionDetails: cluster ? cluster.contradictionDetails : [],
    });
    for (const transition of outcome.transitions) wave.transitions.push(transition.transitionId);

    const fb = applyResearchFeedback(input.radar, result, {
      at: claimTimestamp(result.createdAt, input.atStart),
      cycleId: `m7-wave${input.wave}-${candidateId}`,
      cycleNumber: input.radar.cyclesProcessed.length + 1,
      runId: wave.runId,
    });
    if (fb) {
      feedback.push(fb.update);
      wave.feedbackApplied.push(fb.update.updateId);
    }
  }

  wave.endedAt = clock();
  wave.status = 'COMPLETED';
  wave.notes = input.notes;
  return { ...wave, results, feedback };
}

function reprocessWave(input: {
  wave: number;
  radar: RadarState;
  ledger: EpistemicLedger;
  results: M7ResearchResult[];
  generatedAt: string;
}): { records: M6State['idempotency']; noOps: number } {
  const records: M6State['idempotency'] = [];
  let noOps = 0;
  for (const result of input.results) {
    const candidate = input.radar.candidates[result.candidateId];
    const outcome = input.ledger.reprocess({
      candidateId: result.candidateId,
      clusterId: result.clusterId,
      title: candidate?.title ?? '',
      result,
      wave: input.wave,
      at: input.generatedAt,
      cycleId: `m7-reprocess-${result.candidateId}`,
      runId: 'm7-reprocess',
      qualifiesPromotion: false,
      contradictionDetails: [],
    });
    if (outcome.noOp) noOps += 1;
    records.push({
      key: `m7-reprocess:${result.resultId}`,
      kind: 'SOURCE',
      runId: 'm7-reprocess',
      appliedAt: input.generatedAt,
      attempts: 1,
      noOp: outcome.noOp,
      detail: outcome.noOp
        ? `Resultado ${result.resultId} ya resuelto; reproceso idempotente sin mutar el historial.`
        : `Resultado ${result.resultId} reapuntó estado (no debería ocurrir).`,
    });
  }
  return { records, noOps };
}

// ---------------------------------------------------------------------------
// Enriquecimiento cross-source (evidencia real del corpus, nunca fabricada)
// ---------------------------------------------------------------------------

function enrichHandoff(
  candidate: RadarCandidate,
  baseSources: M7Corpus['sources'],
  priorResults?: AthenaOsResearchResult[],
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

  if (priorResults) {
    for (const result of priorResults) {
      if (result.candidateId !== candidate.candidateId) continue;
      for (const evidence of result.evidence) {
        if (handoff.proposedSources.some((entry) => entry.url === evidence.url)) continue;
        handoff.proposedSources.push({
          url: evidence.url,
          title: evidence.title,
          language: handoff.outputLanguage,
          role: 'EVIDENCE',
          eligibility: {
            hasIdentifiableOrigin: true,
            hasTraceableLocation: true,
            hasTemporalContext: true,
            hasRecoverableEvidence: true,
          },
          proposedTrustTier: isAuthoritativeUrl(evidence.url) ? 'high_trust_primary' : 'medium_trust_secondary',
          accessedAt: result.createdAt,
        });
      }
    }
  }

  // Hace explícita la afirmación original para que la investigación la evalúe
  // (sin inventar: la afirmación proviene de la fuente real).
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

function linkEvidence(
  candidate: RadarCandidate,
  baseSources: M7Corpus['sources'],
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

// ---------------------------------------------------------------------------
// Utilidades de estado / resultados
// ---------------------------------------------------------------------------

function annotateResult(result: AthenaOsResearchResult, wave: number): M7ResearchResult {
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

function qualifies(result: AthenaOsResearchResult, radar: RadarState): boolean {
  const candidate = radar.candidates[result.candidateId];
  if (!candidate) return false;
  const cluster = radar.clusters[candidate.clusterId];
  if (!cluster) return false;
  const records = candidateRecords(radar, candidate);
  return records.length ? qualifiesForPromotion(cluster, records) : false;
}

function contradictionDetailsFor(radar: RadarState, result: AthenaOsResearchResult): string[] {
  const candidate = radar.candidates[result.candidateId];
  const cluster = candidate ? radar.clusters[candidate.clusterId] : undefined;
  return cluster ? cluster.contradictionDetails : [];
}

function candidateRecords(radar: RadarState, candidate: RadarCandidate) {
  const cluster = radar.clusters[candidate.clusterId];
  if (!cluster) return [];
  return cluster.signalIds
    .map((signalId) => radar.signals[signalId])
    .filter((record): record is NonNullable<typeof record> => Boolean(record));
}

function buildState(input: {
  generatedAt: string;
  radar: RadarState;
  m6: Awaited<ReturnType<typeof runM6Offline>>;
  waves: M7Wave[];
  ledger: EpistemicLedger;
  results: M7ResearchResult[];
  feedback: FeedbackUpdate[];
  recovery: M7State['recovery'];
  idempotency: M7State['idempotency'];
  m7Corpus: M7Corpus;
}): M7State {
  const resolutions = input.ledger.all();
  const provenance = buildProvenance(input.generatedAt, input.radar, input.m6, input.results, input.feedback);
  const handoffTrace = buildHandoffTrace(input.generatedAt, resolutions, input.results, input.feedback, input.m6);
  return {
    kind: 'athenasignal.m7.state.v1',
    schemaVersion: 1,
    updatedAt: input.generatedAt,
    importedFrom: 'evidence/m6 (radar vivo + resultados + feedback)',
    radar: input.radar,
    m6: input.m6.state,
    waves: input.waves,
    resolutions,
    results: input.results,
    feedback: input.feedback,
    contradictions: [],
    provenance,
    handoffTrace,
    recovery: input.recovery,
    idempotency: input.idempotency,
    routed: [...input.m6.state.routed],
  };
}

function buildProvenance(
  generatedAt: string,
  radar: RadarState,
  m6: Awaited<ReturnType<typeof runM6Offline>>,
  results: M7ResearchResult[],
  feedback: FeedbackUpdate[]
): M7State['provenance'] {
  const edges: M7State['provenance']['edges'] = [];
  const chains: string[] = [];
  for (const candidate of Object.values(radar.candidates)) {
    const result = results.find((entry) => entry.candidateId === candidate.candidateId);
    const update = feedback.find((entry) => entry.candidateId === candidate.candidateId);
    const cluster = radar.clusters[candidate.clusterId];
    const originSignal = candidate.originSignalIds[0] ?? candidate.candidateId;
    edges.push({ from: candidate.sourceIds[0] ?? 'unknown', to: originSignal, relation: 'SOURCE_TO_SIGNAL', detail: `Fuente origen de ${candidate.candidateId}` });
    edges.push({ from: originSignal, to: candidate.candidateId, relation: 'SIGNAL_TO_CANDIDATE', detail: `Señal agrupada en el candidate` });
    edges.push({ from: candidate.candidateId, to: result?.handoffId ?? `m7-akp-${candidate.candidateId}`, relation: 'CANDIDATE_TO_HANDOFF', detail: 'Handoff validado AKP' });
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
    edges.push({ from: `radar:${candidate.clusterId}`, to: 'm7:radar-state', relation: 'RADAR_TO_STATE', detail: 'Estado persistido' });
    const complete = Boolean(candidate.sourceIds.length && originSignal && result && update && cluster);
    if (complete) chains.push(`${candidate.sourceIds[0]}→${originSignal}→${candidate.candidateId}→${result!.resultId}→${update!.updateId}→radar:${candidate.clusterId}`);
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
  resolutions: M7State['resolutions'],
  results: M7ResearchResult[],
  feedback: FeedbackUpdate[],
  m6: Awaited<ReturnType<typeof runM6Offline>>
): M7State['handoffTrace'] {
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
    limitation: m6.artifacts.akpLive.limitation,
  };
}

function invalidDrillResult(generatedAt: string): AthenaOsResearchResult {
  return {
    kind: 'athenasignal.m6.athenaos_result.v1',
    resultId: 'aos-m7-invalid-candidate',
    candidateId: 'rc7-inexistente',
    clusterId: 'cl-inexistente',
    handoffId: 'm7-akp-inexistente',
    handoffContentHash: '0'.repeat(64),
    researchQuestion: '¿Existe este candidate?',
    worker: M7_WORKER_ID,
    executionMode: 'replay',
    provider: 'drill',
    model: 'drill',
    deterministic: true,
    status: 'RESEARCHED_INCONCLUSIVE',
    steps: [],
    findings: [],
    claims: [],
    evidence: [],
    provenance: [],
    uncertainties: [],
    finalAssessment: 'AMBIGUOUS',
    confidence: 0,
    layers: {
      originalSignal: '',
      researchQuestion: '',
      researchResult: '',
      newEvidence: [],
      newInterpretation: '',
    },
    createdAt: generatedAt,
    runId: 'm7-drill',
    limitations: ['drill'],
  };
}

function newWave(
  wave: number,
  processId: string,
  host: string,
  startedAt: string,
  resumedFrom: string | null
): M7Wave {
  return {
    wave,
    runId: `${processId}-run`,
    processId,
    host,
    startedAt,
    endedAt: null,
    resumedFrom,
    status: 'COMPLETED',
    candidatesResearched: [],
    resultsReturned: [],
    feedbackApplied: [],
    transitions: [],
    notes: '',
  };
}

function claimTimestamp(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.length ? value : fallback;
}

function loadRecording(path: string): LLMRecording {
  const resolved = resolvePath(path);
  if (!existsSync(resolved)) return { kind: LLM_RECORDING_KIND, generatedBy: `missing:${path}`, entries: [] };
  return readLLMRecording(resolved);
}

function fixedClock(start: string, stepMs = 0): () => string {
  let current = Date.parse(start);
  return () => {
    const value = new Date(current).toISOString();
    current += stepMs;
    return value;
  };
}

function resolvePath(path: string): string {
  return path.startsWith('/') ? path : `${process.cwd()}/${path}`;
}

export function outputPathsFor(outputDir: string): M7OutputPaths {
  const at = (file: string): string => `${process.cwd()}/${outputDir.replace(/\/+$/, '')}/${file}`;
  return {
    corpus: at('corpus.json'),
    benchmark: at('benchmark.json'),
    loopTimeline: at('loop-timeline.json'),
    radarState: at('radar-state.json'),
    akpLive: at('akp-live.json'),
    athenaosResults: at('athenaos-results.json'),
    feedbackUpdates: at('feedback-updates.json'),
    epistemicResolutions: at('epistemic-resolutions.json'),
    contradictions: at('contradictions.json'),
    provenance: at('provenance.json'),
    handoffTrace: at('handoff-trace.json'),
    metrics: at('metrics.json'),
    cognitiveRouting: at('cognitive-routing.json'),
    observability: at('observability.json'),
    recoveryEvents: at('recovery-events.json'),
    idempotency: at('idempotency.json'),
    distributed: at('distributed.json'),
    humanReview: at('human-review-packet.json'),
  };
}

function writeArtifacts(paths: M7OutputPaths, artifacts: M7Artifacts): void {
  const write = (path: string, value: unknown): void => {
    mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  };
  write(paths.corpus, artifacts.corpus);
  write(paths.benchmark, artifacts.benchmark);
  write(paths.loopTimeline, artifacts.loopTimeline);
  write(paths.radarState, artifacts.radarState);
  write(paths.akpLive, artifacts.akpLive);
  write(paths.athenaosResults, artifacts.athenaosResults);
  write(paths.feedbackUpdates, artifacts.feedbackUpdates);
  write(paths.epistemicResolutions, artifacts.epistemicResolutions);
  write(paths.contradictions, artifacts.contradictions);
  write(paths.provenance, artifacts.provenance);
  write(paths.handoffTrace, artifacts.handoffTrace);
  write(paths.metrics, artifacts.metrics);
  write(paths.cognitiveRouting, artifacts.cognitiveRouting);
  write(paths.observability, artifacts.observability);
  write(paths.recoveryEvents, artifacts.recoveryEvents);
  write(paths.idempotency, artifacts.idempotency);
  write(paths.distributed, artifacts.distributed);
  write(paths.humanReview, artifacts.humanReview);
}

export { AKP_LIVE_ENTRY_KIND, ATHENAOS_WORKER_ID };
