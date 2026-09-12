/**
 * Seguridad epistémica determinista de M3 (ORDEN-007 §3, §4, §10).
 *
 * Esta capa NO reemplaza la cognición real (el LLM sigue participando en cada
 * etapa); garantiza de forma reproducible las invariantes que no pueden
 * depender de la calidad del modelo:
 *
 * - Una afirmación de descubrimiento NUNCA se eleva a EVIDENCE/FACT.
 * - Un claim original NUNCA reaparece como hecho tras un reframing.
 * - La reformulación es una pregunta investigable, no el claim con "?".
 * - Los campos del handoff no contienen `null`/vacíos (consumibles por AKP).
 *
 * Se apoya en el corpus congelado (provenance) para contrastar el claim con
 * fuentes de autoridad sin romper el record/replay (no altera requests LLM).
 */

import type {
  AssertionDecomposition,
  Corpus,
  CorpusItem,
  DiscoveredSignal,
  InterpretedFinding,
  Reframing,
} from './types.ts';

const NULL_LIKE = new Set(['null', 'none', 'n/a', 'na', 'undefined', 'ninguno', 'ninguna', 'nan']);

const STOPWORDS = new Set([
  'que', 'como', 'por', 'para', 'con', 'los', 'las', 'una', 'uno', 'unos', 'unas', 'del', 'esta',
  'este', 'esto', 'estos', 'estas', 'son', 'ser', 'esta', 'estan', 'puede', 'pueden', 'mas', 'menos',
  'sobre', 'entre', 'cuando', 'donde', 'porque', 'the', 'and', 'for', 'with', 'from', 'that', 'this',
  'una', 'sus', 'sin', 'por', 'han', 'fue', 'sera', 'seran', 'sido', 'tiene', 'tienen', 'hace',
]);

