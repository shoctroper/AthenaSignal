#!/usr/bin/env node
/**
 * Entrypoint/CLI de verificacion offline de M1 (Deep Search Vertical Slice).
 *
 * Corre el pipeline completo con fuentes/fixtures deterministas (sin red) y
 * escribe `evidence/deep-search-e2e.json` con las etapas auditables:
 * `source`, `signal`, `verification`, `opportunity`.
 *
 * Uso:
 *   node --experimental-strip-types src/cli.ts --offline
 *   npm run e2e
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FirecrawlAdapter } from './adapters/FirecrawlAdapter.ts';
import { McpAgentReachAdapter } from './adapters/McpAgentReachAdapter.ts';
import { McpClientService } from './services/McpClientService.ts';
import { ClaimVerifier } from './services/ClaimVerifier.ts';
import { EditorialScorer } from './services/EditorialScorer.ts';
import { DeterministicEvidenceProvider } from './services/EvidenceProviders.ts';
import { PipelineOrchestrator } from './services/PipelineOrchestrator.ts';
import { SignalExtractor } from './services/SignalExtractor.ts';
import type { EditorialOpportunity, Signal, VerificationReport } from './domain/entities.ts';
import type { NormalizedContent } from './adapters/ISourceAdapter.ts';

export const OFFLINE_SOURCE_URL = 'https://youtube.com/watch?v=athena-m1-rabbitmq-vs-kafka';
export const DEFAULT_EVIDENCE_PATH = 'evidence/deep-search-e2e.json';

export interface OfflineEvidence {
  source: NormalizedContent;
  signal: Signal;
  verification: VerificationReport;
  opportunity: EditorialOpportunity;
}

export interface OfflineRunSummary {
  evidence: OfflineEvidence;
  outputPath: string;
}

/**
 * Construye el orquestador offline: adaptadores sin red (MCP no disponible
 * -> fixture; Firecrawl sin transporte -> fixture), extractor heurístico y
 * verificador determinista.
 */
export function buildOfflineOrchestrator(): PipelineOrchestrator {
  return new PipelineOrchestrator(
    [new McpAgentReachAdapter(new McpClientService()), new FirecrawlAdapter()],
    new SignalExtractor(),
    new ClaimVerifier(new DeterministicEvidenceProvider()),
    new EditorialScorer()
  );
}

/**
 * Ejecuta el pipeline offline y escribe el artefacto de evidencia.
 */
export async function runOfflinePipeline(
  outputPath: string = DEFAULT_EVIDENCE_PATH,
  url: string = OFFLINE_SOURCE_URL
): Promise<OfflineRunSummary> {
  const orchestrator = buildOfflineOrchestrator();
  const result = await orchestrator.run(url);

  const evidence: OfflineEvidence = {
    source: result.source,
    signal: result.signal,
    verification: result.verification,
    opportunity: result.opportunity,
  };

  const absolutePath = resolve(process.cwd(), outputPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  return { evidence, outputPath: absolutePath };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (!parsed.offline) {
    console.warn('[AthenaSignal] Advertencia: se recomienda --offline para la aceptacion M1.');
  }

  const { evidence, outputPath } = await runOfflinePipeline(parsed.out, parsed.url);

  const claims = evidence.verification.claims;
  const verdicts = evidence.verification.verdictCounts;
  console.log(`[AthenaSignal] Evidencia escrita en: ${outputPath}`);
  console.log(
    `[AthenaSignal] Claims: ${claims.length} (VERIFIED=${verdicts.VERIFIED}, ` +
      `REFUTED=${verdicts.REFUTED}, UNVERIFIED_AMBIGUOUS=${verdicts.UNVERIFIED_AMBIGUOUS})`
  );
  console.log(`[AthenaSignal] Oportunidad editorial: ${evidence.opportunity.score.toFixed(4)}/1.0`);
}

interface CliArgs {
  offline: boolean;
  out: string;
  url: string;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = { offline: false, out: DEFAULT_EVIDENCE_PATH, url: OFFLINE_SOURCE_URL };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--offline') {
      result.offline = true;
    } else if (arg === '--out' && args[i + 1]) {
      result.out = args[i + 1];
      i += 1;
    } else if (arg === '--url' && args[i + 1]) {
      result.url = args[i + 1];
      i += 1;
    }
  }
  return result;
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error('[AthenaSignal] Error en el pipeline offline:', error);
    process.exit(1);
  });
}
