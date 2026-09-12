/**
 * Transporte AKP vivo M6 (ORDEN-010 §2.1, §2.2, §5).
 *
 * AKP/AthenaOS no expone un endpoint de red en este entorno, así que el
 * transporte es una cola durable en disco con dos buzones observables:
 *
 *   AthenaSignal → (handoff validado) → inbox/ → worker AthenaOS
 *   worker AthenaOS → (resultado estructurado) → returns/ → AthenaSignal
 *
 * Cada entrada y cada retorno se escriben como archivo JSON (provenance
 * reconstruible) además de un índice de estado. Todo es idempotente: republicar
 * un handoff idéntico o reenviar un resultado ya recibido es un no-op lógico.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { AthenaOsHandoff } from '../domain/entities.ts';
import { hashHandoff } from '../platform/sink.ts';
import type { AthenaOsResearchResult } from './types.ts';

export const AKP_LIVE_STATE_KIND = 'athenasignal.m6.akp_transport.v1';
export const AKP_LIVE_ENTRY_KIND = 'athenasignal.m6.akp_handoff_entry.v1';
export const AKP_LIVE_RETURN_KIND = 'athenasignal.m6.akp_return_entry.v1';

export interface AkpHandoffEntry {
  kind: typeof AKP_LIVE_ENTRY_KIND;
  handoffId: string;
  candidateId: string;
  clusterId: string;
  contentHash: string;
  publishedAt: string;
  recommendedAthenaOsInput: AthenaOsHandoff;
  inboxPath: string;
}

export interface AkpLiveState {
  kind: typeof AKP_LIVE_STATE_KIND;
  updatedAt: string;
  inbox: AkpHandoffEntry[];
  returns: AthenaOsResearchResult[];
  /** candidateId → resultId ya devuelto. */
  researched: Record<string, string>;
  /** contentHash → handoffId ya publicado (idempotencia). */
  published: Record<string, string>;
}

export interface HandoffPublishInput {
  handoffId: string;
  candidateId: string;
  clusterId: string;
  contentHash?: string;
  publishedAt: string;
  recommendedAthenaOsInput: AthenaOsHandoff;
}

export interface AkpLiveTransportOptions {
  dir: string;
  write?: boolean;
}

export class AkpLiveTransport {
  private readonly dir: string;
  private readonly inboxDir: string;
  private readonly returnDir: string;
  private readonly statePath: string;
  private readonly write: boolean;
  private memory: AkpLiveState | null = null;

  constructor(options: AkpLiveTransportOptions) {
    this.dir = resolve(process.cwd(), options.dir);
    this.inboxDir = join(this.dir, 'inbox');
    this.returnDir = join(this.dir, 'returns');
    this.statePath = join(this.dir, 'akp-live-state.json');
    this.write = options.write ?? true;
  }

  get inboxPath(): string {
    return this.inboxDir;
  }

  get returnsPath(): string {
    return this.returnDir;
  }

  readState(): AkpLiveState {
    if (this.memory) return this.memory;
    try {
      const raw = JSON.parse(readFileSync(this.statePath, 'utf8')) as AkpLiveState;
      if (raw.kind === AKP_LIVE_STATE_KIND && Array.isArray(raw.inbox) && Array.isArray(raw.returns)) {
        this.memory = raw;
        return raw;
      }
    } catch {
      // sin estado previo
    }
    this.memory = {
      kind: AKP_LIVE_STATE_KIND,
      updatedAt: '',
      inbox: [],
      returns: [],
      researched: {},
      published: {},
    };
    return this.memory;
  }

  private saveState(state: AkpLiveState, updatedAt: string): void {
    state.updatedAt = updatedAt;
    this.memory = state;
    if (!this.write) return;
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.statePath}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    renameSync(tmp, this.statePath);
  }

  /** Publica handoffs validados en el inbox, idempotente por contentHash. */
  publishHandoffs(
    inputs: HandoffPublishInput[],
    updatedAt: string
  ): { published: number; duplicates: number; entries: AkpHandoffEntry[] } {
    const state = this.readState();
    let published = 0;
    let duplicates = 0;
    const entries: AkpHandoffEntry[] = [];

    for (const input of [...inputs].sort((a, b) => (a.handoffId < b.handoffId ? -1 : 1))) {
      const contentHash = input.contentHash ?? hashHandoff(input.recommendedAthenaOsInput);
      if (state.published[contentHash]) {
        duplicates += 1;
        entries.push(state.inbox.find((entry) => entry.contentHash === contentHash)!);
        continue;
      }
      mkdirSync(this.inboxDir, { recursive: true });
      const inboxPath = join(this.inboxDir, `${input.candidateId}.json`);
      const entry: AkpHandoffEntry = {
        kind: AKP_LIVE_ENTRY_KIND,
        handoffId: input.handoffId,
        candidateId: input.candidateId,
        clusterId: input.clusterId,
        contentHash,
        publishedAt: input.publishedAt,
        recommendedAthenaOsInput: input.recommendedAthenaOsInput,
        inboxPath,
      };
      if (this.write) writeFileSync(inboxPath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
      state.inbox.push(entry);
      state.published[contentHash] = input.handoffId;
      published += 1;
      entries.push(entry);
    }

    this.saveState(state, updatedAt);
    return { published, duplicates, entries };
  }

  /** Handoffs del inbox que aún no tienen resultado de investigación. */
  pendingHandoffs(): AkpHandoffEntry[] {
    const state = this.readState();
    return state.inbox
      .filter((entry) => !state.researched[entry.candidateId])
      .sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));
  }

  /** Devuelve un resultado de AthenaOS al buzón compartido (idempotente). */
  submitResult(result: AthenaOsResearchResult, updatedAt: string): { written: boolean } {
    const state = this.readState();
    if (state.returns.some((existing) => existing.resultId === result.resultId)) {
      return { written: false };
    }
    mkdirSync(this.returnDir, { recursive: true });
    const path = join(this.returnDir, `${result.resultId}.json`);
    if (this.write) {
      writeFileSync(
        path,
        `${JSON.stringify({ kind: AKP_LIVE_RETURN_KIND, ...result, returnPath: path }, null, 2)}\n`,
        'utf8'
      );
    }
    state.returns.push(result);
    state.researched[result.candidateId] = result.resultId;
    this.saveState(state, updatedAt);
    return { written: true };
  }

  returnedResults(): AthenaOsResearchResult[] {
    return this.readState()
      .returns.slice()
      .sort((a, b) => (a.resultId < b.resultId ? -1 : a.resultId > b.resultId ? 1 : 0));
  }

  isResearched(candidateId: string): boolean {
    return Boolean(this.readState().researched[candidateId]);
  }

  entries(): AkpHandoffEntry[] {
    return this.readState().inbox.slice();
  }

  /** Solo para diagnóstico: lista de archivos de resultado persistidos. */
  resultFiles(): string[] {
    try {
      return readdirSync(this.returnDir)
        .filter((file) => file.endsWith('.json'))
        .sort();
    } catch {
      return [];
    }
  }

  exists(): boolean {
    return existsSync(this.statePath);
  }
}
