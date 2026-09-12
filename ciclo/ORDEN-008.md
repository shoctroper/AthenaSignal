# ORDEN-008 — MILESTONE M4: Continuous Editorial Radar

- **Fecha:** 2026-09-12
- **Emite:** Arquitecto
- **Estado:** VIGENTE — autorizado para ejecución vía GovernanceOs → OpenCode + DeepSeek
- **Documentos vinculantes:**
  - `decisiones/DU-001-MODELO-CONCEPTUAL-ATHENASIGNAL.md` (RATIFICADA)
  - `docs/athenaos-handoff-contract.md` (handoff AKP)
  - `docs/llm-provider-env.md` (proveedores reales)
  - `ciclo/ORDEN-007.md` (M3, cerrado; tests protegidos)

---

## 0. EXECUCIÓN INMEDIATA (LEER PRIMERO)

**No termines el turno describiendo intenciones.** Si escribes “voy a…”, haz la llamada a herramienta en el mismo turno. El turno solo termina cuando los artefactos de aceptación existen y `npm test` pasa.

**REGLA DURA DE SANDBOX (evita que el turno muera):**
- **NUNCA** `cd` fuera del worktree (`/Volumes/Medios/Repos/AthenaSignal`) ni escribas fuera de él (nada de `/tmp`, `~`, otros repos): la *external-directory permission* lo rechaza y termina el turno.
- Descarga/genera dentro del repo: `evidence/m4/`, `.m4tmp/`.
- Si un comando es rechazado, **no termines el turno**: reformúlalo sin salir del worktree y continúa.

**REGLA DE PRESUPUESTO (~50–90 min por ciclo):**
- Reutiliza `evidence/m3/recordings/` y la capa LLM/record-replay de M3; **no re-grabes** salvo que falte una respuesta nueva imprescindible.
- Primero deja `tests/editorial-radar-e2e.test.ts` verde y `scripts/m4-replay.ts` determinista; después mejora calidad.
- Usa timeouts explícitos en llamadas LLM (evita cuelgues).

Orden sugerido: (1) store persistente + esquema/identidad; (2) dedup/similarity + clustering; (3) event model temporal; (4) reassessment/priority dinámico; (5) recovery/idempotencia; (6) radar CLI + artefactos; (7) tests + replay; (8) benchmark multi-ciclo.

## 0bis. CORRECCIONES OBLIGATORIAS (revisión de producto del Líder Humano)

El milestone pasó la verificación estricta, pero la revisión de producto exige **calibrar la priorización** antes de cerrar. Corregir dentro del scope:

1. **D-M4-01 — Umbral HIGH no discriminante (MATERIAL).** Hoy `score >= 0.55 ⇒ HIGH` produce **6/7 candidates HIGH** (AirLLM y COFEPRIS con **1 sola fuente** a 0.5775). Debe existir discriminación real:
   - `HIGH` debe exigir simultáneamente un umbral de score más alto **y** evidencia/soporte suficiente (p. ej. `≥2 fuentes de evidencia`), de modo que un candidate mono-fuente no sea HIGH por defecto.
   - Usar `MEDIUM`/`LOW` de forma significativa. Objetivo observable: **HIGH minoría** (p. ej. ≤ 1/3 de los candidates), con el resto en MEDIUM/LOW/DISCARD.
   - La decisión debe ser explicable con `priorityReasons` (score + nº de fuentes + contradicción).
   - El test debe asertar la no-inflación (p. ej. ningún candidate con <2 fuentes de evidencia es HIGH; HIGH no es mayoría).
2. **D-M4-02 — Criterio de promoción explícito.** Promover debe requerir condiciones explícitas (p. ej. `HIGH` + `≥2 fuentes de evidencia` + sin contradicción bloqueante), y registrar `promotionReason` en el timeline/handoff. Hoy creatina (0.555) se promueve por encima de rabbitmq (0.765) sin justificación visible.
3. **D-M4-03 — Contradicción vs assessment.** Cuando un cluster queda `SUPPORTED` coexistiendo con `CONTRADICTED`, registrar una `resolutionNote` que explique por qué (p. ej. prevalece la fuente de mayor tier) para que el radar no se lea como contradictorio.
4. Re-ejecutar el radar (replay determinista) y regenerar `evidence/m4/*` con la nueva calibración; mantener las 10 categorías y la regresión (`npm test`).

