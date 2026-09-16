// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Model discovery and capability filtering.
 *
 * Two properties matter most and both are asserted directly rather than by proxy:
 * a capability a model does not declare is never offered (multimodal fails closed),
 * and a live catalog is authoritative — the verified seed is a fallback, never an
 * ingredient mixed into a successful response.
 *
 * The fixtures mirror the shape the public catalog actually returns, including
 * `architecture.input_modalities` and `supported_endpoint_types`.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  fetchOrcaCatalog,
  filterCatalog,
  isChatCapable,
  loadOrcaCatalog,
  ORCA_CATALOG_MAX_ITEMS,
  ORCA_SEED_MODELS,
  type OrcaCatalogModel,
  parseCatalogBody,
  toCatalogModel,
  toPiInput,
} from './catalog.js';

/** A catalog body shaped like the real one. */
function catalogBody(models: unknown[]): unknown {
  return { data: models, object: 'list', success: true };
}

const TEXT_ONLY = {
  id: 'vendor/text-only-chat',
  object: 'model',
  supported_endpoint_types: ['openai', 'anthropic'],
  context_length: 131072,
  max_completion_tokens: 32768,
  architecture: { input_modalities: ['text'], output_modalities: ['text'] },
};

const IMAGE_INPUT_CHAT = {
  id: 'deepseek/deepseek-v4-flash-vision-exp',
  object: 'model',
  supported_endpoint_types: ['openai', 'openai-response', 'anthropic'],
  context_length: 1048576,
  max_completion_tokens: 384000,
  architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
};

const EMBEDDING = {
  id: 'vendor/embed-large',
  supported_endpoint_types: ['embeddings'],
  context_length: 8192,
};

const IMAGE_GENERATION = {
  id: 'vendor/image-gen',
  supported_endpoint_types: ['image-generation'],
};

const VIDEO = {
  id: 'vendor/video-gen',
  supported_endpoint_types: ['openai-video'],
};

const RERANK = {
  id: 'vendor/rerank-v1',
  supported_endpoint_types: ['jina-rerank'],
};

const FULL_CATALOG = [TEXT_ONLY, IMAGE_INPUT_CHAT, EMBEDDING, IMAGE_GENERATION, VIDEO, RERANK];

function parse(models: unknown[]): OrcaCatalogModel[] {
  return parseCatalogBody(catalogBody(models));
}

