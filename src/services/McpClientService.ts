import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

/**
 * Cliente base para interactuar con servidores MCP (Model Context Protocol).
 */
export class McpClientService {
  private serverUrl: string;
  private client: Client | null = null;
  private transport: SSEClientTransport | null = null;

  constructor(serverUrl: string = 'http://localhost:5000') {
    this.serverUrl = serverUrl;
  }

  /**
   * Inicializa la conexión con el servidor MCP a través de SSE.
   */
  async connect(): Promise<void> {
    if (this.client) return;

    const baseUrl = this.serverUrl.replace(/\/+$/, '');
    const sseUrl = new URL(`${baseUrl}/sse`);
    
    this.transport = new SSEClientTransport(sseUrl);
    
    this.client = new Client(
      {
        name: "AthenaSignal-McpClient",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    try {
      await this.client.connect(this.transport);
      console.log(`[McpClient] Conectado exitosamente a ${this.serverUrl}`);
    } catch (error) {
      console.error(`[McpClient] Error al conectar con ${this.serverUrl}:`, error);
      this.client = null;
      this.transport = null;
      throw error;
    }
  }

  /**
   * Ejecuta una herramienta remota definida en un servidor MCP.
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<{ data?: any; error?: string }> {
    try {
      if (!this.client) {
        await this.connect();
      }

      console.log(`[McpClient] Ejecutando tool remota: ${toolName} en ${this.serverUrl}`);
      
      const response = await this.client!.request(
        {
          method: "tools/call",
          params: {
            name: toolName,
            arguments: args,
          }
        },
        Object as any // Evitamos la validación estricta de Zod si no importamos schemas
      ) as any;

      // El estándar MCP retorna la información en un arreglo `content`
      const contentArr = response?.content || [];
      const textContent = contentArr.find((c: any) => c.type === 'text')?.text;
      
      let parsedData = null;
      if (textContent) {
        try {
          // Intentar parsear a JSON (útil para resultados de AgentReach o herramientas estructuradas)
          parsedData = JSON.parse(textContent);
        } catch (e) {
          // Fallback a texto crudo
          parsedData = textContent;
        }
      }

      return {
        data: parsedData || response
      };
    } catch (error: any) {
      console.error(`[McpClient] Error en callTool (${toolName}):`, error);
      return { error: error.message || String(error) };
    }
  }

  /**
   * Cierra la conexión.
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }
    this.client = null;
    this.transport = null;
    console.log(`[McpClient] Desconectado de ${this.serverUrl}`);
  }
}
