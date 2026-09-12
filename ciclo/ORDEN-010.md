# ORDEN-010 — MILESTONE M6: Closed-Loop Editorial Intelligence

- **Fecha:** 2026-09-12
- **Emite:** Arquitecto
- **Estado:** VIGENTE — autorizado para ejecución vía GovernanceOs → OpenCode + DeepSeek
- **Vinculantes:** `decisiones/DU-001` · `docs/athenaos-handoff-contract.md` · `ciclo/ORDEN-009.md` (M5) · `docs/M5-PRODUCT-REVIEW.md`

---

## 0. EJECUCIÓN INMEDIATA (LEER PRIMERO)

**No termines el turno describiendo intenciones.** Haz la llamada a herramienta en el mismo turno; el turno termina solo cuando los artefactos de aceptación existen y `npm test` pasa.

**SANDBOX:** nunca `cd` fuera del worktree ni escribas fuera de él (`/tmp`, `~`, otros repos) — la *external-directory permission* lo rechaza y mata el turno. Genera dentro del repo: `evidence/m6/`, `data/`, `.m6tmp/`. Si un comando es rechazado, reformúlalo y continúa.

**PRESUPUESTO (~50–90 min/ciclo):** reutiliza `evidence/m3/recordings/`, `evidence/m4/radar-state.json`, `evidence/m5/*`; no re-grabes salvo lo imprescindible. Primero deja `tests/closed-loop-e2e.test.ts` verde y `scripts/m6-loop.ts` determinista; después mejora. Timeouts explícitos en LLM/red.

**REALIDAD DEL ENTORNO (no bloquees por dependencias externas):**
- Motores reales existentes en la máquina (pueden ser **inaccesibles** por permisos desde el worker):
  - **AKP:** `/Volumes/Medios/Repos/AthenaKnowledge/athena-knowledge-ingestion/src/AthenaKnowledge.Ingestion.Cli` (dotnet), con `KnowledgeRepository/`.
  - **AthenaOS:** `/Volumes/Medios/Repos/AthenaFramework/src/Athena.Cli`, `Athena.Core/InvestigacionPlanBuilder.cs`, `Athena.Domain/Research/InvestigacionJob.cs`.
  - `dotnet` está en `/usr/local/share/dotnet/dotnet`.
- **Regla:** si el acceso externo está bloqueado o el motor no es invocable, implementa el **closed loop real dentro de AthenaSignal** con un componente **AthenaOS research worker** propio (proceso/comando separado) que haga investigación profunda real (multi-paso con SearXNG + LLM local), **preservando el boundary** (AthenaSignal triage ≠ AthenaOS deep research), y **documenta** que es el stand-in operativo hasta que el motor externo sea accesible. **No** simules que el motor externo consumió algo.

Orden sugerido: (1) transporte AKP vivo (endpoint HTTP o inbox observado) + consumer; (2) AthenaOS research worker real (deep research multi-paso, resultado estructurado); (3) return path AKP→AthenaSignal (re-ingesta); (4) mutación del radar por feedback; (5) loop sostenido + scheduler; (6) recovery/idempotencia multi-proceso; (7) distributed/degradación; (8) observabilidad + métricas; (9) benchmark closed-loop + escala; (10) test longitudinal + replay; (11) human-review-packet.

## 0bis. CORRECCIONES OBLIGATORIAS (revisión de producto del Líder Humano)

M6 pasó la verificación estricta, pero la revisión de producto exige **profundizar el loop** antes de cerrar. Corregir dentro del scope:

1. **Feedback que muta materialmente el radar (MATERIAL).** Hoy el resultado de AthenaOS solo cambia `assessment`/`interpretation`. Cada resultado debe además:
   - **añadir evidencia nueva** con provenance al candidate/cluster (`newEvidence > 0`, `evidenceAdded > 0`);
   - **recomputar prioridad** de forma que al menos un candidate cambie de prioridad por el feedback (`priorityChanges >= 1` atribuible a feedback);
   - **aplicar transiciones de estado coherentes**: si la investigación devuelve `AMBIGUOUS/INCONCLUSIVE` sobre un candidate `PROMOTED` → **no** puede seguir `PROMOTED` (debe `REOPENED`/`DEMOTED`); si `REFUTED` → `CLOSED_REFUTED`; si `CONFIRMED` → avanzar/consolidar. Preservar `statusHistory` completo sin sobrescribir el pasado.
