/**
 * Cadena de resiliencia LLM (ORDEN-007 §4):
 *   primario → fallback(s) → fallback determinista.
 *
 * Cada intento captura su error sin propagarlo; solo si todos fallan se lanza
 * el último error. El `core` nunca queda atado a un proveedor concreto.
 */

import type { LLMProvider, LLMRequest, LLMResponse } from './types.ts';

export class ResilientLLMProvider implements LLMProvider {
  readonly id: string;
  private readonly providers: LLMProvider[];
  private readonly errors: string[] = [];

  constructor(providers: LLMProvider[]) {
    if (providers.length === 0) {
      throw new Error('[ResilientLLMProvider] necesita al menos un proveedor');
    }
    this.providers = providers;
    this.id = providers.map((p) => p.id).join('->');
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.complete(request);
      } catch (error) {
        lastError = error;
        this.errors.push(`${provider.id}: ${String((error as Error)?.message ?? error)}`);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('[ResilientLLMProvider] todos los proveedores fallaron');
  }

  chainErrors(): string[] {
    return [...this.errors];
  }
}
