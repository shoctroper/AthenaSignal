#!/usr/bin/env node
/**
 * Entrypoint/CLI offline de M2 (Signal-to-Research-Candidate, ORDEN-006).
 *
 * Uso:
 *   node --experimental-strip-types src/research-cli.ts --offline
 *   npm run e2e:m2
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runM2Offline } from './research/offline.ts';

export interface M2CliArgs {
  offline: boolean;
  outputDir: string;
}

export function parseM2Args(args: string[]): M2CliArgs {
  const result: M2CliArgs = { offline: false, outputDir: 'evidence' };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--offline') {
      result.offline = true;
    } else if (arg === '--out-dir' && args[i + 1]) {
      result.outputDir = args[i + 1];
      i += 1;
    }
  }
  return result;
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseM2Args(args);
  if (!parsed.offline) {
    console.warn('[AthenaSignal] Advertencia: se recomienda --offline para la aceptacion M2.');
  }

  const { evidence, outputPaths } = await runM2Offline({ outputDir: parsed.outputDir });

  console.log(`[AthenaSignal/M2] Provenance: ${outputPaths.sourceProvenance}`);
  console.log(`[AthenaSignal/M2] Candidates: ${outputPaths.researchCandidates}`);
  console.log(`[AthenaSignal/M2] Handoff AKP: ${outputPaths.handoffAthenaOs}`);

  for (const candidate of evidence.researchCandidates.candidates) {
    console.log(
      `[AthenaSignal/M2] ${candidate.candidateId} [${candidate.assessment}] ` +
        `researchability=${candidate.researchability.level}`
    );
  }
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error('[AthenaSignal] Error en el pipeline M2 offline:', error);
    process.exit(1);
  });
}
