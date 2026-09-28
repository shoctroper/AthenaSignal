import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { Claim } from '../src/domain/entities.ts';
import {
  SignalExtractor,
  DEFAULT_MAX_TRANSCRIPT_CHARS,
  type NormalizedContent,
  type QuotedClaim,
} from '../src/services/SignalExtractor.ts';
import {
  OpenAICompatibleExtractionEngine,
  createOpenAICompatibleExtractionEngine,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
} from '../src/adapters/OpenAICompatibleExtractionEngine.ts';

const TRANSCRIPT =
  'Las «redes neuronales» aprenden ajustando ‘pesos’. ' +
  'Cada capa transforma la entrada en una representación nueva. ' +
  'El descenso de gradiente minimiza el error observado. ' +
  'El algoritmo de optimización proporciona convergencia eficiente y es una base fundamental.';

const sampleContent: NormalizedContent = {
  source: {
    contentId: 'src-test-001',
    platform: 'youtube',
    creator: 'TechLab',
    url: 'https://example.invalid/v',
    publishedAt: '2026-01-01T00:00:00.000Z',
  },
  title: 'Redes neuronales',
  description: 'Una explicación corta sobre redes neuronales y optimización.',
  transcript: TRANSCRIPT,
  language: 'es',
};

describe('Model-based SignalExtractor (RFC-007 / D-EX-1)', () => {
  it('(a) motor con cita LITERAL -> el claim sobrevive y unquotable vacio', async () => {
    const quote = 'El descenso de gradiente minimiza el error observado.';
    const extractor = new SignalExtractor(async () => ({
      claimsToInvestigate: [
        {
          statement: 'El gradiente minimiza el error',
          quote,
        },
      ],
      concepts: ['Redes neuronales', 'Gradiente'],
      topics: ['Redes neuronales'],
    }));

    const signal = await extractor.extract(sampleContent);

    assert.equal(signal.claimsToInvestigate.length, 1);
    const claim = signal.claimsToInvestigate[0] as QuotedClaim;
    assert.ok(claim instanceof Claim, 'El claim debe ser instancia de Claim');
    assert.equal(claim.statement, 'El gradiente minimiza el error');
    assert.equal(claim.quote, quote);
    assert.equal(typeof claim.quoteStart, 'number');
    assert.ok(claim.quoteStart >= 0);
    assert.equal(claim.status, 'UNVERIFIED');
    assert.equal(claim.provenanceSourceId, 'src-test-001');
    assert.deepEqual(signal.unquotable, []);
  });

  it('(b) motor con cita INVENTADA -> claimsToInvestigate vacio y unquotable contiene el descarte con su cita', async () => {
    const fakeQuote = 'esta frase no aparece en el transcript jamas';
    const extractor = new SignalExtractor(async () => ({
      claimsToInvestigate: [
        {
          statement: 'Alucinación no respaldada',
          quote: fakeQuote,
        },
      ],
    }));

    const signal = await extractor.extract(sampleContent);

    assert.equal(signal.claimsToInvestigate.length, 0);
    assert.ok(signal.unquotable && signal.unquotable.length === 1);
    assert.equal(signal.unquotable[0].statement, 'Alucinación no respaldada');
    assert.equal(signal.unquotable[0].quote, fakeQuote);
    assert.equal(signal.unquotable[0].reason, 'cita-inventada');
    assert.equal(signal.unquotable[0].provenanceSourceId, 'src-test-001');
  });

  it('(c) cita con espacios multiples y comillas tipograficas se perdona', async () => {
    // Transcript has: Las «redes neuronales» aprenden ajustando ‘pesos’.
    // Engine provides ASCII quotes and multiple spaces/newlines
    const relaxedQuote = 'Las  "redes neuronales" \n  aprenden  ajustando  \'pesos\'.';
    const extractor = new SignalExtractor(async () => ({
      claimsToInvestigate: [
        {
          statement: 'Las redes aprenden ajustando pesos',
          quote: relaxedQuote,
        },
      ],
    }));

    const signal = await extractor.extract(sampleContent);

    assert.equal(signal.claimsToInvestigate.length, 1);
    assert.equal(signal.claimsToInvestigate[0].statement, 'Las redes aprenden ajustando pesos');
    assert.deepEqual(signal.unquotable, []);
  });

  it('(d) cita con diferencia de PALABRAS (maximiza por minimiza) y mayusculas NO se perdona', async () => {
    const wrongWordQuote = 'El descenso de gradiente maximiza el error observado.';
    const wrongCaseQuote = 'el descenso de gradiente minimiza el error observado.';

    const extractor = new SignalExtractor(async () => ({
      claimsToInvestigate: [
        { statement: 'Claim con palabra cambiada', quote: wrongWordQuote },
        { statement: 'Claim con casing cambiado', quote: wrongCaseQuote },
      ],
    }));

    const signal = await extractor.extract(sampleContent);

    assert.equal(signal.claimsToInvestigate.length, 0);
    assert.equal(signal.unquotable?.length, 2);
    assert.equal(signal.unquotable?.[0].reason, 'cita-inventada');
    assert.equal(signal.unquotable?.[1].reason, 'cita-inventada');
  });

  it('(e) un claim sin cita cae en unquotable con reason:\'sin-cita\'', async () => {
    const extractor = new SignalExtractor(async () => ({
      claimsToInvestigate: [
        'Claim directo en formato string sin objeto',
        { statement: 'Claim con propiedad quote vacia', quote: '   ' },
        { statement: 'Claim sin propiedad quote' },
      ],
    }));

    const signal = await extractor.extract(sampleContent);

    assert.equal(signal.claimsToInvestigate.length, 0);
    assert.equal(signal.unquotable?.length, 3);
    assert.equal(signal.unquotable?.[0].statement, 'Claim directo en formato string sin objeto');
    assert.equal(signal.unquotable?.[0].quote, null);
    assert.equal(signal.unquotable?.[0].reason, 'sin-cita');
    assert.equal(signal.unquotable?.[0].provenanceSourceId, 'src-test-001');

    assert.equal(signal.unquotable?.[1].statement, 'Claim con propiedad quote vacia');
    assert.equal(signal.unquotable?.[1].reason, 'sin-cita');

    assert.equal(signal.unquotable?.[2].statement, 'Claim sin propiedad quote');
    assert.equal(signal.unquotable?.[2].reason, 'sin-cita');
  });

  it('(f) todo claim aceptado conserva provenanceSourceId y status UNVERIFIED', async () => {
    const quote = 'Cada capa transforma la entrada en una representación nueva.';
    const extractor = new SignalExtractor(async () => ({
      claimsToInvestigate: [
        {
          id: 'custom-claim-id-1',
          statement: 'Las capas transforman representaciones',
          quote,
        },
      ],
    }));

    const signal = await extractor.extract(sampleContent);

    assert.equal(signal.claimsToInvestigate.length, 1);
    const claim = signal.claimsToInvestigate[0];
    assert.equal(claim.provenanceSourceId, 'src-test-001');
    assert.equal(claim.status, 'UNVERIFIED');
    assert.equal(claim.id, 'custom-claim-id-1');
  });

  it('(g) camino por defecto sin motor: sigue Byte-identico y NO emite unquotable', async () => {
    const defaultExtractor = new SignalExtractor();
    const signal = await defaultExtractor.extract(sampleContent);

    assert.equal(signal.sourceId, 'src-test-001');
    assert.equal(signal.topic, 'Redes neuronales');
    assert.ok(signal.claimsToInvestigate.length > 0);
    assert.equal('unquotable' in signal, false, 'El camino heuristico por defecto NO debe emitir unquotable');
  });

  it('(h) guarda de no-red: monkeypatch de fetch y socket bloquea cualquier acceso a red y extract completa offline', async () => {
    const originalFetch = globalThis.fetch;
    const originalConnect = net.Socket.prototype.connect;
    const originalCreateConnection = net.createConnection;

    try {
      globalThis.fetch = () => {
        throw new Error('Violación de aislamiento de red: fetch fue llamado');
      };
      net.Socket.prototype.connect = function () {
        throw new Error('Violación de aislamiento de red: net.Socket.connect fue llamado');
      };
      (net as any).createConnection = function () {
        throw new Error('Violación de aislamiento de red: net.createConnection fue llamado');
      };

      // Sin motor
      const heuristicExtractor = new SignalExtractor();
      const signalHeuristic = await heuristicExtractor.extract(sampleContent);
      assert.ok(signalHeuristic.topic);
      assert.equal('unquotable' in signalHeuristic, false);

      // Con motor falso
      const modelExtractor = new SignalExtractor(async () => ({
        claimsToInvestigate: [
          {
            statement: 'Descenso de gradiente',
            quote: 'El descenso de gradiente minimiza el error observado.',
          },
        ],
      }));
      const signalModel = await modelExtractor.extract(sampleContent);
      assert.equal(signalModel.claimsToInvestigate.length, 1);
      assert.deepEqual(signalModel.unquotable, []);
    } finally {
      globalThis.fetch = originalFetch;
      net.Socket.prototype.connect = originalConnect;
      net.createConnection = originalCreateConnection;
    }
  });

  it('(i) motor que lanza excepcion -> extract resuelve con heuristica marcada fallback y sin unquotable', async () => {
    const throwingEngine = () => {
      throw new Error('Fallo catastrofico sincrono del motor');
    };
    const extractorSync = new SignalExtractor(throwingEngine);
    const signalSync = await extractorSync.extract(sampleContent);

    assert.ok(signalSync.metadata?.extractor?.includes('fallback'));
    assert.equal(signalSync.metadata?.extractor, 'heuristic (fallback)');
    assert.ok(signalSync.claimsToInvestigate.length > 0);
    assert.equal('unquotable' in signalSync, false, 'No debe haber unquotable en fallback');
    assert.equal(signalSync.topic, 'Redes neuronales');

    const rejectingEngine = async () => {
      throw new Error('Rechazo asincrono del motor');
    };
    const extractorAsync = new SignalExtractor(rejectingEngine);
    const signalAsync = await extractorAsync.extract(sampleContent);

    assert.ok(signalAsync.metadata?.extractor?.includes('fallback'));
    assert.equal(signalAsync.metadata?.extractor, 'heuristic (fallback)');
    assert.ok(signalAsync.claimsToInvestigate.length > 0);
    assert.equal('unquotable' in signalAsync, false, 'No debe haber unquotable en fallback');
    assert.equal(signalAsync.topic, 'Redes neuronales');
  });

  it('(j) motor que devuelve una cadena no-JSON -> extract resuelve con heuristica marcada fallback y sin unquotable', async () => {
    const nonJsonEngine = async () => 'esto no es JSON en absoluto' as any;
    const extractor = new SignalExtractor(nonJsonEngine);
    const signal = await extractor.extract(sampleContent);

    assert.ok(signal.metadata?.extractor?.includes('fallback'));
    assert.equal(signal.metadata?.extractor, 'heuristic (fallback)');
    assert.ok(signal.claimsToInvestigate.length > 0);
    assert.equal('unquotable' in signal, false, 'No debe haber unquotable en fallback');
    assert.equal(signal.topic, 'Redes neuronales');
  });
});

