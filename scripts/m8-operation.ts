/**
 * Orquestación determinista de la operación sostenida M8 (ORDEN-012 §4).
 *
 * Reproduce el ciclo AthenaSignal→AKP→AthenaOS→AKP→AthenaSignal sostenido sobre
 * el universo ampliado (>= 1000 fuentes) y materializa los artefactos en
 * `evidence/m8/`. La salida canónica es determinista: mismo estado, mismos
 * bytes. No accede a red (replay de grabaciones reales + invocaciones reales
 * registradas).
 *
 * Uso:
 *   node --experimental-strip-types scripts/m8-operation.ts
 */

import { runM8Offline } from '../src/sustained/index.ts';

async function main(): Promise<void> {
  const summary = await runM8Offline({ write: true });
  const { artifacts } = summary;
  const { metrics, benchmark, scheduler, cost } = artifacts;

  const canonical = {
    milestone: 'M8',
    objective: 'Sustained Autonomous Editorial Operation',
    window: metrics.window,
    scale: metrics.scale,
    sustained: metrics.sustained,
    epistemic: {
      resolutions: metrics.epistemic.resolutions,
      transitions: metrics.epistemic.transitions,
      evidenceDriven: metrics.epistemic.evidenceDriven,
      byStatus: artifacts.epistemicResolutions.byStatus,
    },
    loop: metrics.loop,
    research: {
      results: metrics.research.results,
      m7Results: metrics.research.m7Results,
      m8Results: metrics.research.m8Results,
      providers: metrics.research.providers,
    },
    contradictions: metrics.contradictions,
    provenance: metrics.provenance,
    recovery: metrics.recovery,
    idempotency: metrics.idempotency,
    distributed: metrics.distributed,
    performance: metrics.performance,
    quality: metrics.quality,
    scheduler: {
      ticks: scheduler.tickCount,
      processes: scheduler.processes.map((process) => ({
        processId: process.processId,
        status: process.status,
        restarts: process.restarts,
        resumedFrom: process.resumedFrom,
      })),
      hosts: scheduler.hosts.map((host) => ({ host: host.host, reachable: host.reachable })),
    },
    realEngines: artifacts.athenaosReal.engines.invocations.map((invocation) => ({
      engine: invocation.engine,
      status: invocation.status,
      exitCode: invocation.exitCode,
    })),
    realResearch: artifacts.athenaosReal.realResearch
      ? {
          caseId: artifacts.athenaosReal.realResearch.caseId,
          provider: artifacts.athenaosReal.realResearch.provider,
          claims: artifacts.athenaosReal.realResearch.claims,
          disputed: artifacts.athenaosReal.realResearch.disputed,
          knowledgeFacts: artifacts.athenaosReal.realResearch.knowledgeFacts,
        }
      : null,
    akpIngestion: artifacts.akpLive.ingestion
      ? {
          documentsImported: artifacts.akpLive.ingestion.documentsImported,
          knownFactsWritten: artifacts.akpLive.ingestion.knownFactsWritten,
          bridgedFacts: artifacts.akpLive.ingestion.bridgedFacts,
          conflictsDetected: artifacts.akpLive.ingestion.conflictsDetected,
        }
      : null,
    cost: { llmCalls: cost.llmCalls, estimatedCostUnits: cost.estimatedCostUnits },
    benchmark: { coverage: benchmark.coverage, missing: benchmark.falsePositiveObservations },
  };

  process.stdout.write(`${JSON.stringify(canonical, null, 2)}\n`);
}

main().catch((error) => {
  console.error('[m8-operation] fallo:', error);
  process.exit(1);
});
