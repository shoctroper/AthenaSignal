# ORDEN-009 — MILESTONE M5: Autonomous Editorial Intelligence Platform

- **Fecha:** 2026-09-12
- **Emite:** Arquitecto
- **Estado:** VIGENTE — autorizado para ejecución vía GovernanceOs → OpenCode + DeepSeek
- **Vinculantes:** `decisiones/DU-001` (RATIFICADA) · `docs/athenaos-handoff-contract.md` · `docs/llm-provider-env.md` · `ciclo/ORDEN-008.md` (M4) · `docs/M4-PRODUCT-REVIEW.md`

---

## 0. EXECUCIÓN INMEDIATA (LEER PRIMERO)

**No termines el turno describiendo intenciones.** Si escribes “voy a…”, haz la llamada a herramienta en el mismo turno. El turno termina solo cuando los artefactos de aceptación existen y `npm test` pasa.

**SANDBOX (evita que el turno muera):**
- **NUNCA** `cd` fuera del worktree (`/Volumes/Medios/Repos/AthenaSignal`) ni escribas fuera de él (`/tmp`, `~`, otros repos): la *external-directory permission* lo rechaza y termina el turno.
- Genera dentro del repo: `evidence/m5/`, `.m5tmp/`, `data/`.
- Si un comando es rechazado, **no termines el turno**: reformúlalo y continúa.

**PRESUPUESTO (~50–90 min por ciclo):**
- Reutiliza `evidence/m3/recordings/` y `evidence/m4/radar-state.json`; **no re-grabes** salvo lo imprescindible.
- Primero deja `tests/platform-e2e.test.ts` verde y `scripts/m5-replay.ts` determinista; después mejora.
- Timeouts explícitos en toda llamada LLM/red.

**REALIDAD DEL ENTORNO (no bloquees por nodos ausentes):**
- El worker corre en este Mac (Ollama local `http://localhost:11434`, SearXNG `http://localhost:8888`).
- Los nodos Ubuntu (Ryzen 7 4800U) y Mac mini M4 **pueden no ser alcanzables**. Implementa la topología de forma **abstracta** con health-check + timeout + fallback; si un nodo remoto no responde, degrada a local o a fallback determinista. **No** falles por nodos ausentes.
- AKP/AthenaOS **no exponen hoy un endpoint vivo**. Implementa una integración **real pero abstracta** (sink de archivo/cola + validador del contrato); si hay endpoint HTTP legítimo, úsalo; si no, documenta la limitación y persiste el handoff de forma consumible. **No** simules que AthenaOS consumió algo.

Orden sugerido: (1) cognitive runtime + routing; (2) store persistente con continuidad histórica; (3) ingesta programada/incremental; (4) pipeline multi-fuente; (5) recovery/idempotencia multi-proceso; (6) AKP integration sink + validador; (7) observabilidad + métricas; (8) benchmark de escala; (9) test longitudinal + replay; (10) human-review-packet.

## 0bis. CORRECCIONES OBLIGATORIAS (revisión de producto del Líder Humano)

M5 pasó la verificación estricta, pero la revisión de producto exige **reforzar** antes de cerrar. Corregir dentro del scope:

1. **Escala de fuentes únicas (MATERIAL).** Hoy 48 ciclos/132 inputs pero solo **16 fuentes únicas**. Ampliar a un corpus materialmente mayor de **fuentes únicas reales** (objetivo de referencia: **≥50–100 fuentes únicas**), manteniendo calidad: el aumento de escala **no** debe elevar linealmente el ruido/candidates. Demostrar throughput, dedup y quality a esa escala, con `uniqueSources` y `inputsObserved` claramente mayores.
2. **`replayMisses` a cero (integridad de reproducibilidad).** Hoy `replayMisses: 43` y 43 respuestas deterministas por etapas no grabadas. El replay offline debe quedar **completo**: 0 misses (grabar lo faltante o hacer que la ruta offline no requiera esas respuestas). `llm.replayMisses === 0` y el test debe asertarlo.
3. **Consumidor AKP real (cerrar `consumed: 0`).** Implementar un **consumidor/ingestor real** (proceso/comando separado) que lea `evidence/m5/akp-sink/*.json`, valide contra el contrato y **ingiera** en un repositorio local AKP-compatible (p. ej. `data/akp-inbox/` o SQLite), registrando `akp.consumed > 0` y el artefacto de lado-AKP resultante. Si existiera endpoint HTTP legítimo, usarlo; si no, el consumidor local **modela la ingesta de AKP** y se documenta que es el stand-in hasta que exista endpoint. No afirmar que AthenaOS consumió si no ocurrió: registrar el consumo del **consumidor AKP** y su resultado.
4. Re-ejecutar el replay determinista y regenerar `evidence/m5/*` con lo anterior; mantener todas las categorías, recovery, idempotencia y `npm test`.

No cerrar M5 hasta que (1) la escala de fuentes únicas sea materialmente mayor, (2) `replayMisses` sea 0 y (3) exista consumo AKP real (o endpoint vivo).

## 1. MISIÓN