describe('SignalExtractor Transcript Cap (D-EX-7)', () => {
  const LONG_TRANSCRIPT = 'A'.repeat(40000);
  const longContent: NormalizedContent = {
    source: {
      contentId: 'src-long-001',
      platform: 'youtube',
      creator: 'TechLab',
      url: 'https://example.invalid/v_long',
      publishedAt: '2026-01-01T00:00:00.000Z',
    },
    title: 'Transcript muy largo',
    description: 'Descripción de prueba para transcripción larga.',
    transcript: LONG_TRANSCRIPT,
    language: 'es',
  };

  it('(a) a fake engine on a transcript of ~40,000 chars receives a transcript of exactly 9,000 chars and the signal carries metadata.truncated === 31000', async () => {
    let receivedTranscriptLength = 0;
    const extractor = new SignalExtractor(async (content) => {
      receivedTranscriptLength = content.transcript.length;
      return {
        topic: content.title,
        claimsToInvestigate: [],
      };
    });

    const signal = await extractor.extract(longContent);

    assert.equal(receivedTranscriptLength, DEFAULT_MAX_TRANSCRIPT_CHARS);
    assert.equal(receivedTranscriptLength, 9000);
    assert.ok(signal.metadata !== undefined);
    assert.equal(signal.metadata.truncated, 31000);
  });

  it('(b) a transcript at or below the cap leaves metadata.truncated absent', async () => {
    let receivedTranscriptLength = 0;
    const extractor = new SignalExtractor(async (content) => {
      receivedTranscriptLength = content.transcript.length;
      return {
        topic: content.title,
        claimsToInvestigate: [],
      };
    });

    // Sub-caso 1: transcript corto (< 9000 chars)
    const shortSignal = await extractor.extract(sampleContent);
    assert.equal(receivedTranscriptLength, sampleContent.transcript.length);
    assert.equal(shortSignal.metadata?.truncated, undefined);
    assert.equal('truncated' in (shortSignal.metadata || {}), false);

    // Sub-caso 2: transcript exactamente en el cap (9000 chars)
    const exactCapContent: NormalizedContent = {
      ...sampleContent,
      transcript: 'B'.repeat(DEFAULT_MAX_TRANSCRIPT_CHARS),
    };
    const exactSignal = await extractor.extract(exactCapContent);
    assert.equal(receivedTranscriptLength, DEFAULT_MAX_TRANSCRIPT_CHARS);
    assert.equal(exactSignal.metadata?.truncated, undefined);
    assert.equal('truncated' in (exactSignal.metadata || {}), false);
  });

  it('(c) an engine that supplies its own metadata still yields both its keys and truncated', async () => {
    const extractor = new SignalExtractor(async () => ({
      topic: 'Test con metadata propia',
      claimsToInvestigate: [],
      metadata: {
        extractor: 'custom-llm-v1',
        model: 'deepseek-r1',
        confidence: 0.98,
        truncated: 0, // intento de sobreescribir o falsificar por parte del motor
      },
    }));

    const signal = await extractor.extract(longContent);

    assert.ok(signal.metadata !== undefined);
    assert.equal(signal.metadata.extractor, 'custom-llm-v1');
    assert.equal(signal.metadata.model, 'deepseek-r1');
    assert.equal(signal.metadata.confidence, 0.98);
    // Truncated calculado por el extractor debe ganar sobre el del motor
    assert.equal(signal.metadata.truncated, 31000);
  });

  it('(d) the default no-engine path on a long transcript emits no metadata at all (byte-identical guarantee)', async () => {
    const defaultExtractor = new SignalExtractor();
    const signal = await defaultExtractor.extract(longContent);

    assert.equal(signal.sourceId, 'src-long-001');
    assert.equal(signal.topic, 'Transcript muy largo');
    assert.equal('metadata' in signal, false, 'El camino sin motor no debe emitir metadata');
    assert.equal(signal.metadata, undefined);
  });
});

