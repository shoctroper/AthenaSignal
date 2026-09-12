/**
 * Nodo cognitivo M6 en proceso separado (ORDEN-010 §0bis §2).
 *
 * Ejecuta el worker de investigación profunda AthenaOS como **proceso OS
 * independiente** con su propio health-check (heartbeat + PID). El orquestador
 * lo arranca, consume sus resultados y, si el proceso muere, detecta el fallo y
 * hace failover. No simula consumo externo: es un nodo real del loop.
 *
 * Protocolo: líneas JSON por stdin/stdout.
 *   → { at, runId, entry }
 *   ← { result } | { error }
 *
 * Uso interno (lo arranca src/closedloop/nodeProcess.ts):
 *   node --experimental-strip-types scripts/m6-node.ts \
 *     --host mac-mini --heartbeat .m6tmp/.../mac-mini.heartbeat.json \
 *     --evidence-index .m6tmp/.../evidence-index.json \
 *     --llm-recording evidence/m6/recordings/llm.json \
 *     --tool-recording evidence/m3/recordings/tools.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

import type { CorpusItem } from '../src/autonomous/types.ts';
import { ReplayLLMProvider, readLLMRecording } from '../src/llm/RecordReplay.ts';
import { DeterministicLLMProvider } from '../src/llm/DeterministicLLMProvider.ts';
import { ReplaySearchTool, readToolRecording } from '../src/research/tools/RecordReplay.ts';
import {
  AthenaOsResearchWorker,
  ATHENAOS_WORKER_ID,
  type ResearchWorker,
} from '../src/closedloop/athenaosWorker.ts';
import { CompositeSearchTool, LocalCorpusSearchTool } from '../src/closedloop/corpusSearch.ts';
import type { AkpHandoffEntry } from '../src/closedloop/transport.ts';

interface NodeRequest {
  at: string;
  runId: string;
  entry: AkpHandoffEntry;
}

interface NodeResponse {
  result?: unknown;
  error?: string;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const host = arg('host') ?? 'unknown';
const heartbeatPath = arg('heartbeat');
const evidenceIndexPath = arg('evidence-index');
const llmRecordingPath = arg('llm-recording') ?? 'evidence/m6/recordings/llm.json';
const toolRecordingPath = arg('tool-recording') ?? 'evidence/m3/recordings/tools.json';

function writeHeartbeat(status: string): void {
  if (!heartbeatPath) return;
  try {
    writeFileSync(
      heartbeatPath,
      `${JSON.stringify({ host, pid: process.pid, status, at: new Date().toISOString() })}\n`,
      'utf8'
    );
  } catch {
    // best-effort; el health-check usa además la liveness del PID
  }
}

function buildWorker(): ResearchWorker {
  const sources: CorpusItem[] = evidenceIndexPath
    ? (JSON.parse(readFileSync(evidenceIndexPath, 'utf8')) as { sources: CorpusItem[] }).sources
    : [];
  const search = new CompositeSearchTool([
    new ReplaySearchTool(readToolRecording(toolRecordingPath)),
    new LocalCorpusSearchTool(sources, 5),
  ]);
  const llm = new ReplayLLMProvider(readLLMRecording(llmRecordingPath), {
    fallback: new DeterministicLLMProvider(),
  });
  return new AthenaOsResearchWorker({
    llm,
    search,
    clock: () => new Date().toISOString(),
    executionMode: 'replay',
    workerId: ATHENAOS_WORKER_ID,
  });
}

const worker = buildWorker();
writeHeartbeat('ready');

const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
let queue: Promise<void> = Promise.resolve();

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  queue = queue.then(async () => {
    let response: NodeResponse;
    try {
      const request = JSON.parse(trimmed) as NodeRequest;
      const result = await worker.research(request.entry, request.runId, request.at);
      response = { result };
    } catch (error) {
      response = { error: String((error as Error)?.message ?? error) };
    }
    process.stdout.write(`${JSON.stringify(response)}\n`);
    writeHeartbeat('idle');
  });
});

rl.on('close', () => {
  queue.finally(() => process.exit(0));
});
process.on('SIGTERM', () => process.exit(0));
