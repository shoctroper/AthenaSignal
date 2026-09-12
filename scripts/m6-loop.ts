/**
 * Orquestación determinista del loop M6 (ORDEN-010 §7).
 *
 * Reproduce el closed loop completo y materializa los artefactos en
 * `evidence/m6/`. La salida canónica es determinista: mismo estado, mismos
 * bytes. No accede a red (replay de grabaciones reales).
 *
 * Uso:
 *   node --experimental-strip-types scripts/m6-loop.ts
 */

import { runM6Offline } from '../src/closedloop/offline.ts';

async function main(): Promise<void> {
  const summary = await runM6Offline({ write: true });
  const { metrics, benchmark, humanReview } = summary.artifacts;

  const canonical = {
    milestone: 'M6',
    objective: 'Closed-Loop Editorial Intelligence',
    scale: metrics.scale,
    loop: metrics.loop,
    research: metrics.research,
    feedback: metrics.feedback,
    distributed: metrics.distributed,
    recovery: metrics.recovery,
    idempotency: metrics.idempotency,
    performance: metrics.performance,
    quality: metrics.quality,
    benchmark: { coverage: benchmark.coverage, falsePositiveObservations: benchmark.falsePositiveObservations },
    humanReview: {
      bestStory: humanReview.bestStory,
      majorContradiction: humanReview.majorContradiction?.candidateId ?? null,
      majorPromotion: humanReview.majorPromotion?.candidateId ?? null,
      majorFailure: humanReview.majorFailure?.kind ?? null,
    },
  };

  process.stdout.write(`${JSON.stringify(canonical, null, 2)}\n`);
}

main().catch((error) => {
  console.error('[m6-loop] fallo:', error);
  process.exit(1);
});
