/**
 * Motor del loop M6 (ORDEN-010 §2.1–§2.5, §4, §5).
 *
 * Orquesta el ciclo editorial completo:
 *
 *   DISCOVER → TRIAGE → CANDIDATE → HANDOFF → RESEARCH → RETURN → FEEDBACK
 *            → RADAR_UPDATE → (siguiente ciclo)
 *
 * Mantiene el `RadarState` vivo (memoria histórica) y agrega la capa de loop:
 * runs multi-proceso/multi-host, timeline de fases, transporte AKP durable,
 * resultados de investigación, feedback que muta el radar, recuperación e
 * idempotencia. No conoce la red: recibe observaciones y un worker inyectables.
 */

import type { ContinuousEditorialRadar } from '../radar/engine.ts';
import type { M4Cycle, RadarCandidate, RadarState, SignalObservation } from '../radar/types.ts';
import type {
  IdempotencyRecord,
  IdempotencyKind,
  RecoveryEvent,
  RecoveryKind,
  RoutingDecision,
  RunStatus,
} from '../platform/types.ts';
import { applyResearchFeedback, type FeedbackContext } from './feedback.ts';
import type { AkpLiveTransport } from './transport.ts';
import type { ResearchWorker } from './athenaosWorker.ts';
import type {
  AthenaOsResearchResult,
  DistributedReport,
  FeedbackUpdate,
  LoopCycle,
  LoopPhase,
  M6Counters,
  M6Run,
  M6State,
  TopologyNode,
} from './types.ts';

export interface ClosedLoopOptions {
  generatedAt: string;
  clock: () => string;
  observations: Record<string, SignalObservation>;
  observationsByCorpus: Map<string, SignalObservation[]>;
  imported: M6State;
  transport: AkpLiveTransport;
  worker: ResearchWorker;
  radarFactory: (snapshot: RadarState) => ContinuousEditorialRadar;
  nodes: TopologyNode[];
  routingLog: RoutingDecision[];
  recoveryLog: RecoveryEvent[];
  sourceMetadata?: Map<string, string>;
}

export interface IngestOutcome {
  run: M6Run;
  applied: string[];
  skipped: string[];
  sourcesObserved: number;
}

export interface LoopOutcome {
  run: M6Run;
  handoffsDelivered: number;
  results: AthenaOsResearchResult[];
  feedback: FeedbackUpdate[];
}

export class ClosedLoopEngine {
  private state: M6State;
  private radar: ContinuousEditorialRadar;
  private readonly options: ClosedLoopOptions;
  private readonly routingLog: RoutingDecision[];
  private readonly recoveryLog: RecoveryEvent[];
  private runSequence = 0;
  private recoverySequence = 0;

  constructor(options: ClosedLoopOptions) {
    this.options = options;
    this.state = options.imported;
    this.routingLog = options.routingLog;
    this.recoveryLog = options.recoveryLog;
    this.state.runs = [];
    this.state.idempotency = [];
    this.state.loop = [];
    this.radar = options.radarFactory(this.state.radar);
  }

  snapshot(): M6State {
    this.refreshCounters();
    return JSON.parse(JSON.stringify(this.state)) as M6State;
  }

  radarSnapshot(): RadarState {
    return this.radar.snapshot();
  }

  hasProcessedCycle(cycleId: string): boolean {
    return this.radar.hasProcessedCycle(cycleId);
  }

  startProcess(processId: string, host: string, options: { resumedFrom?: string | null } = {}): M6Run {
    this.runSequence += 1;
    const run: M6Run = {
      runId: `${processId}-run-${this.runSequence}`,
      processId,
      host,
      startedAt: this.options.clock(),
      endedAt: null,
      resumedFrom: options.resumedFrom ?? null,
      status: 'COMPLETED',
      crashAt: null,
      crashReason: null,
      cyclesRequested: [],
      cyclesApplied: [],
      researchCompleted: [],
      feedbackApplied: [],
      metrics: {
        cyclesRequested: 0,
        cyclesApplied: 0,
        sourcesObserved: 0,
        handoffsDelivered: 0,
        researchCompleted: 0,
        feedbackApplied: 0,
        routingDecisions: 0,
        fallbacks: 0,
      },
    };
    this.state.runs.push(run);
    if (options.resumedFrom) {
      this.recover({
        runId: run.runId,
        kind: 'PROCESS_RESTART',
        subject: options.resumedFrom,
        action: 'RESUMED',
        detail:
          `El proceso ${processId} (${host}) reanudó desde ${options.resumedFrom} usando el radar ` +
          'persistido; no reinicia el universo ni duplica señales.',
      });
    }
    this.persist();
    return run;
  }

