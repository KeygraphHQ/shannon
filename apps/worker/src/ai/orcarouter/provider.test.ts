// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Registration of OrcaRouter as a provider, and the end-to-end shape of a run.
 *
 * The provider is registered from the live catalog, so what these tests pin is that the
 * registered descriptors carry real metadata (context window, declared input modalities,
 * reasoning ladder) and that the credential reaching the request comes from the shared
 * seam rather than from a copy made here.
 */

import { describe, expect, it } from 'vitest';
import { ORCA_SEED_MODELS, type OrcaCatalogModel } from './catalog.js';
import { ORCA_KEY_PREFIX, ORCAROUTER_AUTH_METHOD_ENV } from './credentials.js';
import {
  adoptOrcaEnv,
  createOrcaProvider,
  ORCAROUTER_API,
  ORCAROUTER_PROVIDER_ID,
  ORCAROUTER_PROVIDER_NAME,
  orcaModelIds,
  prepareOrcaProvider,
  toProviderModel,
} from './provider.js';

const FAKE_KEY = `${ORCA_KEY_PREFIX}test-0000000000000000`;

const LIVE_CATALOG = {
  data: [
    {
      id: 'deepseek/deepseek-v4.1-flash',
      name: 'DeepSeek V4.1 Flash',
      supported_endpoint_types: ['openai', 'anthropic'],
      context_length: 262144,
      max_completion_tokens: 65536,
      architecture: { input_modalities: ['text', 'image'] },
    },
    {
      id: 'vendor/embed-large',
      supported_endpoint_types: ['embeddings'],
      context_length: 8192,
    },
  ],
  object: 'list',
  success: true,
};

function stubFetch(body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as unknown as typeof fetch;
}

const noNetwork: typeof fetch = async () => {
  throw new Error('ENOTFOUND');
};

const gptSeed = ORCA_SEED_MODELS.find((model) => model.id === 'openai/gpt-5.5') as OrcaCatalogModel;

