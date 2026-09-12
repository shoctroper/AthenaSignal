/**
 * Utilidades de provenance para M2 (ORDEN-006 §9).
 *
 * Cada fuente real capturada se conserva como snapshot vendoreado con URL,
 * plataforma, idioma, fecha de captura y hash SHA-256 del contenido. El hash
 * hace reproducible la evidencia sin depender de la red.
 */

import { createHash } from 'node:crypto';

import type { Provenance, SourceRole } from '../domain/entities.ts';
import type { NormalizedContent } from '../adapters/ISourceAdapter.ts';

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export interface ProvenanceInput {
  sourceId: string;
  url: string;
  platform: string;
  language: string;
  title: string;
  role: SourceRole;
  capturedAt: string;
  content: string;
}

export function buildProvenance(input: ProvenanceInput): Provenance {
  return {
    sourceId: input.sourceId,
    url: input.url,
    platform: input.platform,
    language: input.language,
    title: input.title,
    role: input.role,
    capturedAt: input.capturedAt,
    contentHash: hashContent(input.content),
  };
}

/**
 * Construye el snapshot de provenance de un `NormalizedContent` vendoreado.
 */
export function provenanceFromContent(
  content: NormalizedContent,
  options: { sourceId: string; role: SourceRole; capturedAt: string }
): Provenance {
  const snapshot = `${content.title}\n${content.description}\n${content.transcript}`;
  return buildProvenance({
    sourceId: options.sourceId,
    url: content.source.url,
    platform: content.source.platform,
    language: content.language,
    title: content.title,
    role: options.role,
    capturedAt: options.capturedAt,
    content: snapshot,
  });
}
