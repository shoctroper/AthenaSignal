/**
 * ResearchPipeline (ORDEN-006 §3): cablea extracción → análisis de afirmación
 * → investigación inicial → researchability → reframing → candidate → handoff,
 * validando el handoff contra el contrato AKP.
 */

import type { ResearchCandidate, Signal } from '../domain/entities.ts';
import { SignalExtractor } from '../services/SignalExtractor.ts';
import { ResearchCandidateBuilder } from './ResearchCandidateBuilder.ts';
import { VendoredResearchProvider, type ResearchEvidenceProvider } from './ResearchEvidence.ts';
import type { ResearchFixture } from './sources.ts';
import { M2_FIXTURES } from './sources.ts';
import { HandoffValidator, type HandoffValidationResult } from '../handoff/HandoffValidator.ts';

export interface ResearchPipelineResult {
  fixtureId: string;
  signal: Signal;
  candidate: ResearchCandidate;
  validation: HandoffValidationResult;
}

export class ResearchPipeline {
  private readonly provider: ResearchEvidenceProvider;
  private readonly extractor: SignalExtractor;
  private readonly validator: HandoffValidator;
  private readonly builder: ResearchCandidateBuilder;

  constructor(
    provider: ResearchEvidenceProvider = new VendoredResearchProvider(),
    extractor: SignalExtractor = new SignalExtractor(),
    validator: HandoffValidator = new HandoffValidator(),
    builder?: ResearchCandidateBuilder
  ) {
    this.provider = provider;
    this.extractor = extractor;
    this.validator = validator;
    this.builder = builder ?? new ResearchCandidateBuilder(provider);
  }

  async run(fixture: ResearchFixture): Promise<ResearchPipelineResult> {
    const signal = fixture.signal ?? (await this.extractor.extract(fixture.content));

    const candidate = this.builder.build({
      fixtureId: fixture.id,
      signal,
      content: fixture.content,
      provenance: fixture.provenance,
      createdAt: fixture.provenance.capturedAt,
    });

    const validation = this.validator.validate(candidate.recommendedAthenaOsInput);

    return { fixtureId: fixture.id, signal, candidate, validation };
  }

  async runAll(fixtures: ResearchFixture[] = M2_FIXTURES): Promise<ResearchPipelineResult[]> {
    const results: ResearchPipelineResult[] = [];
    for (const fixture of fixtures) {
      results.push(await this.run(fixture));
    }
    return results;
  }
}