Convertir AthenaSignal en un sistema de **inteligencia editorial autónoma y de larga duración**: opera múltiples ciclos sobre un universo cambiante, conserva memoria histórica, descubre señales, actualiza conocimiento, usa inferencia local eficiente y entrega Research Candidates vivos a AKP.

```
EXTERNAL WORLD → SOURCES → CONTINUOUS INGESTION → SIGNAL DISCOVERY → COGNITIVE TRIAGE
→ INITIAL RESEARCH → EVIDENCE → HISTORICAL MEMORY → DEDUP/LINK/CLUSTER/REASSESS
→ DYNAMIC PRIORITIZATION → EDITORIAL RADAR → RESEARCH CANDIDATES → LIVE AKP → ATHENAOS
```

**Pregunta de aceptación:** ¿podemos dejar AthenaSignal operando y volver después para encontrar un radar que **continuó aprendiendo**, filtrando, relacionando, priorizando y entregando oportunidades útiles?

## 2. OBJETIVOS FUNCIONALES

1. **Continuidad de largo plazo:** `START → RUN → PERSIST → STOP → RESTART → RESUME` sin perder señales, identidad, relaciones, evidencia, historial, prioridades ni estado; el reinicio no crea un universo nuevo.
2. **Ingesta programada y continua:** observar fuentes repetidamente (`new | known | process novelty`). Scheduler/job-queue a criterio del worker; solo cuenta si **sostiene el radar**.
3. **Escala material:** superar M4 (10 fuentes/6 ciclos) — referencia **decenas→cientos** de inputs, sin cargar todo en memoria ni intervención humana entre entradas. Medir throughput/latencia/coste/memoria/LLM/research/dedup/calidad. **No** sacrificar calidad por throughput.
4. **Local-first cognitive runtime:** abstracción `CognitiveProvider` + `EmbeddingProvider`; preferencia `LOCAL → LOCAL-ALT → REMOTE-ESCALATION → DETERMINISTIC SAFE FALLBACK`; core desacoplado del proveedor.
5. **Multi-source observation:** video/social, web, GitHub, docs oficiales, académico, multilingüe — arquitectura reusable, sin cobertura universal.
6. **Continuidad histórica:** material conocido sigue en el historial; señales de M4 reaparecen con **misma identidad** (importar `evidence/m4/radar-state.json`), sin reiniciar el universo.
7. **Temporal intelligence:** trayectoria de prioridad/evidencia conservada (MEDIUM→HIGH→…→PROMOTED).
8. **Stable prioritization:** preservar la calibración de M4 (HIGH no trivial; fuentes/evidencia/contradicción/researchability) con razones auditables.
9. **Live AKP integration:** integración funcional real cuando haya acceso legítimo; mantener `athenasignal.research_candidate.handoff.v1` o documentar migración.
10. **Live promotion:** promover sin intervención humana por candidate (autoridad humana solo para producto).
11. **Noise control:** más fuentes ≠ más ruido; descarte/dedup/grouping/priorización/stale detection.
12. **Toolchain evolution:** adoptar herramientas solo si habilitan capacidad real (qué problema, por qué, cobertura, fiabilidad, provenance). Desacoplar el dominio.
13. **Multilingual research:** descubrir/entender/relacionar/evaluar material equivalente en varios idiomas conservando idioma/provenance/tier/origen; output normalizado en español.
14. **Recovery & resilience:** proceso muerto, LLM caído, nodo remoto indisponible, timeout, fuente repetida, respuesta inválida, corrida parcial → fallback/retry/skip/resume sin duplicar/corromper/perder provenance ni fabricar evidencia.
15. **Operational observability:** qué procesa/terminó/falló/por qué/provider/coste/pendiente/promovido. Solo lo necesario.

## 3. NODOS Y RUTEO DE MODELOS

Topología conceptual `Ubuntu(orquestación/ingesta/memoria) → Cognitive Router → {Ubuntu Ollama, Mac mini Ollama, Remote}`. Con health-check, fallback, timeout, recuperación y observabilidad. Si un nodo no está, continuar por otra ruta viable. Ruteo por complejidad (`fast → extraction`, `stronger local → reasoning`, `embedding → similarity`, `remote → escalation justificado`); política explicable; no crear routing sin ventaja real.

## 4. VALIDACIÓN LONGITUDINAL (no simulada)

Demostrar con **estado persistente real** y **reinicio de proceso**:
`START → PROCESS → PERSIST → DISCOVER → UPDATE → RESTART → RESUME → DISCOVER AGAIN → PROMOTE → HANDOFF`.
Una ejecución posterior sobre material conocido no debe duplicar ni reiniciar.

## 5. BENCHMARK Y MÉTRICAS

Benchmark sustancialmente mayor que M4, combinando material real, conocido, adversarial, ruido y evolucionable, con casos: `NEW · KNOWN · DUPLICATE · RELATED · AMBIGUOUS · SUPPORTED · UNSUPPORTED · REFRAMED · CONTRADICTED · DISCARD · PROMOTION · PRIORITY_CHANGE · MULTILINGUAL · CROSS_SOURCE · RECOVERED`.

