/**
 * Pipeline autónomo M3 (ORDEN-007 §1).
 *
 *   MULTIPLE SOURCES → INGESTION → SIGNAL DISCOVERY → ASSERTION DECOMPOSITION
 *   → INITIAL RESEARCH → EVIDENCE INTERPRETATION → CLAIM ASSESSMENT
 *   → RESEARCHABILITY → REFRAMING → EDITORIAL VALUE → PRIORITIZATION
 *   → RESEARCH CANDIDATES
 *
 * Batchea múltiples fuentes sin intervención manual y rechaza ruido.
 */

import type { LLMProvider, LLMResponse } from '../llm/types.ts';
import type { FetchTool, SearchTool } from '../research/tools/SearchTool.ts';
import type {
  AssertionDecomposition,
  AutonomousCandidate,
  ClaimAssessment,
  Corpus,
  DiscoveredSignal,
  EditorialRelevance,
  EvidenceItem,
  InterpretedFinding,
  Reframing,
  ResearchabilityAssessment,
} from './types.ts';
import {
  assessClaim,
  assessEditorialRelevance,
  assessResearchability,
  decomposeAssertion,
  discoverSignals,
  interpretEvidence,
  reframe,
  suggestPriorities,
} from './cognitive.ts';
import { gatherEvidence } from './research.ts';
import { buildCandidate, type CandidateBase } from './candidateBuilder.ts';
import { prioritize } from './prioritizer.ts';
import { normalizeText, sanitizeFindings, significantTokens } from './epistemic.ts';

export interface PipelineDeps {
  llm: LLMProvider;
  search: SearchTool;
  fetch: FetchTool;
  createdAt: string;
}

export interface DiscardedSignal {
  signalId: string;
  corpusId: string;
  assertion: string;
  reason: string;
}

export interface PipelineRunResult {
  signals: DiscoveredSignal[];
  decompositions: AssertionDecomposition[];
  evidence: Record<string, EvidenceItem[]>;
  findings: Record<string, InterpretedFinding[]>;
  assessments: ClaimAssessment[];
  reframings: Reframing[];
  researchability: Record<string, ResearchabilityAssessment>;
  editorial: EditorialRelevance[];
  candidates: AutonomousCandidate[];
  discarded: DiscardedSignal[];
  queries: string[];
  llm: { realResponses: number; deterministicResponses: number; providerChain: string };
}

export class AutonomousPipeline {
  private readonly deps: PipelineDeps;

  constructor(deps: PipelineDeps) {
    this.deps = deps;
  }

