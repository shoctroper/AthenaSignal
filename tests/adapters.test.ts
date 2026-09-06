import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { NormalizedSource, NormalizedContent, ISourceAdapter } from '../src/adapters/ISourceAdapter.ts';

/**
 * Mock YouTube adapter para probar el contrato ISourceAdapter
 */
class MockYouTubeAdapter implements ISourceAdapter {
  canHandle(urlOrSource: string): boolean {
    return urlOrSource.includes('youtube.com') || urlOrSource.includes('youtu.be');
  }

  async acquire(urlOrSource: string): Promise<NormalizedContent> {
    if (!this.canHandle(urlOrSource)) {
      throw new Error(`Unsupported URL: ${urlOrSource}`);
    }

    const source: NormalizedSource = {
      platform: 'youtube',
      creator: 'Tech Channel',
      url: urlOrSource,
      publishedAt: '2026-09-05T12:00:00Z',
      contentId: 'yt-mock-123',
    };

    return {
      source,
      title: 'Mock Technical Video',
      description: 'A mock video explaining system architecture',
      transcript: 'In this video we discuss event-driven microservices...',
      language: 'en',
      metadata: {
        views: 15000,
        durationSeconds: 600,
      },
    };
  }
}

/**
 * Mock TikTok adapter para probar despacho polimórfico
 */
class MockTikTokAdapter implements ISourceAdapter {
  canHandle(urlOrSource: string): boolean {
    return urlOrSource.includes('tiktok.com');
  }

  async acquire(urlOrSource: string): Promise<NormalizedContent> {
    if (!this.canHandle(urlOrSource)) {
      throw new Error(`Unsupported URL: ${urlOrSource}`);
    }

    const source: NormalizedSource = {
      platform: 'tiktok',
      creator: 'dev_tips',
      url: urlOrSource,
      publishedAt: '2026-09-05T10:00:00Z',
      contentId: 'tt-mock-456',
    };

    return {
      source,
      title: 'Quick Redis Tip',
      description: 'Why Redis single-thread model works',
      transcript: 'Here is why Redis uses a single thread for commands...',
      language: 'es',
      metadata: {
        likes: 3200,
        shares: 450,
      },
    };
  }
}

describe('ISourceAdapter Contract & Implementations - AthenaSignal', () => {
  it('allows implementing ISourceAdapter with canHandle and acquire', async () => {
    const adapter: ISourceAdapter = new MockYouTubeAdapter();

    assert.equal(adapter.canHandle('https://youtube.com/watch?v=123'), true);
    assert.equal(adapter.canHandle('https://tiktok.com/@user/video/1'), false);

    const content = await adapter.acquire('https://youtube.com/watch?v=123');

    assert.equal(content.source.platform, 'youtube');
    assert.equal(content.source.creator, 'Tech Channel');
    assert.equal(content.source.contentId, 'yt-mock-123');
    assert.equal(content.title, 'Mock Technical Video');
    assert.equal(typeof content.transcript, 'string');
    assert.equal(content.language, 'en');
    assert.equal(content.metadata.views, 15000);
  });

  it('handles multiple adapters evaluating different platforms', async () => {
    const adapters: ISourceAdapter[] = [
      new MockYouTubeAdapter(),
      new MockTikTokAdapter(),
    ];

    const targetUrl = 'https://tiktok.com/@dev_tips/video/999';
    const matchingAdapter = adapters.find((a) => a.canHandle(targetUrl));

    assert.ok(matchingAdapter, 'Should find a matching adapter for TikTok URL');

    const content = await matchingAdapter.acquire(targetUrl);
    assert.equal(content.source.platform, 'tiktok');
    assert.equal(content.source.creator, 'dev_tips');
    assert.equal(content.language, 'es');
  });

  it('throws an error when acquire is called with an unsupported URL', async () => {
    const adapter = new MockYouTubeAdapter();
    const unsupportedUrl = 'https://example.com/blog/article-1';

    assert.equal(adapter.canHandle(unsupportedUrl), false);
    await assert.rejects(
      async () => {
        await adapter.acquire(unsupportedUrl);
      },
      {
        name: 'Error',
        message: 'Unsupported URL: https://example.com/blog/article-1',
      }
    );
  });

  it('ensures NormalizedContent adheres strictly to the required schema', async () => {
    const adapter = new MockTikTokAdapter();
    const content: NormalizedContent = await adapter.acquire('https://tiktok.com/@dev_tips/video/999');

    // Verify all required properties on NormalizedSource
    const requiredSourceKeys: (keyof NormalizedSource)[] = ['platform', 'creator', 'url', 'publishedAt', 'contentId'];
    for (const key of requiredSourceKeys) {
      assert.ok(key in content.source, `NormalizedSource must have property ${key}`);
      assert.equal(typeof content.source[key], 'string');
    }

    // Verify all required properties on NormalizedContent
    assert.ok('source' in content);
    assert.ok('title' in content);
    assert.ok('description' in content);
    assert.ok('transcript' in content);
    assert.ok('language' in content);
    assert.ok('metadata' in content);
  });
});
