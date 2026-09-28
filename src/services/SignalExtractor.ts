/**
 * Servicio Extractor de Señales (SignalExtractor)
 * Basado en DU-001 (Modelo Conceptual) y RFC-003 (Arquitectura Técnica)
 */

import { Claim, createClaim, type Signal } from '../domain/entities.ts';

export interface NormalizedSource {
  platform: 'tiktok' | 'youtube' | 'reddit' | 'rss' | 'blog' | 'podcast' | string;
  creator: string;
  url: string;
  publishedAt: string;
  contentId: string;
}

export interface NormalizedContent {
  source: NormalizedSource;
  title: string;
  description: string;
  transcript: string;
  language: string;
  metadata?: Record<string, unknown>;
}

export interface SignalExtractionMetadata {
  extractor?: string;
  truncated?: number;
  [key: string]: unknown;
}

export interface UnquotableClaim {
  statement: string;
  quote: string | null;
  reason: 'cita-inventada' | 'sin-cita';
  provenanceSourceId: string;
}

export interface QuotedClaim extends Claim {
  quote: string;
  quoteStart: number;
}

export interface ExtractedSignal extends Signal {
  unquotable?: UnquotableClaim[];
  metadata?: SignalExtractionMetadata;
}

export interface ISignalExtractor {
  extract(content: NormalizedContent): Promise<Signal>;
}

export type CustomExtractorEngine = (
  content: NormalizedContent
) => Promise<Partial<ExtractedSignal> | Partial<Signal>> | Partial<ExtractedSignal> | Partial<Signal>;

