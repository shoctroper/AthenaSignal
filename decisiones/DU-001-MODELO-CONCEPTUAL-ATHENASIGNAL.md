# DU-001 — Modelo Conceptual y Epistemológico de AthenaSignal

- **Fecha:** 2026-09-05
- **Emite:** Arquitecto
- **Estado:** RATIFICADA (Por visión directa del Líder Humano)

---

## 1. Principio Epistemológico Fundamental

> **El contenido externo no es la fuente de verdad ni el producto final de Athena. Es un sensor distribuido.**

AthenaSignal opera bajo la separación estricta e inmutable de 5 dominios:

```
SOURCE (Fuente externa: TikTok, YouTube, Reddit, RSS, Podcasts)
  ↓
SIGNAL (Topic, Concept, Claim, Question, Argument, Assumption, Contradiction)
  ↓
RESEARCH (Investigación independiente en fuentes primarias, papers, benchmarks)
  ↓
KNOWLEDGE (Conocimiento validado y sustentado → AthenaKnowledge)
  ↓
EDITORIAL OPPORTUNITY (Tesis, evidencia y narrativa propia → AthenaFramework / AthenaStudio)
```

**Regla de Oro:** Se prohíbe el atajo `SOURCE → ARTICLE`. La popularidad o engagement de una fuente no incrementa automáticamente la verdad de una afirmación.

---

## 2. Definición de Entidades Centrales

1. **`Source`**: Metadata de origen (plataforma, creador, URL, fecha, id de contenido).
2. **`Content`**: Contenido bruto (título, descripción, audio, idioma).
3. **`Transcript`**: Artefacto de procedencia (*provenance*), normalizado desde subtítulos/captions o Speech-to-Text.
4. **`Signal`**: Estructura extraída conteniendo:
   - **Topics**: Temas principales.
   - **Concepts**: Conceptos técnicos o teóricos.
   - **Claims**: Afirmaciones verificables (registradas obligatoriamente como `UNVERIFIED`).
   - **Questions**: Preguntas explícitas o implícitas.
   - **Arguments**: Líneas argumentativas del creador.
   - **Assumptions**: Supuestos no declarados por el creador.
   - **Contradictions**: Puntos de debate o fricción conceptual.
5. **`ResearchCandidate`**: Señal con alto potencial transformada en hipótesis de investigación.
6. **`ResearchPlan`**: Plan de verificación en fuentes primarias y búsqueda activa de contraargumentos.
7. **`Knowledge`**: Afirmación sustentada con evidencia independiente destinada a `AthenaKnowledge`.
8. **`EditorialOpportunity`**: Oportunidad narrativa evaluada y puntuada para `AthenaStudio`.

---

## 3. Estrategia de Adquisición de Audio/Transcripción

Orden de preferencia obligatorio para minimizar consumo de ancho de banda y almacenamiento:
1. API oficial
2. Captions / Subtítulos
3. Voice-to-Text accesible de la plataforma
4. Audio → Speech-to-Text (Whisper / Gemini Flash STT)
5. Video / MP4 → (Únicamente como último recurso / *fallback*)
