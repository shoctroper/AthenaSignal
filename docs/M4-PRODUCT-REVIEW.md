# M4 — Product Quality Review (Human Gate) — AthenaSignal

- **Fecha:** 2026-09-12
- **Evalúa:** Arquitecto, a pedido del Líder Humano, como **juicio de producto**.
- **Veredicto:** **APPROVE** tras una ronda de **RETURN** para calibrar priorización (D-M4-01/02/03).
- **Runtime de calibración:** `rt-54e73e1fef96`. Strict verify **PASS (5/5)**; `npm test` **71/71**.

## 1. Capacidad demostrada

AthenaSignal mantiene un **modelo vivo del panorama editorial** a lo largo del tiempo: memoria persistente, identidad histórica, dedup, vinculación entre fuentes, evolución de evidencia, reevaluación, contradicciones, prioridad dinámica, recovery/idempotencia, radar consultable y handoff a AKP.

## 2. Demostración (6 ciclos)

- NEW 15 · KNOWN 2 · DUPLICATE 2 · RELATED 8 · UPDATED 2 · PRIORITY_CHANGED 2 · CONTRADICTED 1 · REASSESSED 1 · DISCARDED 1 · PROMOTED 1.
- 10 fuentes · 15 señales rastreadas · 7 clusters (2 multi-fuente) · 7 candidates · 1 promovido.
- Dedup más difícil: `src-creatine-pmc` reaparece 3 veces sin duplicar.
- Contradicción: `cl-ayuno-intermitente` (Cochrane vs Mayo) → `CONTRADICTED` + `REASSESSED` + `resolutionNote`.
- Recovery/idempotencia: tests de no-op sobre material conocido y de resume desde estado persistido.

## 3. Calibración aplicada (ronda RETURN)

- **D-M4-01 resuelto:** distribución **HIGH 2 / MEDIUM 4 / DISCARD 1** (antes 6/7 HIGH). HIGH exige score **y ≥2 fuentes de evidencia**; los mono-fuente (incl. rabbitmq 0.715) bajan a MEDIUM.
- **D-M4-02 resuelto:** `promotionReason` explícito (score ≥0.6 + ≥2 fuentes + ≥2 evidencias + sin contradicción bloqueante).
- **D-M4-03 resuelto:** `resolutionNote` cuando `SUPPORTED` coexiste con contradicción.
- `priorityReasons` incluyen nº de fuentes y contradicción.

## 4. Deuda residual (no bloquea)

- **D-M4-R1:** el mayor score (`ayuno`, 0.94) no se promueve por contradicción abierta; solo `creatina` se promueve. Elección conservadora explícita; revisar si conviene promover con la contradicción anotada.
- **D-M4-R2:** la continuidad de historia entre milestones no es automática (AirLLM nace en el ciclo 5 de M4, no arrastra M3).
- **D-M4-R3:** `LOW` no se usa en la distribución actual (puede ser correcto dado el corpus).

## 5. Evidencia

- `evidence/m4/{corpus,benchmark,radar-timeline,radar-state,metrics,handoff-athenaos,human-review-packet}.json`
- `tests/editorial-radar-e2e.test.ts` · `scripts/m4-replay.ts`
- Strict spec `athenasignal-m4-verify.spec.yaml` PASS; regresión M1+M2+M3 intacta.