/** Tokens significativos (sin acentos, sin stopwords, longitud > 2). */
export function significantTokens(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

/** Normaliza texto: minúsculas, sin acentos, sin puntuación, espacios colapsados. */
export function normalizeText(value: string): string {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `true` si el valor es nulo, vacío o un literal tipo "null". */
export function isNullLike(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
  if (!trimmed) return true;
  return NULL_LIKE.has(trimmed.toLowerCase());
}

/** Un texto que reproduce el claim no puede tratarse como evidencia/hecho. */
export function isClaimEcho(text: string, claim: string): boolean {
  const a = normalizeText(text);
  const b = normalizeText(claim);
  if (a.length < 12 || b.length < 12) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** Solapamiento semántico por Jaccard/cobertura de tokens significativos. */
export function semanticEcho(text: string, claim: string, threshold = 0.6): boolean {
  const a = new Set(significantTokens(text));
  const b = new Set(significantTokens(claim));
  if (!a.size || !b.size) return false;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  const jaccard = union ? intersection / union : 0;
  const coverage = intersection / b.size;
  return jaccard >= threshold || coverage >= 0.8;
}

/**
 * Filtra hallazgos: elimina ecos del claim presentados como EVIDENCE/FACT,
 * duplicados y textos vacíos/nulos. No modifica las refs de los válidos.
 */
export function sanitizeFindings(
  findings: InterpretedFinding[],
  signal: DiscoveredSignal
): InterpretedFinding[] {
  const seen = new Set<string>();
  const result: InterpretedFinding[] = [];
  for (const finding of findings) {
    if (isNullLike(finding.text)) continue;
    if (finding.kind === 'EVIDENCE' || finding.kind === 'FACT') {
      if (isClaimEcho(finding.text, signal.assertion) || semanticEcho(finding.text, signal.assertion, 0.8)) {
        continue;
      }
    }
    const key = normalizeText(finding.text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...finding, refs: [...finding.refs] });
  }
  return result;
}

/**
 * Hipótesis de descomposición. En candidatos REFRAMED/UNSUPPORTED se reemplazan
 * por hipótesis neutrales: el claim no puede presentarse como hipótesis viable.
 */
export function resolveHypotheses(
  hypotheses: string[],
  claim: string,
  researchQuestion: string,
  reframed: boolean
): string[] {
  if (reframed) {
    return [
      'La afirmación original NO se asume como hipótesis válida: la evidencia inicial no la sostiene.',
      `Hipótesis investigable: ${researchQuestion}`,
    ];
  }
  const kept = hypotheses.filter(
    (hypothesis) =>
      !isNullLike(hypothesis) && !isClaimEcho(hypothesis, claim) && !semanticEcho(hypothesis, claim, 0.65)
  );
  if (kept.length) return kept.slice(0, 4);
  return ['La afirmación requiere verificación independiente antes de sostenerse.'];
}

/** `true` si la pregunta es el claim reformulado como pregunta (eco). */
export function isClaimRestatement(question: string, claim: string): boolean {
  if (isNullLike(question)) return false;
  const normalized = normalizeText(question).replace(
    /^(que|como|por que|cual|cuando|donde|quien|cuanto)\s+/,
    ''
  );
  const normalizedClaim = normalizeText(claim);
  if (!normalized || !normalizedClaim) return false;
  return (
    normalized === normalizedClaim ||
    normalized.includes(normalizedClaim) ||
    normalizedClaim.includes(normalized) ||
    semanticEcho(question, claim, 0.7)
  );
}

export interface ReframeContext {
  item: CorpusItem;
  decomposition: AssertionDecomposition;
  corpus: Corpus;
}

export interface RawReframing {
  researchQuestion: string;
  reframingNote: string | null;
  candidateFact: string | null;
}

/**
 * Convierte la salida cruda del LLM en un `Reframing` seguro y completo:
 * normaliza el hecho candidato, reescribe el eco del claim como pregunta
 * investigable y compone una nota con los hechos del corpus/provenance.
 */
export function resolveReframing(
  signal: DiscoveredSignal,
  raw: RawReframing,
  context: ReframeContext
): Reframing {
  const question = isClaimRestatement(raw.researchQuestion, signal.assertion)
    ? synthesizeResearchQuestion(signal, context.decomposition)
    : ensureQuestion(raw.researchQuestion);
  const candidateFact = normalizeCandidateFact(raw.candidateFact, signal.assertion);
  const reframingNote = synthesizeReframingNote(signal, question, raw.reframingNote, context);
  return {
    signalId: signal.signalId,
    required: question.length > 0,
    researchQuestion: question,
    reframingNote,
    candidateFact,
  };
}

/** Normaliza un hecho candidato: `null` literal, vacío o eco del claim → null. */
export function normalizeCandidateFact(value: unknown, claim: string): string | null {
  if (isNullLike(value)) return null;
  const trimmed = String(value).trim();
  if (isClaimEcho(trimmed, claim) || semanticEcho(trimmed, claim, 0.8)) return null;
  return trimmed;
}

/** Construye una pregunta investigable que no reproduce el claim. */
export function synthesizeResearchQuestion(
  signal: DiscoveredSignal,
  decomposition: AssertionDecomposition
): string {
  const entity = pickEntity(decomposition.entities, signal);
  const quantity = extractQuantity(signal.assertion);
  const mentionsModel = /\b(?:v\d+(?:\.\d+)?|modelo|model)\b/i.test(signal.assertion);
  const condition = quantity ? ` en hardware de consumo ${quantity}` : '';
  const tail = mentionsModel ? ', y con qué modelo?' : ' y bajo qué condiciones verificables?';
  return ensureQuestion(`¿Qué puede lograr realmente ${entity}${condition}${tail}`);
}

function pickEntity(entities: string[], signal: DiscoveredSignal): string {
  const clean = entities.map((entity) => entity.trim()).filter((entity) => entity && !isNullLike(entity));
  if (clean.length) return clean[0];
  const topic = signal.topic.trim();
  return topic || 'la tecnología propuesta';
}

function extractQuantity(claim: string): string | null {
  const match = claim.match(/\b\d+(?:[.,]\d+)?\s?(?:GB|TB|MB|kg|kilos?|%)\b/i);
  return match ? match[0].replace(/\s+/g, ' ') : null;
}

function ensureQuestion(value: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '¿Qué evidencia sostiene la afirmación?';
  return trimmed.endsWith('?') ? trimmed : `${trimmed.replace(/[.]+$/, '')}?`;
}

/**
 * Nota de reformulación: el claim no se acepta como hecho y se contrasta con
 * los metadatos de provenance y las fuentes de autoridad del corpus.
 */
export function synthesizeReframingNote(
  signal: DiscoveredSignal,
  question: string,
  llmNote: string | null,
  context: ReframeContext
): string {
  const parts: string[] = [
    `La afirmación «${signal.assertion}» NO se acepta como hecho verificable: la evidencia inicial no la sostiene.`,
  ];
  const notes = context.item.notes?.trim();
  if (notes) parts.push(notes);
  const authority = relatedAuthorityItems(signal, context.item, context.corpus);
  if (authority.length) {
    parts.push(
      `Contraste con fuente(s) de autoridad del corpus: ${authority
        .map((item) => `${item.title} (${item.url})`)
        .join('; ')}.`
    );
  }
  if (llmNote && !isNullLike(llmNote) && !isClaimEcho(llmNote, signal.assertion)) {
    parts.push(llmNote.trim());
  }
  parts.push(`Pregunta investigable reformulada: ${question}`);
  return parts.join(' ');
}

/** Fuentes de autoridad del corpus relacionadas temáticamente con la señal. */
export function relatedAuthorityItems(
  signal: DiscoveredSignal,
  origin: CorpusItem,
  corpus: Corpus
): CorpusItem[] {
  const signalTokens = new Set(
    significantTokens(`${signal.topic} ${signal.assertion} ${signal.concepts.join(' ')}`)
  );
  const ranked = corpus.sources
    .filter((source) => source.id !== origin.id)
    .filter((source) => source.policy === 'PRIMARY' || source.policy === 'EVIDENCE' || source.policy === 'SECONDARY')
    .map((source) => {
      const tokens = significantTokens(`${source.title} ${source.creator}`);
      const overlap = tokens.filter((token) => signalTokens.has(token) && token.length >= 4);
      return { source, score: new Set(overlap).size };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.source.id < b.source.id ? -1 : 1));
  return ranked.slice(0, 2).map((entry) => entry.source);
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (isNullLike(value)) continue;
    const trimmed = String(value).trim();
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