export function normalizeForQuoteMatch(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const DEFAULT_MAX_TRANSCRIPT_CHARS = 9000;

export class SignalExtractor implements ISignalExtractor {
  private customEngine?: CustomExtractorEngine;
  private maxTranscriptChars: number;

  constructor(
    customEngine?: CustomExtractorEngine,
    maxTranscriptChars: number | { maxTranscriptChars?: number } = DEFAULT_MAX_TRANSCRIPT_CHARS
  ) {
    this.customEngine = customEngine;
    if (typeof maxTranscriptChars === 'number') {
      this.maxTranscriptChars = maxTranscriptChars;
    } else if (
      typeof maxTranscriptChars === 'object' &&
      maxTranscriptChars !== null &&
      typeof maxTranscriptChars.maxTranscriptChars === 'number'
    ) {
      this.maxTranscriptChars = maxTranscriptChars.maxTranscriptChars;
    } else {
      this.maxTranscriptChars = DEFAULT_MAX_TRANSCRIPT_CHARS;
    }
  }

  async extract(content: NormalizedContent): Promise<ExtractedSignal> {
    if (this.customEngine) {
      const transcript = content.transcript || '';
      const isTruncated = transcript.length > this.maxTranscriptChars;
      const truncatedChars = isTruncated ? transcript.length - this.maxTranscriptChars : 0;
      const contentForEngine: NormalizedContent = isTruncated
        ? { ...content, transcript: transcript.slice(0, this.maxTranscriptChars) }
        : content;

      try {
        const customResult = await this.customEngine(contentForEngine);
        if (customResult && typeof customResult === 'object' && !Array.isArray(customResult)) {
          const signal = this.normalizeSignal(customResult, content);
          if (isTruncated) {
            signal.metadata = {
              ...(signal.metadata || {}),
              truncated: truncatedChars,
            };
          } else if (signal.metadata && 'truncated' in signal.metadata) {
            delete signal.metadata.truncated;
          }
          return signal;
        }
      } catch {
        // Degrada a heurística si el motor falla
      }

      const fallback = this.heuristicExtract(content) as ExtractedSignal;
      fallback.metadata = {
        extractor: 'heuristic (fallback)',
      };
      return fallback;
    }

    return this.heuristicExtract(content);
  }

  private heuristicExtract(content: NormalizedContent): Signal {
    const fullText = `${content.title}\n${content.description}\n${content.transcript}`;
    const lines = fullText
      .split(/\n|\. /)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const topic = content.title.trim() || 'Unspecified Topic';
    const topics = this.extractTopics(content.title, content.description);
    const concepts = this.extractConcepts(fullText);
    const questions = this.extractQuestions(lines);
    const rawClaims = this.extractClaimStatements(lines);
    const args = this.extractArguments(lines);
    const assumptions = this.extractAssumptions(lines);
    const contradictions = this.extractContradictions(lines);

    const claimsToInvestigate = rawClaims.map((stmt) =>
      createClaim({
        statement: stmt,
        provenanceSourceId: content.source.contentId,
        status: 'UNVERIFIED',
      })
    );

    const potentialAngles = this.generatePotentialAngles(topic, concepts, contradictions);

    return {
      sourceId: content.source.contentId,
      topic,
      topics,
      concepts,
      claimsToInvestigate,
      questions,
      arguments: args,
      assumptions,
      contradictions,
      potentialAngles,
      createdAt: new Date().toISOString(),
    };
  }

  private verifyQuote(quote: string, haystack: string): number | null {
    const normQuote = normalizeForQuoteMatch(quote);
    if (!normQuote) return null;
    const normHaystack = normalizeForQuoteMatch(haystack);
    const index = normHaystack.indexOf(normQuote);
    return index >= 0 ? index : null;
  }

  private normalizeSignal(
    partial: Partial<ExtractedSignal> | Partial<Signal>,
    content: NormalizedContent
  ): ExtractedSignal {
    const claims: QuotedClaim[] = [];
    const unquotable: UnquotableClaim[] = [];

    for (const c of partial.claimsToInvestigate || []) {
      if (c instanceof Claim && !('quote' in c)) {
        claims.push(
          Object.assign(
            createClaim({
              statement: c.statement,
              provenanceSourceId: c.provenanceSourceId || content.source.contentId,
              id: c.id,
              status: c.status || 'UNVERIFIED',
              createdAt: c.createdAt,
            }),
            { quote: '', quoteStart: -1 }
          )
        );
        continue;
      }

      const stmt = typeof c === 'string' ? c : (c as { statement?: string }).statement || '';
      const rawQuote =
        typeof c === 'object' && c !== null && 'quote' in c && typeof (c as { quote?: unknown }).quote === 'string'
          ? (c as { quote: string }).quote
          : null;

      if (!rawQuote || rawQuote.trim().length === 0) {
        unquotable.push({
          statement: stmt,
          quote: rawQuote,
          reason: 'sin-cita',
          provenanceSourceId: content.source.contentId,
        });
        continue;
      }

      const quoteStart = this.verifyQuote(rawQuote, content.transcript || '');
      if (quoteStart === null) {
        unquotable.push({
          statement: stmt,
          quote: rawQuote,
          reason: 'cita-inventada',
          provenanceSourceId: content.source.contentId,
        });
        continue;
      }

      const claimId =
        typeof c === 'object' && c !== null && 'id' in c && typeof (c as { id?: unknown }).id === 'string'
          ? (c as { id: string }).id
          : undefined;

      const created = createClaim({
        statement: stmt,
        provenanceSourceId: content.source.contentId,
        id: claimId,
        status: 'UNVERIFIED',
      });

      const quotedClaim: QuotedClaim = Object.assign(created, {
        quote: rawQuote,
        quoteStart,
      });

      claims.push(quotedClaim);
    }

    const result: ExtractedSignal = {
      sourceId: content.source.contentId,
      topic: partial.topic || content.title || 'Unspecified Topic',
      topics: partial.topics || [partial.topic || content.title],
      concepts: partial.concepts || [],
      claimsToInvestigate: claims,
      unquotable,
      questions: partial.questions || [],
      arguments: partial.arguments || [],
      assumptions: partial.assumptions || [],
      contradictions: partial.contradictions || [],
      potentialAngles: partial.potentialAngles || [],
      createdAt: partial.createdAt || new Date().toISOString(),
    };

    if ((partial as ExtractedSignal).metadata !== undefined) {
      result.metadata = (partial as ExtractedSignal).metadata;
    }

    return result;
  }

  private extractTopics(title: string, description: string): string[] {
    const set = new Set<string>();
    if (title) set.add(title.trim());

    const vsMatch = title.match(/([A-Za-z0-9_\-\s]+)\s+(?:vs|versus|contra)\s+([A-Za-z0-9_\-\s]+)/i);
    if (vsMatch) {
      set.add(vsMatch[0].trim());
      set.add(vsMatch[1].trim());
      set.add(vsMatch[2].trim());
    }

    if (description) {
      const firstSentence = description.split(/\.|\n/)[0].trim();
      if (firstSentence && firstSentence.length < 80) {
        set.add(firstSentence);
      }
    }

    return Array.from(set);
  }

  private extractConcepts(text: string): string[] {
    const knownKeywords = [
      'RabbitMQ',
      'Kafka',
      'Apache Kafka',
      'AMQP',
      'Commit Log',
      'Event Sourcing',
      'Message Broker',
      'Streaming',
      'Pub/Sub',
      'Queue',
      'Exchange',
      'Partition',
      'Consumer',
      'Producer',
      'Throughput',
      'Latency',
    ];

    const found = new Set<string>();
    for (const kw of knownKeywords) {
      const regex = new RegExp(`\\b${kw.replace('-', '\\-')}\\b`, 'i');
      if (regex.test(text)) {
        found.add(kw);
      }
    }

    const capMatches = text.match(/\b[A-Z][a-zA-Z0-9\-_]{2,}\b/g) || [];
    for (const m of capMatches) {
      if (!['Hoy', 'Una', 'Este', 'Para', 'Como', 'Con', 'Por', 'Del', 'Los', 'Las', 'Que'].includes(m)) {
        found.add(m);
      }
    }

    return Array.from(found);
  }

  private extractQuestions(lines: string[]): string[] {
    return lines.filter(
      (l) =>
        l.startsWith('¿') ||
        l.endsWith('?') ||
        /^(cómo|como|cuál|cual|por qué|por que|quién|quien|dónde|donde|cuándo|cuando|which|how|why|what)\b/i.test(l)
    );
  }

  private extractClaimStatements(lines: string[]): string[] {
    const claimKeywords = /es un|es una|ofrece|garantiza|proporciona|es la|es el|destaca|sobresale|is a|provides|delivers|guarantees|allows/i;
    return lines.filter((l) => claimKeywords.test(l) && !l.startsWith('¿') && !l.endsWith('?'));
  }

  private extractArguments(lines: string[]): string[] {
    const argKeywords = /por lo tanto|debido a|porque|destaca en|sobresale en|enables|therefore|because|since/i;
    return lines.filter((l) => argKeywords.test(l));
  }

  private extractAssumptions(lines: string[]): string[] {
    const assumpKeywords = /asum|supo|presup|dado que|assuming|assumes|given that/i;
    return lines.filter((l) => assumpKeywords.test(l));
  }

  private extractContradictions(lines: string[]): string[] {
    const contradKeywords = /contradicci|fricci|versus|\bvs\b|sin embargo|en cambio|diferencia|trade-off|tradeoff|however|whereas|conflict/i;
    return lines.filter((l) => contradKeywords.test(l));
  }

  private generatePotentialAngles(
    topic: string,
    concepts: string[],
    contradictions: string[]
  ): string[] {
    const angles: string[] = [];
    if (contradictions.length > 0) {
      angles.push(`Tensión técnica: ${contradictions[0]}`);
    }
    if (concepts.length >= 2) {
      angles.push(`Análisis comparativo de ${concepts.slice(0, 3).join(' vs ')}`);
    } else {
      angles.push(`Investigación profunda sobre ${topic}`);
    }
    return angles;
  }
}
