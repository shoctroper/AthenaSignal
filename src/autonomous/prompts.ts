/**
 * Prompts deterministas de la capa cognitiva M3 (ORDEN-007 §4, §3).
 *
 * Separación epistemológica explícita: OBSERVATION / ASSERTION / EVIDENCE /
 * MODEL_INTERPRETATION / EDITORIAL_REFRAMING. Ningún prompt autoriza a
 * convertir una afirmación en hecho.
 */

import type {
  AssertionDecomposition,
  CorpusItem,
  DiscoveredSignal,
  EvidenceItem,
  InterpretedFinding,
} from './types.ts';

export const SYSTEM_COGNITIVE =
  'Eres el motor cognitivo de AthenaSignal. Distingues estrictamente entre ' +
  'OBSERVACIÓN, AFIRMACIÓN, EVIDENCIA, INTERPRETACIÓN DEL MODELO y REFORMULACIÓN EDITORIAL. ' +
  'Nunca conviertes una afirmación en hecho por repetición ni presentas una inferencia como evidencia. ' +
  'Un claim falso puede originar una pregunta investigable. ' +
  'Respondes SIEMPRE con JSON válido, sin texto adicional, sin markdown.';

export const SYSTEM_JSON_ONLY =
  'Devuelve exclusivamente un objeto JSON válido, sin comentarios ni texto fuera del JSON.';

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function signalDiscoveryPrompt(item: CorpusItem): string {
  return [
    `FUENTE (${item.platform}, idioma=${item.language}, política=${item.policy}):`,
    `Título: ${clean(item.title)}`,
    `Contenido (snapshot):`,
    clean(item.content).slice(0, 4000),
    '',
    'Tarea: descubre de forma autónoma las señales que MEREZCAN investigación editorial.',
    'Una señal es una afirmación concreta, verificable en principio, con realidad subyacente investigable.',
    'Descarta ruido, promoción sin sustancia, opiniones sin realidad subyacente y contenido sin interés.',
    'Devuelve como máximo 2 señales. Si la fuente no contiene ninguna idea investigable, devuelve {"signals": []}.',
    '',
    'Responde en español con este JSON:',
    '{"signals":[{"topic":"tema breve","assertion":"afirmación exacta a investigar",' +
      '"concepts":["entidad o concepto"],"questions":["pregunta investigable?"],' +
      '"noiseLikelihood":0.0,"rationale":"por qué merece (o no) investigación"}]}',
  ].join('\n');
}

export function assertionDecompositionPrompt(signal: DiscoveredSignal, item: CorpusItem): string {
  return [
    'AFIRMACIÓN A DESCOMPONER:',
    clean(signal.assertion),
    `Contexto de la fuente: ${clean(item.title)} (${item.url})`,
    '',
    'Tarea: descompón la afirmación sin asumir que es verdadera.',
    'Identifica entidades, contexto, preguntas implícitas, hipótesis e incertidumbres.',
    '',
    'Responde en español con este JSON:',
    '{"entities":["..."],"context":["..."],"implicitQuestions":["...?"],' +
      '"hypotheses":["..."],"uncertainties":["..."]}',
  ].join('\n');
}

export function evidenceInterpretationPrompt(
  signal: DiscoveredSignal,
  decomposition: AssertionDecomposition,
  evidence: EvidenceItem[]
): string {
  const evidenceText = evidence
    .map(
      (item, index) =>
        `[${index + 1}] (${item.role}/${item.policy}) ${item.title} — ${item.sourceUrl}\n${clean(item.excerpt).slice(0, 700)}`
    )
    .join('\n\n');
  return [
    'AFIRMACIÓN:',
    clean(signal.assertion),
    `Entidades: ${decomposition.entities.join(', ') || '(ninguna)'}`,
    '',
    'EVIDENCIA INICIAL RECUPERADA (resultados de búsqueda reales):',
    evidenceText || '(no se recuperó evidencia)',
    '',
    'Tarea: interpreta CADA resultado como evidencia, no como hecho. Marca si apoya (true), ' +
      'contradice (false) o es inconcluso (null) respecto de la afirmación.',
    'La primera entrada "(fuente de origen)" es la fuente de la que se extrajo la afirmación: ' +
      'sirve para contextualizar, pero si su política es DISCOVERY/TERTIARY no confirma por sí sola.',
    'Distingue EVIDENCE (contenido de la fuente citada), FACT (hecho establecido por fuente de autoridad) ' +
      'y MODEL_INTERPRETATION (tu inferencia). Nunca uses FACT para lo que solo dice la fuente original.',
    'Cada finding debe citar en "refs" las URLs usadas.',
    'El campo "text" debe ser una frase interpretativa concreta (qué establece o niega la fuente), NUNCA el título ni la URL.',
    'Usa "supports": true solo si el contenido de la fuente de autoridad sostiene la afirmación; false si la contradice; null si no la aborda.',
    '',
    'Responde en español con este JSON:',
    '{"findings":[{"kind":"EVIDENCE|FACT|MODEL_INTERPRETATION","text":"...","refs":["https://..."],"supports":true}]}',
  ].join('\n');
}

