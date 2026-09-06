# RFC-006 — Arquitectura MCP para Adquisición Resiliente y Deep Search (V2)

- **Fecha:** 2026-09-06
- **Emite:** Arquitecto
- **Estado:** RATIFICADO PARA IMPLEMENTACIÓN

---

## 1. Visión General

AthenaSignal migra de una ingesta pasiva de datos hacia un sistema de **Adquisición Dinámica y Búsqueda Profunda**. Para resolver la fricción entre ecosistemas (Athena en TypeScript vs. herramientas AI en Python) y evadir bloqueos anti-bot, estandarizamos la adquisición a través del **Model Context Protocol (MCP)** e implementamos un agente de verificación iterativa inspirado en el marco *Odysseus*.

---

## 2. Componentes de la Arquitectura

### A. Capa de Adquisición (MCP Clients & Adapters)
En lugar de envoltorios CLI frágiles, los adaptadores de Athena actuarán como Clientes MCP.

1. **`McpAgentReachAdapter` (Redes Sociales y Video):**
   - Consume un servidor MCP local de `Agent-Reach`.
   - Utiliza cookies de sesión inyectadas (Tier 1) para obtener transcripciones de YouTube, threads de Reddit y posts de X a costo cero, evitando el error 403.
2. **`FirecrawlAdapter` (Ingesta Web Masiva):**
   - Consumo de API (o self-hosted) para renderizar SPAs (React/Next) y evadir Cloudflare, devolviendo Markdown semánticamente limpio.
3. **`McpScrapeGraphAdapter` (Extracción Estructurada):**
   - Consume un servidor MCP de `ScrapeGraphAI`. Navega el HTML de forma semántica usando un grafo DAG, devolviendo JSON fuertemente tipado sin depender de selectores CSS frágiles.

### B. El Agente de Verificación (Bucle de Deep Search)
Evolucionamos la verificación de Claims hacia un `ResearchAgent`:
1. **Identificación:** `SignalExtractor` detecta un Claim principal.
2. **Ciclo Odysseus:** 
   - El `ResearchAgent` genera *queries* para contrastar el Claim.
   - Consulta a través de `Firecrawl` o `McpAgentReachAdapter`.
   - Evalúa la nueva evidencia y detecta contradicciones.
   - Si la confianza estadística es baja, repite la búsqueda afinando los términos.
3. **Veredicto:** Pasa los hallazgos validados al `EditorialScorer`.

---

## 3. Matriz de Cobertura y Fallbacks Corregida

| Fuente Objetivo | Herramienta Primaria | Fallback Técnico | Formato de Retorno |
|---|---|---|---|
| **YouTube** | Agent-Reach MCP (`yt-dlp` interno) | YouTube Official API (Pago) | Transcripción texto crudo |
| **Reddit / X** | Agent-Reach MCP (Cookies Locales) | Official API (OAuth) | Posts + Top Comments (JSON) |
| **Prensa / Blogs**| Firecrawl (Markdown mode) | ScrapeGraphAI MCP (DAG) | Clean Markdown |
| **Data Precisa** | ScrapeGraphAI MCP (Structured) | Parseo LLM Directo | JSON validado por Zod |

---

## 4. Evaluación del Cuestionador (Red Teaming)

1. **Objeción:** *Agent-Reach requiere cookies de sesión de navegador. Si desplegamos AthenaCore en un servidor Linux (Docker/n8n) sin entorno gráfico, la sesión local no existirá y la extracción fallará.*
   - **Resolución (Arquitecto):** Aprobada. Se dividirá el despliegue. El servidor MCP de Agent-Reach se ejecutará en la máquina local del editor humano (Desktop), exponiéndose de forma segura a través de un túnel (ej. ngrok) o red privada hacia el orquestador n8n en la nube. Los adaptadores de Athena serán resilientes si el túnel está inactivo, pasando inmediatamente al fallback (APIs oficiales).
2. **Objeción:** *El Bucle Odysseus (Deep Search) puede caer en loops infinitos de búsqueda si el LLM se "alucina" tratando de verificar algo irresoluble.*
   - **Resolución (Arquitecto):** Aprobada. Se establecerá un `MAX_ITERATIONS = 3` estricto en el `ResearchAgent`. Si no hay resolución tras 3 ciclos, el Claim se marca como `UNVERIFIED_AMBIGUOUS` y pasa al Scorer con penalización.

---

## 5. Implementación (Tasks)

Ver `ORDEN-004` para la lista de tareas ejecutables derivadas de este RFC.