No cerrar M4 hasta que la distribución de prioridad sea discriminante y esté explicada.

## 1. OBJETIVO FUNCIONAL

Evolucionar AthenaSignal de **“procesar una corrida”** a **“mantener inteligencia editorial a lo largo del tiempo”**: recordar lo descubierto, detectar lo nuevo, reconocer repeticiones, vincular fuentes relacionadas, incorporar evidencia nueva, reevaluar decisiones previas y cambiar prioridades — sin reconstruir contexto manualmente.

Flujo objetivo:

```
MULTIPLE SOURCES → CONTINUOUS DISCOVERY → SIGNAL MEMORY → DEDUPLICATION
→ CROSS-SOURCE LINKING → EVIDENCE EVOLUTION → REASSESSMENT
→ DYNAMIC PRIORITIZATION → EDITORIAL RADAR → RESEARCH CANDIDATES → ATHENAOS
```

**Pregunta de capacidad:** ¿qué puede hacer AthenaSignal después de M4 que antes no podía? → *Mantener un modelo vivo y persistente de qué oportunidades existen, cómo evolucionan y cuáles merecen atención ahora.*

## 2. COMPORTAMIENTO DEMOSTRABLE (multi-ciclo)

```
CYCLE 1  señal X descubierta → candidate MEDIUM
CYCLE 2  misma señal reaparece → no duplicar → vincular nueva fuente
CYCLE 3  evidencia nueva → reevaluar candidate
CYCLE 4  evidencia contradictoria → reflejar contradicción → cambiar estado/prioridad
CYCLE 5  nueva fuente relacionada → ampliar cluster
CYCLE 6  evidencia acumulada → candidate HIGH → listo para AthenaOS
```

Debe demostrar, cuando aplique: `NEW · KNOWN · DUPLICATE · RELATED · UPDATED · CONTRADICTED · REASSESSED · PRIORITY_CHANGED · DISCARDED · PROMOTED`.

## 3. AUTONOMÍA TÉCNICA

El worker decide dentro del scope: storage, schema, indexes, persistence, identity, similarity, dedup, clustering, ranking, temporal state, event model, incremental processing, retry, recovery, idempotency, scheduling, LLM orchestration, tool selection, adapters, caching, migration, API/CLI, test strategy, benchmark. No pedir autorización por decisiones ordinarias.

## 4. PRINCIPIO DE ARQUITECTURA

Preservar el boundary `AthenaSignal → Research Candidate → AthenaOS`. **No** absorber investigación profunda ni generación de guiones de AthenaOS. Preservar las relaciones `source · signal · assertion · evidence · interpretation · reframing · candidate`. Ninguna herramienta externa es autoridad epistemológica.

## 5. ESCALA

El corpus/pruebas deben **superar materialmente M3** (no repetir solo los mismos 10 inputs): múltiples ciclos, múltiples fuentes, repetición, novedad, contradicción, evolución, relaciones y reevaluación. La escala la determina el worker para revelar fallos reales. Se permite extender el corpus con fixtures registrados (record/replay) además de fuentes reales.

## 6. RECOVERY E IDEMPOTENCIA

Debe sobrevivir a interrupción de proceso, retry, reprocesamiento, fuentes repetidas y ejecución parcial. **Una nueva ejecución sobre material conocido no debe destruir el estado ni duplicar artificialmente.** Debe ser idempotente y auditable.

## 7. DEUDA DE M3

D-M3-01..04 (en `docs/M3-PRODUCT-REVIEW.md`) se corrigen **solo** si afectan el radar, producen falsos resultados materiales, bloquean la capacidad o son necesarias para acceptance. No perseguir perfección por sí misma.

## 8. EVIDENCIA

Cada comportamiento importante deja evidencia persistente y reconstruible: `cómo apareció → cómo se interpretó → qué evidencia existía → qué cambió → por qué cambió → qué prioridad tuvo → por qué llegó o no a AthenaOS`. No depender de la narrativa del worker.

## 9. VALIDACIÓN DE PRODUCTO

No detenerse en la implementación técnicamente funcional. Continuar hasta demostrar que **el radar mejora su comprensión del panorama a través del tiempo**. Generar un `human-review-packet` orientado a producto (no a código) con: **best candidate · worst candidate · largest priority change · most difficult deduplication · important contradiction · important reframing · important discard · candidate promoted to AthenaOS**.