export function claimAssessmentPrompt(
  signal: DiscoveredSignal,
  decomposition: AssertionDecomposition,
  findings: InterpretedFinding[]
): string {
  const support = findings
    .map(
      (finding) =>
        `- [${finding.supports === true ? 'APOYA' : finding.supports === false ? 'CONTRADICE' : 'INCONCLUSO'}] ` +
        `(${finding.kind}) ${clean(finding.text).slice(0, 400)}`
    )
    .join('\n');
  return [
    'AFIRMACIÓN ORIGINAL:',
    clean(signal.assertion),
    `Preguntas implícitas: ${decomposition.implicitQuestions.join(' | ')}`,
    '',
    'EVIDENCIA:',
    support || '(sin evidencia)',
    '',
    'Tarea: clasifica la afirmación como SUPPORTED, UNSUPPORTED, AMBIGUOUS o REFRAMED.',
    'REFRAMED solo si la afirmación es falsa/exagerada pero existe una idea subyacente investigable.',
    'Una fuente de política DISCOVERY o TERTIARY NUNCA basta para SUPPORTED; requiere evidencia de autoridad independiente.',
    'Si una fuente de autoridad (PRIMARY/EVIDENCE/SECONDARY) sostiene directamente la afirmación, usa SUPPORTED.',
    'Nunca declares la afirmación como hecho. Los valores numéricos van en [0,1].',
    '',
    'Responde en español con este JSON:',
    '{"assessment":"SUPPORTED|UNSUPPORTED|AMBIGUOUS|REFRAMED","confidence":0.0,' +
      '"reasoning":"...","contradictions":["..."],"uncertainties":["..."]}',
  ].join('\n');
}

export function researchabilityPrompt(
  signal: DiscoveredSignal,
  assessment: string,
  evidenceCount: number
): string {
  return [
    'PREGUNTA/SEÑAL:',
    clean(signal.assertion),
    `Evaluación epistemológica: ${assessment}`,
    `Evidencia inicial recuperada: ${evidenceCount} fuentes`,
    '',
    'Tarea: evalúa la INVESTIGABILIDAD (no la verdad). Considera claridad de la pregunta, ' +
      'disponibilidad de evidencia, incertidumbre resoluble, relevancia editorial y coste razonable.',
    'No asumas que interesante = investigable ni que verdadero = editorialmente interesante.',
    'Valores en [0,1].',
    '',
    'Responde en español con este JSON:',
    '{"level":"HIGH|MEDIUM|LOW","evidenceAvailability":0.0,"questionClarity":0.0,' +
      '"editorialRelevance":0.0,"resolvableUncertainty":0.0,"reason":"..."}',
  ].join('\n');
}

export function reframingPrompt(signal: DiscoveredSignal, assessmentReason: string): string {
  return [
    'AFIRMACIÓN NO ACEPTADA COMO HECHO:',
    clean(signal.assertion),
    `Motivo: ${clean(assessmentReason)}`,
    '',
    'Tarea: reformula la idea subyacente como una pregunta investigable.',
    'La afirmación original NUNCA debe reaparecer como hecho. Propón un hecho candidato reformulado, ' +
      'conservador y verificable, o null si no existe base.',
    '',
    'Responde en español con este JSON:',
    '{"researchQuestion":"...?","reframingNote":"...","candidateFact":"... o null"}',
  ].join('\n');
}

export function editorialRelevancePrompt(signal: DiscoveredSignal, assessment: string): string {
  return [
    'SEÑAL:',
    clean(signal.assertion),
    `Evaluación: ${assessment}`,
    '',
    'Tarea: evalúa el valor editorial para una audiencia general interesada en tecnología y ciencia: ' +
      'novedad, tensión/contraste, utilidad práctica y potencial de explicación.',
    'Valor en [0,1].',
    '',
    'Responde en español con este JSON:',
    '{"score":0.0,"reasons":["..."]}',
  ].join('\n');
}

export function prioritizationPrompt(
  items: Array<{ signalId: string; signal: DiscoveredSignal; assessment: string; researchability: string; evidenceCount: number }>
): string {
  const listing = items
    .map(
      (item, index) =>
        `[${index + 1}] signalId=${item.signalId} | assessment=${item.assessment} | ` +
        `researchability=${item.researchability} | evidencia=${item.evidenceCount}\n` +
        `    afirmación: ${clean(item.signal.assertion)}`
    )
    .join('\n');
  return [
    'CANDIDATES A PRIORIZAR:',
    listing,
    '',
    'Tarea: sugiere una prioridad editorial explicable para cada candidate: HIGH, MEDIUM, LOW o DISCARD.',
    'DISCARD si es ruido, promoción sin sustancia o no investigable. Las razones deben ser observables.',
    '',
    'Responde en español con este JSON:',
    '{"items":[{"signalId":"...","suggestedPriority":"HIGH|MEDIUM|LOW|DISCARD","reasons":["..."]}]}',
  ].join('\n');
}
