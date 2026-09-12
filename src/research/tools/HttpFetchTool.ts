/**
 * Herramienta de fetch de documentos (ORDEN-007 §5). Descarga y extrae texto
 * plano de HTML. No escribe fuera del worktree: solo devuelve el contenido.
 */

import type { FetchResult, FetchTool } from './SearchTool.ts';

export class HttpFetchTool implements FetchTool {
  readonly id = 'http-fetch';
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(options: { timeoutMs?: number; maxBytes?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxBytes = options.maxBytes ?? 200_000;
  }

  async fetch(url: string): Promise<FetchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'AthenaSignal/0.1 (+research; offline-replayable)',
          Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      const contentType = response.headers.get('content-type') ?? '';
      const raw = (await response.text()).slice(0, this.maxBytes);
      const text = contentType.includes('html') ? htmlToText(raw) : raw.trim();
      return { url, status: response.status, contentType, text };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}
