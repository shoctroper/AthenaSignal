/**
 * ResearchCandidateBuilder (ORDEN-006 §3.5-3.8, §5-§6).
 *
 * Toma una fuente + señal ya extraída y produce un `ResearchCandidate`
 * determinista: analiza la afirmación, ejecuta investigación inicial por
 * replay, evalúa researchability, reformula si la afirmación es falsa o
 * exagerada y construye el handoff `recommendedAthenaOsInput`.
 *
 * Regla dura: si la afirmación original es falsa/exagerada NO se propone como
 * CandidateFact; se conserva la idea subyacente como pregunta investigable.
 */

import type {
  AthenaOsHandoff,
  AthenaOsProposedCandidateFact,
  AthenaOsProposedSource,
  InitialFinding,
  Provenance,
  ResearchAssessment,
  ResearchCandidate,
  Signal,
} from '../domain/entities.ts';
import type { NormalizedContent } from '../adapters/ISourceAdapter.ts';
import { AssertionAnalyzer } from './AssertionAnalyzer.ts';
import { ResearchabilityAssessor } from './ResearchabilityAssessor.ts';
import { buildProvenance } from './provenance.ts';
import type {
  ResearchEvidenceProvider,
  ResearchFinding,
  ResearchMatch,
} from './ResearchEvidence.ts';

export interface BuildCandidateInput {
  fixtureId: string;
  signal: Signal;
  content: NormalizedContent;
  provenance: Provenance;
  createdAt: string;
}

export class ResearchCandidateBuilder {
  private readonly provider: ResearchEvidenceProvider;
  private readonly analyzer: AssertionAnalyzer;
  private readonly assessor: ResearchabilityAssessor;

  constructor(
    provider: ResearchEvidenceProvider,
    analyzer: AssertionAnalyzer = new AssertionAnalyzer(),
    assessor: ResearchabilityAssessor = new ResearchabilityAssessor()
  ) {
    this.provider = provider;
    this.analyzer = analyzer;
    this.assessor = assessor;
  }

  build(input: BuildCandidateInput): ResearchCandidate {
    const claims = input.signal.claimsToInvestigate ?? [];
    const primaryClaim = claims[0]?.statement ?? input.signal.topic;
    const assertionAnalysis = this.analyzer.analyze(primaryClaim, input.signal);

    const text = `${input.content.title}\n${input.content.description}\n${input.content.transcript}`;
    const matches = this.provider.research(text, claims[0]);
    if (matches.length === 0) {
      throw new Error(`[ResearchCandidateBuilder] Sin evidencia vendoreada para: ${input.fixtureId}`);
    }

    const entries = matches.map((m) => m.entry);
    const findings = this.uniqueFindings(matches);
    const assessment = this.resolveAssessment(entries, findings);
    const reframe = entries.map((e) => e.reframe).find((r) => r !== undefined);

    const researchQuestion =
      assessment === 'REFRAMED' && reframe ? reframe.question : entries[0].researchQuestion;
    const reframingNote = assessment === 'REFRAMED' && reframe ? reframe.note : null;

    const proposedSources = this.uniqueSources(entries.flatMap((e) => e.proposedSources));
    const initialFindings: InitialFinding[] = findings.map((f) => ({
      kind: f.kind,
      text: f.text,
      refs: [...f.refs],
    }));

    const knownUncertainties = this.unique([
      ...assertionAnalysis.uncertainties,
      ...findings.filter((f) => f.kind === 'MODEL_INTERPRETATION').map((f) => f.text),
    ]);

    const originalClaims = claims.map((c) => c.statement);
    const sourceProvenance = this.buildSourceProvenance(input, proposedSources, findings);

    const researchability = this.assessor.assess({
      researchQuestion,
      assertionAnalysis,
      findings: initialFindings,
      assessment,
      proposedSourcesCount: proposedSources.length,
    });

    const proposedCandidateFacts = this.buildCandidateFacts(
      assessment,
      reframe?.candidateFact,
      claims.map((c) => c.statement),
      primaryClaim,
      input.provenance.url,
      findings
    );

    const recommendedAthenaOsInput: AthenaOsHandoff = {
      kind: 'athenasignal.research_candidate.handoff.v1',
      researchQuestion,
      outputLanguage: 'es',
      viableBase: {
        format: 'article',
        factsRequired: Math.max(
          3,
          initialFindings.filter((f) => f.kind === 'FACT' || f.kind === 'EVIDENCE').length
        ),
        sourcesMinimum: proposedSources.length,
      },
      proposedSources,
      proposedCandidateFacts,
      knownUncertainties,
      initialFindings,
      origin: {
        signalId: input.signal.sourceId ?? input.provenance.sourceId,
        originalClaims,
        assessment,
        reframingNote,
      },
    };

    const candidateId = `rc-${input.signal.sourceId ?? input.fixtureId}`;
    const score = Number(
      (
        (researchability.evidenceAvailability +
          researchability.questionClarity +
          researchability.editorialRelevance +
          researchability.resolvableUncertainty) /
        4
      ).toFixed(4)
    );

    return {
      candidateId,
      title: entries[0].candidateTitle,
      researchQuestion,
      originSignalId: input.signal.sourceId ?? input.provenance.sourceId,
      originalClaims,
      context: this.unique([...assertionAnalysis.context, ...entries[0].context]),
      assessment,
      assertionAnalysis,
      researchability,
      knownUncertainties,
      initialFindings,
      reasonForSelection: this.reasonForSelection(assessment, researchQuestion),
      sourceProvenance,
      recommendedAthenaOsInput,
      createdAt: input.createdAt,

      // Compatibilidad M1
      id: candidateId,
      signalId: input.signal.sourceId ?? input.provenance.sourceId,
      hypothesis: researchQuestion,
      score,
      claims,
      primarySourcesToCheck: proposedSources.map((s) => s.url),
    };
  }

