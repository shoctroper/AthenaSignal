# ORDEN-011 — MILESTONE M7: Epistemically Resolutive Closed Loop

- **Fecha:** 2026-09-12
- **Emite:** Arquitecto
- **Estado:** VIGENTE — autorizado vía GovernanceOs → OpenCode + DeepSeek. **Scope cross-repo autorizado.**
- **Vinculantes:** `decisiones/DU-001` · `docs/athenaos-handoff-contract.md` · `ciclo/ORDEN-010.md` (M6) · `docs/M6-PRODUCT-REVIEW.md`

---

## 0. EJECUCIÓN INMEDIATA (LEER PRIMERO)

**No termines el turno describiendo intenciones.** El turno termina solo cuando los artefactos de aceptación existen y `npm test` pasa.

**SANDBOX (actualizado):**
- `permission.external_directory = allow` está habilitado (ver `opencode.json`): puedes **leer/ejecutar** `AthenaFramework`, `AthenaKnowledge`, `AthenaOS`, `AthenaOS-Unify`.
- **Escribe solo dentro de AthenaSignal** (evidencia, código, artefactos). **No modifiques el código fuente de otros repos**; solo invócalos/construye si es imprescindible y documéntalo. Nunca `cd` a otro repo para escribir.
- Genera dentro del repo: `evidence/m7/`, `data/`, `.m7tmp/`.

**MOTORES REALES (invócalos, no los reimplementes):**
- **AthenaOS (research):** `dotnet /Volumes/Medios/Repos/AthenaFramework/src/Athena.Cli/bin/Release/net9.0/athena.dll <cmd>` · inspecciona `Athena.Cli/CommandRouter.cs` y `--help`. Si no es invocable, usa un research worker real in-repo (SearXNG+LLM) y **documenta** el motivo.
- **AKP (ingesta):** `AthenaKnowledge/athena-knowledge-ingestion/src/AthenaKnowledge.Ingestion.Cli` (compílalo con `dotnet build` si hace falta); produce `KnowledgeRepository/` + `runs/ingestion-run-report.json`.
- **Nodos:** remoto puede estar DOWN; si no está, degrada y **documenta** la limitación (`distributed.json`). No simules que participó.
- `dotnet` en `/usr/local/share/dotnet/dotnet`.

**PRESUPUESTO:** reutiliza recordings de M3/M6; primero deja `tests/epistemic-resolution-e2e.test.ts` verde y `scripts/m7-loop.ts` determinista; timeouts explícitos.

## 1. MISIÓN

Convertir AthenaSignal + AKP + AthenaOS en un sistema operacional de inteligencia editorial **epistemológicamente resolutivo**: descubre, investiga, **confirma, refuta, mantiene incertidumbre o cierra** Research Candidates, actualiza el radar coherentemente y opera continua y recuperablemente.

El conocimiento producido por AthenaOS debe **cambiar el estado de AthenaSignal de forma basada en evidencia y provenance**.

## 2. ESTADOS EPISTEMOLÓGICOS (formalizar y verificar)

Definir explícitamente y conservar `statusHistory`:
`RESEARCHABLE · CONFIRMED · REFUTED · INCONCLUSIVE · CLOSED_CONFIRMED · CLOSED_REFUTED · REOPENED · DEMOTED · PROMOTED · DISCARDED`.
Transiciones **evidence-driven**: cada transición registra la evidencia que la justifica (refs + provenance). Ninguna etiqueta se asigna arbitrariamente.

## 3. OBJETIVOS FUNCIONALES

1. **Closed loop real:** `AthenaSignal → AKP → AthenaOS → AKP → AthenaSignal` verificable (trace de IDs/candidatos).
2. **Resolución epistémica:** ≥1 caso **CONFIRMED** y ≥1 **REFUTED** (o equivalentes explícitos verificables) basados en evidencia, no en etiquetas.
3. **Evidence-driven transitions:** prioridad, promotion, demotion, closure y reopening coherentes con los resultados.
4. **Historial completo** de transiciones preservado (sin sobrescribir el pasado).
5. **Nueva evidencia cambia materialmente el estado** de un candidate.
6. **Contradicciones** representadas y resueltas o **conservadas explícitamente**.
7. **Ejecución continua y recuperable** (scheduler + proceso real; restart/resume).
8. **Nodos reales** cuando aporten y sea posible; failover/recovery demostrado; degradación documentada.
9. **Escala:** corpus **significativamente mayor que M6** (M6: 250 fuentes; objetivo ≥400 fuentes únicas o equivalente con ciclos suficientes).
10. **Provenance completa:** `source → signal → research candidate → evidence → research result → radar state`.
11. **Handoff y retorno verificables** (AthenaSignal→AKP→AthenaOS y de vuelta).
12. **Cierre/reapertura/degradación** de candidates por nueva evidencia.
13. **Regresión M1–M6** sin fallos.

## 4. PRODUCT QUALITY

