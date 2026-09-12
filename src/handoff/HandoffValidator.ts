/**
 * Validador del contrato de handoff AthenaSignal → AKP (ORDEN-006 §6).
 *
 * Verifica localmente el esquema mínimo `recommendedAthenaOsInput`
 * documentado en `docs/athenaos-handoff-contract.md`, sin depender de AKP.
 */

import type { AthenaOsHandoff } from '../domain/entities.ts';

export interface HandoffValidationResult {
  valid: boolean;
  errors: string[];
}

const ASSESSMENTS = ['SUPPORTED', 'UNSUPPORTED', 'AMBIGUOUS', 'REFRAMED'];
const ROLES = ['DISCOVERY', 'EVIDENCE'];
const FINDING_KINDS = ['FACT', 'EVIDENCE', 'MODEL_INTERPRETATION', 'EDITORIAL_REFRAMING'];
const FORMATS = ['short_video', 'article', 'long_video'];
const ELIGIBILITY_KEYS = [
  'hasIdentifiableOrigin',
  'hasTraceableLocation',
  'hasTemporalContext',
  'hasRecoverableEvidence',
];

export class HandoffValidator {
  validate(handoff: AthenaOsHandoff): HandoffValidationResult {
    const errors: string[] = [];

    if (!handoff || typeof handoff !== 'object') {
      return { valid: false, errors: ['handoff must be an object'] };
    }

    if (handoff.kind !== 'athenasignal.research_candidate.handoff.v1') {
      errors.push(`invalid kind: ${String(handoff.kind)}`);
    }

    if (!isNonEmptyString(handoff.researchQuestion)) {
      errors.push('researchQuestion must be a non-empty string');
    }

    if (handoff.outputLanguage !== 'es') {
      errors.push('outputLanguage must be "es"');
    }

    if (!handoff.viableBase || !FORMATS.includes(handoff.viableBase.format)) {
      errors.push('viableBase.format must be short_video|article|long_video');
    } else {
      if (!Number.isInteger(handoff.viableBase.factsRequired) || handoff.viableBase.factsRequired <= 0) {
        errors.push('viableBase.factsRequired must be a positive integer');
      }
      if (
        !Number.isInteger(handoff.viableBase.sourcesMinimum) ||
        handoff.viableBase.sourcesMinimum <= 0
      ) {
        errors.push('viableBase.sourcesMinimum must be a positive integer');
      }
    }

    if (!Array.isArray(handoff.proposedSources) || handoff.proposedSources.length === 0) {
      errors.push('proposedSources must be a non-empty array');
    } else {
      handoff.proposedSources.forEach((source, index) => {
        const prefix = `proposedSources[${index}]`;
        if (!isNonEmptyString(source.url)) errors.push(`${prefix}.url must be a non-empty string`);
        if (!isNonEmptyString(source.title)) errors.push(`${prefix}.title must be a non-empty string`);
        if (!isNonEmptyString(source.language)) errors.push(`${prefix}.language must be a non-empty string`);
        if (!ROLES.includes(source.role)) errors.push(`${prefix}.role must be DISCOVERY|EVIDENCE`);
        if (!isNonEmptyString(source.proposedTrustTier)) {
          errors.push(`${prefix}.proposedTrustTier must be a non-empty string`);
        }
        if (!isNonEmptyString(source.accessedAt)) {
          errors.push(`${prefix}.accessedAt must be a non-empty string`);
        }
        if (!source.eligibility || typeof source.eligibility !== 'object') {
          errors.push(`${prefix}.eligibility must be an object`);
        } else {
          for (const key of ELIGIBILITY_KEYS) {
            if (typeof (source.eligibility as Record<string, unknown>)[key] !== 'boolean') {
              errors.push(`${prefix}.eligibility.${key} must be boolean`);
            }
          }
        }
      });
    }

    if (!Array.isArray(handoff.proposedCandidateFacts)) {
      errors.push('proposedCandidateFacts must be an array');
    } else {
      handoff.proposedCandidateFacts.forEach((fact, index) => {
        const prefix = `proposedCandidateFacts[${index}]`;
        if (!isNonEmptyString(fact.statement)) errors.push(`${prefix}.statement must be a non-empty string`);
        if (fact.statusHint !== 'UNVERIFIED') errors.push(`${prefix}.statusHint must be UNVERIFIED`);
        if (!Array.isArray(fact.provenanceUrls) || !fact.provenanceUrls.every(isNonEmptyString)) {
          errors.push(`${prefix}.provenanceUrls must be an array of non-empty strings`);
        }
      });
    }

    if (!Array.isArray(handoff.knownUncertainties) || !handoff.knownUncertainties.every(isNonEmptyString)) {
      errors.push('knownUncertainties must be an array of non-empty strings');
    }

    if (!Array.isArray(handoff.initialFindings)) {
      errors.push('initialFindings must be an array');
    } else {
      handoff.initialFindings.forEach((finding, index) => {
        const prefix = `initialFindings[${index}]`;
        if (!FINDING_KINDS.includes(finding.kind)) {
          errors.push(`${prefix}.kind must be FACT|EVIDENCE|MODEL_INTERPRETATION|EDITORIAL_REFRAMING`);
        }
        if (!isNonEmptyString(finding.text)) errors.push(`${prefix}.text must be a non-empty string`);
        if (!Array.isArray(finding.refs)) errors.push(`${prefix}.refs must be an array`);
      });
    }

    if (!handoff.origin || typeof handoff.origin !== 'object') {
      errors.push('origin must be an object');
    } else {
      if (!isNonEmptyString(handoff.origin.signalId)) errors.push('origin.signalId must be a non-empty string');
      if (!Array.isArray(handoff.origin.originalClaims)) {
        errors.push('origin.originalClaims must be an array');
      }
      if (!ASSESSMENTS.includes(handoff.origin.assessment)) {
        errors.push('origin.assessment must be SUPPORTED|UNSUPPORTED|AMBIGUOUS|REFRAMED');
      }
      const note = handoff.origin.reframingNote;
      if (note !== null && typeof note !== 'string') {
        errors.push('origin.reframingNote must be string|null');
      }
      if (handoff.origin.assessment === 'REFRAMED' && !isNonEmptyString(note)) {
        errors.push('origin.reframingNote must be non-empty when assessment is REFRAMED');
      }
    }

    // Regla dura del contrato: en REFRAMED no se propone la afirmación original.
    if (handoff.origin?.assessment === 'REFRAMED' && Array.isArray(handoff.proposedCandidateFacts)) {
      for (const claim of handoff.origin.originalClaims ?? []) {
        if (handoff.proposedCandidateFacts.some((f) => f.statement === claim)) {
          errors.push('REFRAMED handoff must not propose the original claim as a CandidateFact');
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
