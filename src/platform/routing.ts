/**
 * CognitiveRouter M5 (ORDEN-009 §3, §4, §14).
 *
 * Enruta cada etapa cognitiva por la topología
 * `Ubuntu(local) → Mac mini(local-alt) → Remote(escalation)` con health-check,
 * timeout, fallback y observabilidad. El core sólo ve `LLMProvider`; el router
 * decide con una política explicable y nunca inventa evidencia: cuando toda la
 * cadena falla, degrada al fallback determinista seguro.
 *
 * Determinismo: la aceptación offline inyecta la salud de los nodos y un reloj
 * fijo. Los tiempos de pared no se registran en los artefactos.
 */

import type { LLMProvider, LLMRequest, LLMResponse, LLMStage } from '../llm/types.ts';
import type {
  CognitiveNode,
  CognitiveRoute,
  NodeHealth,
  RecoveryAction,
  RecoveryEvent,
  RecoveryKind,
  RoutingDecision,
} from './types.ts';
import { COGNITIVE_ROUTES } from './types.ts';

export const DEFAULT_ROUTE_POLICY: Partial<Record<LLMStage, CognitiveRoute[]>> = {
  signal_discovery: ['LOCAL', 'LOCAL_ALT'],
  assertion_decomposition: ['LOCAL', 'LOCAL_ALT'],
  evidence_interpretation: ['LOCAL', 'LOCAL_ALT'],
  claim_assessment: ['LOCAL_ALT', 'REMOTE_ESCALATION', 'LOCAL'],
  reframing: ['LOCAL_ALT', 'REMOTE_ESCALATION', 'LOCAL'],
  researchability: ['LOCAL_ALT', 'LOCAL'],
  editorial_relevance: ['LOCAL_ALT', 'LOCAL'],
  prioritization: ['LOCAL_ALT', 'REMOTE_ESCALATION', 'LOCAL'],
};

export interface RouterRecoveryInput {
  kind: RecoveryKind;
  subject: string;
  action: RecoveryAction;
  detail: string;
}

export interface CognitiveRouterOptions {
  runId: string;
  nodes: CognitiveNode[];
  deterministic: LLMProvider;
  policy?: Partial<Record<LLMStage, CognitiveRoute[]>>;
  timeoutMs?: number;
  clock: () => string;
  onDecision?: (decision: RoutingDecision) => void;
  onRecovery?: (input: RouterRecoveryInput) => void;
}

interface AttemptFailure {
  ok: false;
  node: string;
  route: CognitiveRoute;
  reason: RecoveryKind;
  detail: string;
}

interface AttemptSuccess {
  ok: true;
  node: string;
  route: CognitiveRoute;
  response: LLMResponse;
}

export class CognitiveRouter implements LLMProvider {
  readonly id = 'cognitive-router';
  private readonly options: CognitiveRouterOptions;
  private readonly decisionsLog: RoutingDecision[] = [];
  private readonly emittedRecovery = new Set<string>();
  private sequence = 0;

  constructor(options: CognitiveRouterOptions) {
    this.options = options;
  }

  decisions(): RoutingDecision[] {
    return this.decisionsLog.map((decision) => ({ ...decision }));
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const policy = this.options.policy?.[request.stage] ?? DEFAULT_ROUTE_POLICY[request.stage] ?? ['LOCAL'];
    const seen = new Set<string>();
    let previousRoute: CognitiveRoute | null = null;

    for (const route of policy) {
      const node = this.pickNode(route, seen, request.stage);
      if (!node) continue;
      seen.add(node.node);

      const preferred = policy[0];
      const attempt = await this.attempt(node, request);
      if (attempt.ok) {
        this.record({
          stage: request.stage,
          route: attempt.route,
          node: attempt.node,
          provider: attempt.response.provider,
          model: attempt.response.model,
          deterministic: attempt.response.deterministic,
          fallback: attempt.route !== preferred || previousRoute !== null,
          escalated: attempt.route === 'REMOTE_ESCALATION',
          reason:
            attempt.route === preferred
              ? `Ruta preferida ${route} disponible (${node.node}).`
              : `Degradación a ${attempt.route} (${node.node}) tras ${previousRoute ?? 'preferida'}.`,
        });
        if (attempt.response.deterministic && attempt.route !== 'DETERMINISTIC_FALLBACK') {
          this.recover({
            kind: 'LLM_FALLBACK',
            subject: request.stage,
            action: 'FALLBACK',
            detail:
              `La etapa ${request.stage} no pudo resolverse con cognición real; ` +
              `se degradó al fallback determinista seguro desde ${node.node}.`,
          });
        }
        return attempt.response;
      }

      this.recover({
        kind: attempt.reason,
        subject: `${node.node}:${request.stage}`,
        action: attempt.reason === 'TIMEOUT' ? 'FALLBACK' : 'FALLBACK',
        detail: attempt.detail,
      });
      previousRoute = attempt.route;
    }

    const response = await this.options.deterministic.complete(request);
    this.record({
      stage: request.stage,
      route: 'DETERMINISTIC_FALLBACK',
      node: 'deterministic',
      provider: response.provider,
      model: response.model,
      deterministic: true,
      fallback: true,
      escalated: false,
      reason: 'Ningún nodo cognitivo disponible; fallback determinista seguro.',
    });
    return response;
  }

