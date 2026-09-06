# PRD: Evolución de AthenaCore - Motor de Deep Search y Adquisición Resiliente

- **Fecha:** 2026-09-06
- **Estado:** PROPUESTA
- **Autor:** Arquitecto de Athena

## 1. Resumen Ejecutivo
AthenaSignal requiere evolucionar su capacidad de ingesta de datos y verificación de "Claims" (afirmaciones). Actualmente, el sistema depende de adaptadores tradicionales (basados en selectores HTML fijos o APIs de pago), lo cual es frágil, costoso y susceptible a bloqueos anti-bot (403). Esta propuesta introduce una arquitectura híbrida basada en **Model Context Protocol (MCP)**, integrando herramientas de vanguardia (`Agent-Reach`, `Firecrawl`, `ScrapeGraphAI`) y metodologías de investigación profunda inspiradas en el proyecto `Odysseus`.

## 2. Problemas Actuales y Limitaciones
1. **Costos y Bloqueos (Muro Anti-Bot):** Extraer datos de X/Twitter, Reddit o transcripciones de YouTube mediante scrapers ingenuos resulta en bloqueos inmediatos o requiere APIs comerciales prohibitivas.
2. **Fragilidad de Extracción:** Las estructuras web cambian. Los selectores CSS/XPath fallan silenciosamente, corrompiendo la extracción de señales.
3. **Verificación Plana:** La validación actual de un Claim es de un solo paso. No existe un proceso iterativo de "Deep Search" que cuestione, investigue y contraste múltiples fuentes antes de emitir un veredicto editorial.
4. **Fricción de Ecosistemas (Node vs Python):** Las mejores herramientas de scraping de IA están en Python, mientras que AthenaCore opera en TypeScript, dificultando una integración directa limpia.

## 3. Propuestas de Solución (La Evolución)

### A. Adopción del Estandar MCP (Model Context Protocol)
- **Propuesta:** En lugar de envolver scripts de Python con ejecuciones de subprocesos (`exec`), AthenaSignal actuará como un Cliente MCP. Las herramientas de extracción se expondrán como Servidores MCP.
- **Beneficio:** Desacopla la lógica de adquisición (Python) de la orquestación (TypeScript/n8n). Previene fallas de dependencias y estandariza la comunicación.

### B. Matriz de Adquisición Especializada
1. **Agent-Reach (Vía MCP):**
   - *Uso:* Minería social de costo cero (YouTube, Reddit, X).
   - *Justificación:* Utiliza cookies locales (`OpenCLI`) eludiendo las protecciones anti-bot comerciales. Vital para extraer contexto social real.
2. **Firecrawl:**
   - *Uso:* Ingesta masiva de artículos web y Single-Page Applications (SPAs).
   - *Justificación:* Renderiza JS y limpia el ruido del DOM, entregando Markdown puro de alta densidad semántica, ideal para que el LLM lo procese rápidamente.
3. **ScrapeGraphAI (Vía MCP):**
   - *Uso:* Extracción quirúrgica de datos estructurados (JSON).
   - *Justificación:* Usa grafos (DAG) y LLMs para entender la semántica de la página. Si la web cambia de diseño, ScrapeGraphAI se adapta sin requerir mantenimiento humano.

### C. El "Bucle Odysseus" (Sub-Agente de Deep Search)
- **Propuesta:** Evolucionar el `SignalExtractor` hacia un agente autónomo de investigación (`ResearchAgent`).
- **Comportamiento:** Ante un Claim dudoso, el agente formula nuevas consultas, busca en la web, evalúa la evidencia, detecta contradicciones y vuelve a buscar iterativamente hasta tener confianza estadística, imitando el flujo del proyecto Odysseus.

## 4. Impacto a Futuro en AthenaCore
- **Escalabilidad Infinita de Fuentes:** Al usar MCP, cualquier desarrollador podrá añadir nuevas fuentes (ej. Telegram, Discord, bases de datos académicas) creando un servidor MCP en cualquier lenguaje, sin tocar el core de Athena.
- **Resiliencia Operativa:** La extracción guiada por LLM (ScrapeGraph) reduce los tiempos caídos por cambios de UI en las fuentes de noticias a prácticamente cero.
- **Calidad Editorial Superior:** El bucle Odysseus garantiza que las señales entregadas al radar editorial (Scorer) no son "fake news" superficiales, sino hipótesis trianguladas y verificadas con rigor periodístico.

## 5. Conclusión
Implementar esta actualización transforma a AthenaSignal de un simple "agregador de feeds" a un **Analista de Inteligencia Autónomo**. Es una actualización fundacional necesaria antes de escalar a cientos de fuentes simultáneas.