/** A fetch stub that answers with one body and records the URL it was asked for. */
function stubFetch(body: unknown, init: { status?: number; headers?: Record<string, string>; text?: string } = {}) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    const text = init.text ?? JSON.stringify(body);
    return {
      ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
      status: init.status ?? 200,
      headers: { get: (name: string) => init.headers?.[name.toLowerCase()] ?? null },
      text: async () => text,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('parseCatalogBody', () => {
  it('reads the ids, window, and declared modalities from a real-shaped response', () => {
    const models = parse([IMAGE_INPUT_CHAT]);
    const model = models[0];

    expect(model?.id).toBe('deepseek/deepseek-v4-flash-vision-exp');
    expect(model?.contextWindow).toBe(1048576);
    expect(model?.maxTokens).toBe(384000);
    expect(model?.inputModalities).toEqual(['text', 'image']);
    expect(model?.endpointTypes).toEqual(['openai', 'openai-response', 'anthropic']);
  });

  it('keeps the vendor/model namespace exactly as returned', () => {
    expect(parse([TEXT_ONLY])[0]?.id).toBe('vendor/text-only-chat');
  });

  it('accepts a bare array as well as the wrapped envelope', () => {
    expect(parseCatalogBody([TEXT_ONLY])).toHaveLength(1);
  });

  it('drops entries with no usable id and never throws on junk', () => {
    const models = parseCatalogBody({ data: [null, 42, 'nope', {}, { id: '' }, { id: 'ok/model' }] });
    expect(models.map((model) => model.id)).toEqual(['ok/model']);
  });

  it('treats an entry with no declared modalities as text-only rather than multimodal', () => {
    const model = toCatalogModel({ id: 'vendor/mystery' }, 'live');
    expect(model.inputModalities).toEqual(['text']);
    expect(toPiInput(model.inputModalities)).toEqual(['text']);
  });

  it('applies documented defaults when the catalog omits metadata', () => {
    const model = toCatalogModel({ id: 'vendor/mystery' }, 'live');
    expect(model.contextWindow).toBe(128000);
    expect(model.maxTokens).toBe(16384);
  });

  it('bounds the number of accepted entries', () => {
    const many = Array.from({ length: ORCA_CATALOG_MAX_ITEMS + 50 }, (_, index) => ({ id: `vendor/m${index}` }));
    expect(parse(many)).toHaveLength(ORCA_CATALOG_MAX_ITEMS);
  });

  it('claims no reasoning support for a live entry, which the catalog does not advertise', () => {
    expect(parse([TEXT_ONLY])[0]?.reasoning).toBe(false);
  });
});

describe('capability filtering', () => {
  it('offers text chat models for a text entry point', () => {
    const ids = filterCatalog(parse(FULL_CATALOG), { capability: 'chat' }).map((model) => model.id);
    expect(ids).toEqual(['vendor/text-only-chat', 'deepseek/deepseek-v4-flash-vision-exp']);
  });

  it('excludes image-generation, video, and rerank models from a text chat selector', () => {
    const ids = filterCatalog(parse(FULL_CATALOG), { capability: 'chat' }).map((model) => model.id);
    expect(ids).not.toContain('vendor/image-gen');
    expect(ids).not.toContain('vendor/video-gen');
    expect(ids).not.toContain('vendor/rerank-v1');
    expect(ids).not.toContain('vendor/embed-large');
  });

  it('excludes a model whose only endpoint types this client cannot speak', () => {
    const exotic = { id: 'vendor/pi-only', supported_endpoint_types: ['pi-messages'] };
    expect(isChatCapable(toCatalogModel(exotic, 'live'))).toBe(false);
    expect(filterCatalog(parse([exotic]), { capability: 'chat' })).toHaveLength(0);
  });

  it('fails closed on multimodal: a text-only chat model is not offered when an image is attached', () => {
    const ids = filterCatalog(parse(FULL_CATALOG), { capability: 'chat', modality: 'image' }).map((m) => m.id);
    expect(ids).toEqual(['deepseek/deepseek-v4-flash-vision-exp']);
    expect(ids).not.toContain('vendor/text-only-chat');
  });

  it('fails closed for audio and video input, which no fixture declares', () => {
    expect(filterCatalog(parse(FULL_CATALOG), { capability: 'chat', modality: 'audio' })).toHaveLength(0);
    expect(filterCatalog(parse(FULL_CATALOG), { capability: 'chat', modality: 'video' })).toHaveLength(0);
  });

  it('never infers a capability from a model name', () => {
    // Named "vision" but declaring no image input: still excluded.
    const misleading = {
      id: 'vendor/vision-pro',
      supported_endpoint_types: ['openai'],
      architecture: { input_modalities: ['text'] },
    };
    expect(filterCatalog(parse([misleading]), { capability: 'chat', modality: 'image' })).toHaveLength(0);
  });

  it('matches each non-chat capability on its own endpoint type only', () => {
    const models = parse(FULL_CATALOG);
    expect(filterCatalog(models, { capability: 'embedding' }).map((m) => m.id)).toEqual(['vendor/embed-large']);
    expect(filterCatalog(models, { capability: 'image' }).map((m) => m.id)).toEqual(['vendor/image-gen']);
    expect(filterCatalog(models, { capability: 'video' }).map((m) => m.id)).toEqual(['vendor/video-gen']);
    expect(filterCatalog(models, { capability: 'rerank' }).map((m) => m.id)).toEqual(['vendor/rerank-v1']);
  });

  it('does not let an embedding model into the text chat selector', () => {
    expect(isChatCapable(toCatalogModel(EMBEDDING, 'live'))).toBe(false);
  });
});

describe('fetchOrcaCatalog', () => {
  it('asks the api origin for the chat capability with a bearer token', async () => {
    const { impl, calls } = stubFetch(catalogBody([TEXT_ONLY]));
    await fetchOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', fetchImpl: impl });

    expect(calls[0]).toBe('https://api.orcarouter.ai/v1/models?capability=chat');
  });

  it('sends the requested capability rather than one hardcoded value', async () => {
    const { impl, calls } = stubFetch(catalogBody([]));
    await fetchOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', capability: 'embedding', fetchImpl: impl });
    expect(calls[0]).toContain('capability=embedding');
  });

  it('reports a non-2xx response as a failure rather than an empty catalogue', async () => {
    const { impl } = stubFetch({}, { status: 500, text: 'boom' });
    const result = await fetchOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', fetchImpl: impl });

    expect(result.source).toBe('seed');
    expect(result.reason).toBe('http');
  });

  it('reports unparseable JSON as a failure rather than an empty catalogue', async () => {
    const { impl } = stubFetch(null, { text: '<html>not json</html>' });
    const result = await fetchOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', fetchImpl: impl });
    expect(result.reason).toBe('malformed');
  });

  it('rejects an oversized body by declared length without reading it', async () => {
    const { impl } = stubFetch(catalogBody([TEXT_ONLY]), { headers: { 'content-length': '99999999' } });
    const result = await fetchOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', fetchImpl: impl });
    expect(result.reason).toBe('oversized');
  });

  it('reports a transport fault as a failure', async () => {
    const impl = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;
    const result = await fetchOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', fetchImpl: impl });
    expect(result.reason).toBe('network');
  });

  it('never places the api key in the request URL', async () => {
    const { impl, calls } = stubFetch(catalogBody([TEXT_ONLY]));
    await fetchOrcaCatalog({ apiKey: 'sk-orca-secret-value-1234', fetchImpl: impl });
    expect(calls[0]).not.toContain('sk-orca-secret-value-1234');
  });
});

describe('loadOrcaCatalog fallback', () => {
  it('treats a successful live response as authoritative and never mixes the seed in', async () => {
    const { impl } = stubFetch(catalogBody([TEXT_ONLY]));
    const result = await loadOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', fetchImpl: impl });

    expect(result.source).toBe('live');
    expect(result.models.map((model) => model.id)).toEqual(['vendor/text-only-chat']);
    for (const model of result.models) {
      expect(model.origin).toBe('live');
    }
    // No seed entry leaked in, even the ones that are text chat capable.
    const seedIds = ORCA_SEED_MODELS.map((model) => model.id);
    for (const model of result.models) {
      expect(seedIds).not.toContain(model.id);
    }
  });

  it('falls back to the verified seed and says so when discovery fails', async () => {
    const impl = (async () => {
      throw new Error('ENOTFOUND');
    }) as unknown as typeof fetch;
    const result = await loadOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', fetchImpl: impl });

    expect(result.source).toBe('seed');
    expect(result.reason).toBe('network');
    expect(result.models.length).toBeGreaterThan(0);
    for (const model of result.models) {
      expect(model.origin).toBe('seed');
    }
  });

  it('keeps the verified reasoning ladder on the seed gpt-5.5 entry', async () => {
    const impl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const result = await loadOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', fetchImpl: impl });

    const gpt = result.models.find((model) => model.id === 'openai/gpt-5.5');
    expect(gpt?.reasoning).toBe(true);
    expect(gpt?.thinkingLevelMap).toMatchObject({ low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' });
    expect(gpt?.inputModalities).toContain('image');
    expect(gpt?.contextWindow).toBeGreaterThan(0);
  });

  it('never offers a seed model outside the requested capability', async () => {
    const impl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const result = await loadOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', capability: 'embedding', fetchImpl: impl });
    expect(result.source).toBe('seed');
    expect(result.models).toHaveLength(0);
  });

  it('bounds the request with a timeout so a hung catalog cannot stall startup', async () => {
    vi.useFakeTimers();
    try {
      const impl = ((_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })) as unknown as typeof fetch;

      const pending = loadOrcaCatalog({ apiKey: 'sk-orca-test-key-0000', fetchImpl: impl, timeoutMs: 5 });
      await vi.advanceTimersByTimeAsync(10);
      const result = await pending;

      expect(result.source).toBe('seed');
      expect(result.reason).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });
});
