// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * OrcaRouter is wired into the paths a run actually takes.
 *
 * The catalog and credential tests prove the pieces behave; this one proves the pieces are
 * reachable. It resolves a model the way a scan does — through `resolveModelSelection` —
 * and asserts that the OrcaRouter model it names resolves against the live catalog rather
 * than against the harness's builtin registry, which knows nothing about these ids. A
 * registration that exists but is never attached to the runtime fails exactly here.
 *
 * No network is used: the catalog request is answered from a fixture through the same
 * `fetchImpl` seam production uses.
 *
 * The harness module is replaced by a registry stand-in, because pi's own module graph
 * needs Node >= 22.19 while this suite runs on whatever `node` the developer has. Nothing
 * under test is replaced: the catalog is read here, `adoptOrcaEnv` runs, and the provider
 * is registered through the same `registerProvider` call a run makes. Only the registry
 * that call lands in is local, and it composes entries the way the harness does — the
 * provider id and the registration's base URL are attached to every declared model — so an
 * assertion on a resolved model still reads the registration this package produced.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORCA_KEY_PREFIX } from './credentials.js';
import type { OrcaRegistrationTarget } from './register.js';

const pi = vi.hoisted(() => {
  type Descriptor = Record<string, unknown>;

  /** Registrations by provider id, at the shape the harness stores them. */
  const providers = new Map<string, Descriptor>();
  /** Models by provider id, composed from a registration. */
  const models = new Map<string, Descriptor[]>();

  class ModelRuntime {
    static async create(): Promise<ModelRuntime> {
      return new ModelRuntime();
    }

    getProvider(providerId: string): Descriptor | undefined {
      return providers.get(providerId);
    }

    registerProvider(providerId: string, config: Descriptor): void {
      // A re-registration merges defined values over the previous one, matching the
      // harness contract.
      const effective = { ...providers.get(providerId), ...config };
      providers.set(providerId, effective);
      const declared = (config.models as Descriptor[] | undefined) ?? [];
      models.set(
        providerId,
        declared.map((model) => ({ ...model, provider: providerId, baseUrl: effective.baseUrl })),
      );
    }

    getModels(providerId?: string): readonly Descriptor[] {
      if (providerId) return models.get(providerId) ?? [];
      return [...models.values()].flat();
    }

    getModel(providerId: string, modelId: string): Descriptor | undefined {
      return this.getModels(providerId).find((model) => model.id === modelId);
    }
  }

  return { ModelRuntime, providers, models, getAgentDir: () => '/tmp/shannon-orca-test-agent' };
});

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: pi.getAgentDir,
  ModelRuntime: pi.ModelRuntime,
}));

const FAKE_KEY = `${ORCA_KEY_PREFIX}test-0000000000000000`;

const CATALOG = {
  data: [
    {
      id: 'vendor/registered-chat-model',
      name: 'Registered Chat Model',
      supported_endpoint_types: ['openai', 'anthropic'],
      context_length: 262144,
      max_completion_tokens: 65536,
      architecture: { input_modalities: ['text'] },
    },
  ],
  object: 'list',
  success: true,
};