  private resolveAssessment(
    entries: ResearchMatch['entry'][],
    findings: ResearchFinding[]
  ): ResearchAssessment {
    const contradicted = findings.some((f) => f.supports === false);
    const hasReframe = entries.some((e) => e.reframe !== undefined);
    if (hasReframe && contradicted) {
      return 'REFRAMED';
    }
    if (entries[0].assessmentHint) {
      return entries[0].assessmentHint;
    }
    const positives = findings.filter((f) => f.supports === true).length;
    const negatives = findings.filter((f) => f.supports === false).length;
    if (positives > negatives) return 'SUPPORTED';
    if (negatives > positives) return 'UNSUPPORTED';
    return 'AMBIGUOUS';
  }

  private uniqueFindings(matches: ResearchMatch[]): ResearchFinding[] {
    const seen = new Set<string>();
    const result: ResearchFinding[] = [];
    for (const match of matches) {
      for (const finding of match.findings) {
        if (!seen.has(finding.text)) {
          seen.add(finding.text);
          result.push(finding);
        }
      }
    }
    return result;
  }

  private uniqueSources(sources: AthenaOsProposedSource[]): AthenaOsProposedSource[] {
    const seen = new Set<string>();
    const result: AthenaOsProposedSource[] = [];
    for (const source of sources) {
      if (!seen.has(source.url)) {
        seen.add(source.url);
        result.push(source);
      }
    }
    return result;
  }

  private buildSourceProvenance(
    input: BuildCandidateInput,
    proposedSources: AthenaOsProposedSource[],
    findings: ResearchFinding[]
  ): Provenance[] {
    const derived = proposedSources.map((source) => {
      const related = findings.filter((f) => f.refs.includes(source.url));
      const content = related.length ? related.map((f) => f.text).join('\n') : source.title;
      return buildProvenance({
        sourceId: `prop-${this.slug(source.url)}`,
        url: source.url,
        platform: 'web',
        language: source.language,
        title: source.title,
        role: source.role,
        capturedAt: input.createdAt,
        content,
      });
    });
    return [input.provenance, ...derived];
  }

  private buildCandidateFacts(
    assessment: ResearchAssessment,
    reframeFact: string | undefined,
    originalClaims: string[],
    primaryClaim: string,
    primaryUrl: string,
    findings: ResearchFinding[]
  ): AthenaOsProposedCandidateFact[] {
    if (assessment === 'REFRAMED') {
      const statement = reframeFact ?? primaryClaim;
      return [
        {
          statement,
          provenanceUrls: this.unique(
            findings.flatMap((f) => f.refs).concat(primaryUrl)
          ),
          statusHint: 'UNVERIFIED',
        },
      ];
    }

    const supportingRefs = this.unique(
      findings.filter((f) => f.supports === true).flatMap((f) => f.refs)
    );
    const statements = originalClaims.length > 0 ? originalClaims : [primaryClaim];
    return statements.map((statement) => ({
      statement,
      provenanceUrls: this.unique([primaryUrl, ...supportingRefs]),
      statusHint: 'UNVERIFIED',
    }));
  }

  private reasonForSelection(assessment: ResearchAssessment, researchQuestion: string): string {
    switch (assessment) {
      case 'REFRAMED':
        return `La afirmación original no se acepta como hecho; la idea subyacente es investigable: "${researchQuestion}".`;
      case 'SUPPORTED':
        return 'La afirmación central está sustentada por fuentes de autoridad y abre una comparación editorialmente relevante.';
      case 'UNSUPPORTED':
        return 'La afirmación central no está sustentada por la evidencia inicial; solo procede si se reformula.';
      default:
        return 'La evidencia inicial es ambigua; la pregunta es investigable pero requiere verificación adicional.';
    }
  }

  private slug(value: string): string {
    return value
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  private unique(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const trimmed = value.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
    return result;
  }
}
