import type { Claim } from '../domain/entities.ts';
import type { ClaimSearchProvider, EvidenceItem } from './ClaimVerifier.ts';

interface CorpusEntry {
  patterns: RegExp[];
  supports: boolean | null;
  source: string;
  excerpt: string;
}

/**
 * Buscador sin evidencia: siempre devuelve `[]`. Determinista.
 * Usado para forzar el camino `UNVERIFIED_AMBIGUOUS` tras 3 ciclos.
 */
export class NoEvidenceProvider implements ClaimSearchProvider {
  search(): EvidenceItem[] {
    return [];
  }
}

/**
 * Buscador determinista basado en un corpus fijo de patrones. No usa red ni
 * aleatoriedad. Reemplaza al antiguo `Math.random` del ClaimVerifier.
 */
export class DeterministicEvidenceProvider implements ClaimSearchProvider {
  private readonly corpus: CorpusEntry[];

  constructor(corpus?: CorpusEntry[]) {
    this.corpus = corpus ?? DEFAULT_CORPUS;
  }

  search(_query: string, claim: Claim): EvidenceItem[] {
    // Se clasifica por el enunciado del claim (no por la query, que incluye el
    // topic y sesgaría el corpus). Determinista y sin red.
    const haystack = claim.statement;
    const results: EvidenceItem[] = [];
    for (const entry of this.corpus) {
      if (entry.patterns.some((pattern) => pattern.test(haystack))) {
        results.push({ supports: entry.supports, source: entry.source, excerpt: entry.excerpt });
      }
    }
    return results;
  }
}

export const DEFAULT_CORPUS: CorpusEntry[] = [
  {
    patterns: [/rabbitmq/i],
    supports: true,
    source: 'https://www.rabbitmq.com/docs',
    excerpt: 'La documentacion oficial de RabbitMQ confirma su enrutamiento AMQP y su baja latencia.',
  },
  {
    patterns: [/kafka/i, /commit log/i, /particion/i, /partition/i],
    supports: true,
    source: 'https://kafka.apache.org/documentation/',
    excerpt: 'Apache Kafka documenta el commit log apendizado y el orden por particion.',
  },
  {
    patterns: [/latencia|throughput/i],
    supports: true,
    source: 'https://benchmark.example.org/messaging-2026',
    excerpt: 'Mediciones reproducibles confirman los perfiles de latencia y throughput descritos.',
  },
  {
    patterns: [/destaca|sobresale|superior|mejor/i],
    supports: false,
    source: 'https://benchmark.example.org/comparativa-2026',
    excerpt: 'Benchmarks independientes no respaldan una superioridad general entre ambos brokers.',
  },
];
