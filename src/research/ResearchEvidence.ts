/**
 * Investigación inicial por replay de evidencia vendoreada (ORDEN-006 §9).
 *
 * Este módulo implementa la etapa INITIAL RESEARCH de forma determinista y
 * offline: en lugar de salir a la red, reproduce un corpus de evidencia
 * registrada con referencias a fuentes reales. Cada hallazgo distingue
 * explícitamente `FACT` / `EVIDENCE` de `MODEL_INTERPRETATION` y
 * `EDITORIAL_REFRAMING`.
 */

import type {
  AthenaOsProposedSource,
  FindingKind,
  ResearchAssessment,
  Claim,
} from '../domain/entities.ts';

export interface ResearchFinding {
  kind: FindingKind;
  text: string;
  refs: string[];
  /** true = soporta, false = contradice, null = inconcluso. */
  supports: boolean | null;
}

export interface Reframe {
  question: string;
  note: string;
  candidateFact: string;
}

export interface ResearchCorpusEntry {
  id: string;
  match: RegExp[];
  candidateTitle: string;
  context: string[];
  entities: string[];
  researchQuestion: string;
  proposedSources: AthenaOsProposedSource[];
  findings: ResearchFinding[];
  reframe?: Reframe;
  assessmentHint?: ResearchAssessment;
}

export interface ResearchMatch {
  entry: ResearchCorpusEntry;
  findings: ResearchFinding[];
}

export interface ResearchEvidenceProvider {
  research(text: string, claim?: Claim): ResearchMatch[];
}

export function proposedSource(
  url: string,
  title: string,
  language: string,
  role: 'DISCOVERY' | 'EVIDENCE',
  proposedTrustTier: string,
  accessedAt: string
): AthenaOsProposedSource {
  return {
    url,
    title,
    language,
    role,
    eligibility: {
      hasIdentifiableOrigin: true,
      hasTraceableLocation: true,
      hasTemporalContext: true,
      hasRecoverableEvidence: true,
    },
    proposedTrustTier,
    accessedAt,
  };
}

const KAFKA_ENTRY: ResearchCorpusEntry = {
  id: 'corpus-kafka-vs-rabbitmq',
  match: [/kafka/i, /rabbitmq/i, /message broker/i, /event streaming/i],
  candidateTitle: 'Kafka frente a RabbitMQ: cuándo usar cada broker',
  context: [
    'Arquitecturas event-driven',
    'Mensajería distribuida y streaming',
    'Comparación de brokers (Kafka vs RabbitMQ)',
  ],
  entities: ['Apache Kafka', 'RabbitMQ', 'AMQP', 'Commit Log', 'Topics', 'Particiones'],
  researchQuestion:
    '¿En qué escenarios conviene Apache Kafka frente a RabbitMQ para mensajería y event streaming, y con qué evidencia se puede sostener?',
  proposedSources: [
    proposedSource(
      'https://kafka.apache.org/intro',
      'Apache Kafka — Introduction',
      'en',
      'EVIDENCE',
      'official_documentation',
      '2026-09-11T00:00:00.000Z'
    ),
    proposedSource(
      'https://www.rabbitmq.com/tutorials/amqp-concepts',
      'RabbitMQ — AMQP 0-9-1 Model Explained',
      'en',
      'EVIDENCE',
      'official_documentation',
      '2026-09-11T00:00:00.000Z'
    ),
  ],
  findings: [
    {
      kind: 'FACT',
      text: 'Apache Kafka es una plataforma distribuida de event streaming que combina publish/subscribe, almacenamiento durable y procesamiento de streams.',
      refs: ['https://kafka.apache.org/intro'],
      supports: true,
    },
    {
      kind: 'EVIDENCE',
      text: 'La documentación oficial describe topics particionados, replicación y garantía de orden por partición, lo que sostiene las propiedades de escalabilidad y durabilidad.',
      refs: ['https://kafka.apache.org/documentation/'],
      supports: true,
    },
    {
      kind: 'MODEL_INTERPRETATION',
      text: 'La fuente es documentación del propio proyecto: describe capacidades pero no compara con RabbitMQ; la comparación requiere evidencia adicional e independiente.',
      refs: ['https://kafka.apache.org/intro'],
      supports: null,
    },
  ],
  assessmentHint: 'SUPPORTED',
};

