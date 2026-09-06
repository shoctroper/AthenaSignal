import { ISourceAdapter, NormalizedContent } from './ISourceAdapter';

/**
 * Adaptador Firecrawl para webs genéricas y SPAs.
 * Llama a la API (o self-hosted endpoint) de Firecrawl para extraer el DOM limpio en formato Markdown.
 */
export class FirecrawlAdapter implements ISourceAdapter {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string = 'http://localhost:3002', apiKey: string = '') {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  canHandle(urlOrSource: string): boolean {
    // Si no es un sitio de red social (handled by AgentReach), Firecrawl puede intentarlo.
    const socialPatterns = ['youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'reddit.com'];
    return urlOrSource.startsWith('http') && !socialPatterns.some(p => urlOrSource.includes(p));
  }

  async acquire(urlOrSource: string): Promise<NormalizedContent> {
    console.log(`[FirecrawlAdapter] Rastreando sitio web para Markdown limpio: ${urlOrSource}`);
    
    // Simulación de llamada a Firecrawl SDK/API
    const mockFirecrawlResponse = {
      markdown: `# Título extraído de ${urlOrSource}\n\nEste es el contenido completo de la página, sin sidebars ni footers.`,
      metadata: {
        title: `Artículo de ${urlOrSource}`,
        description: 'Descripción meta del sitio',
        language: 'es'
      }
    };

    return {
      source: {
        platform: 'web',
        creator: 'Web Publisher',
        url: urlOrSource,
        publishedAt: new Date().toISOString(),
        contentId: urlOrSource
      },
      title: mockFirecrawlResponse.metadata.title,
      description: mockFirecrawlResponse.metadata.description,
      transcript: mockFirecrawlResponse.markdown,
      language: mockFirecrawlResponse.metadata.language,
      metadata: { crawler: 'Firecrawl v1.0' }
    };
  }
}