  async run(corpus: Corpus): Promise<PipelineRunResult> {
    const counter = new CountingLLMProvider(this.deps.llm);

    const signals: DiscoveredSignal[] = [];
    for (const item of corpus.sources) {
      const discovered = await discoverSignals(counter, item);
      for (const signal of discovered) signals.push(signal);
    }

    const decompositions: AssertionDecomposition[] = [];
    const evidenceBySignal: Record<string, EvidenceItem[]> = {};
    const findingsBySignal: Record<string, InterpretedFinding[]> = {};
    const assessments: ClaimAssessment[] = [];
    const reframings: Reframing[] = [];
    const researchability: Record<string, ResearchabilityAssessment> = {};
    const editorial: EditorialRelevance[] = [];
    const queries: string[] = [];
    const candidateBases: CandidateBase[] = [];
    const reframedFlags: Record<string, boolean> = {};

    for (const signal of signals) {
      const item = corpus.sources.find((source) => source.id === signal.corpusId);
      if (!item) continue;

      const decomposition = await decomposeAssertion(counter, signal, item);
      decompositions.push(decomposition);

      const gathered = await gatherEvidence(signal, item, this.deps.search, this.deps.fetch);
      queries.push(...gathered.queries);
      evidenceBySignal[signal.signalId] = gathered.evidence;

      const rawFindings = await interpretEvidence(counter, signal, decomposition, gathered.evidence);

      let assessment = await assessClaim(counter, signal, decomposition, rawFindings);

      // Saneamiento determinista DESPUÉS del assessment: mantiene intactas las
      // claves de replay (el LLM ya vio los hallazgos crudos) y garantiza que
      // el claim original nunca se propague como EVIDENCE/FACT.
      const findings = sanitizeFindings(rawFindings, signal);
      findingsBySignal[signal.signalId] = findings;

      let reframing: Reframing | null = null;
      if (assessment.assessment === 'REFRAMED' || assessment.assessment === 'UNSUPPORTED') {
        reframing = await reframe(counter, signal, assessment.reasoning, {
          item,
          decomposition,
          corpus,
        });
        // Un claim falso puede producir una pregunta investigable: si existe
        // una reformulación válida, el resultado es REFRAMED aunque no haya un
        // hecho candidato (el claim original sigue sin proponerse como hecho).
        if (assessment.assessment === 'UNSUPPORTED' && reframing.required) {
          assessment = { ...assessment, assessment: 'REFRAMED' };
        }
      }
      if (reframing) reframings.push(reframing);
      reframedFlags[signal.signalId] = assessment.assessment === 'REFRAMED';
      assessments.push(assessment);

      const researchabilityAssessment = await assessResearchability(
        counter,
        signal,
        assessment.assessment,
        gathered.evidence.length
      );
      researchability[signal.signalId] = researchabilityAssessment;

      const editorialRelevance = await assessEditorialRelevance(counter, signal, assessment.assessment);
      editorial.push(editorialRelevance);

      candidateBases.push(
        buildCandidate({
          signal,
          item,
          decomposition,
          evidence: gathered.evidence,
          findings,
          assessment,
          reframing,
          researchability: researchabilityAssessment,
          editorialRelevance,
          createdAt: this.deps.createdAt,
        })
      );
    }

    const suggestions = await suggestPriorities(
      counter,
      candidateBases.map((candidate) => {
        const signal = signals.find((s) => s.signalId === candidate.originSignalId)!;
        const assessment = assessments.find((a) => a.signalId === signal.signalId)!;
        return {
          signal,
          assessment: assessment.assessment,
          researchability: researchability[signal.signalId]?.level ?? 'LOW',
          evidenceCount: evidenceBySignal[signal.signalId]?.length ?? 0,
        };
      })
    );

    const prioritizedCandidates: AutonomousCandidate[] = [];
    const discarded: DiscardedSignal[] = [];
    for (const base of candidateBases) {
      const signal = signals.find((s) => s.signalId === base.originSignalId)!;
      const assessment = assessments.find((a) => a.signalId === signal.signalId)!;
      const prioritized = prioritize({
        candidate: base,
        signal,
        assessment,
        researchability: researchability[signal.signalId],
        editorialRelevance: editorial.find((e) => e.signalId === signal.signalId)!,
        evidenceCount: evidenceBySignal[signal.signalId]?.length ?? 0,
        reframed: reframedFlags[signal.signalId] ?? false,
        suggestion: suggestions.get(signal.signalId),
      });
      if (prioritized.priority === 'DISCARD') {
        discarded.push({
          signalId: signal.signalId,
          corpusId: signal.corpusId,
          assertion: signal.assertion,
          reason: prioritized.priorityReasons.join(' | '),
        });
      } else {
        prioritizedCandidates.push(prioritized);
      }
    }

    // Discriminación editorial real: N señales → M candidates con M << N.
    const selection = selectCandidates(prioritizedCandidates, signals, corpus);
    discarded.push(...selection.discarded);
    const candidates = selection.candidates.sort((a, b) => compareCandidates(a, b));

    return {
      signals,
      decompositions,
      evidence: evidenceBySignal,
      findings: findingsBySignal,
      assessments,
      reframings,
      researchability,
      editorial,
      candidates,
      discarded,
      queries,
      llm: {
        realResponses: counter.realResponses,
        deterministicResponses: counter.deterministicResponses,
        providerChain: this.deps.llm.id,
      },
    };
  }
}

/**
 * Selección editorial (ORDEN-007 §9): de las señales ya priorizadas conserva a
 * lo sumo un candidate por fuente y luego fusiona temas equivalentes entre
 * fuentes. El resto se descarta con un motivo explícito → M << N.
 */
