import { ISourceAdapter, NormalizedContent } from './ISourceAdapter';

/**
 * Adaptador MCP para Agent-Reach.
 * Se conecta vía MCP (Model Context Protocol) a un servidor Python (Agent-Reach)
 * para realizar la minería social a costo cero evadiendo bloqueos anti-bot.
 */
export class McpAgentReachAdapter implements ISourceAdapter {
  private mcpClient: any;

  constructor(mcpClient: any) {
    this.mcpClient = mcpClient;
  }

  canHandle(urlOrSource: string): boolean {
    const supportedPatterns = ['youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'reddit.com'];
    return supportedPatterns.some(pattern => urlOrSource.includes(pattern));
  }

  async acquire(urlOrSource: string): Promise<NormalizedContent> {
    console.log(`[McpAgentReachAdapter] Solicitando extracción al servidor MCP Agent-Reach para: ${urlOrSource}`);
    
    // Llamada hipotética al protocolo MCP
    const response = await this.mcpClient.callTool('agent_reach_extract', { url: urlOrSource });
    
    if (response.error) {
        throw new Error(`Fallo en Agent-Reach MCP: ${response.error}`);
    }

    return {
      source: {
        platform: this.detectPlatform(urlOrSource),
        creator: response.data.author || 'Unknown',
        url: urlOrSource,
        publishedAt: response.data.date || new Date().toISOString(),
        contentId: response.data.id || 'N/A'
      },
      title: response.data.title || 'Contenido extraído por Agent-Reach',
      description: response.data.summary || '',
      transcript: response.data.full_text || '',
      language: response.data.lang || 'es',
      metadata: { tool_used: 'Agent-Reach MCP', auth_tier: 'tier-1-cookie' }
    };
  }

  private detectPlatform(url: string): string {
    if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube';
    if (url.includes('twitter') || url.includes('x.com')) return 'twitter';
    if (url.includes('reddit')) return 'reddit';
    return 'unknown_social';
  }
}
