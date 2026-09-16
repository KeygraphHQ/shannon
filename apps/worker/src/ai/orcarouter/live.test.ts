// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * The live OrcaRouter path, exercised through the provider code this package ships.
 *
 * Each case calls the same functions a scan calls — `loadOrcaCatalog` for discovery,
 * `filterCatalog` for the model a selector would offer, and the registration's own
 * `streamSimple` for inference — so a green run means the wiring reaches the real
 * service, not merely that the service answers a bare HTTP request. Discovery reads
 * `GET https://api.orcarouter.ai/v1/models` with the run's own key, and the completion
 * goes out over the registered OpenAI-compatible adapter to the inference origin.
 *
 * Skipped without `ORCAROUTER_API_KEY`, so the offline suite stays offline. The
 * independent delivery verifier runs this file with an integration key in the
 * environment, which is the run that proves the live path.
 */

import { describe, expect, it } from 'vitest';
import { filterCatalog, loadOrcaCatalog, type OrcaCatalogModel } from './catalog.js';
import { maskOrcaKey, resolveOrcaCredential } from './credentials.js';
import { resolveOrcaEndpoints } from './endpoints.js';
import { createOrcaProvider, ORCAROUTER_PROVIDER_NAME, toProviderModel } from './provider.js';

const credential = resolveOrcaCredential();
const apiKey = credential?.apiKey ?? '';
const endpoints = resolveOrcaEndpoints();
const live = describe.skipIf(!credential);

/** The catalog a chat entry point reads, bounded by the provider's own limits. */
async function chatCatalog(): Promise<readonly OrcaCatalogModel[]> {
  const catalog = await loadOrcaCatalog({ endpoints, apiKey, capability: 'chat' });
  expect(catalog.source).toBe('live');
  return catalog.models;
}

live('OrcaRouter live discovery and inference', () => {
  it('reads the catalog from the inference origin with the configured credential', async () => {
    // The public defaults, stated so a live run reports the origins it actually used.
    expect(endpoints.authBaseUrl).toBe('https://www.orcarouter.ai');
    expect(endpoints.apiBaseUrl).toBe('https://api.orcarouter.ai/v1');

    const models = await chatCatalog();
    expect(models.length).toBeGreaterThan(0);
    // Display form only: the mask carries the fixed prefix and a length, never key material.
    expect(maskOrcaKey(apiKey)).toBe(`sk-orca-…(${apiKey.length})`);
  }, 60_000);

  it('offers only chat-capable models in the text selector, and a subset for image input', async () => {
    const models = await chatCatalog();

    const chat = filterCatalog(models, { capability: 'chat' });
    expect(chat.length).toBeGreaterThan(0);
    // Model ids keep the vendor namespace the catalog published them under.
    for (const model of chat) expect(model.id).toContain('/');

    // Multimodal selection fails closed: every image-input model is also a chat model.
    const vision = filterCatalog(models, { capability: 'chat', modality: 'image' });
    const chatIds = new Set(chat.map((model) => model.id));
    for (const model of vision) expect(chatIds.has(model.id)).toBe(true);
  }, 60_000);

  it('runs a real completion through the registered provider', async () => {
    const chat = filterCatalog(await chatCatalog(), { capability: 'chat' });
    // A routing alias such as `orcarouter/auto` resolves per request, so a concrete
    // vendor model is preferred when the catalogue carries one.
    const target = chat.find((model) => !model.id.startsWith('orcarouter/')) ?? chat[0];
    expect(target).toBeDefined();
    if (!target) return;

    // The registration a run builds, driven directly: same adapter, same base URL,
    // same bearer credential that reaches the wire in production.
    const config = createOrcaProvider({ endpoints, models: [target] });
    expect(config.name).toBe(ORCAROUTER_PROVIDER_NAME);
    expect(config.baseUrl).toBe('https://api.orcarouter.ai/v1');

    const events = config.streamSimple?.(
      {
        ...toProviderModel(target),
        provider: 'orcarouter',
        baseUrl: config.baseUrl,
      } as never,
      { messages: [{ role: 'user', content: 'Reply with exactly: ORCA_OK', timestamp: Date.now() }] } as never,
      { apiKey, maxTokens: 256 } as never,
    );
    expect(events).toBeDefined();

    let text = '';
    let failed = false;
    for await (const event of events as AsyncIterable<{ type: string; delta?: string }>) {
      if (event.type === 'text_delta' && typeof event.delta === 'string') text += event.delta;
      if (event.type === 'error') failed = true;
    }
    expect(failed).toBe(false);
    expect(text.trim().length).toBeGreaterThan(0);
  }, 120_000);
});
