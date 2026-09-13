# ORDEN-012 — MILESTONE M8: Sustained Autonomous Editorial Operation

- **Fecha:** 2026-09-12
- **Emite:** Arquitecto
- **Estado:** VIGENTE — GovernanceOs → OpenCode + DeepSeek. **Scope cross-repo autorizado.**
- **Vinculantes:** `ciclo/ORDEN-011.md` (M7) · `docs/M7-PRODUCT-REVIEW.md` · `docs/athenaos-handoff-contract.md` · `docs/llm-provider-env.md`

---

## 0. EJECUCIÓN INMEDIATA (LEER PRIMERO)

**No termines el turno describiendo intenciones.** El turno termina solo cuando los artefactos `evidence/m8/*` existen y `npm test` pasa.

**SANDBOX:** `opencode.json` habilita `external_directory=allow`. Puedes **leer/ejecutar** `AthenaFramework`, `AthenaKnowledge`, `AthenaOS` y **SSH al nodo Ubuntu `athena`**. **Escribe solo dentro de AthenaSignal** (evidence, código). No modifiques el código fuente externo; invócalo/construye y documenta.

**COMPONENTES REALES (verificados, úsalos en vez de stand-ins):**
- **Ubuntu `athena`** = `192.168.0.36` (Linux, 16 cores, 14 GiB) **REACHABLE** vía `ssh -o BatchMode=yes athena '<cmd>'`. Úsalo como nodo real de ejecución (scheduler/ingesta/research/Ollama/SearXNG si están allí).
- **Mac mini M4** (`192.168.0.149`) **NO alcanzable** (ping loss, Ollama timeout) → **documenta** la exclusión en `evidence/m8/distributed.json`; no simules su participación.
- **AthenaOS engine REAL:** `dotnet /Volumes/Medios/Repos/AthenaFramework/src/Athena.Cli/bin/Release/net9.0/athena.dll <cmd>` (`run --topic "<pregunta>" [--knowledge <dir>]`, `list`, `show`, `export`, `grafo search/embed`, `doctor`). Config por env: `ATHENA_LLM_PROVIDER=gemini|template|stub`, `ATHENA_LLM_API_KEY`, `ATHENA_HOME`. Verificado: `doctor`/`list` corren; **gemini está agotado (429)** → usa `template`/`stub` o un proveedor real disponible; documenta.
- **AKP ingestion REAL:** `cd /Volumes/Medios/Repos/AthenaKnowledge/athena-knowledge-ingestion && dotnet build` → ejecuta `AthenaKnowledge.Ingestion.Cli` sobre `data/source-documents` → `KnowledgeRepository/` + `runs/ingestion-run-report.json`.

**PRESUPUESTO:** reutiliza recordings/estado M6/M7; primero deja `tests/sustained-operation-e2e.test.ts` verde y `scripts/m8-operation.ts` determinista; timeouts explícitos en LLM/SSH.

## 0bis. CORRECCIONES OBLIGATORIAS (revisión de producto del Líder Humano)

M8 pasó la verificación estricta, pero la revisión de producto exige **profundizar**. Corregir dentro del scope:

1. **Operación de reloj real (MATERIAL).** Hoy la ventana es una proyección comprimida (24 ticks con fechas futuras). Ejecuta el scheduler en **tiempo de reloj real**, con `startedAt`/`endedAt` **reales** (no fechas simuladas), durante una ventana genuina acotada por el presupuesto del worker (objetivo: **≥20–30 min reales** de ticks continuos, o el máximo posible). `operation-timeline.json` y `scheduler.json` deben usar timestamps reales verificables.
2. **AthenaOS ejecutando investigación real (MATERIAL).** Hoy solo se invocó `athena.dll list`/`doctor`. Ejecuta `athena run --topic "<research question>" --knowledge <AKP KnowledgeRepository>` **end-to-end** para al menos un candidate y **captura el caso/artefacto resultante** (`list`/`show`/`export`). Si el proveedor gemini está agotado, intenta un proveedor real disponible; si AthenaOS no permite otro proveedor, usa `template`/`stub` **ejecutando el motor real** y **documenta** la limitación de proveedor (no lo omitas).
3. **AKP real end-to-end.** Construye (`dotnet build`) y ejecuta `AthenaKnowledge.Ingestion.Cli` sobre `data/source-documents`, y **usa** el `KnowledgeRepository`/`runs/ingestion-run-report.json` producido como parte del handoff hacia AthenaOS.
4. **Más resoluciones epistémicas.** Forzar **≥1 caso REFUTED adicional** y **≥1 CONFIRMED adicional** basados en evidencia/provenance (no etiquetas), además de los existentes.
5. Re-ejecutar el replay determinista y regenerar `evidence/m8/*`, manteniendo recovery, idempotencia, provenance completa y `npm test` verde.

No cerrar M8 hasta que (1) haya una ventana de reloj real, (2) AthenaOS ejecute un research job real (o limitación de proveedor documentada), (3) AKP corra end-to-end, y (4) existan más resoluciones CONFIRMED/REFUTED.

## 1. MISIÓN

