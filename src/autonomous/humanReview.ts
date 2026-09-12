/**
 * Paquete de revisión humana M3 (ORDEN-007 §13).
 *
 * Produce una muestra significativa de candidates, un rubric explícito y los
 * falsos positivos observados. La aceptación de producto requiere revisión
 * humana real (Human Gate de cierre).
 */

import type { HumanReviewPacket, HumanReviewSample } from './types.ts';
import type { PipelineRunResult } from './pipeline.ts';

export const M3_RUBRIC = [
  { id: 'R1', question: '¿Encontró una idea real y concreta en el material de entrada?' },
  { id: 'R2', question: '¿La interpretación corresponde al material de la fuente?' },
  { id: 'R3', question: '¿Separó observación de afirmación (y de evidencia)?' },
  { id: 'R4', question: '¿Evitó convertir el contenido de la fuente en verdad?' },
  { id: 'R5', question: '¿Encontró evidencia inicial útil y de autoridad?' },
  { id: 'R6', question: '¿Descartó lo inviable o ruidoso?' },
  { id: 'R7', question: '¿Reformuló correctamente cuando el claim era incorrecto?' },
  { id: 'R8', question: '¿Son preguntas investigables por AthenaOS/AKP?' },
  { id: 'R9', question: '¿La priorización es explicable y tiene sentido?' },
  { id: 'R10', question: '¿El handoff da contexto suficiente para iniciar la investigación?' },
];

export interface HumanReviewInput {
  pipeline: PipelineRunResult;
  generatedAt: string;
  falsePositiveObservations: string[];
  sampleSize?: number;
}

export function buildHumanReviewPacket(input: HumanReviewInput): HumanReviewPacket {
  const sample = input.pipeline.candidates.slice(0, input.sampleSize ?? 5).map(toSample);
  return {
    kind: 'athenasignal.m3.human_review_packet.v1',
    generatedAt: input.generatedAt,
    rubric: M3_RUBRIC.map((item) => ({ ...item })),
    discovered: input.pipeline.signals.length,
    discarded: input.pipeline.discarded.length,
    sample,
    falsePositiveObservations: [...input.falsePositiveObservations],
  };
}

function toSample(candidate: PipelineRunResult['candidates'][number]): HumanReviewSample {
  return {
    candidateId: candidate.candidateId,
    title: candidate.title,
    researchQuestion: candidate.researchQuestion,
    priority: candidate.priority,
    assessment: candidate.assessment,
    reasonForSelection: candidate.reasonForSelection,
    priorityReasons: candidate.priorityReasons,
    handoffKind: candidate.recommendedAthenaOsInput.kind,
    coverage: {
      hasOriginSignals: candidate.originSignalIds.length > 0,
      hasSourceProvenance: candidate.sourceProvenance.length > 0,
      hasOriginalAssertions: candidate.originalClaims.length > 0,
      hasEvidence: candidate.evidence.length > 0,
      hasUncertainties: candidate.knownUncertainties.length > 0,
      hasReframing:
        candidate.assessment === 'REFRAMED'
          ? Boolean(candidate.recommendedAthenaOsInput.origin.reframingNote)
          : true,
      hasResearchability: Boolean(candidate.researchability),
      hasEditorialRelevance: Boolean(candidate.editorialRelevance),
      hasPriority: Boolean(candidate.priority),
    },
  };
}
