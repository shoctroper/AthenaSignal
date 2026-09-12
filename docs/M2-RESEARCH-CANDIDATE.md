# M2 — Signal-to-Research-Candidate Vertical Slice (offline)

Implementación de `ciclo/ORDEN-006.md` conforme a DU-001, RFC-006 y el
contrato AKP vendoreado en `docs/athenaos-handoff-contract.md`.

## Comandos

```bash
npm test           # suite completa (M1 + M2)
npm run e2e        # pipeline offline M1 -> evidence/deep-search-e2e.json
npm run e2e:m2     # pipeline offline M2 -> evidence/{source-provenance,research-candidates,handoff-athenaos}.json
npm run verify:m1  # aceptación oficial M1
npm run verify:m2  # aceptación oficial M2 (lista explícita de suites)
```

## Flujo demostrado

```
SOURCE → CONTENT EXTRACTION → SIGNAL / IDEA → ASSERTION / CLAIM ANALYSIS
→ INITIAL RESEARCH → RESEARCHABILITY ASSESSMENT → REFRAMING (si procede)
→ RESEARCH CANDIDATE → HANDOFF A AKP
```

## Casos

- **CASO 1 — Idea investigable.** Fuente real: `https://kafka.apache.org/intro`.
  Resultado: `SUPPORTED`, researchability `HIGH`, candidate
  `rc-athenasignal-src-kafka-intro`.
- **CASO 2 — Afirmación problemática (obligatorio).** Fuente real:
  short de `@legitalgorithmswithpeter` que afirma *"AirLLM permite ejecutar
  DeepSeek V4 localmente con 12 GB de RAM"*. La investigación inicial contra la
  documentación real de AirLLM (`https://pypi.org/project/airllm/`,
  `https://github.com/lyogavin/airllm`) muestra que la cifra ~12 GB es **VRAM
  de GPU** y corresponde a **DeepSeek-V3 (671B)**, no a una versión "V4".
  Resultado: `REFRAMED`; la afirmación original **no** se propone como
  `CandidateFact`, se conserva la idea subyacente como pregunta investigable.

## Componentes

- `src/research/sources.ts` — fixtures vendoreados con provenance real.
- `src/research/ResearchEvidence.ts` — corpus de evidencia vendoreada (replay
  offline determinista); cada hallazgo distingue `FACT` / `EVIDENCE` de
  `MODEL_INTERPRETATION` y `EDITORIAL_REFRAMING`.
- `src/research/AssertionAnalyzer.ts` — descompone la afirmación.
- `src/research/ResearchabilityAssessor.ts` — evalúa investigabilidad.
- `src/research/ResearchCandidateBuilder.ts` — reformula cuando procede y
  construye el `ResearchCandidate`.
- `src/research/ResearchPipeline.ts` — orquesta el flujo completo.
- `src/handoff/HandoffValidator.ts` — valida el esquema AKP.
- `src/research/offline.ts` + `src/research-cli.ts` — runner/CLI offline.

## Artefactos de aceptación

- `evidence/source-provenance.json` — fuentes reales con URL, idioma, fecha de
  captura y hash SHA-256 del snapshot.
- `evidence/research-candidates.json` — >= 2 candidates, incluido `REFRAMED`.
- `evidence/handoff-athenaos.json` — handoff AKP validado.
- `tests/research-candidate-e2e.test.ts` — E2E determinista offline.

La generación es byte-determinista: los timestamps provienen del snapshot
vendoreado, no del reloj, por lo que no hay deriva entre corridas.
