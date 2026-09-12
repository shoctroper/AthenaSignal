/**
 * Plataforma editorial autónoma M5 (ORDEN-009 §1, §2, §14).
 *
 * Orquesta el ciclo de vida `START → RUN → PERSIST → STOP → RESTART → RESUME`
 * sobre el radar persistente de M4, con ingesta incremental, idempotencia,
 * recuperación multi-proceso, sink AKP y contadores observables. No conoce la
 * red: recibe observaciones ya resueltas (replay) y un store inyectable.
 */

import type { ContinuousEditorialRadar } from '../radar/engine.ts';
import type {
  M4Cycle,
  RadarCycleResult,
  RadarEvent,
  RadarState,
  SignalObservation,
} from '../radar/types.ts';
import { cloneState } from '../radar/store.ts';
import { AkpHandoffSink } from './sink.ts';
import type {
  IdempotencyRecord,
  M5PlatformState,
  M5Run,
  RecoveryEvent,
  RecoveryKind,
  RunStatus,
} from './types.ts';

export interface PlatformStoreLike {
  save(state: M5PlatformState): void;
  load(): M5PlatformState | null;
  exists(): boolean;
}

export interface PlatformOptions {
  generatedAt: string;
  clock: () => string;
  observationsByCorpus: Map<string, SignalObservation[]>;
  importedState: M5PlatformState;
  radarFactory: (snapshot: RadarState) => ContinuousEditorialRadar;
  store: PlatformStoreLike;
  sink: AkpHandoffSink;
  /** Hash de contenido por fuente para observaciones sin señal cognitiva. */
  sourceMetadata?: Map<string, string>;
  /** Eventos de routing/recovery anteriores (pipeline) que se preservan. */
  routingDecisions?: M5PlatformState['routing'];
  pipelineRecovery?: RecoveryEvent[];
  pipelineCounters?: Partial<M5PlatformState['counters']>;
}

export interface IngestOutcome {
  run: M5Run;
  applied: string[];
  skipped: string[];
  newSignals: number;
  knownSignals: number;
  duplicateSources: number;
  events: RadarEvent[];
}

export class AutonomousEditorialPlatform {
  private state: M5PlatformState;
  private readonly radar: ContinuousEditorialRadar;
  private readonly options: PlatformOptions;
  private runSequence = 0;
  private recoverySequence = 0;

  constructor(options: PlatformOptions) {
    this.options = options;
    this.state = options.importedState;
    this.state.runs = [];
    this.state.idempotency = [];
    this.state.recovery = [...(options.pipelineRecovery ?? [])];
    this.state.routing = [...(options.routingDecisions ?? [])];
    this.state.akp.deliveries = [];
    this.state.updatedAt = options.generatedAt;
    if (options.pipelineCounters) {
      this.state.counters = { ...this.state.counters, ...options.pipelineCounters };
    }
    this.radar = options.radarFactory(this.state.radar);
  }

  snapshot(): M5PlatformState {
    this.refreshCounters();
    return JSON.parse(JSON.stringify(this.state)) as M5PlatformState;
  }

  persistedRadar(): RadarState {
    return this.radar.snapshot();
  }

  hasProcessedCycle(cycleId: string): boolean {
    return this.radar.hasProcessedCycle(cycleId);
  }

  startProcess(processId: string, options: { resumedFrom?: string | null } = {}): M5Run {
    this.runSequence += 1;
    const run: M5Run = {
      runId: `${processId}-run-${this.runSequence}`,
      processId,
      startedAt: this.options.clock(),
      endedAt: null,
      resumedFrom: options.resumedFrom ?? null,
      status: 'COMPLETED',
      crashAt: null,
      crashReason: null,
      cyclesRequested: [],
      cyclesApplied: [],
      metrics: {
        cyclesRequested: 0,
        cyclesApplied: 0,
        inputsObserved: 0,
        newSignals: 0,
        knownSignals: 0,
        duplicateSources: 0,
        routingDecisions: 0,
        fallbacks: 0,
      },
    };
    this.state.runs.push(run);
    this.state.counters.runs = this.state.runs.length;

    if (options.resumedFrom) {
      this.recover({
        runId: run.runId,
        kind: 'PROCESS_RESTART',
        subject: options.resumedFrom,
        action: 'RESUMED',
        detail:
          `El proceso ${processId} reanudó desde ${options.resumedFrom} usando el estado ` +
          'persistido; no se reinicia el universo ni se duplican señales.',
      });
    }
    this.persist();
    return run;
  }