describe('resolveModelSelection with OrcaRouter', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.model = process.env.SHANNON_AI_MODEL;
    saved.key = process.env.ORCAROUTER_API_KEY;
    saved.method = process.env.ORCAROUTER_AUTH_METHOD;

    process.env.SHANNON_AI_MODEL = 'orcarouter:vendor/registered-chat-model';
    process.env.ORCAROUTER_API_KEY = FAKE_KEY;
    process.env.ORCAROUTER_AUTH_METHOD = 'pkce';

    pi.providers.clear();
    pi.models.clear();

    // The catalog is read with the run's own key; answer it locally so this stays offline.
    vi.stubGlobal('fetch', async (url: string) => {
      if (!String(url).startsWith('https://api.orcarouter.ai/v1/models')) {
        throw new Error(`unexpected request: ${url}`);
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify(CATALOG),
      } as unknown as Response;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const [name, value] of Object.entries({
      SHANNON_AI_MODEL: saved.model,
      ORCAROUTER_API_KEY: saved.key,
      ORCAROUTER_AUTH_METHOD: saved.method,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('resolves a catalog-only model through the registered provider', async () => {
    const { resolveModelSelection } = await import('../models.js');
    const selection = await resolveModelSelection();

    expect(selection.providerId).toBe('orcarouter');
    expect(selection.modelId).toBe('vendor/registered-chat-model');
    // The model exists only because the live catalog was registered: pi's builtin
    // registry has no such id.
    expect(selection.model.id).toBe('vendor/registered-chat-model');
    expect(selection.model.provider).toBe('orcarouter');
    expect(selection.model.api).toBe('openai-completions');
  });

  it('points the resolved model at the inference origin, not the auth origin', async () => {
    const { resolveModelSelection } = await import('../models.js');
    const selection = await resolveModelSelection();

    expect(selection.model.baseUrl).toBe('https://api.orcarouter.ai/v1');
    expect(selection.model.baseUrl).not.toContain('www.orcarouter.ai');
  });

  it('carries catalog metadata onto the resolved model', async () => {
    const { resolveModelSelection } = await import('../models.js');
    const selection = await resolveModelSelection();

    expect(selection.model.contextWindow).toBe(262144);
    expect(selection.model.maxTokens).toBe(65536);
    expect(selection.model.input).toEqual(['text']);
  });

  it('reports the credential as an api key whichever entry point produced it', async () => {
    const { resolveModelSelection } = await import('../models.js');
    const selection = await resolveModelSelection();
    expect(selection.credentialSource).toBe('api-key');
  });

  it('still fails clearly for a model the catalog does not carry', async () => {
    process.env.SHANNON_AI_MODEL = 'orcarouter:vendor/not-in-catalog';
    const { resolveModelSelection } = await import('../models.js');

    await expect(resolveModelSelection()).rejects.toThrow(/Model not found in pi registry/);
  });

  it('reads the catalogue from the api origin with the run credential', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push(url);
      expect(init?.headers?.Authorization).toBe(`Bearer ${FAKE_KEY}`);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify(CATALOG),
      } as unknown as Response;
    });

    const { resolveModelSelection } = await import('../models.js');
    await resolveModelSelection();

    expect(calls[0]).toContain('api.orcarouter.ai/v1/models');
    expect(calls.some((url) => url.includes('www.orcarouter.ai'))).toBe(false);
  });

  it('adopts a key supplied under an alias before registering', async () => {
    delete process.env.ORCAROUTER_API_KEY;
    process.env.ORCA_KEY = FAKE_KEY;

    try {
      const { resolveModelSelection } = await import('../models.js');
      const selection = await resolveModelSelection();

      expect(selection.model.id).toBe('vendor/registered-chat-model');
      // The registration names the canonical variable, so a run that only exports the
      // shorthand would otherwise register a provider with no resolvable credential.
      expect(process.env.ORCAROUTER_API_KEY).toBe(FAKE_KEY);
      expect(pi.providers.get('orcarouter')?.apiKey).toBe('$ORCAROUTER_API_KEY');
    } finally {
      delete process.env.ORCA_KEY;
    }
  });

  it('leaves a provider the runtime already knows untouched', async () => {
    const existing = { name: 'Pre-existing', baseUrl: 'https://example.invalid/v1' };
    pi.providers.set('orcarouter', existing);

    const { registerOrcaRouter } = await import('./register.js');
    const target: OrcaRegistrationTarget = {
      getProvider: (id: string) => pi.providers.get(id),
      registerProvider: (id: string, config: never) => void pi.providers.set(id, config),
    };
    const registered = await registerOrcaRouter(target, 'orcarouter');

    expect(registered).toBe(false);
    expect(pi.providers.get('orcarouter')).toBe(existing);
  });
});