  ingest(run: M6Run, cycles: M4Cycle[]): IngestOutcome {
    const applied: string[] = [];
    const skipped: string[] = [];
    let sourcesObserved = 0;
    run.cyclesRequested = cycles.map((cycle) => cycle.cycleId);
    run.metrics.cyclesRequested = cycles.length;

    for (const cycle of cycles) {
      if (this.radar.hasProcessedCycle(cycle.cycleId)) {
        skipped.push(cycle.cycleId);
        this.recordIdempotency({
          key: cycle.cycleId,
          kind: 'CYCLE',
          runId: run.runId,
          noOp: true,
          detail: `Ciclo ${cycle.cycleId} ya aplicado; reingesta idempotente sin mutar el radar.`,
        });
        continue;
      }
      this.radar.ingestCycle(cycle, this.options.observationsByCorpus, this.options.sourceMetadata);
      applied.push(cycle.cycleId);
      sourcesObserved += cycle.sourceIds.length;
      this.recordLoop(run, 'DISCOVER', cycle, {
        sourcesObserved: cycle.sourceIds.length,
        notes: cycle.notes,
      });
      this.recordLoop(run, 'TRIAGE', cycle, {
        sourcesObserved: cycle.sourceIds.length,
        notes:
          `Triaje autónomo de ${cycle.sourceIds.length} fuentes: se conservan las investigables ` +
          'y se descarta ruido sin intervención manual.',
      });
      this.recordLoop(run, 'CANDIDATE', cycle, {
        notes: `Candidates vigentes tras el ciclo: ${Object.keys(this.state.radar.candidates).length}.`,
      });
      this.recordIdempotency({
        key: cycle.cycleId,
        kind: 'CYCLE',
        runId: run.runId,
        noOp: false,
        detail: `Ciclo ${cycle.cycleId} aplicado una sola vez.`,
      });
    }

    run.cyclesApplied = applied;
    run.metrics.cyclesApplied = applied.length;
    run.metrics.sourcesObserved += sourcesObserved;
    this.state.radar = this.radar.snapshot();
    this.persist();
    return { run, applied, skipped, sourcesObserved };
  }

  ingestUntil(run: M6Run, cycles: M4Cycle[], stopAfter: string): IngestOutcome {
    const index = cycles.findIndex((cycle) => cycle.cycleId === stopAfter);
    const slice = index >= 0 ? cycles.slice(0, index + 1) : cycles;
    const outcome = this.ingest(run, slice);
    this.crashRun(run, `Muerte de proceso simulada tras ${stopAfter}.`, stopAfter);
    return { ...outcome, run };
  }

  completeRun(run: M6Run, status: RunStatus = 'COMPLETED'): void {
    run.status = status;
    run.endedAt = this.options.clock();
    this.persist();
  }

  crashRun(run: M6Run, reason: string, afterCycle: string): void {
    run.status = 'CRASHED';
    run.crashAt = this.options.clock();
    run.crashReason = reason;
    run.endedAt = afterCycle;
    this.recover({
      runId: run.runId,
      kind: 'PARTIAL_RUN',
      subject: afterCycle,
      action: 'DEGRADED',
      detail:
        `El proceso murió tras ${afterCycle}; el radar quedó persistido y una corrida posterior ` +
        'debe reanudar sin duplicar ni perder provenance.',
    });
    this.persist();
  }

  /** Entrega a AKP los candidates promovidos aún no publicados (idempotente). */
  deliverPromoted(run: M6Run): number {
    return this.publish(run, Object.values(this.state.radar.candidates).filter(
      (candidate) => candidate.status === 'PROMOTED'
    ));
  }

  /**
   * Entrega a AKP los candidates con valor editorial para investigación
   * profunda: promovidos o activos con prioridad HIGH/MEDIUM. Idempotente.
   */
  deliverResearchable(run: M6Run): number {
    return this.publish(
      run,
      Object.values(this.state.radar.candidates).filter(
        (candidate) =>
          candidate.status === 'PROMOTED' ||
          (candidate.status === 'ACTIVE' && (candidate.priority === 'HIGH' || candidate.priority === 'MEDIUM'))
      )
    );
  }

