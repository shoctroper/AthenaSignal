/**
 * Orquestación determinista del loop M7 (ORDEN-011 §7).
 *
 * Reproduce el closed loop epistémicamente resolutivo completo y materializa los
 * artefactos en `evidence/m7/`. La salida canónica es determinista: mismo
 * estado, mismos bytes. No accede a red (replay de grabaciones reales).
 *
 * Uso:
 *   node --experimental-strip-types scripts/m7-loop.ts
 */

import { runM7Offline } from '../src/epistemic/index.ts';

async function main(): Promise<void> {
  const summary = await runM7Offline({ write: true });
  const { artifacts } = summary;
  const { metrics, benchmark } = artifacts;
  const board = artifacts.epistemicResolutions.byStatus;

  const canonical = {
    milestone: 'M7',
    objective: 'Epistemically Resolutive Closed Loop',
    scale: metrics.scale,
    epistemic: {
      resolutions: metrics.epistemic.resolutions,
      transitions: metrics.epistemic.transitions,
      evidenceDriven: metrics.epistemic.evidenceDriven,
      board,
    },
    loop: metrics.loop,
    research: metrics.research,
    contradictions: metrics.contradictions,
    provenance: metrics.provenance,
    recovery: metrics.recovery,
    idempotency: metrics.idempotency,
    distributed: metrics.distributed,
    quality: metrics.quality,
    benchmark: { coverage: benchmark.coverage, falsePositiveObservations: benchmark.falsePositiveObservations },
    confirmedCase: artifacts.humanReview.confirmedCase,
    refutedCase: artifacts.humanReview.refutedCase,
    evidenceDrivenTransition: artifacts.humanReview.evidenceDrivenTransition,
    closure: artifacts.humanReview.majorClosure,
    reopening: artifacts.humanReview.majorReopening,
  };

  process.stdout.write(`${JSON.stringify(canonical, null, 2)}\n`);
}

main().catch((error) => {
  console.error('[m7-loop] fallo:', error);
  process.exit(1);
});
