/**
 * AKP handoff sink M5 (ORDEN-009 §2.9, §14).
 *
 * Integración real pero abstracta: AKP/AthenaOS no expone hoy un endpoint vivo,
 * así que el handoff se valida localmente contra el contrato vendoreado y se
 * persiste de forma consumible en un sink de archivo/cola (un JSON por
 * handoff). La supresión de duplicados usa el `EmbeddingProvider` local-first.
 *
 * Nunca se simula que AthenaOS consumió algo: `consumed` permanece 0 y la
 * limitación se documenta en cada entrega.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { HandoffValidator } from '../handoff/HandoffValidator.ts';
import type { AthenaOsHandoff } from '../domain/entities.ts';
import type { AkpDelivery, AkpDeliveryStatus } from './types.ts';
import { cosineSimilarity, NEAR_DUPLICATE_THRESHOLD, type EmbeddingProvider } from './embedding.ts';

export interface DeliverInput {
  handoffId: string;
  candidateId: string;
  clusterId: string;
  version: number;
  deliveredAt: string;
  runId: string;
  recommendedAthenaOsInput: AthenaOsHandoff;
}

export interface DeliverResult {
  delivery: AkpDelivery;
  written: boolean;
}

export interface AkpSinkOptions {
  sinkDir: string;
  embedding: EmbeddingProvider;
  limitation: string;
  write?: boolean;
}

export class AkpHandoffSink {
  private readonly options: AkpSinkOptions;
  private readonly validator = new HandoffValidator();
  private readonly deliveries: AkpDelivery[] = [];
  private readonly byHash = new Map<string, AkpDelivery>();

  constructor(options: AkpSinkOptions) {
    this.options = options;
  }

  deliverables(): AkpDelivery[] {
    return this.deliveries.map((delivery) => clone(delivery));
  }

  consumeAll(): number {
    // No hay consumidor vivo: se documenta explícitamente y no se marca nada
    // como consumido para no fabricar evidencia.
    return 0;
  }

  deliver(input: DeliverInput): DeliverResult {
    const contentHash = hashHandoff(input.recommendedAthenaOsInput);
    const validation = this.validator.validate(input.recommendedAthenaOsInput);
    const existing = this.byHash.get(contentHash);

    if (existing) {
      const suppressed: AkpDelivery = {
        ...clone(existing),
        handoffId: input.handoffId,
        version: input.version,
        deliveredAt: input.deliveredAt,
        runId: input.runId,
        status: 'DUPLICATE_SUPPRESSED',
      };
      this.deliveries.push(suppressed);
      return { delivery: clone(suppressed), written: false };
    }

    const near = this.findNearDuplicate(input.recommendedAthenaOsInput);
    const status: AkpDeliveryStatus = near ? 'DUPLICATE_SUPPRESSED' : 'DELIVERED_TO_SINK';

    const delivery: AkpDelivery = {
      handoffId: input.handoffId,
      candidateId: input.candidateId,
      clusterId: input.clusterId,
      version: input.version,
      contentHash,
      deliveredAt: input.deliveredAt,
      runId: input.runId,
      status,
      validation,
      recommendedAthenaOsInput: input.recommendedAthenaOsInput,
      consumption: {
        consumer: null,
        consumedAt: null,
        limitation: this.options.limitation,
      },
    };

    this.deliveries.push(delivery);
    this.byHash.set(contentHash, delivery);

    let written = false;
    if ((this.options.write ?? true) && status === 'DELIVERED_TO_SINK') {
      mkdirSync(this.options.sinkDir, { recursive: true });
      const path = join(this.options.sinkDir, `${input.handoffId}.json`);
      writeFileSync(path, `${JSON.stringify(delivery, null, 2)}\n`, 'utf8');
      written = existsSync(path);
    }

    return { delivery: clone(delivery), written };
  }

  private findNearDuplicate(handoff: AthenaOsHandoff): AkpDelivery | null {
    const candidate = this.options.embedding.embed(
      `${handoff.researchQuestion} ${handoff.proposedCandidateFacts.map((fact) => fact.statement).join(' ')}`
    );
    for (const existing of this.deliveries) {
      if (existing.status !== 'DELIVERED_TO_SINK') continue;
      const other = this.options.embedding.embed(
        `${existing.recommendedAthenaOsInput.researchQuestion} ` +
          `${existing.recommendedAthenaOsInput.proposedCandidateFacts.map((fact) => fact.statement).join(' ')}`
      );
      if (cosineSimilarity(candidate, other) >= NEAR_DUPLICATE_THRESHOLD) return existing;
    }
    return null;
  }
}

export function hashHandoff(handoff: AthenaOsHandoff): string {
  return createHash('sha256').update(stableStringify(handoff), 'utf8').digest('hex');
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
