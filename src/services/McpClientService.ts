/**
 * Cliente base para interactuar con servidores MCP (Model Context Protocol).
 *
 * El SDK oficial de MCP es una dependencia opcional: se carga de forma dinámica
 * (lazy) y, si no está instalado o el servidor no está disponible, el cliente
 * devuelve un error controlado para que el adaptador degrade a un fixture
 * determinista. De esta forma la aceptación de M1 corre sin red y sin SDK.
 */

export interface McpToolResult {
  data?: unknown;
  error?: string;
}

/**
 * Transporte MCP inyectable. Permite conectar el cliente a un servidor real
 * (SSE/stdio) o a un fake determinista en pruebas, sin acoplar el módulo al SDK.
 */
export interface McpTransport {
  connect(): Promise<void>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  close(): Promise<void>;
}

export class McpClientService {
  private serverUrl: string;
  private transport?: McpTransport;

  constructor(serverUrl: string = 'http://localhost:5000', transport?: McpTransport) {
    this.serverUrl = serverUrl;
    this.transport = transport ?? this.createDefaultTransport();
  }

  /**
   * Inyecta o reemplaza el transporte MCP en tiempo de ejecución.
   */
  setTransport(transport?: McpTransport): void {
    this.transport = transport;
  }

  /**
   * Inicializa la conexión si existe un transporte disponible.
   */
  async connect(): Promise<void> {
    if (!this.transport) {
      throw new Error('[McpClient] No hay transporte MCP disponible.');
    }
    await this.transport.connect();
  }

  /**
   * Ejecuta una herramienta remota definida en un servidor MCP.
   * Nunca lanza: devuelve `{ error }` para permitir el fallback determinista.
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    try {
      if (!this.transport) {
        return { error: 'MCP transport not available' };
      }
      await this.transport.connect();
      return await this.transport.callTool(toolName, args);
    } catch (error) {
      return { error: (error as Error).message || String(error) };
    }
  }

  /**
   * Cierra la conexión.
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // La desconexión es best-effort.
      }
    }
  }

  /**
   * Intenta construir un transporte real basado en el SDK oficial de MCP.
   * Devuelve `undefined` si el SDK no está instalado o falla la carga.
   */
  private createDefaultTransport(): McpTransport | undefined {
    const serverUrl = this.serverUrl;
    let client: any = null;
    let sdkTransport: any = null;

    return {
      async connect(): Promise<void> {
        if (client) return;
        const clientMod: any = await import('@modelcontextprotocol/sdk/client/index.js');
        const sseMod: any = await import('@modelcontextprotocol/sdk/client/sse.js');
        sdkTransport = new sseMod.SSEClientTransport(new URL(`${serverUrl.replace(/\/+$/, '')}/sse`));
        client = new clientMod.Client(
          { name: 'AthenaSignal-McpClient', version: '1.0.0' },
          { capabilities: { tools: {} } }
        );
        await client.connect(sdkTransport);
      },
      async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
        if (!client) {
          await this.connect();
        }
        const response: any = await client.request(
          { method: 'tools/call', params: { name, arguments: args } },
          {}
        );
        const contentArr = response?.content ?? [];
        const textContent = contentArr.find((c: any) => c.type === 'text')?.text;
        if (typeof textContent === 'string') {
          try {
            return { data: JSON.parse(textContent) };
          } catch {
            return { data: textContent };
          }
        }
        return { data: response };
      },
      async close(): Promise<void> {
        if (sdkTransport) {
          await sdkTransport.close();
        }
        client = null;
        sdkTransport = null;
      },
    };
  }
}
