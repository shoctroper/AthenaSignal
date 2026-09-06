# Cola de Tareas del Proyecto — ./ciclo/COLA.md

- **Proyecto:** AthenaSignal
- **Última actualización:** 2026-09-06
- **Estado de la Cola:** Activa (Fase 2.1 - Adquisición MCP & Deep Search)

---

## 📋 Tabla de Cola de Tareas

| ID | Tarea | Asignado | Estado | Precondición | Artefacto / Entrega |
|---|---|---|---|---|---|
| T-001 | Crear estructura base de directorios (`src/`, `tests/`, `scripts/`, `docs/`) | Alphonse | `[COMPLETADO]` | Ninguna | `find src/ tests/ scripts/ docs/` |
| T-002 | Crear script de verificación de entregas `scripts/verify-report.sh` | Alphonse | `[COMPLETADO]` | T-001 | `scripts/verify-report.sh` |
| T-003 | Modelado del Dominio Epistemológico (`Source`, `Content`, `Signal`, `Claim`) | Edward | `[COMPLETADO]` | T-001, DU-001 | `src/domain/entities.ts` + tests |
| T-004 | Definición de interfaz `ISourceAdapter` y contrato `NormalizedContent` | Alphonse | `[COMPLETADO]` | T-003, RFC-003 | `src/adapters/ISourceAdapter.ts` |
| T-005 | Implementación del Extractor de Señales (`SignalExtractor`) | Edward | `[COMPLETADO]` | T-003, RFC-003 | `src/services/SignalExtractor.ts` |
| T-006 | Algoritmo de Scoring de Oportunidades Editoriales (`EditorialScorer`) | Edward | `[COMPLETADO]` | T-005 | `src/services/EditorialScorer.ts` |
| T-007 | Implementación de `RssSourceAdapter` para fuentes RSS | Alphonse | `[CANCELADO]` | Pivot a ORDEN-004 | N/A |
| T-008 | Implementación de `WebContentAdapter` para contenido HTML/Artículos | Edward | `[CANCELADO]` | Pivot a ORDEN-004 | N/A |
| T-009 | Implementación de `PipelineOrchestrator` (Ingesta -> Extracción -> Scoring) | Edward | `[CANCELADO]` | Pivot a ORDEN-004 | N/A |
| T-010 | Integración n8n Queue Runner (`scripts/queue-runner.js`) | Alphonse | `[CANCELADO]` | Pivot a ORDEN-004 | N/A |
| T-011 | Cliente MCP Base (`McpClientService`) | Alphonse | `[PENDIENTE]` | RFC-006 | `src/services/McpClientService.ts` |
| T-012 | Adaptador AgentReach MCP | Edward | `[PENDIENTE]` | T-011 | `src/adapters/McpAgentReachAdapter.ts` |
| T-013 | Adaptador Firecrawl Web | Edward | `[PENDIENTE]` | T-004 | `src/adapters/FirecrawlAdapter.ts` |
| T-014 | Agente `ClaimVerifier` (Bucle Odysseus) | Edward | `[PENDIENTE]` | T-012, T-013 | `src/services/ClaimVerifier.ts` |
| T-015 | Actualización de `PipelineOrchestrator` | Alphonse | `[PENDIENTE]` | T-014 | `src/services/PipelineOrchestrator.ts` |

---

## 📌 Leyenda de Estados
- `[EN_DISCUSION]`: Evaluado por Cuestionador.
- `[PENDIENTE]`: Listo para procesar por Implementador / n8n Pipeline.
- `[EN_PROGRESO]`: En desarrollo.
- `[EN_VERIFICACION]`: En pruebas por Hornet / QA (+ Rohan / Robin).
- `[REVISAR_ESPEC]`: Marcado por QA para ajuste del Arquitecto.
- `[COMPLETADO]`: Verificado y certificado.
- `[CANCELADO]`: Deprecado por cambio de arquitectura.