const AIRLLM_ENTRY: ResearchCorpusEntry = {
  id: 'corpus-airllm-deepseek',
  match: [/airllm/i],
  candidateTitle: 'AirLLM y modelos MoE de gran escala en hardware de consumo',
  context: [
    'Inferencia local de LLM en hardware de consumo',
    'Distinción VRAM (GPU) vs RAM (sistema)',
    'Modelos MoE y streaming de capas',
  ],
  entities: ['AirLLM', 'DeepSeek-V3', 'DeepSeek V4', 'VRAM', 'RAM', 'MoE'],
  researchQuestion:
    '¿Puede AirLLM ejecutar modelos MoE de gran escala como DeepSeek-V3 (671B) en hardware de consumo con ~12 GB de VRAM, y cuáles son los requisitos reales de RAM/disco y los límites de latencia?',
  proposedSources: [
    proposedSource(
      'https://pypi.org/project/airllm/',
      'airllm — PyPI (v4.0.0)',
      'en',
      'EVIDENCE',
      'official_package_registry',
      '2026-09-11T00:00:00.000Z'
    ),
    proposedSource(
      'https://github.com/lyogavin/airllm',
      'lyogavin/airllm — GitHub',
      'en',
      'EVIDENCE',
      'primary_source_repository',
      '2026-09-11T00:00:00.000Z'
    ),
  ],
  findings: [
    {
      kind: 'EVIDENCE',
      text: 'La documentación de AirLLM (PyPI v4.0.0, 2026) afirma ejecutar DeepSeek-V3 (671B) con ~12 GB de VRAM; no menciona DeepSeek V4.',
      refs: ['https://pypi.org/project/airllm/'],
      supports: false,
    },
    {
      kind: 'FACT',
      text: 'AirLLM mantiene solo una capa del modelo en la GPU a la vez; la memoria requerida depende del tamaño de capa, no del tamaño total del modelo.',
      refs: ['https://github.com/lyogavin/airllm'],
      supports: true,
    },
    {
      kind: 'MODEL_INTERPRETATION',
      text: 'La afirmación original confunde VRAM con RAM del sistema y atribuye a una versión (V4) no documentada una capacidad medida sobre DeepSeek-V3.',
      refs: ['https://pypi.org/project/airllm/'],
      supports: false,
    },
  ],
  reframe: {
    question:
      '¿Puede AirLLM ejecutar modelos MoE de gran escala como DeepSeek-V3 (671B) en hardware de consumo con ~12 GB de VRAM, y cuáles son los requisitos reales de RAM/disco y los límites de latencia?',
    note:
      'La afirmación original "AirLLM permite ejecutar DeepSeek V4 localmente con 12 GB de RAM" no se acepta como hecho: confunde VRAM con RAM del sistema y menciona una versión (V4) no documentada. Se conserva la idea subyacente como pregunta investigable.',
    candidateFact:
      'AirLLM puede ejecutar modelos MoE de gran escala (p. ej. DeepSeek-V3 671B) con ~12 GB de VRAM, sujeto a requisitos reales de RAM del sistema, disco y latencia.',
  },
  assessmentHint: 'REFRAMED',
};

export const CURATED_RESEARCH_CORPUS: ResearchCorpusEntry[] = [KAFKA_ENTRY, AIRLLM_ENTRY];

/**
 * Proveedor determinista: clasifica por el texto del snapshot más el
 * enunciado del claim. Sin red ni aleatoriedad.
 */
export class VendoredResearchProvider implements ResearchEvidenceProvider {
  private readonly corpus: ResearchCorpusEntry[];

  constructor(corpus: ResearchCorpusEntry[] = CURATED_RESEARCH_CORPUS) {
    this.corpus = corpus;
  }

  research(text: string, claim?: Claim): ResearchMatch[] {
    const haystack = `${text}\n${claim?.statement ?? ''}`;
    const matches: ResearchMatch[] = [];
    for (const entry of this.corpus) {
      if (entry.match.some((pattern) => pattern.test(haystack))) {
        matches.push({ entry, findings: entry.findings });
      }
    }
    return matches;
  }
}
