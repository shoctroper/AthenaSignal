# RFC-003 — Arquitectura Técnica de Componentes y Adapters de AthenaSignal

- **Fecha:** 2026-09-05
- **Emite:** Arquitecto
- **Estado:** PROPUESTA EN DISCUSIÓN (Evaluada por Cuestionador)

---

## 1. Módulos Principales de la Solución

```text
[ Capa de Adquisición (Adapters) ] ──> NormalizedContent
                │
                ↓
[ Extractor de Señales (LLM Spec) ] ──> Signal (Topics, Claims, Questions)
                │
                ↓
[ Puntuador de Oportunidad (Scorer) ] ──> EditorialScore (0.0 - 1.0)
                │
                ↓
[ Radar Editorial (Dashboard / API) ] ──> ResearchCandidate
```

---

## 2. Definición de Interfaces del Dominio

### A. Adquisición (`ISourceAdapter`)
```typescript
export interface NormalizedSource {
  platform: 'tiktok' | 'youtube' | 'reddit' | 'rss' | 'blog' | 'podcast';
  creator: string;
  url: string;
  publishedAt: string;
  contentId: string;
}

export interface NormalizedContent {
  source: NormalizedSource;
  title: string;
  description: string;
  transcript: string;
  language: string;
  metadata: Record<string, unknown>;
}

export interface ISourceAdapter {
  canHandle(urlOrSource: string): boolean;
  acquire(urlOrSource: string): Promise<NormalizedContent>;
}
```

### B. Extracción de Señales (`ISignalExtractor`)
```typescript
export interface Claim {
  statement: string;
  status: 'UNVERIFIED';
  provenanceSourceId: string;
}

export interface SignalExtractorResult {
  topic: string;
  concepts: string[];
  claimsToInvestigate: Claim[];
  questions: string[];
  arguments: string[];
  assumptions: string[];
  contradictions: string[];
  potentialAngles: string[];
}

export interface ISignalExtractor {
  extract(content: NormalizedContent): Promise<SignalExtractorResult>;
}
```

### C. Evaluación y Radar Editorial (`IEditorialScorer`)
```typescript
export interface EditorialMetrics {
  novelty: number;            // 0.0 - 1.0
  researchability: number;    // 0.0 - 1.0
  audienceRelevance: number;  // 0.0 - 1.0
  contradictionTension: number; // 0.0 - 1.0
  evidenceDensity: number;    // 0.0 - 1.0
  athenaPotential: number;    // 0.0 - 1.0
  timeliness: number;         // 0.0 - 1.0
}

export interface EditorialOpportunity {
  id: string;
  topic: string;
  score: number; // Ponderado global
  metrics: EditorialMetrics;
  candidate: SignalExtractorResult;
}

export interface IEditorialScorer {
  score(signal: SignalExtractorResult): EditorialMetrics;
  calculateGlobalScore(metrics: EditorialMetrics): number;
}
```

---

## 3. Evaluación del Cuestionador (Red Teaming sobre RFC-003)

1. **La Objeción Más Fuerte:** Las plataformas externas (TikTok/YouTube/Reddit) cambian frecuentemente sus selectores o requieren autenticación/captchas. Si el `ISourceAdapter` depende únicamente de agentes Playwright sin resiliencia, la adquisición fallará continuamente.
   - *Solución:* Los `ISourceAdapter` deben ser plugins desacoplados con fallback en cascada (API oficial → Captions estáticos → Playwright Headless Agent → Manual Input).
2. **El Supuesto No Declarado:** Se asume que el Speech-to-Text de fuentes sin subtítulos será lo suficientemente preciso para extraer términos técnicos en español/inglés.
   - *Mecanismo de Falsación:* Probar el pipeline de transcripción con 5 videos de jerga técnica compleja (ej. RabbitMQ AMQP vs Kafka commit log) y verificar la tasa de error en palabras clave (*Word Error Rate* en términos de dominio).
3. **Costo de Oportunidad:** Implementar los 6 adapters simultáneamente ralentizaría el MVP. Se prioriza el MVP en 2 Fases (Fase 1: TikTok + Captions/STT + Signal Extractor; Fase 2: Radar + Research Candidate).
