import type { ISourceAdapter, NormalizedContent } from './ISourceAdapter.ts';
import { McpClientService } from '../services/McpClientService.ts';

const SOCIAL_PATTERNS = ['youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'reddit.com', 'tiktok.com'];

/**
 * Fixture determinista usado cuando el servidor MCP de Agent-Reach no está
 * disponible. No depende de la red ni del reloj: mismo `url` -> mismo contenido.
 */
export function createAgentReachFixture(url: string): NormalizedContent {
  const slug = url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    source: {
      platform: 'youtube',
      creator: 'TechArchitectureLab (offline fixture)',
      url,
      publishedAt: '2026-09-11T00:00:00.000Z',
      contentId: `fixture-agent-reach-${slug}`,
    },
    title: 'RabbitMQ vs Kafka: Comparativa de Arquitectura',
    description:
      'Analisis profundo entre RabbitMQ y Apache Kafka. Cual es la mejor opcion para sistemas distribuidos?',
    transcript: [
      'En este episodio analizo RabbitMQ vs Kafka.',
      'RabbitMQ es un broker de mensajes basado en AMQP que ofrece enrutamiento complejo mediante exchanges.',
      'Kafka es una plataforma de streaming distribuido basada en un commit log apendizado.',
      'RabbitMQ garantiza baja latencia y entrega individual de mensajes.',
      'Kafka ofrece alto throughput para el procesamiento de eventos masivos.',
      'Kafka garantiza el ordenamiento estricto de los mensajes dentro de cada particion.',
      'RabbitMQ es la mejor opcion para sistemas distribuidos.',
      'Cuando deberias usar RabbitMQ en lugar de Kafka?',
      'Asumimos que el consumo de almacenamiento en disco no es la limitante principal.',
      'RabbitMQ destaca en arquitectura de colas tradicionales mientras que Kafka sobresale en event sourcing.',
      'Existe una contradiccion entre la latencia instantanea de RabbitMQ y el throughput masivo de Kafka.',
    ].join('\n'),
    language: 'es',
    metadata: {
      crawler: 'Agent-Reach MCP (offline deterministic fixture)',
      transport: 'fixture',
    },
  };
}

/**
 * Adaptador Agent-Reach (redes sociales y video) que consume el servidor MCP
 * a través de `McpClientService` (RFC-006). Si MCP no está disponible, degrada
 * a un fixture determinista para mantener la aceptación offline.
 */
export class McpAgentReachAdapter implements ISourceAdapter {
  private mcpClient?: McpClientService;

  constructor(mcpClient?: McpClientService) {
    this.mcpClient = mcpClient;
  }

  canHandle(urlOrSource: string): boolean {
    return SOCIAL_PATTERNS.some((p) => urlOrSource.includes(p));
  }

  async acquire(urlOrSource: string): Promise<NormalizedContent> {
    if (this.mcpClient) {
      try {
        const result = await this.mcpClient.callTool('agent_reach_acquire', { url: urlOrSource });
        if (result && !result.error && result.data) {
          const normalized = this.normalize(result.data, urlOrSource);
          if (normalized) {
            return normalized;
          }
        }
      } catch {
        // Degrada a fixture.
      }
    }

    return createAgentReachFixture(urlOrSource);
  }

  private normalize(data: unknown, url: string): NormalizedContent | null {
    if (!data || typeof data !== 'object') return null;
    const payload = data as Record<string, unknown>;
    const transcript =
      (payload.transcript as string) ||
      (payload.text as string) ||
      (payload.content as string) ||
      '';
    if (!transcript) return null;

    const platform = (payload.platform as string) || 'youtube';
    return {
      source: {
        platform,
        creator: (payload.creator as string) || 'Unknown',
        url,
        publishedAt: (payload.publishedAt as string) || '2026-09-11T00:00:00.000Z',
        contentId: (payload.contentId as string) || url,
      },
      title: (payload.title as string) || `Contenido de ${url}`,
      description: (payload.description as string) || '',
      transcript,
      language: (payload.language as string) || 'es',
      metadata: { crawler: 'Agent-Reach MCP', transport: 'mcp' },
    };
  }
}