2. **Distribución real (o bloqueo documentado).** `hosts: 1` no cumple “Ubuntu y/o Mac mini participan realmente”. Ejecutar el loop sobre **≥2 contextos de ejecución distintos** (procesos/host configs separados con health-check independiente y **fallo real** de uno, no un flag) y demostrar failover; registrar `hosts >= 2`. Si los nodos remotos son materialmente inalcanzables, **documentar el bloqueo** con evidencia y degradar — no simular que participaron.
3. **Al menos una trayectoria material.** Demostrar un candidate cuyo recorrido cambie materialmente por el feedback: p. ej. un `PROMOTED` que tras investigación se **reabre/refuta**, o un claim `REFUTED`/`CONFIRMED` con evidencia (`refuted >= 1` o una transición `REOPENED` visible). No basta con que todos queden AMBIGUOUS.
4. Regenerar `evidence/m6/*` con lo anterior, manteniendo todas las categorías, recovery, idempotencia, `npm test` verde y `replayMisses: 0`.

No cerrar M6 hasta que exista una trayectoria end-to-end donde **el conocimiento de AthenaOS cambie evidencia, prioridad y estado** de AthenaSignal de forma trazable.

## 1. MISIÓN

Convertir AthenaSignal + AKP + AthenaOS en un **closed-loop editorial intelligence system**:

```
EXTERNAL WORLD → ATHENASIGNAL → SIGNAL → RESEARCH CANDIDATE → AKP → ATHENAOS
→ DEEP RESEARCH → RESULT/CLAIMS/EVIDENCE → AKP → ATHENASIGNAL → RADAR UPDATED
→ NEXT EDITORIAL DECISION
```

**Meta:** demostrar que el ecosistema **aprende de su propio trabajo**: el conocimiento producido por AthenaOS cambia el comportamiento posterior de AthenaSignal.

## 2. OBJETIVOS FUNCIONALES

1. **Live AthenaOS path:** candidate real → AKP → consumido (o stand-in real documentado si no hay endpoint).
2. **Return path:** resultado estructurado de vuelta a AKP (`candidate identity · research status · findings · claims · evidence · provenance · uncertainties · final assessment`), integrado con los contratos existentes (no duplicar almacén).
3. **Re-ingesta en AthenaSignal:** detectar conocimiento nuevo sobre un candidate investigado (`reassessment → priority/status/promotion/closure`) conservando historia; no sobrescribir el pasado.
4. **Operación continua real:** `scheduler → discover → triage → candidate → AKP → AthenaOS → result → feedback → radar update → next cycle` durante una ventana prolongada real (no simulación mínima). Duración la fija el worker para demostrar comportamiento real.
5. **Ejecución distribuida real** cuando sea útil (Ubuntu: orchestration/scheduler/ingestion/persistence/research; Mac mini: nodo cognitivo). Degradar correctamente si un nodo no está; ningún nodo obligatorio para toda tarea.
6. **Cognitive routing en producción:** `local-first → local-alt → remote escalation → safe fallback`; registrar provider/latencia/fallo/fallback/coste-proxy. No plataforma LLM genérica.
7. **Escala:** superar materialmente M5 (≈130 fuentes). Orden de **cientos de fuentes únicas** cuando sea viable; medir throughput/latencia/memoria/LLM/research/coste/calidad/ruido/failure rate.
8. **Source evolution:** `candidate + new source → reassessment`; `+ evidencia contradictoria → status/priority update`; `nuevo related → cluster`.
9. **Editorial feedback loop:** un resultado de AthenaOS cambia el estado editorial del radar conservando separados `original signal · research question · research result · new evidence · new interpretation`.
10. **End-to-end product demonstration:** descubrir → candidate → AKP → AthenaOS consume → research real → resultado a AKP → AthenaSignal consume → radar cambia → siguiente ciclo reconoce el estado → sobrevive restart/recovery.

## 3. BOUNDARY EPISTEMOLÓGICO

Mantener separación estricta: `SOURCE OBSERVATION · ASSERTION · EVIDENCE · RESEARCH FINDING · MODEL INTERPRETATION · EDITORIAL REFRAMING`. **Un resultado de AthenaOS no se convierte en fact por regresar**: conserva provenance y evaluación.

## 4. RECOVERY, IDEMPOTENCIA, MEMORIA

- Recovery: `process crash · node unavailable · LLM failure · research timeout · partial run · restart · resume` sin duplicación, pérdida histórica/provenance, falso promotion ni corrupción AKP.
- Idempotencia: reprocesar `candidate · research result · source · AKP message` debe ser seguro (sin duplicados lógicos).
- Memoria: la información histórica sobrevive `restart · redeploy · new run · new process · new milestone`; AthenaSignal sigue reconociendo su universo editorial.

## 5. CONTRATO AKP Y OBSERVABILIDAD

Preservar los contracts actuales salvo deficiencia demostrada; documentar cambios, mantener compatibilidad, provenance, identidad y trazabilidad.

Observabilidad mínima para responder: qué descubrió/descartó/mandó a AthenaOS/qué investiga/qué regresó/qué cambió/por qué/cuánto costó/qué falló/qué está pendiente.

## 6. BENCHMARK CLOSED-LOOP