No basta endpoint/DB/scheduler/test. Debe demostrarse que **el conocimiento de AthenaOS cambia realmente el comportamiento posterior de AthenaSignal**, con estados confirmados/refutados/inciertos y trazabilidad. Preservar la separación `OBSERVATION · ASSERTION · EVIDENCE · RESEARCH FINDING · MODEL INTERPRETATION · EDITORIAL REFRAMING`; el resultado de AthenaOS no se convierte en fact por regresar.

## 5. RECOVERY / IDEMPOTENCIA / MEMORIA

`process crash · node unavailable · LLM failure · research timeout · partial run · restart · resume` sin duplicación, pérdida histórica/provenance, falso promotion ni corrupción. Reprocesar candidate/result/source/AKP message debe ser seguro. La memoria sobrevive restart/redeploy/nuevo run/nuevo milestone.

## 6. BENCHMARK

Mayor que M6, incluyendo: `new · known · duplicate · related · reassessment · promotion · demotion · closure · reopening · contradiction · research result CONFIRMED · research result REFUTED · feedback update · node failure · process restart · LLM failure · AKP retry`. Material real + casos reproducibles.

## 7. ACEPTACIÓN

- closed loop operativo real AthenaSignal→AKP→AthenaOS→AKP→AthenaSignal;
- ≥1 CONFIRMED y ≥1 REFUTED (o equivalentes explícitos verificables);
- resoluciones basadas en evidencia/provenance;
- evidence-driven state transitions;
- priority/promotion/demotion/closure/reopening coherentes + historial completo;
- nueva evidencia cambia materialmente el estado;
- contradicciones representadas y resueltas o conservadas;
- ejecución continua y recuperable; failover/recovery; nodos reales cuando aporten;
- corpus ≫ M6; provenance completa; handoff/retorno verificables;
- regression suite M1–M6 completa; evidencia ejecutable/auditable.

Artefactos deterministas en `evidence/m7/`:

- `corpus.json`, `benchmark.json`, `loop-timeline.json`, `radar-state.json`
- `akp-live.json`, `athenaos-results.json`, `feedback-updates.json`
- `epistemic-resolutions.json` (CONFIRMED/REFUTED/INCONCLUSIVE + evidencia), `contradictions.json`
- `provenance.json`, `handoff-trace.json`, `metrics.json`, `cognitive-routing.json`
- `observability.json`, `recovery-events.json`, `idempotency.json`, `distributed.json`
- `human-review-packet.json`
- `tests/epistemic-resolution-e2e.test.ts` (offline, longitudinal, evidence-driven, recovery)
- `scripts/m7-loop.ts` (orquestación determinista)

Comando de aceptación oficial:

```bash
node --test --experimental-strip-types \
  tests/domain.test.ts tests/adapters.test.ts tests/signal-extractor.test.ts \
  tests/editorial-scorer.test.ts tests/pipeline-e2e.test.ts \
  tests/research-candidate-e2e.test.ts tests/autonomous-intelligence-e2e.test.ts \
  tests/editorial-radar-e2e.test.ts tests/platform-e2e.test.ts \
  tests/closed-loop-e2e.test.ts tests/epistemic-resolution-e2e.test.ts
```

Reproducibilidad: `node --experimental-strip-types scripts/m7-loop.ts` (salida canónica determinista).

## 8. HUMAN GATE

El primer Human Gate debe ocurrir **después de la demostración funcional completa** y los deterministic gates en verde. El `human-review-packet.json` debe incluir: best/worst closed-loop story · CONFIRMED case · REFUTED case · most important feedback update · evidence-driven state transition · contradiction handling · major promotion/demotion/closure/reopening · failure and recovery · distributed example · long-running timeline · AKP→AthenaOS→AKP trace. Revisión de producto, no de código.

## 9. CONTINUACIÓN Y PARADA

No crear micro-milestones. Continuar mientras el objetivo no esté demostrado ∧ la acción sea necesaria ∧ no haya Human Gate. Parar solo por: objetivo completo · Human Gate real · bloqueo externo material no resoluble.

## 10. REPORTE FINAL

Entregar: MILESTONE STATUS · PRODUCT CAPABILITY · CLOSED LOOP · ATHENASIGNAL→AKP→ATHENAOS→AKP→ATHENASIGNAL · EPISTEMIC STATES & RESOLUTIONS (CONFIRMED/REFUTED/INCONCLUSIVE) · EVIDENCE-DRIVEN TRANSITIONS · STATE HISTORY · CONTRADICTIONS · SOURCES · SCALE · LONG-RUN TIMELINE · COGNITIVE ROUTING · NODES (real vs degraded) · LLM USAGE · AKP LIVE · ATHENAOS RESULTS · FEEDBACK/RADAR MUTATIONS · PROMOTION/DEMOTION/CLOSURE/REOPENING · RECOVERY · IDEMPOTENCY · PROVENANCE · PERFORMANCE/COST · QUALITY METRICS · FAILURES FOUND AND FIXED · HUMAN REVIEW PACKET · LIMITATIONS · TECHNICAL DEBT · EXTERNAL BLOCKERS · EVIDENCE ARTIFACTS · REGRESSION · HUMAN GATES · NEXT MILESTONE.
