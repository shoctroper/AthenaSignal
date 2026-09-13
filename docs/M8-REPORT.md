# M8 — Sustained Autonomous Editorial Operation · Reporte Final

- **Fecha:** 2026-09-12
- **Milestone:** `athenasignal-m8-sustained-autonomous-operation` (v1)
- **Orden:** `ciclo/ORDEN-012.md`
- **Evidencia ejecutable:** `evidence/m8/*` · `tests/sustained-operation-e2e.test.ts`
- **Aceptación:** `npm test` (132 tests, 12 suites, 0 fallos)

## 1. Duración y timeline (reloj real)

La ventana se ejecutó en **tiempo de reloj real** con `scripts/m8-sustain.ts`:

- **Inicio real:** `2026-09-12T21:31:46.867Z`
- **Fin real:** `2026-09-12T21:53:47.450Z`
- **Duración:** **22.0 min** continuos · **24 ticks** (intervalo ~60 s)
- **Procesos:** `m8-scheduler-a` (12 ticks, `CRASHED` en el tick 12) → reinicio real del
  proceso (`exit 137`) → `m8-scheduler-b` (12 ticks, `COMPLETED`, `resumedFrom: a`).
- **Host:** Ubuntu `athena` (192.168.0.36, SSH BatchMode, 16 cores).
- Grabación verificable: `evidence/m8/recordings/window.json` (heartbeat en
  `.m8tmp/m8-sustain/heartbeat.log`). El replay determinista consume la grabación y
  conserva estos timestamps (`evidence/m8/scheduler.json`).

El test `J` valida que el artefacto usa exactamente esa ventana y que dura ≥ 20 min.

## 2. Fuentes y escala

- **Corpus:** 1500 fuentes únicas (base M7 500 + 1000 canales de continuidad M8), 176
  ciclos procesados; `inputsObserved` 2768.
- Radar vivo: 25 señales, 7 clusters, 7 candidates. `NEW` 25 · `KNOWN` 293 ·
  `DUPLICATE` 1268 (la expansión no eleva linealmente el ruido).
- Proveedor real de ingesta: **AthenaKnowledge/AKP** (10 documentos fuente).

## 3. Motores reales e infraestructura

`evidence/m8/recordings/real-engines.json` — 9 invocaciones reales, **8 OK**, 1
documentada como no disponible:

| Motor | Invocación | Estado |
| --- | --- | --- |
| `ubuntu-node` | `ssh athena 'hostname; nproc; free -g'` | OK |
| `ubuntu-node` | Ollama local en Ubuntu (`/api/tags`) | OK |
| `athenaknowledge` | `dotnet build` | OK |
| `athenaknowledge` | `Ingestion.Cli` sobre `data/source-documents` | OK |
| `athenaos` | `doctor` (proveedor template; gemini agotado 429) | OK |
| `athenaos` | `run --topic … --knowledge <puente AKP>` | OK |
| `athenaos` | `show <caso>` | OK |
| `athenaos` | `export <caso>` | OK |
| `macmini-node` | `ping 192.168.0.149` | **UNREACHABLE** (documentado, no simulado) |

## 4. AKP real end-to-end

`evidence/m8/akp-live.json` (`ingestion`) + `evidence/m8/recordings/akp-ingestion-report.json`:

- 10 documentos importados · 172 fragmentos · 291 aserciones · 273 CandidateFacts ·
  **267 KnownFacts** · 7 conflictos · 1 duplicado.
- Puente AKP → AthenaOS: `data/m8-akp/knowledge-athenaos` (272 hechos en wire format
  `KnownFact`, con `eventDate`; los hechos que el loader real rechaza por P4 se excluyen
  y documentan). Es la base del handoff hacia AthenaOS.

## 5. AthenaOS investigación real

`evidence/m8/athenaos-real.json` (`realResearch`):

- **Caso real:** `4ae47f3a-e7ff-4d85-8403-0986a2b8a799` (`AwaitingHumanApproval`).
- 270 claims · 6 en disputa · fidelidad 1.00 · export en
  `evidence/m8/recordings/athena-case-export.json`.
- **Limitación de proveedor:** gemini agotado (429). Se ejecutó el **motor real** de
  AthenaOS con proveedor `template` sobre el knowledge de AKP; el loader, los claims,
  los conflictos y el export son reales, la redacción no es editorialmente definitiva.

