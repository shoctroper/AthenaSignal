#!/usr/bin/env node
/**
 * Consumidor AKP independiente M5 (ORDEN-009 §0bis.3, §7).
 *
 * Proceso separado que lee `evidence/m5/akp-sink/*.json`, revalida los
 * handoffs contra el contrato vendoreado y los ingiere en `data/akp-inbox/`,
 * registrando el consumo real del lado-AKP. Es idempotente.
 *
 * Uso:
 *   node --experimental-strip-types scripts/akp-consume.ts
 *   node --experimental-strip-types scripts/akp-consume.ts --sink evidence/m5/akp-sink
 */

import { resolve } from 'node:path';

import { AkpInboxConsumer } from '../src/platform/akpConsumer.ts';
import { DEFAULT_AKP_INBOX_DIR, DEFAULT_M5_OUTPUT_DIR } from '../src/platform/offline.ts';

const CONSUMED_AT = process.env.AKP_CONSUMED_AT ?? '2026-09-12T00:00:00.000Z';

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function main(): void {
  const sinkDir = argValue('--sink', resolve(process.cwd(), DEFAULT_M5_OUTPUT_DIR, 'akp-sink'));
  const inboxDir = argValue('--inbox', DEFAULT_AKP_INBOX_DIR);
  const consumer = new AkpInboxConsumer({ inboxDir, write: true });
  const result = consumer.consumeFromDir(sinkDir, CONSUMED_AT);

  console.log(`[AKP:consume] sink=${sinkDir}`);
  console.log(
    `[AKP:consume] consumidos=${result.consumed} ingeridos=${result.ingested} ` +
      `duplicados=${result.duplicates} inválidos=${result.invalid}`
  );
  console.log(`[AKP:consume] inbox=${result.inboxDir}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
