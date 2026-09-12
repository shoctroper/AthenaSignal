/**
 * Consumidor AKP local M5 (ORDEN-009 §0bis.3, §2.9, §14).
 *
 * AKP/AthenaOS no expone hoy un endpoint vivo, así que este consumidor
 * independiente lee el sink validado (`evidence/m5/akp-sink/*.json`), revalida
 * cada handoff contra el contrato vendoreado y lo ingiere en un repositorio
 * local AKP-compatible (`data/akp-inbox/`). Registra el consumo real del
 * lado-AKP: `consumed > 0`, `consumer` y el artefacto resultante. No afirma que
 * AthenaOS consumió nada si no ocurrió: es el stand-in documentado.
 *
 * Es idempotente: un handoff ya ingerido (mismo contentHash) se marca
 * DUPLICATE sin reescribir el inbox.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { HandoffValidator } from '../handoff/HandoffValidator.ts';
import type { AthenaOsHandoff } from '../domain/entities.ts';
import { hashHandoff } from './sink.ts';
import type {
  AkpConsumption,
  AkpConsumptionRecord,
  AkpDelivery,
} from './types.ts';

export const AKP_CONSUMER_ID = 'akp-local-ingestor-v1';
export const AKP_INBOX_INDEX_KIND = 'athenasignal.akp.inbox_index.v1';
export const AKP_INBOX_ENTRY_KIND = 'athenasignal.akp.inbox_entry.v1';

export interface AkpInboxIndexEntry {
  handoffId: string;
  candidateId: string;
  contentHash: string;
  ingestedAt: string;
  inboxPath: string;
}

export interface AkpInboxIndex {
  kind: typeof AKP_INBOX_INDEX_KIND;
  consumer: string;
  updatedAt: string;
  entries: AkpInboxIndexEntry[];
}

export interface AkpConsumerOptions {
  inboxDir: string;
  consumer?: string;
  write?: boolean;
  validator?: HandoffValidator;
}

export class AkpInboxConsumer {
  private readonly inboxDir: string;
  private readonly consumer: string;
  private readonly write: boolean;
  private readonly validator: HandoffValidator;

  constructor(options: AkpConsumerOptions) {
    this.inboxDir = options.inboxDir;
    this.consumer = options.consumer ?? AKP_CONSUMER_ID;
    this.write = options.write ?? true;
    this.validator = options.validator ?? new HandoffValidator();
  }

  private resolveInbox(file?: string): string {
    return resolve(process.cwd(), this.inboxDir, file ?? '');
  }

  /** Lee el sink de archivos real y lo ingiere. */
  consumeFromDir(sinkDir: string, consumedAt: string): AkpConsumption {
    const dir = resolve(process.cwd(), sinkDir);
    let files: string[] = [];
    try {
      files = readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .sort();
    } catch {
      files = [];
    }
    const deliveries = files
      .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as AkpDelivery)
      .filter((delivery) => delivery && typeof delivery === 'object' && delivery.recommendedAthenaOsInput);
    return this.consume(deliveries, consumedAt);
  }

  /**
   * Ingesta una lista de entregas. `consumed` cuenta los handoffs válidos y
   * distintos presentados (estable entre corridas); `ingested` cuenta los
   * escritos nuevos.
   */
  consume(deliveries: AkpDelivery[], consumedAt: string): AkpConsumption {
    const index = this.readIndex();
    const known = new Set(index.entries.map((entry) => entry.contentHash));
    const seen = new Set<string>();
    const records: AkpConsumptionRecord[] = [];
    let ingested = 0;
    let duplicates = 0;
    let invalid = 0;

    const eligible = deliveries
      .filter((delivery) => delivery.status !== 'DUPLICATE_SUPPRESSED')
      .sort((a, b) => (a.contentHash < b.contentHash ? -1 : a.contentHash > b.contentHash ? 1 : 0));

    for (const delivery of eligible) {
      const handoff: AthenaOsHandoff = delivery.recommendedAthenaOsInput;
      const contentHash = delivery.contentHash || hashHandoff(handoff);
      const validation = this.validator.validate(handoff);

      if (!validation.valid) {
        invalid += 1;
        records.push({
          handoffId: delivery.handoffId,
          candidateId: delivery.candidateId,
          clusterId: delivery.clusterId,
          contentHash,
          status: 'INVALID',
          inboxPath: null,
          consumedAt,
          validation,
        });
        continue;
      }

      if (seen.has(contentHash)) continue;
      seen.add(contentHash);

      if (known.has(contentHash)) {
        duplicates += 1;
        records.push({
          handoffId: delivery.handoffId,
          candidateId: delivery.candidateId,
          clusterId: delivery.clusterId,
          contentHash,
          status: 'DUPLICATE',
          inboxPath: null,
          consumedAt,
          validation,
        });
        continue;
      }

      const inboxPath = join(this.inboxDir, `${delivery.candidateId}.json`);
      if (this.write) {
        mkdirSync(this.resolveInbox(), { recursive: true });
        writeFileSync(
          this.resolveInbox(`${delivery.candidateId}.json`),
          `${JSON.stringify(
            {
              kind: AKP_INBOX_ENTRY_KIND,
              consumer: this.consumer,
              consumedAt,
              candidateId: delivery.candidateId,
              clusterId: delivery.clusterId,
              contentHash,
              recommendedAthenaOsInput: handoff,
            },
            null,
            2
          )}\n`,
          'utf8'
        );
        index.entries.push({
          handoffId: delivery.handoffId,
          candidateId: delivery.candidateId,
          contentHash,
          ingestedAt: consumedAt,
          inboxPath,
        });
      }
      ingested += 1;
      records.push({
        handoffId: delivery.handoffId,
        candidateId: delivery.candidateId,
        clusterId: delivery.clusterId,
        contentHash,
        status: 'INGESTED',
        inboxPath,
        consumedAt,
        validation,
      });
    }

    if (this.write) {
      index.updatedAt = consumedAt;
      mkdirSync(this.resolveInbox(), { recursive: true });
      writeFileSync(this.resolveInbox('index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    }

    return {
      kind: 'athenasignal.m5.akp_consumption.v1',
      consumer: this.consumer,
      consumedAt,
      consumed: seen.size,
      ingested,
      duplicates,
      invalid,
      inboxDir: this.inboxDir,
      records,
    };
  }

  readIndex(): AkpInboxIndex {
    try {
      const raw = JSON.parse(readFileSync(this.resolveInbox('index.json'), 'utf8')) as AkpInboxIndex;
      if (raw.kind === AKP_INBOX_INDEX_KIND && Array.isArray(raw.entries)) return raw;
    } catch {
      // Sin índice previo: inbox vacío.
    }
    return { kind: AKP_INBOX_INDEX_KIND, consumer: this.consumer, updatedAt: '', entries: [] };
  }
}

/** Anota las entregas con la evidencia de consumo del lado-AKP. */
export function annotateConsumption(
  deliveries: AkpDelivery[],
  consumption: AkpConsumption,
  limitation: string
): AkpDelivery[] {
  const consumedHashes = new Set(
    consumption.records.filter((record) => record.status !== 'INVALID').map((record) => record.contentHash)
  );
  return deliveries.map((delivery) => {
    if (delivery.status !== 'DELIVERED_TO_SINK' || !consumedHashes.has(delivery.contentHash)) {
      return delivery;
    }
    return {
      ...delivery,
      consumption: {
        consumer: consumption.consumer,
        consumedAt: consumption.consumedAt,
        limitation,
      },
    };
  });
}