describe('provider descriptors', () => {
  it('registers every model under the provider id with the completions dialect', () => {
    const model = toProviderModel({ ...gptSeed, origin: 'live' });
    expect(model.api).toBe(ORCAROUTER_API);
    expect(model.id).toBe('openai/gpt-5.5');
  });

  it('preserves the verified reasoning ladder and input modalities from the catalog', () => {
    const model = toProviderModel(gptSeed);
    expect(model.reasoning).toBe(true);
    expect(model.thinkingLevelMap).toMatchObject({ low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' });
    expect(model.input).toEqual(['text', 'image']);
  });

  it('carries the context window and output cap through unchanged', () => {
    const model = toProviderModel(gptSeed);
    expect(model.contextWindow).toBe(gptSeed.contextWindow);
    expect(model.maxTokens).toBe(gptSeed.maxTokens);
  });

  it('points the provider at the inference origin and names the credential variable', () => {
    const config = createOrcaProvider({
      endpoints: { authBaseUrl: 'https://www.orcarouter.ai', apiBaseUrl: 'https://api.orcarouter.ai/v1' },
      models: [gptSeed],
    });

    expect(config.name).toBe(ORCAROUTER_PROVIDER_NAME);
    expect(config.baseUrl).toBe('https://api.orcarouter.ai/v1');
    expect(config.api).toBe(ORCAROUTER_API);
    // The variable name, not the secret: the key stays in the environment.
    expect(config.apiKey).toBe('$ORCAROUTER_API_KEY');
    expect(config.authHeader).toBe(true);
  });

  it('never embeds a key value in the registration', () => {
    const config = createOrcaProvider({
      endpoints: { authBaseUrl: 'https://www.orcarouter.ai', apiBaseUrl: 'https://api.orcarouter.ai/v1' },
      models: [gptSeed],
    });
    expect(JSON.stringify(config)).not.toContain(ORCA_KEY_PREFIX);
  });

  it('formats model ids the way SHANNON_AI_MODEL expects, namespace intact', () => {
    expect(orcaModelIds([{ id: 'deepseek/deepseek-v4.1-flash' }])).toEqual([
      `${ORCAROUTER_PROVIDER_ID}:deepseek/deepseek-v4.1-flash`,
    ]);
  });
});

describe('prepareOrcaProvider', () => {
  it('returns nothing when no credential is configured, so the caller can offer connect', async () => {
    const prepared = await prepareOrcaProvider({ env: {}, fetchImpl: noNetwork });
    expect(prepared).toBeUndefined();
  });

  it('registers the live catalog when discovery succeeds', async () => {
    const prepared = await prepareOrcaProvider({
      env: { ORCAROUTER_API_KEY: FAKE_KEY },
      fetchImpl: stubFetch(LIVE_CATALOG),
    });

    expect(prepared?.catalogSource).toBe('live');
    expect(prepared?.modelCount).toBe(1);
    expect(prepared?.config.models?.map((model) => model.id)).toEqual(['deepseek/deepseek-v4.1-flash']);
    expect(prepared?.config.models?.[0]?.input).toEqual(['text', 'image']);
  });

  it('registers the verified seed when discovery fails, rather than nothing', async () => {
    const prepared = await prepareOrcaProvider({
      env: { ORCAROUTER_API_KEY: FAKE_KEY },
      fetchImpl: noNetwork,
    });

    expect(prepared?.catalogSource).toBe('seed');
    expect(prepared?.catalogReason).toBe('network');
    expect(prepared?.modelCount).toBeGreaterThan(0);
  });

  it('excludes non-text models from the registered chat catalog', async () => {
    const prepared = await prepareOrcaProvider({
      env: { ORCAROUTER_API_KEY: FAKE_KEY },
      fetchImpl: stubFetch(LIVE_CATALOG),
    });
    expect(prepared?.config.models?.map((model) => model.id)).not.toContain('vendor/embed-large');
  });

  it('produces the same registration whichever entry point supplied the key', async () => {
    const viaApiKey = await prepareOrcaProvider({
      env: { ORCAROUTER_API_KEY: FAKE_KEY },
      fetchImpl: stubFetch(LIVE_CATALOG),
    });
    const viaConnect = await prepareOrcaProvider({
      env: { ORCAROUTER_API_KEY: FAKE_KEY, [ORCAROUTER_AUTH_METHOD_ENV]: 'pkce' },
      fetchImpl: stubFetch(LIVE_CATALOG),
    });

    // The provider is identical; only the reported provenance differs.
    expect(JSON.stringify(viaConnect?.config)).toBe(JSON.stringify(viaApiKey?.config));
    expect(viaConnect?.credential.method).toBe('pkce');
    expect(viaApiKey?.credential.method).toBe('api-key');
  });

  it('reports the api-origin catalog as its source without touching the auth origin', async () => {
    const calls: string[] = [];
    const impl = (async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify(LIVE_CATALOG),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await prepareOrcaProvider({ env: { ORCAROUTER_API_KEY: FAKE_KEY }, fetchImpl: impl });

    expect(calls[0]).toContain('https://api.orcarouter.ai/v1/models');
    expect(calls.some((url) => url.includes('www.orcarouter.ai'))).toBe(false);
  });
});

describe('a request built from the registration', () => {
  /**
   * The registered provider is what a run streams through, so these drive the real
   * `streamSimple` the registration carries and read the HTTP request it produced. That
   * covers the two halves a descriptor alone cannot: the key reaches the request as a
   * bearer credential from the environment, and the address it reaches is the inference
   * origin — never the auth origin the connect flow used.
   */
  async function captureRequest(options: { env: Record<string, string | undefined> }) {
    const prepared = await prepareOrcaProvider({
      env: { ORCAROUTER_API_KEY: FAKE_KEY, ...options.env },
      fetchImpl: stubFetch(LIVE_CATALOG),
    });
    const requests: { url: string; headers: Record<string, string>; body: unknown }[] = [];

    // 1. Stand in for the network at the transport boundary the registration uses, so the
    //    adapter builds and sends its real request and only the socket is replaced.
    const stream = prepared?.config.streamSimple;
    if (!stream || !prepared) throw new Error('the registration carries no streamSimple');
    const events = stream(
      {
        id: 'deepseek/deepseek-v4.1-flash',
        name: 'DeepSeek V4.1 Flash',
        api: ORCAROUTER_API,
        provider: ORCAROUTER_PROVIDER_ID,
        baseUrl: prepared.config.baseUrl,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 262144,
        maxTokens: 65536,
      } as never,
      { messages: [{ role: 'user', content: 'hi', timestamp: 0 }] } as never,
      {
        apiKey: prepared.credential.apiKey,
        maxTokens: 16,
        fetch: (async (input: string | URL, init?: RequestInit) => {
          // pi hands headers over as a Headers instance, so normalize through the same
          // type rather than assuming a plain object.
          const headers: Record<string, string> = {};
          new Headers(init?.headers).forEach((value, name) => {
            headers[name.toLowerCase()] = value;
          });
          requests.push({ url: String(input), headers, body: init?.body ? JSON.parse(String(init.body)) : undefined });
          throw new Error('captured');
        }) as unknown as typeof fetch,
      } as never,
    );
    // 2. Drain the event stream so the request is actually issued.
    for await (const _event of events as AsyncIterable<unknown>) {
      // The capture throws before any event is produced; draining only drives the call.
    }
    return { requests, prepared };
  }

  it('sends the run credential as a bearer header to the inference origin', async () => {
    const { requests, prepared } = await captureRequest({ env: {} });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain('https://api.orcarouter.ai/v1/chat/completions');
    expect(requests[0]?.url).not.toContain('www.orcarouter.ai');
    expect(requests[0]?.headers.authorization).toBe(`Bearer ${FAKE_KEY}`);
    // The requested model keeps its vendor namespace on the wire.
    expect(requests[0]?.body).toMatchObject({ model: 'deepseek/deepseek-v4.1-flash' });
    expect(prepared.credential.apiKey).toBe(FAKE_KEY);
  });

  it('builds the same request whichever entry point supplied the credential', async () => {
    const viaApiKey = await captureRequest({ env: {} });
    const viaConnect = await captureRequest({ env: { [ORCAROUTER_AUTH_METHOD_ENV]: 'pkce' } });

    // Only the reported provenance differs: nothing on the request path branches on it.
    expect(viaConnect.requests[0]?.url).toBe(viaApiKey.requests[0]?.url);
    expect(viaConnect.requests[0]?.headers.authorization).toBe(viaApiKey.requests[0]?.headers.authorization);
    expect(JSON.stringify(viaConnect.requests[0]?.body)).toBe(JSON.stringify(viaApiKey.requests[0]?.body));
    expect(viaConnect.prepared.credential.method).toBe('pkce');
    expect(viaApiKey.prepared.credential.method).toBe('api-key');
  });
});

describe('adoptOrcaEnv', () => {
  it('adopts a key supplied under an alias so the registered provider can resolve it', () => {
    const env: NodeJS.ProcessEnv = { ORCA_KEY: FAKE_KEY };
    adoptOrcaEnv(env);
    expect(env.ORCAROUTER_API_KEY).toBe(FAKE_KEY);
  });

  it('never overwrites a value that is already set', () => {
    const env: NodeJS.ProcessEnv = { ORCAROUTER_API_KEY: FAKE_KEY, ORCA_KEY: `${ORCA_KEY_PREFIX}other` };
    adoptOrcaEnv(env);
    expect(env.ORCAROUTER_API_KEY).toBe(FAKE_KEY);
  });

  it('is a no-op when nothing is set', () => {
    const env: NodeJS.ProcessEnv = {};
    adoptOrcaEnv(env);
    expect(env.ORCAROUTER_API_KEY).toBeUndefined();
  });
});
