# ORDEN-006 — MILESTONE M2: Signal-to-Research-Candidate Vertical Slice

- **Fecha:** 2026-09-11
- **Emite:** Arquitecto
- **Estado:** VIGENTE — autorizado para ejecución vía GovernanceOs → OpenCode + DeepSeek
- **Documentos vinculantes:**
  - [DU-001 — Modelo Conceptual](file:///Volumes/Medios/Repos/AthenaSignal/decisiones/DU-001-MODELO-CONCEPTUAL-ATHENASIGNAL.md) (RATIFICADA)
  - [RFC-006 — Adquisición MCP y Deep Search](file:///Volumes/Medios/Repos/AthenaSignal/decisiones/RFC-006-MOTOR-DE-BUSQUEDA-Y-VERIFICACION-DE-CLAIMS.md) (RATIFICADO)
- **Handoff objetivo (motor existente):** AthenaKnowledge / AKP — Knowledge Acquisition Domain Workflow (RFC-004), Source Eligibility (RFC-003), `CandidateFact` (Domain Model v0.5). Ruta local: `/Volumes/Medios/Repos/AthenaKnowledge/docs/`.

---

## 1. OBJETIVO

Demostrar que AthenaSignal convierte una **fuente real e imperfecta** en un **Research Candidate útil, justificable y transferible** al motor de investigación existente (AKP/AthenaKnowledge), sin asumir que la fuente tiene razón y sin amplificar afirmaciones.

Flujo demostrable:

```
SOURCE → CONTENT EXTRACTION → SIGNAL / IDEA → ASSERTION / CLAIM ANALYSIS
→ INITIAL RESEARCH → RESEARCHABILITY ASSESSMENT → REFRAMING (si procede)
→ RESEARCH CANDIDATE → HANDOFF A AKP
```

AthenaSignal es un **motor de descubrimiento y triage editorial**, no un scraper ni un generador de afirmaciones.

## 2. AUTORIDAD Y AUTONOMÍA DEL WORKER

El worker tiene autonomía total para descomponer técnicamente el trabajo dentro del scope. **NO** se solicita Human Gate por: bugs, tests fallidos, refactors, cambios de implementación, adapters, tipos, configuración, fixtures, transporte, mejoras necesarias para cumplir acceptance, ni decisiones técnicas ordinarias. Continuar iterando (`INSPECT → IMPLEMENT → TEST → FAIL → DIAGNOSE → FIX → TEST → VERIFY → CONTINUE`) mientras exista trabajo dentro del scope.

**PERSISTENCIA OBLIGATORIA:** no termines el turno mientras exista trabajo dentro del scope. Si una herramienta o acceso externo es **rechazado por permisos**, busca una alternativa dentro del worktree y continúa; el contrato AKP ya está vendoreado en `docs/athenaos-handoff-contract.md`. Terminar sin haber producido los artefactos de aceptación no cierra el milestone.

**Human Gate solo si** cambia materialmente: el objetivo, la arquitectura fundamental, los límites de autoridad, una decisión ratificada, el contrato AthenaSignal↔AthenaOS, o si falta información fundamental.

## 3. CAPACIDADES OBLIGATORIAS AL CIERRE

1. **Ingerir una fuente real** pública (vídeo, página, repositorio u otro origen soportado), conservando provenance.
2. **Extraer contenido relevante** (metadata, título, descripción, transcript/texto, URLs, referencias, técnico), reproducible en las limitaciones del entorno.
3. **Detectar una o varias señales/ideas** como representación estructurada.
4. **Descomponer la afirmación**: afirmación original, contexto, entidades, preguntas implícitas, hipótesis, incertidumbres.
5. **Investigación inicial** suficiente para clasificar la señal: sustentada / no sustentada / ambigua / mal formulada / idea subyacente investigable.
6. **Evaluar researchability** explícitamente (investigabilidad, disponibilidad potencial de evidencia, claridad de la pregunta, relevancia editorial, incertidumbre resoluble).
7. **Reformular** cuando la afirmación original sea falsa/exagerada, rescatando la idea subyacente como pregunta investigable. Nunca convertir una afirmación falsa en un claim verdadero por inferencia.
8. **Generar un Research Candidate** consumible por AKP.

## 4. CASOS MÍNIMOS (dentro de la misma ejecución)

- **CASO 1 — Idea investigable** (p. ej. Kafka vs RabbitMQ): `SOURCE → SIGNAL → RESEARCH QUESTION → RESEARCHABILITY HIGH → candidate`.
- **CASO 2 — Afirmación problemática** (p. ej. “AirLLM permite ejecutar DeepSeek V4 localmente con 12 GB de RAM”): `SOURCE → SIGNAL → INITIAL INVESTIGATION → claim original NO aceptado como hecho → idea subyacente identificada → pregunta reformulada → Research Candidate OR descarte explícito`.

El CASO 2 es obligatorio: demuestra que AthenaSignal no es un amplificador de afirmaciones.

La fuente concreta (p. ej. `@legitalgorithmswithpeter`) es ilustrativa, **no** dependencia arquitectónica. Debe demostrarse capacidad reutilizable.

## 5. MODELO DE DOMINIO A EXTENDER

Extender `src/domain/entities.ts` (sin romper M1) con al menos:

```ts
type Researchability = 'HIGH' | 'MEDIUM' | 'LOW';
type ResearchAssessment = 'SUPPORTED' | 'UNSUPPORTED' | 'AMBIGUOUS' | 'REFRAMED';

interface AssertionAnalysis { originalClaim: string; context: string[]; entities: string[];
  implicitQuestions: string[]; hypotheses: string[]; uncertainties: string[]; }

interface ResearchabilityAssessment { level: Researchability; evidenceAvailability: number;
  questionClarity: number; editorialRelevance: number; resolvableUncertainty: number; reason: string; }

interface ResearchCandidate { candidateId: string; title: string; researchQuestion: string;
  originSignalId: string; originalClaims: string[]; context: string[]; assessment: ResearchAssessment;
  assertionAnalysis: AssertionAnalysis; researchability: ResearchabilityAssessment;
  knownUncertainties: string[]; initialFindings: InitialFinding[];
  reasonForSelection: string; sourceProvenance: Provenance[]; recommendedAthenaOsInput: AthenaOsHandoff; createdAt: string; }
```

La estructura exacta puede adaptarse al modelo existente; los campos anteriores son el mínimo.

## 6. CONTRATO DE HANDOFF A AKP (AthenaKnowledge)

AthenaSignal **no** investiga en profundidad ni duplica el motor de AKP. Entrega:

```text
ATHENASIGNAL: "Encontré esto. Esto afirma. Esto sabemos inicialmente. Esto parece
               cierto/falso/ambiguo. Esta es la pregunta investigable. Por esto vale la pena."
        ↓
AKP:          "Ahora voy a investigar esto de verdad."
```

`recommendedAthenaOsInput` debe mapear al vocabulario AKP (RFC-003/RFC-004/Domain Model v0.5):
- `researchQuestion` + formato/viable-base requerida;
- `proposedSources[]` con criterios de elegibilidad (`hasIdentifiableOrigin`, `hasTraceableLocation`, `hasTemporalContext`, `hasRecoverableEvidence`) y `proposedTrustTier`;
- `proposedCandidateFacts[]` (assertions a verificar) con provenance;
- `knownUncertainties[]` y `initialFindings[]`.

Debe existir un **validador de handoff** (`src/handoff/`) y un artefacto de evidencia. El contrato operativo ya está **vendoreado en el repo** en `./docs/athenaos-handoff-contract.md` (derivado de los documentos ratificados de AKP); úsalo como fuente de verdad y **no dependas de leer otros repos**, porque el acceso de lectura fuera del worktree puede estar bloqueado.

> Nota de entorno: el worker OpenCode corre con `--dir` AthenaSignal y el acceso a rutas externas (p. ej. `/Volumes/Medios/Repos/AthenaKnowledge`) puede ser **rechazado por permisos**. Si un comando externo es rechazado, NO te detengas: continúa con la información vendoreada en `docs/athenaos-handoff-contract.md`.

## 7. POLÍTICA DE FUENTES

Distinguir explícitamente:

```text
DISCOVERY SOURCE  (descubrir entidades/conceptos/referencias; p. ej. Wikipedia)
EVIDENCE SOURCE   (evidencia de mayor autoridad; documentación oficial, papers, repos, prensa técnica)
```

Una fuente puede servir para descubrir sin ser evidencia final. No imponer restricciones que impidan descubrir. La autoridad epistemológica se decide en la etapa de evidencia. Atribuir a cada fuente su rol y `proposedTrustTier`.

## 8. MULTILINGÜISMO

El idioma no debe ser limitación arquitectónica. El input conserva idioma original; la normalización interna es común; el output del candidate es en español; la provenance conserva idioma de cada fuente. No construir un sistema multilingüe gigante; sí un flujo que no se rompa por idioma.

## 9. REPRODUCIBILIDAD Y EVIDENCIA

Toda ejecución de evidencia deja artefactos suficientes para reconstruir:

```
input source → extracted content → signal → assertion analysis → research steps
→ evidence → assessment → research candidate → handoff
```

Datos/snapshots reales usados se conservan como fixtures versionados con provenance (URL, plataforma, idioma, fecha de captura, hash). La investigación inicial debe poder reproducirse **offline** (replay de evidencia registrada). Diferenciar en los artefactos: `fact/evidence` vs `model_interpretation` vs `editorial_reframing`.

## 10. CRITERIOS DE ACEPTACIÓN

- **A.** Parte de al menos una fuente pública real; provenance persistida.
- **B.** Extracción con contenido y provenance.
- **C.** Al menos una idea/afirmación técnicamente significativa.
- **D.** Investigación inicial suficiente para evaluar la(s) afirmación(es).
- **E.** Reclasificación demostrada: al menos `SUPPORTED`/`UNSUPPORTED`/`AMBIGUOUS`/`REFRAMED`.
- **F.** Evaluación explícita de researchability.
- **G.** Al menos un Research Candidate estructurado y transferible.
- **H.** Evidencia persistente suficiente para verificar sin narrativa del worker.
- **I.** Todos los tests protegidos por M1 siguen pasando.
- **J.** Product Value: responde “qué idea encontramos, qué afirmaba la fuente, qué descubrimos al investigar inicialmente y por qué merece (o no) investigación real en AKP”.

Artefactos de aceptación (deterministas, offline):

- `evidence/source-provenance.json` — objeto JSON con fuentes reales y su provenance.
- `evidence/research-candidates.json` — objeto JSON con los candidates (>= 2 casos, incluido REFRAMED).
- `evidence/handoff-athenaos.json` — objeto JSON con el handoff AKP validado.
- `tests/research-candidate-e2e.test.ts` — test determinista end-to-end.

Comando de aceptación oficial de M2:

```bash
node --test --experimental-strip-types \
  tests/domain.test.ts tests/adapters.test.ts \
  tests/signal-extractor.test.ts tests/editorial-scorer.test.ts \
  tests/pipeline-e2e.test.ts tests/research-candidate-e2e.test.ts
```

## 11. NO FORMA PARTE DEL SCOPE

Dashboard; radar persistente completo; multi-provider LLM genérico; framework universal de scraping; nueva capa de Governance; nueva infraestructura de workers; soporte exhaustivo de redes sociales; motor editorial completo; generador de guiones; investigación profunda equivalente a AKP; memoria general; observabilidad empresarial. Pregunta de control: *¿esto es necesario para demostrar el vertical slice?*

## 12. CONDICIÓN DE CIERRE

Cerrar solo cuando estén demostrados: **functional vertical slice + reproducible evidence + regression pass + handoff a AKP validado**. No cerrar por “implemented”, “tests pass”, “architecture ready” o “components exist”.

## 13. REPORTE FINAL

Al terminar, entregar el reporte con: MILESTONE STATUS · PRODUCT CAPABILITY DEMONSTRATED · REAL SOURCE USED · SIGNALS EXTRACTED · INITIAL RESEARCH PERFORMED · CLAIMS/ASSERTIONS · RESEARCHABILITY ASSESSMENT · REFRAMING PERFORMED · RESEARCH CANDIDATE(S) · ATHENAOS HANDOFF · EVIDENCE ARTIFACTS · TEST RESULTS · REGRESSION RESULTS · TOOLS/EXTERNAL PROJECTS USED · LIMITATIONS · UNRESOLVED ISSUES · HUMAN GATES REQUIRED · RECOMMENDED NEXT PRODUCT MILESTONE.