## 10. CRITERIOS DE ACEPTACIÓN

1. **Persistent Signal Memory** — estado persistente entre ejecuciones/procesos.
2. **Continuous Discovery** — procesamiento incremental multi-ciclo.
3. **Historical Identity** — identidad estable de señales/candidates en el tiempo.
4. **Deduplication** — no duplica señales/fuentes repetidas.
5. **Cross-source Relationships** — vincula fuentes relacionadas / clusters.
6. **Evidence Evolution** — incorpora y registra evidencia nueva.
7. **Reassessment** — reevalúa candidates al cambiar la evidencia.
8. **Dynamic Prioritization** — prioridad cambia con la evidencia.
9. **Contradiction Handling** — refleja contradicciones.
10. **Recovery** — sobrevive interrupción/retry/reproceso.
11. **Idempotency** — repetir material conocido no altera el estado.
12. **Editorial Radar** — representación consultable del estado vivo.
13. **AthenaOS Handoff** — el handoff de M2/M3 sigue validando.
14. **Regression** — suite M1+M2+M3 sigue verde.
15. **Product Quality Review** — paquete de revisión humana.

Artefactos de aceptación deterministas:

- `evidence/m4/corpus.json`, `evidence/m4/benchmark.json`
- `evidence/m4/radar-timeline.json` (eventos por ciclo), `evidence/m4/radar-state.json` (estado persistido final)
- `evidence/m4/metrics.json` (conteos NEW/KNOWN/DUPLICATE/RELATED/UPDATED/CONTRADICTED/REASSESSED/PRIORITY_CHANGED/DISCARDED/PROMOTED)
- `evidence/m4/handoff-athenaos.json` (candidates promovidos, validado)
- `evidence/m4/human-review-packet.json`
- `tests/editorial-radar-e2e.test.ts` (offline, multi-ciclo, incluye recovery + idempotencia)
- `scripts/m4-replay.ts` (replay determinista; salida canónica)

Comando de aceptación oficial:

```bash
node --test --experimental-strip-types \
  tests/domain.test.ts tests/adapters.test.ts tests/signal-extractor.test.ts \
  tests/editorial-scorer.test.ts tests/pipeline-e2e.test.ts \
  tests/research-candidate-e2e.test.ts tests/autonomous-intelligence-e2e.test.ts \
  tests/editorial-radar-e2e.test.ts
```

Reproducibilidad: `node --experimental-strip-types scripts/m4-replay.ts` debe producir salida canónica determinista (incluyendo los ciclos y el estado final).

## 11. NO FORMA PARTE DEL SCOPE

Dashboard/web final; investigación profunda AthenaOS; generador de guiones; nueva infraestructura de Governance; plataforma LLM genérica; sistema universal de scraping; memoria global MarioOS. Toda infraestructura debe justificarse por la capacidad funcional.

## 12. REGLA DE PARADA

Continuar mientras: el objetivo no esté demostrado ∧ la siguiente acción sea necesaria ∧ no exista Human Gate real. **Detenerse** solo ante: (1) capacidad completa con evidencia reproducible; (2) Human Gate real (cambio de objetivo/arquitectura/contrato/principios, conflicto con decisión ratificada, o decisión estratégica); (3) imposibilidad material externa (devolver evidencia del bloqueo, no inventar).

Nunca detenerse solo porque: tests/lint/build pasan, una feature funciona, un adapter está listo, una integración se completó, una deuda se corrigió, un benchmark existe o una herramienta se integró.

## 13. REPORTE FINAL

Al cerrar, entregar: MILESTONE STATUS · PRODUCT CAPABILITY DEMONSTRATED · ¿QUÉ PUEDE HACER AHORA QUE ANTES NO? · CORPUS/CICLOS · EVENTOS POR CATEGORÍA · DEDUP/CLUSTERS · EVOLUCIÓN DE EVIDENCIA · CONTRADICCIONES · REASSESSMENT/PRIORITY CHANGES · RECOVERY/IDEMPOTENCIA · RADAR ESTADO · ATHENAOS HANDOFF · EVIDENCE ARTIFACTS · BENCHMARK · MÉTRICAS · REGRESIÓN · HUMAN REVIEW PACKET · LIMITACIONES · ISSUES · HUMAN GATES · NEXT MILESTONE.
