/**
 * Nodo cognitivo en proceso separado y failover M6 (ORDEN-010 §0bis §2).
 *
 * El orquestador ejecuta parte de la investigación profunda en un proceso OS
 * independiente (`scripts/m6-node.ts`) con health-check propio (heartbeat + PID).
 * Si el proceso muere realmente —se le envía SIGKILL— el health-check lo detecta
 * y el loop hace failover al fallback, registrando `NODE_DOWN`. No es un flag de
 * salud: el proceso deja de existir.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

import type { AthenaOsResearchResult } from './types.ts';
import type { AkpHandoffEntry } from './transport.ts';
import type { ResearchWorker } from './athenaosWorker.ts';

export interface ChildCognitiveNodeOptions {
  id: string;
  host: string;
  scriptPath: string;
  heartbeatPath: string;
  evidenceIndexPath: string;
  llmRecordingPath: string;
  toolRecordingPath: string;
  startTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (value: AthenaOsResearchResult) => void;
  reject: (error: Error) => void;
}

export class ChildCognitiveNode {
  readonly id: string;
  readonly host: string;
  private readonly options: ChildCognitiveNodeOptions;
  private child: ChildProcess | null = null;
  private pid: number | null = null;
  private starting: Promise<void> | null = null;
  private readonly pending: PendingRequest[] = [];
  private exited = false;

  constructor(options: ChildCognitiveNodeOptions) {
    this.options = options;
    this.id = options.id;
    this.host = options.host;
  }

  async start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = this.launch();
    return this.starting;
  }

  private async launch(): Promise<void> {
    const script = resolve(process.cwd(), this.options.scriptPath);
    const child = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        script,
        '--host',
        this.options.host,
        '--heartbeat',
        resolve(process.cwd(), this.options.heartbeatPath),
        '--evidence-index',
        resolve(process.cwd(), this.options.evidenceIndexPath),
        '--llm-recording',
        resolve(process.cwd(), this.options.llmRecordingPath),
        '--tool-recording',
        resolve(process.cwd(), this.options.toolRecordingPath),
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], env: process.env }
    );
    this.child = child;
    this.pid = child.pid ?? null;

    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const pending = this.pending.shift();
      if (!pending) return;
      try {
        const parsed = JSON.parse(trimmed) as { result?: AthenaOsResearchResult; error?: string };
        if (parsed.error) pending.reject(new Error(parsed.error));
        else if (parsed.result) pending.resolve(parsed.result);
        else pending.reject(new Error(`[${this.id}] respuesta vacía`));
      } catch (error) {
        pending.reject(new Error(`[${this.id}] respuesta inválida: ${String(error)}`));
      }
    });

    child.on('exit', () => {
      this.exited = true;
      while (this.pending.length) {
        this.pending.shift()!.reject(new Error(`[${this.id}] el nodo murió antes de responder`));
      }
    });
    child.on('error', () => {
      this.exited = true;
    });

    await this.waitForHeartbeat();
  }

  private async waitForHeartbeat(): Promise<void> {
    const heartbeatPath = resolve(process.cwd(), this.options.heartbeatPath);
    const deadline = Date.now() + (this.options.startTimeoutMs ?? 20_000);
    while (Date.now() < deadline) {
      if (this.exited) throw new Error(`[${this.id}] el nodo terminó durante el arranque`);
      if (existsSync(heartbeatPath)) {
        try {
          const beat = JSON.parse(readFileSync(heartbeatPath, 'utf8')) as { pid?: number };
          if (typeof beat.pid === 'number') this.pid = beat.pid;
        } catch {
          // heartbeat parcial; se reintenta
        }
        // Verifica liveness real del PID antes de declararlo listo.
        if (this.probePid()) return;
      }
      await sleep(50);
    }
    throw new Error(`[${this.id}] timeout esperando heartbeat del nodo`);
  }

  /** Health-check independiente: liveness real del PID del proceso. */
  health(): boolean {
    if (!this.child || this.exited) return false;
    if (this.child.exitCode !== null || this.child.signalCode !== null) return false;
    return this.probePid();
  }

  private probePid(): boolean {
    if (!this.pid) return false;
    try {
      process.kill(this.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async research(entry: AkpHandoffEntry, runId: string, at?: string): Promise<AthenaOsResearchResult> {
    if (this.starting) await this.starting;
    if (!this.health()) throw new Error(`[${this.id}] nodo no saludable (PID muerto)`);
    return new Promise<AthenaOsResearchResult>((resolvePromise, reject) => {
      this.pending.push({ resolve: resolvePromise, reject });
      const payload = JSON.stringify({ at: at ?? new Date().toISOString(), runId, entry });
      this.child!.stdin!.write(`${payload}\n`, (error) => {
        if (error) {
          const index = this.pending.findIndex((item) => item.resolve === resolvePromise);
          if (index >= 0) this.pending.splice(index, 1);
          reject(new Error(`[${this.id}] no se pudo enviar trabajo: ${String(error)}`));
        }
      });
    });
  }

  /** Termina el proceso real (SIGKILL) y espera su salida. */
  async kill(): Promise<void> {
    if (!this.child || this.exited) return;
    const child = this.child;
    const done = new Promise<void>((resolvePromise) => child.once('exit', () => resolvePromise()));
    try {
      if (this.pid) process.kill(this.pid, 'SIGKILL');
    } catch {
      // ya estaba muerto
    }
    await Promise.race([done, sleep(2000)]);
    this.exited = true;
  }

  async close(): Promise<void> {
    if (!this.child || this.exited) return;
    try {
      this.child.stdin?.end();
    } catch {
      // ignorado
    }
    await this.kill();
  }
}

export interface FailoverEvent {
  nodeId: string;
  host: string;
  detail: string;
}

export interface FailoverResearchWorkerOptions {
  primary: ChildCognitiveNode;
  fallback: ResearchWorker;
  /** Mata el nodo primario tras N resultados para forzar el failover real. */
  killAfter?: number;
  onFailure?: (event: FailoverEvent) => void;
}

export class FailoverResearchWorker implements ResearchWorker {
  readonly id: string;
  private readonly options: FailoverResearchWorkerOptions;
  private served = 0;
  private failedOver = false;

  constructor(options: FailoverResearchWorkerOptions) {
    this.options = options;
    this.id = `${options.primary.id}→failover`;
  }

  get failoverActivated(): boolean {
    return this.failedOver;
  }

  async research(entry: AkpHandoffEntry, runId: string, at?: string): Promise<AthenaOsResearchResult> {
    const { primary, fallback } = this.options;
    if (!this.failedOver) {
      if (primary.health()) {
        try {
          const result = await primary.research(entry, runId, at);
          this.served += 1;
          if ((this.options.killAfter ?? 0) > 0 && this.served >= this.options.killAfter!) {
            await primary.kill();
          }
          return result;
        } catch (error) {
          this.failover(`El nodo ${primary.id} falló durante la investigación: ${String((error as Error)?.message ?? error)}`);
        }
      } else {
        this.failover(`El health-check del nodo ${primary.id} (${primary.host}) lo reportó muerto (PID sin vida).`);
      }
    }
    return fallback.research(entry, runId, at);
  }

  private failover(detail: string): void {
    if (this.failedOver) return;
    this.failedOver = true;
    this.options.onFailure?.({ nodeId: this.options.primary.id, host: this.options.primary.host, detail });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