## 6. Investigación, resolución y radar

- 27 resultados de investigación (19 M7 + 8 M8), 0 replay-misses, 100 % respuestas
  reales (grabaciones Ollama), 336 refs de evidencia.
- **Resoluciones epistémicas:** 7 (1 `CLOSED_CONFIRMED`, 1 `CLOSED_REFUTED`,
  1 `PROMOTED`, 1 `DEMOTED`, 3 `INCONCLUSIVE`); 14 transiciones, 13 evidence-driven.
- **Contradicciones:** 2 (1 resuelta por refutación, 1 conservada).
- **Provenance:** 113 edges, 7/7 cadenas completas, 0 faltantes
  (`source → signal → candidate → evidence → result → radar`).
- **Mutaciones del radar:** 27 feedbacks; promoción/democión/reapertura/cierre trazados
  en `evidence/m8/human-review-packet.json`.

### Nota sobre `ORDEN-012 §0bis.4`

Se forzaron ondas de investigación adicionales en reloj real sobre los 4 candidates
activos; la evidencia real recuperada (síntesis Ollama y corpus) mantuvo 3 de ellos en
`INCONCLUSIVE`. Producir casos `CONFIRMED`/`REFUTED` **adicionales** a los ya existentes
exige material nuevo (p. ej. resultados de búsqueda real; SearXNG estuvo limitado por
rate-limit/CAPTCHA durante la ventana). No se fabricaron veredictos: el sistema conservó
la incertidumbre, conforme al principio evidence-driven del milestone.

## 7. Failover, recovery e idempotencia

- **Recovery:** 17 eventos — `NODE_DOWN` (Mac mini), `PROCESS_RESTART` (crash real tick
  12), `PARTIAL_RUN`, `TIMEOUT`, `INVALID_RESPONSE`, `LLM_FALLBACK`.
- **Idempotencia:** 57 intentos, 51 no-ops; reprocesar ciclos/ondas no muta ni duplica.

## 8. Métricas (calidad / latencia / coste)

- `resolutionCoverage` 1.0 · `evidenceDrivenRate` 0.929 · `provenanceCoverage` 1.0.
- `avgTickMs` ≈ 55 024 (ventana real de 60 s/tick) · 3.9 s de cómputo de aceptación.
- Coste proxy: 17 unidades (5 locales, 3 remotas, 0 deterministas); sin facturación real.

## 9. Regresiones y aceptación

- `npm test`: **132 pass / 0 fail**. Tests M1–M7 intactos; M8 añade 14 casos
  (A–K + artefactos), incluidos ventana real (J) y motores reales (K).
- Reproducibilidad: `node --experimental-strip-types scripts/m8-operation.ts` produce
  salida canónica **byte-idéntica** en ejecuciones consecutivas.
- Roadmap reproducible: `scripts/m8-real-engines.ts` (grabación real) →
  `scripts/m8-sustain.ts` (ventana real) → `scripts/m8-operation.ts` (replay canónico).

## 10. Limitaciones y deuda

- AthenaOS sin proveedor editorial real (gemini 429) → ejecución con `template`.
- Mac mini no alcanzable (excluido, no simulado).
- Búsqueda real (SearXNG) no productiva durante la ventana.
- No se lograron resoluciones `CONFIRMED`/`REFUTED` adicionales sin material nuevo.

## 11. Artefactos

`evidence/m8/`: `operation-timeline.json`, `scheduler.json`, `corpus.json`,
`benchmark.json`, `radar-state.json`, `akp-live.json`, `athenaos-real.json`,
`feedback-updates.json`, `epistemic-resolutions.json`, `contradictions.json`,
`distributed.json`, `recovery-events.json`, `idempotency.json`, `provenance.json`,
`handoff-trace.json`, `metrics.json`, `observability.json`, `cost.json`,
`human-review-packet.json`, y `recordings/` (window, real-engines, athenaos-research,
akp-ingestion, llm, caso exportado).

## 12. Siguiente milestone

M9 — producción editorial asistida: proveedor LLM de calidad (sustituir template),
búsqueda real (SearXNG/DeepSeek) y generación de material genuinamente nuevo para
resolver candidates adicionales, manteniendo el gate humano.
