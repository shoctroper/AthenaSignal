# M3 — Product Quality Review (Human Gate) — AthenaSignal

- **Fecha:** 2026-09-12
- **Evalúa:** Arquitecto (a pedido del Líder Humano), como **juicio de producto** (no de implementación).
- **Veredicto:** **APPROVE** (capacidad del milestone válida y generalizable; defectos menores → deuda).
- **Muestra:** los 6 Research Candidates + los 9 descartes de `evidence/m3/`.

## 1. Evaluación por criterio

| # | Criterio | Resultado |
|---|---|---|
| 1 | Fidelidad al contenido original | OK — los 6 candidates citan fuentes reales; el corpus conserva provenance. |
| 2 | Separación observación/assertion/evidence/model-interpretation/reframing | OK — `initialFindings[].kind` correcto; `EVIDENCE` con refs, interpretaciones sin refs. |
| 3 | Investigación inicial suficiente | OK — 34 queries / 25 evidence items; evidencia ligada al candidate correcto. |
| 4 | Reframing rescata pregunta real vs conversión artificial | Genuino en AirLLM/Kafka/COFEPRIS/Creatina; **umbral bajo** (4/6 REFRAMED) → deuda. |
| 5 | Researchability justificada | OK — dimensiones explícitas + razón; niveles coherentes con evidencia. |
| 6 | Prioridad HIGH/MEDIUM/LOW con sentido | OK — `priorityReasons` con fórmula compuesta; HIGH reservado a evidencia fuerte. |
| 7 | Candidate digno de AthenaOS | OK — handoffs completos y validados. |
| 8 | Descartes son ruido vs oportunidad perdida | Mayormente ruido/dedup; **pérdida menor**: creatine-pmc (metabólico/diabetes) e if-mayo (inflamación). |
| 9 | Caso AirLLM / REFRAMED | **Corregido**: claim no amplificado, `proposedCandidateFacts` vacío, `reframingNote` completo, invariante en test. |
| 10 | Sesgo 8 REFRAMED vs 2 SUPPORTED | Parcialmente por corpus adversarial; problema real = umbral de reframing bajo. |

## 2. Defectos registrados como DEUDA (no bloquean cierre)

- **D-M3-01 (terminológica):** `creatinina` (creatinina de laboratorio) vs `creatina` (suplemento) no normalizada en la pregunta reformulada y en `proposedCandidateFacts` del candidate `rc-sig-src-creatine-harvard-1`.
- **D-M3-02 (calibración):** umbral de reframing bajo → convierte claims débilmente sustentados en oportunidades; revisar regla (p. ej. exigir evidencia mínima o `resolvableUncertainty` más alto).
- **D-M3-03 (discriminación):** descartes por "tema ya cubierto" pueden perder ángulos editoriales distintos (metabólico/diabetes; inflamación).
- **D-M3-04 (cobertura):** `UNSUPPORTED = 0` instrumentado pero no ejercitado por el corpus; añadir un caso claramente refutado.

## 3. Evidencia de producto (verificada)

- Strict spec `athenasignal-m3-verify.spec.yaml`: **PASS (5/5 gates)**.
- `npm test`: **54/54** (7 suites); suite M1+M2 intacta.
- Replay determinista: 10 fuentes → 15 señales → 6 candidates / 9 descartes; `handoffsValid: true`; `missingRecordings: []`; 94 respuestas LLM reales (Ollama `qwen2.5:7b-instruct` + `gpt-oss:20b`; DeepSeek opcional).
- Human review packet: `evidence/m3/human-review-packet.json` (rubric R1–R10).
