/**
 * Identidad, deduplicación y similitud del radar M4 (ORDEN-008 §3, §6, §8).
 *
 * Toda la identidad deriva de datos observables y es determinista:
 * - contenido de una fuente → contentHash (dedup de fuentes repetidas);
 * - afirmación de una señal → fingerprint (identidad histórica estable);
 * - conceptos de una señal → stems (vinculación cross-source / clustering).
 */

import { createHash } from 'node:crypto';

import type { DiscoveredSignal } from '../autonomous/types.ts';
import { normalizeText, significantTokens } from '../autonomous/epistemic.ts';

/** Stems genéricos (6 caracteres) que no deben vincular clusters entre temas distintos. */
const GENERIC_STEMS = new Set([
  'efecto', 'efecti', 'capaci', 'implem', 'inform', 'sistem', 'person', 'mayore',
  'metabo', 'celula', 'salud', 'riesgo', 'benefi', 'perdid', 'peso', 'dieta',
  'ejerci', 'suplem', 'genera', 'tradic', 'estudi', 'result', 'conclu',
]);

/** Normaliza una cadena (minúsculas, sin acentos, sin puntuación). */
export function normalize(value: string): string {
  return normalizeText(value);
}

/** Hash estable de la afirmación de una señal. */
export function signalFingerprint(signal: DiscoveredSignal): string {
  return createHash('sha256').update(normalize(signal.assertion), 'utf8').digest('hex').slice(0, 16);
}

/** Stems semánticos de una señal (topic + conceptos), sin genéricos. */
export function clusterStems(signal: DiscoveredSignal): string[] {
  const source = [signal.topic, ...signal.concepts].join(' ');
  const stems = new Set<string>();
  for (const token of significantTokens(source)) {
    if (token.length < 4) continue;
    const stem = token.slice(0, Math.min(6, token.length));
    if (GENERIC_STEMS.has(stem)) continue;
    stems.add(stem);
  }
  return [...stems].sort();
}

/** Solapamiento de stems entre dos conjuntos. */
export function sharedStems(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((stem) => setB.has(stem));
}

/** Jaccard de stems. */
export function stemJaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size && !setB.size) return 0;
  let intersection = 0;
  for (const stem of setA) if (setB.has(stem)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union ? intersection / union : 0;
}

/** ¿Dos señales pertenecen al mismo tema (mismo cluster)? */
export function sameCluster(a: string[], b: string[]): boolean {
  const shared = sharedStems(a, b);
  if (shared.length >= 2) return true;
  if (shared.some((stem) => stem.length >= 5)) return true;
  return stemJaccard(a, b) >= 0.34;
}

/** Etiqueta legible de un cluster a partir de su señal fundadora. */
export function clusterLabel(signal: DiscoveredSignal): string {
  const concept = signal.concepts.find((entry) => entry.trim().length > 0);
  const label = (concept ?? signal.topic).replace(/\s+/g, ' ').trim();
  return label.length > 80 ? label.slice(0, 80) : label || 'tema';
}

/** Identificador estable de cluster. */
export function clusterIdFor(label: string): string {
  const slug = normalize(label)
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `cl-${slug || 'tema'}`;
}

const POSITIVE_CUES =
  /\b(?:puede|pueden|mejora|mejoran|acelera|aceleran|reduce|reducen|ayuda|ayudan|aumenta|aumentan|permite|permiten|eficaz|efectivo|beneficia|beneficio|supera|introdujo|anadio|logra)\b/i;
const NEGATIVE_CUES =
  /\b(?:no|nunca|sin|tampoco|niega|niegan|refuta|refutan|desmiente|desmienten|insuficiente|limitad[oa]|escasa|escaso|contradictori[oa]|descartad[oa])\b/i;

/** Polaridad editorial de una afirmación: 1 positiva, -1 negativa, 0 neutra. */
export function assertionPolarity(assertion: string): number {
  const normalized = normalize(assertion);
  const negative = NEGATIVE_CUES.test(normalized);
  const positive = POSITIVE_CUES.test(normalized);
  if (negative && !positive) return -1;
  if (positive && !negative) return 1;
  return 0;
}

/** Conteo de tokens significativos de un texto (para scoring). */
export function tokenCount(value: string): number {
  return significantTokens(value).length;
}
