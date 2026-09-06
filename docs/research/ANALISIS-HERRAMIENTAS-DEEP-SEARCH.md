# Análisis Arquitectónico: Motores de Búsqueda Profunda y Verificación de Claims para AthenaSignal

- **Fecha:** 2026-09-06
- **Emite:** Arquitecto
- **Propósito:** Evaluación técnica comparativa de repositorios clave (`Agent-Reach`, `ScrapeGraphAI`, `Firecrawl`, `Odysseus`) y su integración estratégica en la arquitectura de AthenaSignal.

---

## 1. Contexto y Problema a Resolver en AthenaSignal

En el estado actual de AthenaSignal, la **búsqueda y verificación de Claims** enfrenta tres cuellos de botella principales:
1. **Paredes de Pago / Bloqueos Anti-Bot (403):** Plataformas como X (Twitter), Reddit, YouTube y sitios web dinámicos bloquean scrapers tradicionales o imponen APIs de alto costo.
2. **Fragilidad de Selectores HTML:** Las estructuras DOM cambian constantemente, rompiendo los raspadores de datos basados en CSS/XPath.
3. **Búsqueda Superficial de 1 Solo Paso:** Una sola consulta a un motor de búsqueda no es suficiente para verificar la veracidad, tensión o proveniencia de un Claim complejo.

---

## 2. Análisis Técnico de Repositorios Clave

### A. `Agent-Reach` (Panniantong/Agent-Reach)
- **Concepto Core:** Interfaz unificada en CLI / Python que otorga a los agentes IA capacidad de lectura y búsqueda en Twitter, Reddit, YouTube, GitHub, Bilibili y RSS sin cuotas de API pagadas.
- **Mecanismo Técnico:**
  - **Patrón Channel + Backends en Cascada:** Combina herramientas ligeras (ej. `yt-dlp`, `youtube_transcript_api`, `rdt-cli`) con puentes a sesiones de navegador local (`OpenCLI`) para reutilizar cookies de sesión reales.
  - **Fallback por Niveles (Tier 0 -> Tier 1 -> Tier 2):** Intenta extracción pública cero-configuración; si falla por 403, conmuta al puente de sesión de navegador.
- **Aplicación en Athena:**
  - Inspiración/Librería directa para expandir nuestros `ISourceAdapter` (ej. `YouTubeSourceAdapter`, `RedditClaimAdapter`, `TwitterClaimAdapter`).

### B. `ScrapeGraphAI` (`scrapegraph-ai`)
- **Concepto Core:** Pipelines de raspado web basados en Grafos Dirigidos Acíclicos (DAG) impulsados por LLMs.
- **Mecanismo Técnico:**
  - Reemplaza selectores fijos por nodos en un DAG (`FetchNode` -> `ParseNode` -> `LlmExtractionNode` -> `SchemaValidationNode`).
  - Dada una URL y un esquema TypeScript/JSON objetivo, la IA navega el HTML en bruto y devuelve los datos estructurados.
- **Aplicación en Athena:**
  - Resiliencia para `WebContentAdapter`: Extracción autónoma de `NormalizedContent` y `Claim[]` sin importar si la página web cambia de diseño.

### C. `Firecrawl`
- **Concepto Core:** Motor de adquisición e ingesta web optimizado para LLMs.
- **Mecanismo Técnico:**
  - Renderiza Single-Page Applications (SPAs en React/Next.js/Vue), salta protecciones anti-bot y convierte el DOM ruidoso (menús, pies de página, scripts) en **Markdown limpio de alta densidad**.
- **Aplicación en Athena:**
  - Ingestador primario para artículos largos e investigación profunda antes de enviarse al `SignalExtractor`.

### D. `Odysseus` (Deep Search Loop)
- **Concepto Core:** Bucle de razonamiento de búsqueda recursiva e iterativa.
- **Mecanismo Técnico:**
  - **Ciclo de Verificación de Evidencia:** `Generar Consulta` -> `Buscar` -> `Evaluar Evidencia` -> `Identificar Vacíos/Contradicciones` -> `Re-consultar` -> `Sintetizar Veredicto`.
- **Aplicación en Athena:**
  - Motor interno para el `ClaimVerifier` de Athena (fase posterior al `SignalExtractor`).

---

## 3. Propuesta de Arquitectura Híbrida para AthenaSignal (`RFC-006`)

```text
[ Entrada / URL / Claim ]
           │
           ▼
[ Router de Adquisición (ISourceAdapter) ]
   ├── Fuertes Sociales / Videos ──> Agent-Reach Adapter (Zero-API / OpenCLI)
   ├── Webs Complejas / SPAs ──────> Firecrawl Adapter (Clean Markdown)
   └── Sitios Estáticos / HTML ────> ScrapeGraphAI DAG Adapter (Schema Extraction)
           │
           ▼
[ NormalizedContent ]
           │
           ▼
[ SignalExtractor (LLM Core) ] ──> Claims Iniciales & Preguntas
           │
           ▼
[ Bucle Odysseus (ClaimVerifier) ] ──> Verificación Iterativa de Evidencia
           │
           ▼
[ EditorialScorer (Radar Athena) ] ──> Oportunidad Evaluada (0.0 - 1.0)
```

---

## 4. Próximos Pasos Recomendados

1. **Investigación de Código (Clonado):**
   - Repositorio `Agent-Reach` clonado localmente en `docs/research/agent-reach/`.
2. **Drafting de `RFC-006`:**
   - Formalizar la inclusión del patrón **Agent-Reach** en la arquitectura de `ISourceAdapter` de Athena.