  private pickNode(route: CognitiveRoute, used: Set<string>, stage: string): CognitiveNode | null {
    const candidates = this.options.nodes.filter(
      (node) => node.route === route && !used.has(node.node)
    );
    for (const node of candidates) {
      if (node.healthy()) return node;
      this.recover({
        kind: 'NODE_DOWN',
        subject: `${node.node}:${stage}`,
        action: 'SKIPPED',
        detail: `Nodo ${node.node} (${route}) no saludable; se omite en ${stage}.`,
      });
    }
    return null;
  }

  private async attempt(node: CognitiveNode, request: LLMRequest): Promise<AttemptSuccess | AttemptFailure> {
    try {
      const response = await withTimeout(
        node.provider.complete(request),
        this.options.timeoutMs ?? 3000
      );
      if (response === TIMEOUT) {
        return {
          ok: false,
          node: node.node,
          route: node.route,
          reason: 'TIMEOUT',
          detail: `Nodo ${node.node} excedió el timeout de ${this.options.timeoutMs ?? 3000} ms en ${request.stage}.`,
        };
      }
      return { ok: true, node: node.node, route: node.route, response };
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      const reason: RecoveryKind = /invalid|malformed|parse/i.test(message)
        ? 'INVALID_RESPONSE'
        : 'NODE_DOWN';
      return {
        ok: false,
        node: node.node,
        route: node.route,
        reason,
        detail: `Nodo ${node.node} falló en ${request.stage}: ${message}`,
      };
    }
  }

  private record(input: {
    stage: string;
    route: CognitiveRoute;
    node: string;
    provider: string;
    model: string;
    deterministic: boolean;
    fallback: boolean;
    escalated: boolean;
    reason: string;
  }): void {
    this.sequence += 1;
    const decision: RoutingDecision = {
      decisionId: `route-${this.options.runId}-${String(this.sequence).padStart(4, '0')}`,
      sequence: this.sequence,
      runId: this.options.runId,
      stage: input.stage,
      route: input.route,
      node: input.node,
      provider: input.provider,
      model: input.model,
      deterministic: input.deterministic,
      fallback: input.fallback,
      escalated: input.escalated,
      reason: input.reason,
    };
    this.decisionsLog.push(decision);
    this.options.onDecision?.(decision);
  }

  private recover(input: RouterRecoveryInput): void {
    const key = `${this.options.runId}:${input.kind}:${input.subject}:${input.action}`;
    if (this.emittedRecovery.has(key)) return;
    this.emittedRecovery.add(key);
    this.options.onRecovery?.(input);
  }
}

const TIMEOUT = Symbol('timeout');

function withTimeout(promise: Promise<LLMResponse>, ms: number): Promise<LLMResponse | typeof TIMEOUT> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMEOUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export interface TopologyInput {
  nodes: Array<Pick<CognitiveNode, 'node' | 'route' | 'model' | 'reason'> & { healthy: boolean }>;
}

export function describeTopology(input: TopologyInput): NodeHealth[] {
  return input.nodes.map((node) => ({
    node: node.node,
    route: node.route,
    status: node.healthy ? 'UP' : 'DOWN',
    reason: node.reason,
  }));
}

export function routeCounts(decisions: RoutingDecision[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const route of COGNITIVE_ROUTES) counts[route] = 0;
  for (const decision of decisions) counts[decision.route] = (counts[decision.route] ?? 0) + 1;
  return counts;
}
