/**
 * Runner offline de M2 (ORDEN-006 §9, §10): ejecuta el pipeline completo con
 * fixtures deterministas y escribe los tres artefactos de aceptación:
 *
 *   evidence/source-provenance.json
 *   evidence/research-candidates.json
 *   evidence/handoff-athenaos.json
 *
 * Todo es reproducible sin red: mismos fixtures -> mismos bytes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { Provenance, ResearchCandidate } from '../domain/entities.ts';
import { HandoffValidator, type HandoffValidationResult } from '../handoff/HandoffValidator.ts';
import { ResearchPipeline } from './ResearchPipeline.ts';
import { CAPTURED_AT, M2_FIXTURES, type ResearchFixture } from './sources.ts';

export const DEFAULT_SOURCE_PROVENANCE_PATH = 'evidence/source-provenance.json';
export const DEFAULT_RESEARCH_CANDIDATES_PATH = 'evidence/research-candidates.json';
export const DEFAULT_HANDOFF_ATHENAOS_PATH = 'evidence/handoff-athenaos.json';

export interface HandoffEntry {
  candidateId: string;
  researchQuestion: string;
  assessment: string;
  validation: HandoffValidationResult;
  recommendedAthenaOsInput: ResearchCandidate['recommendedAthenaOsInput'];
}

export interface M2Evidence {
  sourceProvenance: {
    kind: 'athenasignal.source_provenance.v1';
    generatedAt: string;
    sources: Provenance[];
  };
  researchCandidates: {
    kind: 'athenasignal.research_candidates.v1';
    generatedAt: string;
    candidates: ResearchCandidate[];
  };
  handoffAthenaOs: {
    kind: 'athenasignal.handoff_bundle.v1';
    generatedAt: string;
    handoffs: HandoffEntry[];
  };
}

export interface M2RunSummary {
  evidence: M2Evidence;
  outputPaths: {
    sourceProvenance: string;
    researchCandidates: string;
    handoffAthenaOs: string;
  };
}

export interface RunM2Options {
  outputDir?: string;
  fixtures?: ResearchFixture[];
  generatedAt?: string;
}

export async function runM2Offline(options: RunM2Options = {}): Promise<M2RunSummary> {
  const generatedAt = options.generatedAt ?? CAPTURED_AT;
  const outputDir = options.outputDir ?? 'evidence';
  const pipeline = new ResearchPipeline();
  const results = await pipeline.runAll(options.fixtures ?? M2_FIXTURES);

  const candidates = results.map((r) => r.candidate);

  const provenanceSeen = new Set<string>();
  const sources: Provenance[] = [];
  for (const candidate of candidates) {
    for (const provenance of candidate.sourceProvenance) {
      if (!provenanceSeen.has(provenance.sourceId)) {
        provenanceSeen.add(provenance.sourceId);
        sources.push(provenance);
      }
    }
  }

  const validator = new HandoffValidator();
  const handoffs: HandoffEntry[] = candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    researchQuestion: candidate.researchQuestion,
    assessment: candidate.assessment,
    validation: validator.validate(candidate.recommendedAthenaOsInput),
    recommendedAthenaOsInput: candidate.recommendedAthenaOsInput,
  }));

  const evidence: M2Evidence = {
    sourceProvenance: {
      kind: 'athenasignal.source_provenance.v1',
      generatedAt,
      sources,
    },
    researchCandidates: {
      kind: 'athenasignal.research_candidates.v1',
      generatedAt,
      candidates,
    },
    handoffAthenaOs: {
      kind: 'athenasignal.handoff_bundle.v1',
      generatedAt,
      handoffs,
    },
  };

  const sourceProvenancePath = resolve(process.cwd(), outputDir, 'source-provenance.json');
  const researchCandidatesPath = resolve(process.cwd(), outputDir, 'research-candidates.json');
  const handoffAthenaOsPath = resolve(process.cwd(), outputDir, 'handoff-athenaos.json');

  writeJson(sourceProvenancePath, evidence.sourceProvenance);
  writeJson(researchCandidatesPath, evidence.researchCandidates);
  writeJson(handoffAthenaOsPath, evidence.handoffAthenaOs);

  return {
    evidence,
    outputPaths: {
      sourceProvenance: sourceProvenancePath,
      researchCandidates: researchCandidatesPath,
      handoffAthenaOs: handoffAthenaOsPath,
    },
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