  ingest(run: M5Run, cycles: M4Cycle[]): IngestOutcome {
    const applied: string[] = [];
    const skipped: string[] = [];
    const events: RadarEvent[] = [];
    let newSignals = 0;
    let knownSignals = 0;
    let duplicateSources = 0;
    let inputsObserved = 0;

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
          detail: `Ciclo ${cycle.cycleId} ya aplicado; reingesta idempotente sin mutar el estado.`,
        });
        continue;
      }
      const outcome: RadarCycleResult = this.radar.ingestCycle(
        cycle,
        this.options.observationsByCorpus,
        this.options.sourceMetadata
      );
      applied.push(cycle.cycleId);
      events.push(...outcome.events);
      newSignals += outcome.newSignals.length;
      knownSignals += outcome.knownSignals.length;
      inputsObserved += cycle.sourceIds.length;
      duplicateSources += outcome.events.filter((event) => event.kind === 'DUPLICATE').length;
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
    run.metrics.inputsObserved += inputsObserved;
    run.metrics.newSignals += newSignals;
    run.metrics.knownSignals += knownSignals;
    run.metrics.duplicateSources += duplicateSources;
    this.refreshCounters();
    this.persist();

    return { run, applied, skipped, newSignals, knownSignals, duplicateSources, events };
  }

  completeRun(run: M5Run, status: RunStatus = 'COMPLETED'): void {
    run.status = status;
    run.endedAt = this.options.clock();
    this.persist();
  }

  crashRun(run: M5Run, reason: string, afterCycle: string): void {
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
        `El proceso murió tras ${afterCycle}; el estado quedó persistido y una corrida ` +
        'posterior debe reanudar sin duplicar ni perder provenance.',
    });
    this.persist();
  }

  /**
   * Simula una corrida parcial: aplica `partial` ciclos de una lista mayor y
   * luego "muere" el proceso. El estado persistido permite reanudar.
   */
  ingestUntil(run: M5Run, cycles: M4Cycle[], stopAfter: string): IngestOutcome {
    const index = cycles.findIndex((cycle) => cycle.cycleId === stopAfter);
    const slice = index >= 0 ? cycles.slice(0, index + 1) : cycles;
    const outcome = this.ingest(run, slice);
    this.crashRun(run, `Simulación de muerte de proceso tras ${stopAfter}.`, stopAfter);
    return { ...outcome, run };
  }

  resumeCandidates(): M4Cycle[] {
    return [];
  }

  deliverPromoted(runId: string): number {
    const promoted = Object.values(this.state.radar.candidates)
      .filter((candidate) => candidate.status === 'PROMOTED')
      .sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));
    let delivered = 0;
    for (const candidate of promoted) {
      const result = this.options.sink.deliver({
        handoffId: `akp-${candidate.candidateId}`,
        candidateId: candidate.candidateId,
        clusterId: candidate.clusterId,
        version: this.deliveryVersion(candidate.candidateId),
        deliveredAt: this.options.clock(),
        runId,
        recommendedAthenaOsInput: candidate.recommendedAthenaOsInput,
      });
      if (result.delivery.status === 'DELIVERED_TO_SINK') delivered += 1;
    }
    this.state.akp.deliveries = this.options.sink.deliverables();
    this.refreshCounters();
    this.persist();
    return delivered;
  }

  private deliveryVersion(candidateId: string): number {
    return this.options.sink
      .deliverables()
      .filter((delivery) => delivery.candidateId === candidateId).length + 1;
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
    this.state.recovery.push(event);
    this.state.counters.recoveryEvents = this.state.recovery.length;
    return event;
  }

  private recordIdempotency(input: {
    key: string;
    kind: IdempotencyRecord['kind'];
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

  persist(): M5PlatformState {
    this.state.radar = this.radar.snapshot();
    this.state.updatedAt = this.options.clock();
    this.refreshCounters();
    this.options.store.save(this.state);
    return this.state;
  }

  radarState(): RadarState {
    return cloneState(this.radar.snapshot());
  }

  private refreshCounters(): void {
    const candidates = Object.values(this.state.radar.candidates);
    const counts = this.state.routing.reduce<Record<string, number>>((acc, decision) => {
      acc[decision.route] = (acc[decision.route] ?? 0) + 1;
      return acc;
    }, {});
    this.state.counters = {
      ...this.state.counters,
      inputsObserved: this.state.runs.reduce((sum, run) => sum + run.metrics.inputsObserved, 0),
      cyclesProcessed: this.state.radar.cyclesProcessed.length,
      runs: this.state.runs.length,
      signals: Object.keys(this.state.radar.signals).length,
      clusters: Object.keys(this.state.radar.clusters).length,
      candidates: candidates.length,
      promoted: candidates.filter((candidate) => candidate.status === 'PROMOTED').length,
      discarded: candidates.filter((candidate) => candidate.status === 'DISCARDED').length,
      routingDecisions: this.state.routing.length,
      localRoutes: (counts.LOCAL ?? 0) + (counts.LOCAL_ALT ?? 0),
      remoteRoutes: counts.REMOTE_ESCALATION ?? 0,
      deterministicRoutes: counts.DETERMINISTIC_FALLBACK ?? 0,
      recoveryEvents: this.state.recovery.length,
      akpDeliveries: this.state.akp.deliveries.filter(
        (delivery) => delivery.status === 'DELIVERED_TO_SINK'
      ).length,
    };
  }
}
