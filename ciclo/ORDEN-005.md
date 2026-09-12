# ORDEN-005 — MILESTONE M1: Deep Search Vertical Slice

- **Fecha:** 2026-09-11
- **Emite:** Arquitecto
- **Estado:** VIGENTE (autoriza ejecución vía Governance, worker OpenCode)
- **Reemplaza la ejecución pendiente de:** ORDEN-004 (T-012 a T-015)
- **Documentos vinculantes:**
  - [DU-001 — Modelo Conceptual](file:///Volumes/Medios/Repos/AthenaSignal/decisiones/DU-001-MODELO-CONCEPTUAL-ATHENASIGNAL.md) (RATIFICADA)
  - [RFC-006 — Adquisición MCP y Deep Search](file:///Volumes/Medios/Repos/AthenaSignal/decisiones/RFC-006-MOTOR-DE-BUSQUEDA-Y-VERIFICACION-DE-CLAIMS.md) (RATIFICADO)

---

## 1. OBJETIVO

Convertir el pipeline `SOURCE → SIGNAL → RESEARCH → EDITORIAL OPPORTUNITY` — hoy stub, duplicado o roto — en una **rebanada vertical real, ejecutable de punta a punta y verificable sin red**, conforme a DU-001 (todo claim nace `UNVERIFIED`) y RFC-006 (bucle Odysseus con `MAX_ITERATIONS = 3`).

Este milestone agrupa como subtareas internas toda la deuda técnica derivada de ORDEN-004.

## 2. ALCANCE

1. **Unificar el contrato de adquisición.** Una sola interfaz `ISourceAdapter` con `canHandle(url): boolean` y `acquire(url): Promise<NormalizedContent>` en `src/adapters/ISourceAdapter.ts`. Eliminar `src/interfaces/ISourceAdapter.ts` y toda referencia a `connect/fetchData/disconnect`.
2. **Adaptadores reales con transporte inyectable.**
   - `FirecrawlAdapter`: usará un cliente HTTP real inyectable (API Firecrawl o self-hosted); si el transporte falla/no está configurado, degrada a un fixture determinista documentado (no un mock aleatorio oculto).
   - `McpAgentReachAdapter`: implementará `ISourceAdapter` (canHandle/acquire) consumiendo el servidor MCP vía `McpClientService`; si MCP no está disponible, degrada a fixture determinista.
   - Sin dependencia de red para pasar la aceptación.
3. **`SignalExtractor` con motor inyectable.** Mantener el motor heurístico actual como fallback; permitir un motor LLM inyectable (`CustomExtractorEngine` ya existe). Garantizar `status: 'UNVERIFIED'` en todo claim.
4. **`ClaimVerifier` real (bucle Odysseus).**
   - `MAX_ITERATIONS = 3` estricto.
   - Evidencia obtenida por un buscador/adaptador inyectable (no `Math.random`).
   - Veredictos por claim: `VERIFIED` / `REFUTED` / `UNVERIFIED_AMBIGUOUS`.
   - Sin resolución tras 3 ciclos → `UNVERIFIED_AMBIGUOUS` (con penalización para el scorer).
5. **`PipelineOrchestrator` correcto y compilable.** Cablea `adapters → extractor → verifier → scorer`; usa la API real del `EditorialScorer` (`score()` + `calculateGlobalScore()`/`evaluateOpportunity()`); adjunta el reporte de verificación y actualiza el `status` de los claims; devuelve un `EditorialOpportunity`.
6. **Entrypoint/CLI de verificación offline.** Un comando único (por ejemplo `npm run e2e` o `node --experimental-strip-types src/cli.ts --offline`) que corre el pipeline completo con fuentes/fixtures deterministas y escribe `evidence/deep-search-e2e.json`.
7. **Pruebas.** Nueva suite de integración `tests/pipeline-e2e.test.ts` que cubre el pipeline completo con fixtures deterministas. Las 4 suites existentes deben seguir pasando sin debilitarse.
8. **Dependencias reproducibles.** Declarar en `package.json` las dependencias usadas y permitir instalación reproducible (`package-lock.json`). Si el SDK MCP no puede instalarse, documentarlo y usar transporte inyectable + fake.

## 3. RESULTADO FUNCIONAL

Un comando único que, sin red y con datos deterministas, produce:

- una `EditorialOpportunity` puntuada en `[0.0, 1.0]`, y
- un reporte `evidence/deep-search-e2e.json` auditable con las etapas `source`, `signal`, `verification` y `opportunity`, donde cada claim aparece con su veredicto.

## 4. CRITERIOS DE ACEPTACIÓN (verificables)

1. `tests/pipeline-e2e.test.ts` existe, corre y pasa.
2. `evidence/deep-search-e2e.json` existe, es un objeto JSON con claves `source`, `signal`, `verification`, `opportunity`.
3. Los 18 tests previos siguen pasando (y los 4 archivos de test existentes no se debilitan).
4. No quedan imports sin resolver en `src/` (en particular `PipelineOrchestrator.ts`).
5. `ClaimVerifier` no usa aleatoriedad, respeta `MAX_ITERATIONS = 3` y marca `UNVERIFIED_AMBIGUOUS` cuando no resuelve.
6. No existe más de un contrato `ISourceAdapter` con semánticas distintas.
7. La aceptación pasa **sin acceso a red**.

Comando de aceptación oficial de M1:

```bash
node --test --experimental-strip-types \
  tests/domain.test.ts tests/adapters.test.ts \
  tests/signal-extractor.test.ts tests/editorial-scorer.test.ts \
  tests/pipeline-e2e.test.ts
```

## 5. LÍMITES

- No se modifican decisiones ratificadas (`decisiones/`).
- No se implementa persistencia, dashboard/Radar ni API HTTP (milestone siguiente, M2).
- No se usan APIs de pago por defecto; la ruta de aceptación es offline/determinista.
- No se expande el scope autorizado del spec de Governance.

## 6. CONDICIONES DE ESCALAMIENTO (Human Gate)

- Conflicto real entre este milestone y una decisión ratificada (DU-001 / RFC-006).
- Imposibilidad de instalar el SDK MCP y falta de alternativa inyectable razonable.
- Modelo del proveedor autorizado no disponible (no sustituir silenciosamente).
- Criterio de aceptación ambiguo que cambie el resultado funcional.
