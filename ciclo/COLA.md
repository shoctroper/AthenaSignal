# Cola de Tareas del Proyecto — ./ciclo/COLA.md

- **Proyecto:** AthenaSignal
- **Última actualización:** 2026-09-06
- **Estado de la Cola:** Activa (Fase 2.1 - Adquisición MCP & Deep Search)

---

## 📋 Tabla de Cola de Tareas

### [BLK-01] Adquisición MCP y Bucle de Búsqueda
**Definition of Done (DoD) del Bloque:** Los adaptadores MCP logran hacer consultas externas sin romper la memoria y el `PipelineOrchestrator` es capaz de enlazar Ingesta -> ClaimVerifier.

| ID | Tarea | Asignado | Estado | Precondición | Artefacto / Entrega |
|---|---|---|---|---|---|
| T-011 | Cliente MCP Base (`McpClientService`) | Alphonse | `[COMPLETADO]` | Ninguna | `src/services/McpClientService.ts` |
| T-012 | Adaptador AgentReach MCP | Edward `[Model: qwen2.5-7b]` | `[COMPLETADO]` | T-011 | `src/adapters/McpAgentReachAdapter.ts` |
| T-013 | Adaptador Firecrawl Web | Edward `[Model: qwen2.5-7b]` | `[COMPLETADO]` | T-011 | `src/adapters/FirecrawlAdapter.ts` |
| T-014 | Agente `ClaimVerifier` (Bucle Odysseus) | Edward `[Model: antigravity]` | `[COMPLETADO]` | T-012, T-013 | `src/services/ClaimVerifier.ts` |
| T-015 | Actualización de `PipelineOrchestrator` | Alphonse `[Model: qwen2.5-7b]` | `[COMPLETADO]` | T-014 | `src/services/PipelineOrchestrator.ts` |

> **Nota:** T-012 a T-015 fueron re-ejecutadas y verificadas bajo **M1 / ORDEN-005** vía Governance (run `rt-388c7fddbd26`, 28/28 tests). El marcado previo de T-012/T-013 era prematuro (stubs). Ver `./ciclo/ESTADO.md`.

---

## 📌 Leyenda de Estados
- `[EN_DISCUSION]`: Evaluado por Cuestionador.
- `[PENDIENTE]`: Listo para procesar por Implementador / n8n Pipeline.
- `[EN_PROGRESO]`: En desarrollo.
- `[EN_VERIFICACION]`: En pruebas por Hornet / QA.
- `[REVISAR_ESPEC]`: Marcado por QA para ajuste del Arquitecto.
- `[COMPLETADO]`: Verificado y certificado.
- `[BLOQUEADO]`: Techo cognitivo alcanzado.