describe('OpenAI-compatible Extraction Engine (RFC-007 / D-EX-4 / D-EX-5 / D-EX-8 / S4)', () => {
  it('(a) POSTs chat-completions request with reasoning_effort: "none" and configured model/base-url', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const fakeFetch: typeof globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method || 'GET';
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = init?.body ? JSON.parse(String(init.body)) : null;

      const mockResponse = {
        id: 'chatcmpl-mock-001',
        object: 'chat.completion',
        created: Date.now(),
        model: 'custom-extractor-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                topics: ['Redes neuronales y optimización'],
                concepts: ['Descenso de gradiente', 'Pesos neuronales'],
                claimsToInvestigate: [
                  {
                    statement: 'El descenso de gradiente minimiza el error',
                    quote: 'El descenso de gradiente minimiza el error observado.',
                  },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const engine = new OpenAICompatibleExtractionEngine({
      baseUrl: 'http://custom-ollama.local:11434/v1',
      model: 'custom-extractor-model',
      apiKey: 'secret-key-123',
      fetch: fakeFetch,
    });

    const extractor = new SignalExtractor(engine);
    const signal = await extractor.extract(sampleContent);

    assert.equal(capturedUrl, 'http://custom-ollama.local:11434/v1/chat/completions');
    assert.equal(capturedMethod, 'POST');
    assert.equal(capturedHeaders['Content-Type'], 'application/json');
    assert.equal(capturedHeaders['Authorization'], 'Bearer secret-key-123');
    assert.ok(capturedBody !== null);
    assert.equal(capturedBody.model, 'custom-extractor-model');
    assert.equal(capturedBody.reasoning_effort, 'none');
    assert.equal(capturedBody.temperature, 0);

    // Assert that claims survived literal quote filter with provenanceSourceId intact
    assert.equal(signal.claimsToInvestigate.length, 1);
    const claim = signal.claimsToInvestigate[0] as QuotedClaim;
    assert.equal(claim.statement, 'El descenso de gradiente minimiza el error');
    assert.equal(claim.quote, 'El descenso de gradiente minimiza el error observado.');
    assert.equal(claim.provenanceSourceId, 'src-test-001');
    assert.equal(claim.status, 'UNVERIFIED');
    assert.ok(claim.quoteStart >= 0);
    assert.deepEqual(signal.unquotable, []);
    assert.equal(signal.metadata?.extractor, 'openai-compatible');
    assert.equal(signal.metadata?.model, 'custom-extractor-model');
  });

  it('(b) reads default model and base-url from environment variables when omitted', async () => {
    const prevBaseUrl = process.env.SIGNAL_EXTRACTOR_BASE_URL;
    const prevModel = process.env.SIGNAL_EXTRACTOR_MODEL;

    let capturedUrl = '';
    let capturedBody: any = null;

    try {
      process.env.SIGNAL_EXTRACTOR_BASE_URL = 'http://env-ollama:11434/v1';
      process.env.SIGNAL_EXTRACTOR_MODEL = 'env-model-v2';

      const fakeFetch: typeof globalThis.fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    topics: ['Env Topic'],
                    concepts: [],
                    claimsToInvestigate: [],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const engine = new OpenAICompatibleExtractionEngine({ fetch: fakeFetch });
      const extractor = new SignalExtractor(engine.asCustomEngine());
      await extractor.extract(sampleContent);

      assert.equal(capturedUrl, 'http://env-ollama:11434/v1/chat/completions');
      assert.equal(capturedBody.model, 'env-model-v2');
      assert.equal(capturedBody.reasoning_effort, 'none');
    } finally {
      if (prevBaseUrl === undefined) {
        delete process.env.SIGNAL_EXTRACTOR_BASE_URL;
      } else {
        process.env.SIGNAL_EXTRACTOR_BASE_URL = prevBaseUrl;
      }
      if (prevModel === undefined) {
        delete process.env.SIGNAL_EXTRACTOR_MODEL;
      } else {
        process.env.SIGNAL_EXTRACTOR_MODEL = prevModel;
      }
    }
  });

  it('(c) uses default localhost ollama endpoint when no options or env vars are present', async () => {
    const prevBaseUrl = process.env.SIGNAL_EXTRACTOR_BASE_URL;
    const prevModel = process.env.SIGNAL_EXTRACTOR_MODEL;

    let capturedUrl = '';
    let capturedBody: any = null;

    try {
      delete process.env.SIGNAL_EXTRACTOR_BASE_URL;
      delete process.env.SIGNAL_EXTRACTOR_MODEL;

      const fakeFetch: typeof globalThis.fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    topics: ['Localhost Topic'],
                    concepts: [],
                    claimsToInvestigate: [],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const engine = createOpenAICompatibleExtractionEngine({ fetch: fakeFetch });
      const extractor = new SignalExtractor(engine);
      await extractor.extract(sampleContent);

      assert.equal(capturedUrl, `${DEFAULT_OPENAI_BASE_URL}/chat/completions`);
      assert.equal(capturedBody.model, DEFAULT_OPENAI_MODEL);
      assert.equal(capturedBody.reasoning_effort, 'none');
    } finally {
      if (prevBaseUrl !== undefined) process.env.SIGNAL_EXTRACTOR_BASE_URL = prevBaseUrl;
      if (prevModel !== undefined) process.env.SIGNAL_EXTRACTOR_MODEL = prevModel;
    }
  });

  it('(d) a fake engine answering non-JSON degrades to "heuristic (fallback)"', async () => {
    const fakeFetch: typeof globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Respuesta en texto plano que no es JSON: El modelo alucinó sin formato.',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const engine = new OpenAICompatibleExtractionEngine({ fetch: fakeFetch });
    const extractor = new SignalExtractor(engine);
    const signal = await extractor.extract(sampleContent);

    assert.equal(signal.metadata?.extractor, 'heuristic (fallback)');
    assert.ok(signal.claimsToInvestigate.length > 0);
    assert.equal('unquotable' in signal, false, 'No unquotable bucket on fallback degradation');
  });

  it('(e) engine throwing on HTTP error degrades to "heuristic (fallback)"', async () => {
    const fakeFetch: typeof globalThis.fetch = async () => {
      return new Response('Rate limit exceeded / Model error', {
        status: 429,
        statusText: 'Too Many Requests',
      });
    };

    const engine = new OpenAICompatibleExtractionEngine({ fetch: fakeFetch });
    const extractor = new SignalExtractor(engine);
    const signal = await extractor.extract(sampleContent);

    assert.equal(signal.metadata?.extractor, 'heuristic (fallback)');
    assert.ok(signal.claimsToInvestigate.length > 0);
    assert.equal('unquotable' in signal, false);
  });

  it('(f) engine throwing on empty model content degrades to "heuristic (fallback)"', async () => {
    const fakeFetch: typeof globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '   ',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const engine = new OpenAICompatibleExtractionEngine({ fetch: fakeFetch });
    const extractor = new SignalExtractor(engine);
    const signal = await extractor.extract(sampleContent);

    assert.equal(signal.metadata?.extractor, 'heuristic (fallback)');
    assert.ok(signal.claimsToInvestigate.length > 0);
    assert.equal('unquotable' in signal, false);
  });

  it('(g) engine throwing on fetch failure / network error degrades to "heuristic (fallback)"', async () => {
    const fakeFetch: typeof globalThis.fetch = async () => {
      throw new Error('Connection refused: ECONNREFUSED 127.0.0.1:11434');
    };

    const engine = new OpenAICompatibleExtractionEngine({ fetch: fakeFetch });
    const extractor = new SignalExtractor(engine);
    const signal = await extractor.extract(sampleContent);

    assert.equal(signal.metadata?.extractor, 'heuristic (fallback)');
    assert.ok(signal.claimsToInvestigate.length > 0);
    assert.equal('unquotable' in signal, false);
  });
});


