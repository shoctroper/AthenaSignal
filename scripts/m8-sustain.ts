/**
 * Operación sostenida M8 en **tiempo de reloj real** (ORDEN-012 §0bis.1).
 *
 * Ejecuta el scheduler del circuito `AthenaSignal → AKP → AthenaOS → AKP →
 * AthenaSignal` durante una ventana genuina acotada por el presupuesto del
 * worker. Cada tick realiza trabajo real (ingesta idempotente de ciclos del
 * universo ampliado, persistencia de estado y heartbeat con timestamps reales),
 * y el tick `--crash-at` termina el proceso de forma controlada para forzar un
 * **reinicio real** que reanuda desde el estado persistido.
 *
 * Salida: `evidence/m8/recordings/window.json` con `startedAt`/`endedAt` reales,
 * que el replay determinista (`runM8Offline`) consume para reconstruir la
 * operación sin red conservando tiempos verificables.
 *
 * Uso:
 *   node --experimental-strip-types scripts/m8-sustain.ts [--reset]
 *     [--minutes 24] [--ticks 24] [--interval-ms 60000] [--crash-at 12]
 *     [--state-dir .m8tmp/m8-sustain] [--out evidence/m8/recordings/window.json]
 *
 * El supervisor reinicia el proceso si sale con código 137 (crash controlado):
 *   for i in 1 2 3; do node --experimental-strip-types scripts/m8-sustain.ts || true; done
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { prepareM8SustainInputs } from '../src/sustained/offline.ts';
import { writeWindowRecording } from '../src/sustained/window.ts';
import { SCHEDULER_PHASES, type M8WindowRecording, type M8WindowRecordingTick } from '../src/sustained/types.ts';

interface Options {
  reset: boolean;
  ticks: number;
  intervalMs: number;
  crashAt: number;
  stateDir: string;
  out: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    reset: false,
    ticks: 24,
    intervalMs: 60_000,
    crashAt: 12,
    stateDir: '.m8tmp/m8-sustain',
    out: 'evidence/m8/recordings/window.json',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => argv[++i] ?? '';
    if (arg === '--reset') options.reset = true;
    else if (arg === '--ticks') options.ticks = Number(next());
    else if (arg === '--interval-ms') options.intervalMs = Number(next());
    else if (arg === '--minutes') options.intervalMs = (Number(next()) * 60_000) / options.ticks;
    else if (arg === '--crash-at') options.crashAt = Number(next());
    else if (arg === '--state-dir') options.stateDir = next();
    else if (arg === '--out') options.out = next();
  }
  return options;
}

function tickPath(stateDir: string, tick: number): string {
  return resolve(process.cwd(), stateDir, `tick-${String(tick).padStart(3, '0')}.json`);
}

function readTick(stateDir: string, tick: number): M8WindowRecordingTick | null {
  const path = tickPath(stateDir, tick);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as M8WindowRecordingTick;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, Math.max(0, ms)));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const stateDir = resolve(process.cwd(), options.stateDir);
  if (options.reset) rmSync(stateDir, { recursive: true, force: true });
  mkdirSync(stateDir, { recursive: true });
  const heartbeat = resolve(process.cwd(), 'evidence/m8/recordings/m8-sustain-heartbeat.log');
  mkdirSync(dirname(heartbeat), { recursive: true });
  const crashMarker = resolve(stateDir, 'crash.marker');
  const doneMarker = resolve(stateDir, 'done.marker');

  if (existsSync(doneMarker)) {
    console.log('[m8-sustain] ventana ya completada; no-op.');
    return;
  }

  const inputs = await prepareM8SustainInputs();
  const snapshotPath = resolve(stateDir, 'radar.json');
  let radarEngine = inputs.radarEngine;
  if (existsSync(snapshotPath)) {
    try {
      const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
      const { ContinuousEditorialRadar } = await import('../src/radar/engine.ts');
      radarEngine = ContinuousEditorialRadar.fromSnapshot(snapshot, {
        generatedAt: inputs.corpus.generatedAt,
        observations: inputs.observations,
      });
    } catch {
      radarEngine = inputs.radarEngine;
    }
  }

  let nextTick = 1;
  while (readTick(stateDir, nextTick)) nextTick += 1;
  if (nextTick > options.ticks) {
    finalize(options, stateDir, heartbeat);
    return;
  }

  for (let tick = nextTick; tick <= options.ticks; tick += 1) {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const start = (tick - 1) * 3;
    const batch = inputs.m8Cycles.slice(start, start + 3);
    let sourcesObserved = 0;
    let newSignals = 0;
    let knownSignals = 0;
    let duplicateSources = 0;
    for (const cycle of batch) {
      const outcome = radarEngine.ingestCycle(cycle, inputs.observationsByCorpus, inputs.sourceMetadata);
      sourcesObserved += cycle.sourceIds.length;
      newSignals += outcome.newSignals.length;
      knownSignals += outcome.knownSignals.length;
      duplicateSources += outcome.eventCounts.DUPLICATE ?? 0;
    }
    const endedAt = new Date().toISOString();
    const crashed = tick === options.crashAt && !existsSync(crashMarker);
    const record: M8WindowRecordingTick = {
      tick,
      processId: tick <= options.crashAt ? 'm8-scheduler-a' : 'm8-scheduler-b',
      host: 'athena',
      cycleId: batch.map((cycle) => cycle.cycleId).join('+') || `m8-idle-${tick}`,
      phases: [...SCHEDULER_PHASES],
      startedAt,
      endedAt,
      durationMs: Date.now() - startTime,
      status: crashed ? 'CRASHED' : 'COMPLETED',
      sourcesObserved,
      newSignals,
      knownSignals,
      duplicateSources,
      recovery: tick === options.crashAt ? ['rec-m8-restart-001'] : [],
      notes:
        `Tick real ${tick}: ${batch.length} ciclos M8 (${sourcesObserved} fuentes); ` +
        `${newSignals} nuevas, ${knownSignals} conocidas, ${duplicateSources} duplicadas.`,
    };
    writeFileSync(tickPath(stateDir, tick), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    writeFileSync(snapshotPath, `${JSON.stringify(radarEngine.snapshot())}\n`, 'utf8');
    appendFileSync(heartbeat, `${endedAt} tick=${tick} status=${record.status}\n`, 'utf8');
    console.log(`[m8-sustain] tick ${tick}/${options.ticks} ${record.status} (${record.durationMs}ms)`);

    if (crashed) {
      writeFileSync(crashMarker, `${endedAt}\n`, 'utf8');
      console.log('[m8-sustain] crash controlado; el supervisor debe reiniciar y reanudar.');
      process.exit(137);
    }

    if (tick < options.ticks) {
      const elapsed = Date.now() - startTime;
      await sleep(options.intervalMs - elapsed);
    }
  }

  finalize(options, stateDir, heartbeat);
}

function finalize(options: Options, stateDir: string, heartbeat: string): void {
  const ticks: M8WindowRecordingTick[] = [];
  for (let tick = 1; tick <= options.ticks; tick += 1) {
    const record = readTick(stateDir, tick);
    if (record) ticks.push(record);
  }
  ticks.sort((a, b) => a.tick - b.tick);
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  const crashAt = options.crashAt;
  const processes = [
    {
      processId: 'm8-scheduler-a',
      host: 'athena',
      startedAt: first.startedAt,
      endedAt: crashAt >= 1 ? readTick(stateDir, crashAt)?.endedAt ?? first.endedAt : last.endedAt,
      status: crashAt >= 1 ? ('CRASHED' as const) : ('COMPLETED' as const),
      ticks: crashAt >= 1 ? Math.min(crashAt, ticks.length) : ticks.length,
      restarts: 0,
      resumedFrom: null,
      notes:
        crashAt >= 1
          ? `Proceso sostenido A (reloj real); crash controlado en el tick ${crashAt}.`
          : 'Proceso sostenido único en reloj real.',
    },
    ...(crashAt >= 1
      ? [
          {
            processId: 'm8-scheduler-b',
            host: 'athena',
            startedAt: readTick(stateDir, crashAt + 1)?.startedAt ?? last.startedAt,
            endedAt: last.endedAt,
            status: 'COMPLETED' as const,
            ticks: Math.max(0, ticks.length - crashAt),
            restarts: 1,
            resumedFrom: 'm8-scheduler-a',
            notes: 'Proceso sostenido B (reloj real); reanuda desde A sin perder historial.',
          },
        ]
      : []),
  ];

  const recording: M8WindowRecording = {
    kind: 'athenasignal.m8.window_recording.v1',
    recordedAt: new Date().toISOString(),
    mode: 'real-clock',
    windowId: 'm8-window-001',
    startedAt: first.startedAt,
    endedAt: last.endedAt,
    durationMs: Math.max(0, Date.parse(last.endedAt) - Date.parse(first.startedAt)),
    tickCount: ticks.length,
    tickIntervalMs: options.intervalMs,
    ticks,
    processes,
    notes:
      `Ventana ejecutada en tiempo de reloj real por scripts/m8-sustain.ts ` +
      `(${ticks.length} ticks, intervalo ~${Math.round(options.intervalMs / 1000)}s, ` +
      'crash/reanudación de proceso real). Heartbeat: ' +
      heartbeat.replace(`${process.cwd()}/`, ''),
  };
  const out = writeWindowRecording(recording, options.out);
  writeFileSync(resolve(stateDir, 'done.marker'), `${new Date().toISOString()}\n`, 'utf8');
  console.log(
    `[m8-sustain] ventana real completada: ${ticks.length} ticks, ` +
      `${(recording.durationMs / 60000).toFixed(1)} min → ${out}`
  );
}

main().catch((error) => {
  console.error('[m8-sustain] fallo:', error);
  process.exit(1);
});
