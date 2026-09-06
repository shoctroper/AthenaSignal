/**
 * Interfaces del contrato de la Capa de Adquisición (Adapters) de AthenaSignal.
 * Basado en RFC-003 (Arquitectura Técnica de Componentes y Adapters).
 */

export interface NormalizedSource {
  platform: 'tiktok' | 'youtube' | 'reddit' | 'rss' | 'blog' | 'podcast' | string;
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
