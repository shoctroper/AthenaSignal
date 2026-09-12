/**
 * EmbeddingProvider local-first (ORDEN-009 §4).
 *
 * Preferencia `LOCAL → LOCAL-ALT → DETERMINISTIC`: la similitud semántica usada
 * para deduplicar handoffs y relacionar señales se resuelve con un embedding
 * determinista y offline (bag-of-words hasheado). No requiere red y es
 * reproducible, de modo que la aceptación no depende de un modelo remoto.
 *
 * El core nunca conoce el proveedor concreto: sólo la interfaz
 * `EmbeddingProvider`.
 */

import { createHash } from 'node:crypto';

export interface Embedding {
  vector: number[];
  dimension: number;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly route: 'LOCAL' | 'LOCAL_ALT' | 'DETERMINISTIC_FALLBACK';
  embed(text: string): Embedding;
}

export const EMBEDDING_DIMENSION = 64;

function tokenize(text: string): string[] {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

/**
 * Embedding determinista: hashea cada token a una dimensión y acumula
 * frecuencia, luego normaliza L2. Dos textos equivalentes producen el mismo
 * vector en cualquier corrida.
 */
export function hashEmbedding(text: string, dimension = EMBEDDING_DIMENSION): Embedding {
  const vector = new Array<number>(dimension).fill(0);
  for (const token of tokenize(text)) {
    const digest = createHash('sha256').update(token, 'utf8').digest();
    const index = digest.readUInt32BE(0) % dimension;
    const sign = digest[4] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  const normalized = norm === 0 ? vector : vector.map((value) => Number((value / norm).toFixed(6)));
  return { vector: normalized, dimension };
}

export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.dimension !== b.dimension) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.dimension; i += 1) {
    dot += a.vector[i] * b.vector[i];
    normA += a.vector[i] * a.vector[i];
    normB += b.vector[i] * b.vector[i];
  }
  if (!normA || !normB) return 0;
  return Number((dot / (Math.sqrt(normA) * Math.sqrt(normB))).toFixed(6));
}

/** Proveedor local (primario) de embeddings. */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'embedding-local-hash';
  readonly route = 'LOCAL' as const;

  embed(text: string): Embedding {
    return hashEmbedding(text);
  }
}

/**
 * Cadena de embeddings local-first con fallback determinista (mismo algoritmo,
 * distinta etiqueta de provenance: permite observar qué ruta resolvió).
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'embedding-deterministic';
  readonly route = 'DETERMINISTIC_FALLBACK' as const;

  embed(text: string): Embedding {
    return hashEmbedding(text);
  }
}

export function defaultEmbeddingProvider(): EmbeddingProvider {
  return new LocalEmbeddingProvider();
}

/** Distancia semántica usada para suprimir handoffs casi idénticos. */
export const NEAR_DUPLICATE_THRESHOLD = 0.92;