Operación **editorial autónoma y sostenida** sobre la infraestructura real disponible, manteniendo el circuito `AthenaSignal → AKP → AthenaOS → AKP → AthenaSignal` en ejecución continua, recuperable y orientada a valor editorial real. Preferir **motores reales** AthenaOS/AKP cuando puedan ejecutarse.

## 2. ACCEPTANCE

1. Loop operativo real AthenaSignal→AKP→AthenaOS→AKP→AthenaSignal.
2. **Motores reales** AthenaOS (`athena.dll`) y AthenaKnowledge (CLI) usados vía sus interfaces; evitar stand-ins cuando puedan ejecutarse.
3. **Scheduler/operación continua real** (no solo simulación de ciclos): un proceso sostenido que descubre → triage → candidate → AKP → AthenaOS → resultado → feedback → radar, durante una **ventana prolongada** verificable.
4. **Corpus ≫ M7** (M7: 500 fuentes) — objetivo ≥1000 fuentes únicas o equivalente con ciclos sostenidos.
5. Generación, investigación, resolución y actualización de Research Candidates **durante** la operación.
6. Resultados de AthenaOS producen **cambios observables** en evidencia/estado/prioridad/promoción/democión/cierre/reapertura.
7. Estados epistemológicos (CONFIRMED/REFUTED/UNCERTAIN/CLOSED/REOPENED…) coherentes y trazables; `statusHistory` completo.
8. **Infraestructura real**: Ubuntu `athena` participa cuando corresponde; Mac mini documentado como no disponible.
9. **Failover/recovery** ante fallo real de proceso/proveedor/nodo reproducible.
10. **Idempotencia** sin pérdida de historial ni duplicación lógica.
11. **Provenance completa** `source → signal → candidate → evidence → research result → radar`.
12. **Handoff y retorno verificables**.
13. **Métricas** de calidad, latencia, uso de LLM y coste/proxy durante operación sostenida.
14. **Regresión M1–M7** sin fallos.
15. Evidencia ejecutable, reproducible y auditable. Human Gate solo tras demostración completa.

## 3. PRODUCT SUCCESS

Demostrar: *"AthenaSignal puede operar autónomamente durante una ventana prolongada, descubrir material nuevo, producir Research Candidates, enviarlos a AthenaOS para investigación real, recibir conocimiento nuevo, modificar coherentemente su radar y continuar el ciclo sin coordinación manual entre iteraciones."*

## 4. ARTEFACTOS DETERMINISTAS (`evidence/m8/`)

- `operation-timeline.json` · `scheduler.json` (ventana, ciclos, procesos)
- `corpus.json` · `benchmark.json` · `radar-state.json`
- `akp-live.json` · `athenaos-real.json` (invocaciones reales + salidas) · `feedback-updates.json`
- `epistemic-resolutions.json` · `contradictions.json`
- `distributed.json` (ubuntu/ macmini real vs documentado) · `recovery-events.json` · `idempotency.json`
- `provenance.json` · `handoff-trace.json` · `metrics.json` · `observability.json` · `cost.json`
- `human-review-packet.json`
- `tests/sustained-operation-e2e.test.ts` (offline, longitudinal, scheduler + engine + recovery)
- `scripts/m8-operation.ts` (scheduler/loop determinista)

Comando de aceptación:

```bash
node --test --experimental-strip-types \
  tests/domain.test.ts tests/adapters.test.ts tests/signal-extractor.test.ts \
  tests/editorial-scorer.test.ts tests/pipeline-e2e.test.ts \
  tests/research-candidate-e2e.test.ts tests/autonomous-intelligence-e2e.test.ts \
  tests/editorial-radar-e2e.test.ts tests/platform-e2e.test.ts \
  tests/closed-loop-e2e.test.ts tests/epistemic-resolution-e2e.test.ts \
  tests/sustained-operation-e2e.test.ts
```

Reproducibilidad: `node --experimental-strip-types scripts/m8-operation.ts` (salida canónica determinista).

## 5. CONTINUACIÓN Y PARADA

No micro-milestones (scheduler, integración, distribución, failover, escala, routing, observabilidad, performance son trabajo interno). Continuar mientras el objetivo no esté completo ∧ la acción sea necesaria ∧ no haya Human Gate. Parar solo por: capacidad completa con evidencia · Human Gate real · bloqueo externo material no resoluble.

## 6. HUMAN REVIEW PACKET

`evidence/m8/human-review-packet.json`: duración/timeline · best/worst story · CONFIRMED/REFUTED/UNCERTAIN/CLOSED · radar mutations · promotion/demotion/reopening/closure · Ubuntu execution · failover/recovery · AKP→AthenaOS→AKP trace · metrics (calidad/latencia/coste).

## 7. REPORTE FINAL

Entregar: duración y timeline · fuentes y escala · candidates producidos · investigaciones ejecutadas · CONFIRMED/REFUTED/UNCERTAIN/CLOSED · mutaciones del radar · promotions/demotions/reopenings/closures · uso Ubuntu/Mac mini · fallos y failover · recovery/idempotency · LLM routing y consumo · AKP/AthenaOS real · provenance · métricas calidad/performance/coste · regresiones · limitaciones · deuda técnica · evidencia/artifacts · Human Review Packet · siguiente milestone.