Benchmark mayor que M5 con: `new signal · known · duplicate · related · reassessment · promotion · contradiction · research result · feedback update · node failure · process restart · LLM failure · AKP retry`. Combinar material real y casos reproducibles.

## 7. ACEPTACIÓN

- **A. Live Signal → AthenaOS:** un Research Candidate real llega a AthenaOS (o stand-in real documentado).
- **B. Real Research Result:** se produce investigación real sobre un candidate.
- **C. Return Path:** el resultado vuelve al conocimiento compartido (AKP).
- **D. Radar Mutation:** AthenaSignal cambia de estado por esa información nueva.
- **E. Continuous Operation:** el loop corre repetidamente sin intervención manual entre ciclos.
- **F. Distributed Capability:** Ubuntu y/o Mac mini participan y el sistema degrada si uno falla (o limitación documentada).
- **G. Scale:** procesa un universo mayor que M5 sin degradación catastrófica.
- **H. Historical Continuity:** el loop continúa tras reinicios y nuevas ejecuciones.
- **I. Recovery / Idempotency:** fallos y reintentos no corrompen.
- **J. Editorial Value:** evaluación humana confirma radar mejor informado.

Artefactos deterministas:

- `evidence/m6/corpus.json`, `evidence/m6/benchmark.json`
- `evidence/m6/loop-timeline.json`, `evidence/m6/radar-state.json`
- `evidence/m6/akp-live.json` (transporte/consumo), `evidence/m6/athenaos-results.json`
- `evidence/m6/feedback-updates.json` (mutaciones del radar)
- `evidence/m6/metrics.json`, `evidence/m6/cognitive-routing.json`, `evidence/m6/observability.json`
- `evidence/m6/recovery-events.json`, `evidence/m6/idempotency.json`, `evidence/m6/distributed.json`
- `evidence/m6/human-review-packet.json`
- `tests/closed-loop-e2e.test.ts` (offline, longitudinal, feedback + recovery)
- `scripts/m6-loop.ts` (orquestación determinista del loop)

Comando de aceptación oficial:

```bash
node --test --experimental-strip-types \
  tests/domain.test.ts tests/adapters.test.ts tests/signal-extractor.test.ts \
  tests/editorial-scorer.test.ts tests/pipeline-e2e.test.ts \
  tests/research-candidate-e2e.test.ts tests/autonomous-intelligence-e2e.test.ts \
  tests/editorial-radar-e2e.test.ts tests/platform-e2e.test.ts \
  tests/closed-loop-e2e.test.ts
```

Reproducibilidad: `node --experimental-strip-types scripts/m6-loop.ts` (salida canónica determinista).

## 8. NO FORMA PARTE DEL SCOPE

Plataforma de API genérica; dashboard/web final; generador de guiones; nueva capa de Governance; plataforma LLM genérica; cobertura universal de plataformas; memoria global MarioOS. Toda infraestructura se justifica por la capacidad funcional.

## 9. CONTINUACIÓN Y PARADA

No crear M6.1/M6.2…; scheduler/AKP/nodos/scale/feedback/performance son mecanismos internos. Continuar mientras el objetivo no esté demostrado ∧ la acción sea necesaria ∧ no haya Human Gate. Parar solo por: (A) capacidad completa; (B) Human Gate real; (C) bloqueo externo material no resoluble.

El Human Gate del worker aparece solo con una demostración madura: *"¿AthenaSignal y AthenaOS forman ya un sistema editorial que descubre, investiga, aprende y vuelve a actuar sobre lo aprendido?"*

## 10. HUMAN REVIEW PACKET

`evidence/m6/human-review-packet.json`: best closed-loop story · worst · most important feedback update · most difficult source/evidence update · major contradiction · major promotion · major failure and recovery · distributed execution example · long-running timeline · AKP→AthenaOS→AKP trace.

## 11. REPORTE FINAL

Entregar: MILESTONE STATUS · PRODUCT CAPABILITY · END-TO-END CLOSED LOOP · ATHENASIGNAL→AKP→ATHENAOS→AKP→ATHENASIGNAL · SOURCES · SCALE · LONG-RUN TIMELINE · COGNITIVE ROUTING · UBUNTU/MAC MINI/REMOTE · LLM USAGE · AKP LIVE CONSUMPTION · ATHENAOS RESULTS · FEEDBACK/RADAR MUTATIONS · DEDUP/CLUSTERS · REASSESSMENT · PROMOTIONS · CONTRADICTIONS · RECOVERY · IDEMPOTENCY · PERFORMANCE · COST PROXY · QUALITY METRICS · FAILURES FOUND AND FIXED · HUMAN REVIEW PACKET · LIMITATIONS · TECHNICAL DEBT · EXTERNAL BLOCKERS · EVIDENCE ARTIFACTS · REGRESSION · HUMAN GATES · NEXT MILESTONE.
