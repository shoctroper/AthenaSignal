# ORDEN-007 — MILESTONE M3: Autonomous Signal Intelligence

- **Fecha:** 2026-09-11
- **Emite:** Arquitecto
- **Estado:** VIGENTE — autorizado para ejecución vía GovernanceOs → OpenCode + DeepSeek
- **Documentos vinculantes:**
  - [DU-001 — Modelo Conceptual](file:///Volumes/Medios/Repos/AthenaSignal/decisiones/DU-001-MODELO-CONCEPTUAL-ATHENASIGNAL.md) (RATIFICADA)
  - [RFC-006 — Adquisición MCP y Deep Search](file:///Volumes/Medios/Repos/AthenaSignal/decisiones/RFC-006-MOTOR-DE-BUSQUEDA-Y-VERIFICACION-DE-CLAIMS.md) (RATIFICADO)
  - [Handoff AKP vendoreado](./../docs/athenaos-handoff-contract.md) (M2)
  - [Proveedores LLM/búsqueda del entorno](./../docs/llm-provider-env.md)

---

## 0. EXECUCIÓN INMEDIATA (LEER PRIMERO)

**No termines el turno describiendo intenciones.** Si escribes “voy a…”, en el mismo turno haz la llamada a herramienta. El turno solo termina cuando los artefactos de aceptación existen y los tests pasan.

Orden de trabajo sugerido (ajústalo si hace falta, pero empieza ya):

1. Crea `src/llm/LLMProvider.ts` (Ollama real vía `LOCAL_OLLAMA_HOST`, fallback DeepSeek por env, fallback determinista).
2. Crea `src/research/tools/` (SearXNG `http://localhost:8888` + fetch).
3. Construye el corpus real y **regístralo** en `evidence/m3/corpus.json` + `evidence/m3/recordings/`.
4. Implementa el pipeline cognitivo (discovery → assertion → research → assessment → reframing → priorización → candidate) usando el LLM real.
5. Ejecuta el batch y produce `evidence/m3/{signals,candidates,metrics,benchmark,handoff-athenaos,human-review-packet}.json`.
6. Crea `tests/autonomous-intelligence-e2e.test.ts` (offline, replay) y `scripts/m3-replay.ts`.
7. `npm test` verde y `node --experimental-strip-types scripts/m3-replay.ts` determinista.

No necesitas leer todo el repo ni todas las decisiones: `docs/llm-provider-env.md` tiene la config real, `docs/athenaos-handoff-contract.md` el handoff, y esta orden el resto. Empieza a implementar.

**REGLA DURA DE SANDBOX (evita que el turno muera):**
- **NUNCA** hagas `cd` fuera del worktree (`/Volumes/Medios/Repos/AthenaSignal`). Un `cd` externo es rechazado por permisos y termina tu turno.
- **NUNCA** escribas fuera del worktree (nada de `/tmp`, `~`, ni otros repos). Usa rutas relativas dentro del repo: `evidence/m3/`, `.m3tmp/` (bajo el repo), etc.
- Agrupa comandos sin `cd` externo: usa `curl ... -o evidence/m3/raw/archivo` con `mkdir -p evidence/m3/raw` (dentro del repo).
- Si un comando es rechazado, **no termines el turno**: reformúlalo sin salir del worktree y continúa.

**REGLA DE PRESUPUESTO (el worker tiene ~50 min por ciclo):**
- Si `evidence/m3/recordings/llm.json` y `tools.json` YA existen, **no re-grabes** salvo bug bloqueante; reutilízalos para el replay offline.
- Prioriza primero crear `tests/autonomous-intelligence-e2e.test.ts` y dejar `npm test` verde, y después mejorar calidad. Un ciclo que graba pero no deja el test no cierra el milestone.
- Usa tiempos de espera explícitos en llamadas LLM (evita cuelgues).

## 0bis. CORRECCIONES OBLIGATORIAS (revisión de calidad del Arquitecto)

La verificación estricta pasó, pero la revisión de calidad detectó **falsos positivos** que deben corregirse dentro del scope (no son Human Gate):

1. **CASO AirLLM (`sig-src-airllm-claim-1`) — CRÍTICO.** El candidate se marca `REFRAMED` pero:
   - `researchQuestion` es el claim original sin reformular.
   - `initialFindings` incluye el claim original como `kind: EVIDENCE` — **viola ORDEN-007 §3 y §4 (#4 Epistemic Safety)**.
   - `assertionAnalysis.hypotheses` presenta el claim como hipótesis viable.
   - `reframingNote` vacío; faltan los hechos reales (VRAM≠RAM, versión/modelo real, límites medidos).
   **Debe**: marcar el claim como no sustentado, reformular a una pregunta investigable (p. ej. “¿qué puede lograr realmente AirLLM en hardware de consumo ~12 GB y con qué modelo?”), rellenar `reframingNote`, y garantizar que el claim original **no** aparezca como `EVIDENCE` ni en `proposedCandidateFacts`. El test debe asertar esta invariante anti-amplificación.
2. **Discriminación (`M << N`).** Hoy 10 fuentes → 12 candidates (M≈N). Debe existir selección real: descartar señales de bajo valor con `reason`, apuntando a `M << N` (y `DISCARDED` explícito).
3. **Campos malformados:** eliminar `null`/valores vacíos en `proposedCandidateFacts`, `reframingNote`, `priorityReasons`, etc. Todo candidate debe ser consumible por AKP.
4. **Priorización explicable:** `HIGH` solo con justificación fuerte y consistente con `priorityReasons`; revisar la distribución.
5. Re-grabar solo lo imprescindible (reutilizar `evidence/m3/recordings/` y registrar únicamente lo que cambie).

No cerrar el milestone hasta que el CASO AirLLM pase la invariante anti-amplificación.

## 1. OBJETIVO

Convertir AthenaSignal de un vertical slice determinista en un **sistema autónomo de descubrimiento, evaluación y priorización editorial** que procesa **fuentes reales desconocidas** y produce **Research Candidates priorizados** para AthenaOS.

Flujo objetivo:

```
MULTIPLE REAL SOURCES → INGESTION → CONTENT EXTRACTION → SIGNAL DISCOVERY
→ IDEA/ASSERTION EXTRACTION → INITIAL RESEARCH → EVIDENCE COLLECTION
→ CLAIM ASSESSMENT → RESEARCHABILITY → REFRAMING → EDITORIAL VALUE
→ PRIORITIZATION → RESEARCH CANDIDATES → ATHENAOS HANDOFF
```

Debe operar sobre material **no seleccionado manualmente**: el sistema recibe fuentes y descubre por sí mismo qué merece investigación, qué es ruido y qué debe descartarse.

## 2. AUTORIDAD Y AUTONOMÍA

El worker tiene autonomía total dentro del scope: descomposición, implementación, pruebas, corrección, selección de librerías/adapters/prompts/schemas, tool wiring, caching, retries, fallback, fixtures y reemplazo de herramientas dentro del mismo propósito. Trabajar sostenidamente hasta acceptance.

**Human Gate solo si** cambia materialmente: objetivo, arquitectura fundamental, autoridad, decisión ratificada, contrato AthenaSignal→AthenaOS, límites epistemológicos, o falta decisión humana indispensable.

**PERSISTENCIA:** no terminar el turno mientras haya trabajo en scope. Si una herramienta externa es rechazada por permisos, buscar alternativa local y continuar.

## 3. PRINCIPIO EPISTEMOLÓGICO (separación obligatoria)

`DISCOVERY` · `OBSERVATION` · `ASSERTION` · `EVIDENCE` · `MODEL_INTERPRETATION` · `EDITORIAL_REFRAMING` · `RESEARCH_CANDIDATE`.

- Una afirmación de un video **no** se convierte en hecho por repetición.
- Una inferencia del modelo **no** es evidencia.
- Una fuente de descubrimiento no adquiere autoridad de evidencia por defecto.
- Un claim falso puede producir una pregunta válida si hay realidad subyacente investigable.

## 4. CAPA COGNITIVA REAL (obligatoria)

Debe participar un LLM real en: signal extraction, idea normalization, assertion decomposition, research question generation, evidence interpretation, researchability assessment, reframing, editorial relevance, candidate generation, prioritization.

Abstracción `LLMProvider` con **cadena de resiliencia**: proveedor primario → fallback → **fallback determinista**. `core` no atado a un proveedor. Sin LLM, el comportamiento debe ser seguro: **nunca** degradar una assertion a `FACT` por falta de modelo.

## 5. ENTORNO REAL DISPONIBLE (vendoreado)

Detalle completo en `docs/llm-provider-env.md`. Resumen:

- **LLM local garantizado (sin key):** Ollama OpenAI-compatible en `http://localhost:11434/v1/chat/completions`; modelos disponibles `qwen2.5:7b-instruct`, `gpt-oss:20b`, `qwen3.6:35b-a3b`. El repo `.env` ya declara `LOCAL_OLLAMA_HOST=http://localhost:11434`.
- **LLM remoto opcional:** DeepSeek `https://api.deepseek.com` modelo `deepseek-v4-flash`, key `DEEPSEEK_API_KEY` (puede no estar disponible en el entorno del worker; implementar vía env y degradar a Ollama).
- **Búsqueda real:** **SearXNG** en `http://localhost:8888/search?q=<query>&format=json` (resultados reales). Usar para descubrimiento/evidencia.
- **Fetch de documentos:** `curl`/`webfetch` (permitido). **Lectura de archivos fuera del worktree puede estar bloqueada**; no depender de ella.

La ruta de aceptación es **offline determinista** mediante **record/replay**: el worker ejecuta una vez contra LLM/búsqueda reales, **registra** respuestas en `evidence/m3/recordings/`, y los tests reproducen sin red.

## 6. SOURCE POLICY (explícita)

Distinguir al menos: `DISCOVERY` · `EVIDENCE` · `PRIMARY` · `SECONDARY` · `TERTIARY` · `BLOCKED`. Ej.: Wikipedia válida para discovery, **no** como evidencia final por defecto. Permitir descubrir referencias desde fuentes no-evidencia. Multilingüe: conservar idioma y provenance; la traducción no altera autoridad.

## 7. RESEARCHABILITY

Evaluación explícita de: claridad de la pregunta, disponibilidad de evidencia, incertidumbre resoluble, relevancia, potencial de contraste, novedad/interés, coste razonable, calidad de fuentes. **No** asumir `interesting = researchable` ni `true = editorially interesting`.

## 8. PRIORIZACIÓN

Asignar prioridad explicable: `HIGH` · `MEDIUM` · `LOW` · `DISCARD`. Derivada de señales observables, no de un score opaco. Debe poder responderse *“¿por qué RC-X va antes que RC-Y?”* (guardar `priorityReasons`).

## 9. BATCH Y NOISE REJECTION

`N SOURCES → N SIGNALS → M CANDIDATES` con `M << N`. Debe existir selección, descarte y priorización. Un sistema que produce 100 candidates para 100 fuentes **no** satisface el objetivo. Distribución observable: `SUPPORTED` / `UNSUPPORTED` / `AMBIGUOUS` / `REFRAMED` / `DISCARDED`.

## 10. OUTPUT CONTRACT

Preservar `athenasignal.research_candidate.handoff.v1` (salvo deficiencia real justificada). Cada candidate debe expresar: `candidateId`, `title`/`researchQuestion`, origin signals, source provenance, original assertions, initial evidence, assertion assessment, known uncertainties, reframing, researchability, editorial relevance, **priority**, reason for selection, `recommendedAthenaOsInput`. El claim original **nunca** debe reaparecer como hecho tras un reframing.

## 11. ATHENAOS HANDOFF

Mantener el boundary: AthenaSignal entrega *qué encontró, qué afirmaba, qué descubrió inicialmente, qué no pudo establecer, qué pregunta recomienda, por qué merece investigación*. **No** duplicar la investigación profunda de AthenaOS. El validador de handoff de M2 debe seguir validando.

## 12. BENCHMARK Y MÉTRICAS

Benchmark versionado `evidence/m3/benchmark.json` con: `KNOWN-GOOD`, `KNOWN-BAD CLAIMS`, `AMBIGUOUS`, `REFRAMING CASES`, `LOW-VALUE NOISE`, `MULTI-SOURCE`. Parte del conjunto debe proceder de **fuentes reales**.

Métricas mínimas en `evidence/m3/metrics.json`: sources processed · signals extracted · candidates generated · candidates discarded · high-priority · reframed · unsupported · evidence sources per candidate · duplicate/near-duplicate rate · false-positive observations · human acceptance rate (placeholder hasta revisión). No optimizar una métrica aislada a costa de la calidad.

## 13. PRODUCT VALIDATION (requiere humano)

Generar `evidence/m3/human-review-packet.json` con una **muestra significativa** de candidates y un rubric respondiendo: ¿encontró una idea real? ¿la interpretación corresponde al material? ¿separó observación de afirmación? ¿evitó convertir contenido en verdad? ¿encontró evidencia útil? ¿descartó lo inviable? ¿reformuló correctamente? ¿son preguntas investigables por AthenaOS? ¿la priorización tiene sentido? ¿el handoff da contexto suficiente? Registrar aciertos y **falsos positivos**; corregir los solucionables.

Este punto implica **Human Gate de validación de producto** al cierre (evaluación humana real).

## 14. PROVENANCE Y REPRODUCIBILIDAD

Reconstruible `Candidate → Signal → Content → Source` y `Candidate → Assertions → Evidence → Evidence sources`. Conservar corpus, metadata, contenido extraído, señales, assertions, queries/steps de investigación, evidencia, salidas de razonamiento relevantes, researchability, reframing, priorización, candidates y handoff. Evitar depender de timestamps/URLs dinámicas; conservar snapshots/hashes/extractos cuando sea legal y técnicamente apropiado; documentar limitaciones.

## 15. CRITERIOS DE ACEPTACIÓN

1. **Autonomous Discovery** (corpus real desconocido, sin lista manual de ideas).
2. **Real Cognitive Processing** (LLM real participa).
3. **Real Research** (búsqueda y cruce de evidencia inicial).
4. **Epistemic Safety** (no convierte assertions en facts).
5. **Reframing** (claim incorrecto → pregunta investigable).
6. **Noise Rejection** (descarta lo inviable).
7. **Prioritization** (ordena y explica).
8. **Batch Operation** (múltiples fuentes sin intervención entre inputs).
9. **Research Candidate Quality** (revisión humana los considera legítimos/útiles).
10. **AthenaOS Compatibility** (handoff sigue validando).
11. **Provenance** (trazabilidad completa).
12. **Regression** (suite M1+M2 sigue verde).

Artefactos de aceptación deterministas:

- `evidence/m3/corpus.json`, `evidence/m3/benchmark.json`, `evidence/m3/signals.json`
- `evidence/m3/candidates.json` (con prioridad y distribución), `evidence/m3/metrics.json`
- `evidence/m3/handoff-athenaos.json`, `evidence/m3/human-review-packet.json`
- `tests/autonomous-intelligence-e2e.test.ts` (offline, replay)
- `scripts/m3-replay.ts` (replay determinista del corpus; salida canónica)

Comando de aceptación oficial de M3:

```bash
node --test --experimental-strip-types \
  tests/domain.test.ts tests/adapters.test.ts tests/signal-extractor.test.ts \
  tests/editorial-scorer.test.ts tests/pipeline-e2e.test.ts \
  tests/research-candidate-e2e.test.ts tests/autonomous-intelligence-e2e.test.ts
```

Reproducibilidad: `node --experimental-strip-types scripts/m3-replay.ts` debe producir salida canónica determinista.

## 16. NO FORMA PARTE DEL SCOPE

Dashboard completo; radar persistente de producción; web app; sistema universal de scraping; framework genérico de LLM; nueva infraestructura de Governance; generador de guiones; investigación profunda completa; memoria global MarioOS; soporte exhaustivo de todas las plataformas. Toda infraestructura adicional debe justificarse por necesidad funcional.

## 17. CONDICIÓN DE CIERRE

Cerrar solo con evidencia de: Autonomous Signal Discovery + Real Cognitive Processing + Initial Research + Reframing + Noise Rejection + Prioritization + Research Candidates + AthenaOS Handoff + Reproducible Evidence + Regression Pass + **Human Quality Review**. Evidencia de producto, no solo de infraestructura.

## 18. REPORTE FINAL

Entregar el reporte con todos los campos solicitados por el Líder Humano (STATUS, capacidad, corpus, sources/signals/candidates, distribución HIGH/MEDIUM/LOW y SUPPORTED/…, ejemplos de éxito y de fallo, revisión humana, researchability, priorización, handoff, configuración LLM, herramientas usadas/adoptadas/rechazadas, evidencia, benchmarks, métricas, regresión, limitaciones, issues, Human Gates, next milestone).
