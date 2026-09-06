# ORDEN-004 — Implementación de Adquisición MCP y Research Agent

- **Fecha:** 2026-09-06
- **Emite:** Arquitecto
- **Estado:** VIGENTE
- **Documentos Vinculantes:**
  - [RFC-006-MOTOR-DE-BUSQUEDA-Y-VERIFICACION-DE-CLAIMS.md](file:///Volumes/Medios/Repos/AthenaSignal/decisiones/RFC-006-MOTOR-DE-BUSQUEDA-Y-VERIFICACION-DE-CLAIMS.md)
  - [PRD-ATHENA-CORE-DEEP-SEARCH.md](file:///Volumes/Medios/Repos/AthenaSignal/docs/research/PRD-ATHENA-CORE-DEEP-SEARCH.md)

---
*Nota: Reemplaza y depreca la ORDEN-003, ajustándose al uso de MCP y agentes iterativos.*

## Ítems Ejecutables (Fase 2.1 - Deep Search & MCP)

| # | Tarea | Asignado | Criterio de Aceptación |
|---|---|---|---|
| T-011 | Cliente MCP Base (`McpClientService`) | Alphonse | `src/services/McpClientService.ts` capaz de conectar a servidores externos |
| T-012 | Adaptador AgentReach MCP | Edward | `src/adapters/McpAgentReachAdapter.ts` implementa `ISourceAdapter` |
| T-013 | Adaptador Firecrawl Web | Edward | `src/adapters/FirecrawlAdapter.ts` implementa `ISourceAdapter` |
| T-014 | Agente `ClaimVerifier` (Bucle Odysseus) | Edward | `src/services/ClaimVerifier.ts` con límite de 3 iteraciones de búsqueda |
| T-015 | Actualización de `PipelineOrchestrator` | Alphonse | Orquesta Ingesta -> `ClaimVerifier` -> `EditorialScorer` |