  private publish(run: M6Run, selected: RadarCandidate[]): number {
    const candidates = [...selected].sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));

    const inputs = candidates.map((candidate) => ({
      handoffId: `m6-akp-${candidate.candidateId}`,
      candidateId: candidate.candidateId,
      clusterId: candidate.clusterId,
      publishedAt: this.options.clock(),
      recommendedAthenaOsInput: candidate.recommendedAthenaOsInput,
    }));

    const result = this.options.transport.publishHandoffs(inputs, this.options.clock());
    run.metrics.handoffsDelivered += result.published;
    if (result.published > 0) {
      this.recordLoop(run, 'HANDOFF', null, {
        candidatesAvailable: candidates.length,
        handoffsDelivered: result.published,
        notes: `Publicados ${result.published} handoffs en el inbox AKP (${result.duplicates} duplicados suprimidos).`,
      });
    }
    this.persist();
    return result.published;
  }

  /** El worker AthenaOS consume el inbox y devuelve resultados a AKP. */
  async researchPending(
    run: M6Run,
    limit = Number.POSITIVE_INFINITY,
    worker: ResearchWorker = this.options.worker
  ): Promise<AthenaOsResearchResult[]> {
    const pending = this.options.transport.pendingHandoffs().slice(0, Math.max(0, limit));
    const results: AthenaOsResearchResult[] = [];
    for (const entry of pending) {
      const idempotencyKey = `research:${entry.candidateId}`;
      if (this.state.research.some((result) => result.candidateId === entry.candidateId)) {
        this.recordIdempotency({
          key: idempotencyKey,
          kind: 'SOURCE',
          runId: run.runId,
          noOp: true,
          detail: `El candidate ${entry.candidateId} ya fue investigado; no se re-investiga.`,
        });
        continue;
      }
      const result = await worker.research(entry, run.runId, this.options.clock());
      this.options.transport.submitResult(result, this.options.clock());
      this.state.research.push(result);
      run.researchCompleted.push(result.resultId);
      run.metrics.researchCompleted += 1;
      results.push(result);
      this.recordLoop(run, 'RESEARCH', null, {
        resultsReturned: 1,
        notes:
          `AthenaOS investigó ${result.candidateId} → ${result.status} ` +
          `(${result.claims.length} claims, ${result.evidence.length} evidencias).`,
      });
      this.recordIdempotency({
        key: idempotencyKey,
        kind: 'SOURCE',
        runId: run.runId,
        noOp: false,
        detail: `Investigación ${result.resultId} completada y devuelta a AKP.`,
      });
    }
    this.persist();
    return results;
  }

  /** AthenaSignal re-ingiere los resultados y muta el radar (idempotente). */
  applyReturnedFeedback(run: M6Run): FeedbackUpdate[] {
    const returned = this.options.transport.returnedResults();
    const applied: FeedbackUpdate[] = [];
    for (const result of returned) {
      if (this.state.feedback.some((update) => update.resultId === result.resultId)) {
        this.recordIdempotency({
          key: `feedback:${result.resultId}`,
          kind: 'SIGNAL',
          runId: run.runId,
          noOp: true,
          detail: `El feedback de ${result.resultId} ya fue aplicado; reingesta sin mutar.`,
        });
        continue;
      }
      const ctx: FeedbackContext = {
        at: this.options.clock(),
        cycleId: `m6-feedback-${result.candidateId}`,
        cycleNumber: this.state.radar.cyclesProcessed.length + applied.length + 1,
        runId: run.runId,
      };
      const outcome = applyResearchFeedback(this.state.radar, result, ctx);
      if (!outcome) {
        this.recover({
          runId: run.runId,
          kind: 'INVALID_RESPONSE',
          subject: result.resultId,
          action: 'SKIPPED',
          detail: `El resultado ${result.resultId} referencia un candidate inexistente; se omite sin inventar estado.`,
        });
        continue;
      }
      this.state.feedback.push(outcome.update);
      applied.push(outcome.update);
      run.feedbackApplied.push(outcome.update.updateId);
      run.metrics.feedbackApplied += 1;
      this.recordLoop(run, 'RETURN', null, {
        resultsReturned: 1,
        notes: `Resultado ${result.resultId} re-ingresado desde AKP por AthenaSignal.`,
      });
      this.recordLoop(run, 'FEEDBACK', null, {
        feedbackApplied: 1,
        notes: `${outcome.update.candidateId}: ${outcome.update.changes.join(', ')}`,
      });
      this.recordLoop(run, 'RADAR_UPDATE', null, {
        feedbackApplied: 1,
        notes: `Radar mutado por ${result.resultId}: ${outcome.update.reason}`,
      });
      this.recordIdempotency({
        key: `feedback:${result.resultId}`,
        kind: 'SIGNAL',
        runId: run.runId,
        noOp: false,
        detail: `Feedback ${outcome.update.updateId} aplicado una sola vez.`,
      });
    }
    this.radar = this.options.radarFactory(this.state.radar);
    this.persist();
    return applied;
  }

  /** Corre las fases RETURn/FEEDBACK pendientes de resultados ya devueltos. */
  applyPendingFeedback(run: M6Run): FeedbackUpdate[] {
    return this.applyReturnedFeedback(run);
  }

  recover(input: {
    runId: string;
    kind: RecoveryKind;
    subject: string;
    action: RecoveryEvent['action'];
    detail: string;
  }): RecoveryEvent {
    this.recoverySequence += 1;
    const event: RecoveryEvent = {
      recoveryId: `rec-${input.runId}-${String(this.recoverySequence).padStart(3, '0')}`,
      runId: input.runId,
      at: this.options.clock(),
      kind: input.kind,
      subject: input.subject,
      action: input.action,
      detail: input.detail,
    };
    this.recoveryLog.push(event);
    this.state.recovery.push(event);
    return event;
  }

  private recordIdempotency(input: {
    key: string;
    kind: IdempotencyKind;
    runId: string;
    noOp: boolean;
    detail: string;
  }): void {
    const existing = this.state.idempotency.find(
      (record) => record.key === input.key && record.kind === input.kind
    );
    if (existing) {
      existing.attempts += 1;
      existing.noOp = input.noOp;
      existing.runId = input.runId;
      if (input.noOp) this.state.counters.idempotencyNoops += 1;
      return;
    }
    this.state.idempotency.push({
      key: input.key,
      kind: input.kind,
      runId: input.runId,
      appliedAt: this.options.clock(),
      attempts: 1,
      noOp: input.noOp,
      detail: input.detail,
    });
    if (input.noOp) this.state.counters.idempotencyNoops += 1;
  }

  private recordLoop(
    run: M6Run,
    phase: LoopPhase,
    cycle: M4Cycle | null,
    input: {
      sourcesObserved?: number;
      candidatesAvailable?: number;
      handoffsDelivered?: number;
      resultsReturned?: number;
      feedbackApplied?: number;
      notes: string;
    }
  ): void {
    const entry: LoopCycle = {
      cycleId: cycle?.cycleId ?? `${phase.toLowerCase()}-${this.state.loop.length + 1}`,
      cycleNumber: cycle?.cycleNumber ?? 0,
      at: cycle?.occurredAt ?? this.options.clock(),
      runId: run.runId,
      phase,
      sourcesObserved: input.sourcesObserved ?? 0,
      candidatesAvailable: input.candidatesAvailable ?? Object.keys(this.state.radar.candidates).length,
      handoffsDelivered: input.handoffsDelivered ?? 0,
      resultsReturned: input.resultsReturned ?? 0,
      feedbackApplied: input.feedbackApplied ?? 0,
      notes: input.notes,
    };
    this.state.loop.push(entry);
  }

  /** Reporte de topología/distribución a partir de la salud de los nodos. */
  buildDistribution(): DistributedReport {
    const nodes = this.options.nodes.map((node) => ({ ...node }));
    const down = nodes.filter((node) => node.status === 'DOWN');
    const degradedRuns = this.state.runs
      .filter((run) => run.status === 'CRASHED')
      .map((run) => run.runId);
    const examples: string[] = [];
    if (down.length) {
      examples.push(
        `Nodos no disponibles: ${down.map((node) => node.node).join(', ')}; el loop degradó a ` +
          `las rutas restantes sin detener la operación.`
      );
    } else {
      examples.push('Todos los nodos documentados disponibles; el loop usó local-first.');
    }
    return {
      kind: 'athenasignal.m6.distributed.v1',
      generatedAt: this.options.generatedAt,
      nodes,
      degradedRuns,
      examples,
      fallbackRoutes: this.routingLog.filter((decision) => decision.fallback).length,
      remoteEscalations: this.routingLog.filter((decision) => decision.route === 'REMOTE_ESCALATION').length,
    };
  }

  persist(): M6State {
    this.state.radar = this.radar.snapshot();
    this.state.updatedAt = this.options.clock();
    this.refreshCounters();
    return this.state;
  }

  private refreshCounters(): void {
    const promotedByFeedback = this.state.feedback.filter((update) =>
      update.changes.includes('PROMOTED')
    ).length;
    const counters: M6Counters = {
      inputsObserved: this.state.runs.reduce((sum, run) => sum + run.metrics.sourcesObserved, 0),
      cyclesProcessed: this.state.radar.cyclesProcessed.length,
      runs: this.state.runs.length,
      handoffs: this.options.transport.entries().length,
      researchResults: this.state.research.length,
      feedbackUpdates: this.state.feedback.length,
      promotionsTriggeredByFeedback: promotedByFeedback,
      closuresTriggeredByFeedback: this.state.feedback.filter((update) =>
        update.changes.includes('CLOSED')
      ).length,
      contradictionsRaised: this.state.feedback.filter((update) =>
        update.changes.includes('CONTRADICTION_ADDED')
      ).length,
      priorityChangesFromFeedback: this.state.feedback.filter((update) =>
        update.changes.includes('PRIORITY_CHANGED')
      ).length,
      routingDecisions: this.routingLog.length,
      recoveryEvents: this.state.recovery.length,
      idempotencyNoops: this.state.counters.idempotencyNoops,
    };
    this.state.counters = counters;
    this.state.distribution = this.buildDistribution();
    this.state.routed = [...this.routingLog];
  }
}