export function selectCandidates(
  candidates: AutonomousCandidate[],
  signals: DiscoveredSignal[],
  corpus: Corpus
): { candidates: AutonomousCandidate[]; discarded: DiscardedSignal[] } {
  const signalById = new Map(signals.map((signal) => [signal.signalId, signal]));
  const itemById = new Map(corpus.sources.map((source) => [source.id, source]));
  const discarded: DiscardedSignal[] = [];

  const byCorpus = new Map<string, AutonomousCandidate[]>();
  for (const candidate of candidates) {
    const signal = signalById.get(candidate.originSignalId);
    const key = signal?.corpusId ?? candidate.originSignalId;
    const list = byCorpus.get(key) ?? [];
    list.push(candidate);
    byCorpus.set(key, list);
  }

  const survivors: AutonomousCandidate[] = [];
  for (const [corpusId, list] of byCorpus) {
    const ordered = [...list].sort(compareCandidates);
    survivors.push(ordered[0]);
    for (const redundant of ordered.slice(1)) {
      discarded.push({
        signalId: redundant.originSignalId,
        corpusId,
        assertion: signalById.get(redundant.originSignalId)?.assertion ?? redundant.researchQuestion,
        reason:
          `Selección editorial: señal redundante de la misma fuente (${corpusId}); ` +
          `se conserva ${ordered[0].candidateId} por mayor prioridad/valor.`,
      });
    }
  }

  const signatures = buildTopicSignatures(survivors, signalById, itemById);
  const parent = survivors.map((_, index) => index);
  const find = (index: number): number =>
    parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (a: number, b: number): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  for (let i = 0; i < signatures.length; i += 1) {
    for (let j = i + 1; j < signatures.length; j += 1) {
      if (sharesToken(signatures[i], signatures[j])) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  survivors.forEach((_, index) => {
    const root = find(index);
    const list = groups.get(root) ?? [];
    list.push(index);
    groups.set(root, list);
  });

  const kept: AutonomousCandidate[] = [];
  for (const indices of groups.values()) {
    const ordered = indices.map((index) => survivors[index]).sort(compareCandidates);
    kept.push(ordered[0]);
    for (const redundant of ordered.slice(1)) {
      const signal = signalById.get(redundant.originSignalId);
      discarded.push({
        signalId: redundant.originSignalId,
        corpusId: signal?.corpusId ?? 'unknown',
        assertion: signal?.assertion ?? redundant.researchQuestion,
        reason:
          `Selección editorial: tema ya cubierto por ${ordered[0].candidateId}; ` +
          'se descarta para evitar duplicación temática entre fuentes (M << N).',
      });
    }
  }

  return { candidates: kept, discarded };
}

const GENERIC_TOPIC_TOKENS = new Set([
  'capacidad', 'memoria', 'modelos', 'modelo', 'lenguaje', 'grandes', 'inferencia',
  'sistema', 'sistemas', 'efecto', 'efectos', 'resultados', 'personas', 'mayores',
  'ejercicio', 'suplemento', 'suplementacion', 'evidencia', 'ciencia', 'cientifica',
  'beneficios', 'riesgos', 'efectividad', 'metodos', 'diaria', 'balanceada',
]);

function buildTopicSignatures(
  candidates: AutonomousCandidate[],
  signalById: Map<string, DiscoveredSignal>,
  itemById: Map<string, Corpus['sources'][number]>
): Array<Set<string>> {
  const base = candidates.map((candidate) => {
    const signal = signalById.get(candidate.originSignalId);
    const item = signal ? itemById.get(signal.corpusId) : undefined;
    const tokens = new Set<string>();
    if (item) {
      for (const token of item.id.replace(/^src-/, '').split('-')) {
        if (token.length >= 4) tokens.add(normalizeText(token));
      }
    }
    return tokens;
  });

  const frequency = new Map<string, number>();
  const conceptTokens = candidates.map((candidate) => {
    const signal = signalById.get(candidate.originSignalId);
    const tokens = new Set<string>();
    for (const concept of signal?.concepts ?? []) {
      for (const token of significantTokens(concept)) {
        if (token.length >= 5 && !GENERIC_TOPIC_TOKENS.has(token) && !tokens.has(token)) {
          tokens.add(token);
          frequency.set(token, (frequency.get(token) ?? 0) + 1);
        }
      }
    }
    return tokens;
  });

  return base.map((tokens, index) => {
    for (const token of conceptTokens[index]) {
      if ((frequency.get(token) ?? 0) >= 2) tokens.add(token);
    }
    return tokens;
  });
}

function sharesToken(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) if (b.has(token)) return true;
  return false;
}

function compareCandidates(a: AutonomousCandidate, b: AutonomousCandidate): number {
  const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, DISCARD: 3 };
  if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
  return a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0;
}

class CountingLLMProvider implements LLMProvider {
  readonly id: string;
  private readonly inner: LLMProvider;
  realResponses = 0;
  deterministicResponses = 0;

  constructor(inner: LLMProvider) {
    this.inner = inner;
    this.id = inner.id;
  }

  async complete(request: Parameters<LLMProvider['complete']>[0]): Promise<LLMResponse> {
    const response = await this.inner.complete(request);
    if (response.deterministic) this.deterministicResponses += 1;
    else this.realResponses += 1;
    return response;
  }
}