Métricas mínimas: sources processed · runs · cycles · signals · new/known/duplicates/related · clusters · candidates · discarded · supported/unsupported/ambiguous/reframed/contradicted/reassessed · promoted · priority changes · evidence updates · avg sources/candidate · LLM calls · local/remote · fallbacks · research queries · processing time · recovery events · idempotency events · AKP handoffs.

## 6. PRODUCT QUALITY REVIEW

Generar `evidence/m5/human-review-packet.json` para juzgar: ¿mejora con el tiempo? ¿reconoce lo conocido? ¿encuentra nuevo? ¿no duplica? ¿relaciona? ¿mantiene contradicciones? ¿actualiza decisiones? ¿prioriza útilmente? ¿evita saturar AthenaOS? ¿entrega candidates investigables? Orientado a **comportamiento de producto**, no a código.

## 7. CRITERIOS DE ACEPTACIÓN

CONTINUOUS INGESTION · LONG-TERM MEMORY · MULTI-SOURCE DISCOVERY · COGNITIVE ROUTING · HISTORICAL CONTINUITY · DEDUPLICATION · CROSS-SOURCE LINKING · EVIDENCE EVOLUTION · REASSESSMENT · DYNAMIC PRIORITIZATION · NOISE CONTROL · RECOVERY · IDEMPOTENCY · SCALABLE OPERATION · LIVE AKP HANDOFF · ATHENAOS CONSUMPTION (o limitación documentada) · REPRODUCIBLE EVIDENCE · REGRESSION PASS · PRODUCT QUALITY REVIEW.

Artefactos de aceptación deterministas:

- `evidence/m5/corpus.json`, `evidence/m5/benchmark.json`
- `evidence/m5/run-timeline.json` (multi-proceso), `evidence/m5/radar-state.json` (persistido)
- `evidence/m5/metrics.json`, `evidence/m5/cognitive-routing.json`, `evidence/m5/observability.json`
- `evidence/m5/recovery-events.json`, `evidence/m5/idempotency.json`
- `evidence/m5/akp-handoff.json` (integración + handoff validado)
- `evidence/m5/human-review-packet.json`
- `tests/platform-e2e.test.ts` (offline, longitudinal, reinicio + idempotencia + escala)
- `scripts/m5-replay.ts` (orquestación determinista multi-ciclo/reinicio)

Comando de aceptación oficial:

```bash
node --test --experimental-strip-types \
  tests/domain.test.ts tests/adapters.test.ts tests/signal-extractor.test.ts \
  tests/editorial-scorer.test.ts tests/pipeline-e2e.test.ts \
  tests/research-candidate-e2e.test.ts tests/autonomous-intelligence-e2e.test.ts \
  tests/editorial-radar-e2e.test.ts tests/platform-e2e.test.ts
```

Reproducibilidad: `node --experimental-strip-types scripts/m5-replay.ts` (salida canónica determinista).

## 8. NO FORMA PARTE DEL SCOPE

Dashboard/web final; investigación profunda AthenaOS; generador de guiones; plataforma LLM genérica; nueva infraestructura de Governance; memoria global MarioOS; cobertura universal de plataformas. Toda infraestructura debe justificarse por la capacidad funcional.

## 9. REGLAS DE CONTINUACIÓN Y PARADA

No crear M5.1/M5.2…; scheduler/persistence/AKP/scale/routing/dedup son mecanismos internos. Continuar mientras el objetivo no esté demostrado ∧ la acción sea necesaria ∧ no haya Human Gate. Parar solo por: (A) objetivo demostrado con evidencia reproducible; (B) Human Gate auténtico; (C) bloqueo material no resoluble. Nunca parar solo porque una pieza esté lista.

## 10. DEUDA PREVIA

D-M3-01..04 y D-M4-R1..R3 se corrigen solo si afectan M5 o bloquean acceptance (ver `docs/M3-PRODUCT-REVIEW.md`, `docs/M4-PRODUCT-REVIEW.md`).

## 11. REPORTE FINAL

Entregar: MILESTONE STATUS · PRODUCT CAPABILITY DEMONSTRATED · SYSTEM ARCHITECTURE · NODE TOPOLOGY · COGNITIVE PROVIDERS · MODEL ROUTING · SOURCES · SCALE BENCHMARK · CYCLES · SIGNALS · DEDUPLICATION · CLUSTERS · EVIDENCE EVOLUTION · REASSESSMENT · PRIORITY EVOLUTION · PROMOTIONS · NOISE CONTROL · RECOVERY · IDEMPOTENCY · AKP INTEGRATION · ATHENAOS CONSUMPTION · TOOLS USED/REJECTED · COST/PERFORMANCE · LLM USAGE · LOCAL VS REMOTE · QUALITY METRICS · HUMAN REVIEW PACKET · FAILURES FOUND AND FIXED · LIMITATIONS · TECHNICAL DEBT · UNRESOLVED ISSUES · EVIDENCE ARTIFACTS · REGRESSION RESULTS · HUMAN GATES REQUIRED · RECOMMENDED NEXT PRODUCT MILESTONE.
