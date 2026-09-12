# AthenaSignal → AKP (AthenaKnowledge) Handoff Contract

- **Estado:** Referencia operativa para M2 (ORDEN-006). Derivada de los documentos ratificados de AKP.
- **Fuente conceptual (solo lectura, NO copiar el motor):**
  - `AthenaKnowledge/docs/domain/DOMAIN_MODEL.md` (v0.5)
  - `AthenaKnowledge/docs/rfc/RFC-003-source-eligibility-model.md`
  - `AthenaKnowledge/docs/rfc/RFC-004-knowledge-acquisition-domain-workflow.md`
  - `AthenaKnowledge/docs/rfc/RFC-002-knowledge-repository-exchange-contract.md`
  - `AthenaKnowledge/docs/EvidencePackage/*`

> Nota de entorno: el worker OpenCode corre con `--dir` sobre AthenaSignal y **puede tener bloqueado el acceso de lectura fuera del worktree**. Todo lo necesario para el handoff debe poder construirse con este documento, sin leer otros repos.

## 1. Boundary

```
ATHENASIGNAL
  "Encontré esto. Esto afirma. Esto sabemos inicialmente.
   Esto parece cierto/falso/ambiguo. Esta es la pregunta investigable.
   Por esto vale la pena investigarla."
        ↓
AKP (Knowledge Acquisition Domain Workflow)
  "Ahora voy a investigar esto de verdad."
```

AthenaSignal **no** investiga en profundidad ni duplica AKP. Produce un `recommendedAthenaOsInput` que mapea al vocabulario de AKP.

## 2. Vocabulario AKP de destino

- **`Source`** (Aggregate): origen de información. Value Objects: `EligibilityCriteria` (`hasIdentifiableOrigin`, `hasTraceableLocation`, `hasTemporalContext`, `hasRecoverableEvidence`), `SourceEligibilityStatus` (`Unknown` | `Eligible` | `Ineligible` | `Suspended`), `TrustTier`.
- **`Document`** (Aggregate): snapshot inmutable capturado de una `Source` elegible.
- **`CandidateFact`** (Aggregate): hecho candidato propuesto, con provenance/confidence; evento de génesis `CandidateFactProposed`. Sus workflows posteriores (A/B) viven en AKP.
- **Knowledge Acquisition Workflow** (RFC-004): `K1 Source Eligibility` → `K2 Document Capture` → `K3 Candidate Fact Proposal`. Se cierra en `CandidateFactProposed`.

## 3. Distinción Discovery vs Evidence (obligatoria en el handoff)

Cada fuente propuesta declara `role`:
- `DISCOVERY`: sirve para descubrir entidades/conceptos/referencias. **No** es evidencia final.
- `EVIDENCE`: candidata a evidencia por su autoridad (documentación oficial, paper, repo, prensa técnica).

AKP decide elegibilidad/`TrustTier` final. AthenaSignal solo **propone**.

## 4. `recommendedAthenaOsInput` — esquema mínimo

```jsonc
{
  "kind": "athenasignal.research_candidate.handoff.v1",
  "researchQuestion": "string",
  "outputLanguage": "es",
  "viableBase": { "format": "short_video|article|long_video", "factsRequired": 6, "sourcesMinimum": 2 },
  "proposedSources": [
    {
      "url": "string",
      "title": "string",
      "language": "string",
      "role": "DISCOVERY|EVIDENCE",
      "eligibility": {
        "hasIdentifiableOrigin": true,
        "hasTraceableLocation": true,
        "hasTemporalContext": true,
        "hasRecoverableEvidence": true
      },
      "proposedTrustTier": "string",
      "accessedAt": "ISO-8601"
    }
  ],
  "proposedCandidateFacts": [
    { "statement": "string", "provenanceUrls": ["string"], "statusHint": "UNVERIFIED" }
  ],
  "knownUncertainties": ["string"],
  "initialFindings": [
    { "kind": "FACT|EVIDENCE|MODEL_INTERPRETATION|EDITORIAL_REFRAMING", "text": "string", "refs": ["string"] }
  ],
  "origin": {
    "signalId": "string",
    "originalClaims": ["string"],
    "assessment": "SUPPORTED|UNSUPPORTED|AMBIGUOUS|REFRAMED",
    "reframingNote": "string|null"
  }
}
```

## 5. Reglas del handoff

1. `proposedCandidateFacts[].statusHint` siempre `UNVERIFIED` (DU-001: nada nace verificado).
2. Si la afirmación original es falsa/exagerada, **no** se propone como CandidateFact; se conserva la idea subyacente en `researchQuestion` y se documenta el `reframingNote`.
3. Cada `proposedSource` conserva `language` y `accessedAt` (provenance; multilingüismo).
4. `initialFindings[].kind` separa explícitamente `FACT`/`EVIDENCE` de `MODEL_INTERPRETATION` y `EDITORIAL_REFRAMING`.
5. El handoff debe pasar un validador local (`src/handoff/`) que verifique este esquema.
