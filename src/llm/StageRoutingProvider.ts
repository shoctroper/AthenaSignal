/**
 * Router por etapa (ORDEN-007 §4): permite usar un modelo más capaz en las
 * etapas de juicio (assessment/reframing/researchability/editorial/priority)
 * y un modelo rápido en las etapas de extracción.
 */

import type { LLMProvider, LLMRequest, LLMResponse, LLMStage } from './types.ts';

export class StageRoutingLLMProvider implements LLMProvider {
  readonly id: string;
  private readonly routes: Partial<Record<LLMStage, LLMProvider>>;
  private readonly fallback: LLMProvider;

  constructor(routes: Partial<Record<LLMStage, LLMProvider>>, fallback: LLMProvider) {
    this.routes = routes;
    this.fallback = fallback;
    this.id = `routing(${Object.keys(routes).join('+') || 'none'})`;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const provider = this.routes[request.stage] ?? this.fallback;
    return provider.complete(request);
  }
}
