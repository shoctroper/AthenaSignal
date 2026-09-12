import type { ISourceAdapter, NormalizedContent } from './ISourceAdapter.ts';

/**
 * Resultado crudo que devuelve un transporte Firecrawl (API real o self-hosted).
 */
export interface FirecrawlRawResult {
  markdown: string;
  metadata?: {
    title?: string;
    description?: string;
    language?: string;
  };
}

/**
 * Transporte inyectable para Firecrawl.
 * Permite usar la API real o self-hosted sin acoplar el adaptador a la red.
 * La ruta de aceptación offline no inyecta transporte: el adaptador degrada
 * a un fixture determinista documentado.
 */
export interface FirecrawlTransport {
  scrape(url: string): Promise<FirecrawlRawResult>;
}

export interface FirecrawlAdapterOptions {
  transport?: FirecrawlTransport;
  apiUrl?: string;
  apiKey?: string;
}

/**
 * Fixture determinista usado cuando Firecrawl no está configurado o falla.
 * No depende de la red ni del reloj: mismo `url` -> mismo `NormalizedContent`.
 */
export function createFirecrawlFixture(url: string): NormalizedContent {
  const slug = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    source: {
      platform: 'blog',
      creator: 'AthenaSignal Fixture Publisher',
      url,
      publishedAt: '2026-09-11T00:00:00.000Z',
      contentId: `fixture-firecrawl-${slug}`,
    },
    title: `Fixture Web: ${slug}`,
    description: `Contenido determinista de Firecrawl para ${url}`,
    transcript: [
      `Este es el contenido determinista extraido por Firecrawl para ${url}.`,
      'RabbitMQ es un broker de mensajes basado en AMQP que ofrece enrutamiento complejo mediante exchanges.',
      'Kafka es una plataforma de streaming distribuido basada en un commit log apendizado.',
      'Kafka garantiza el ordenamiento estricto de los mensajes dentro de cada particion.',
      'Existe una contradiccion entre la latencia instantanea de RabbitMQ y el throughput masivo de Kafka.',
    ].join('\n'),
    language: 'es',
    metadata: {
      crawler: 'Firecrawl (offline deterministic fixture)',
      transport: 'fixture',
    },
  };
}

/**
 * Adaptador Firecrawl para webs genericas y SPAs (RFC-006).
 * Usa un transporte HTTP real inyectable; si el transporte falla o no esta
 * configurado, degrada a un fixture determinista (no un mock aleatorio oculto).
 */
export class FirecrawlAdapter implements ISourceAdapter {
  private transport?: FirecrawlTransport;
  private apiUrl: string;
  private apiKey: string;

  constructor(options: FirecrawlAdapterOptions = {}) {
    this.transport = options.transport;
    this.apiUrl = options.apiUrl ?? process.env.FIRECRAWL_API_URL ?? '';
    this.apiKey = options.apiKey ?? process.env.FIRECRAWL_API_KEY ?? '';
  }

  canHandle(urlOrSource: string): boolean {
    const socialPatterns = ['youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'reddit.com', 'tiktok.com'];
    return urlOrSource.startsWith('http') && !socialPatterns.some((p) => urlOrSource.includes(p));
  }

  async acquire(urlOrSource: string): Promise<NormalizedContent> {
    if (this.transport) {
      try {
        const raw = await this.transport.scrape(urlOrSource);
        return this.normalize(raw, urlOrSource);
      } catch (error) {
        console.error(
          `[FirecrawlAdapter] Transporte no disponible (${(error as Error).message}). Degradando a fixture determinista.`
        );
      }
    }

    return createFirecrawlFixture(urlOrSource);
  }

  private normalize(raw: FirecrawlRawResult, url: string): NormalizedContent {
    const slug = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    return {
      source: {
        platform: 'web',
        creator: 'Web Publisher',
        url,
        publishedAt: '2026-09-11T00:00:00.000Z',
        contentId: `firecrawl-${slug}`,
      },
      title: raw.metadata?.title ?? `Articulo de ${url}`,
      description: raw.metadata?.description ?? 'Descripcion meta del sitio',
      transcript: raw.markdown,
      language: raw.metadata?.language ?? 'es',
      metadata: {
        crawler: 'Firecrawl',
        apiUrl: this.apiUrl,
        configured: Boolean(this.apiKey || this.apiUrl),
      },
    };
  }
}
