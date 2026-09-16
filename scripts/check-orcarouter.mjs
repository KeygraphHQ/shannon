#!/usr/bin/env node
/**
 * Live OrcaRouter check.
 *
 * Runs a real request and real model discovery through the provider code paths this
 * repository ships — `resolveModelSelection` for inference, `loadOrcaCatalog` for
 * discovery — rather than through a bare curl, so a green result means the wiring works
 * and not merely that the service is reachable.
 *
 * Requires ORCAROUTER_API_KEY and a build of the worker package:
 *
 *   pnpm --filter @shannon/worker run build
 *   ORCAROUTER_API_KEY=sk-orca-… pnpm run check:orcarouter
 *
 * It reports which origin each half talked to, how many models came back, and which
 * models the chat and image-input selectors would offer. Nothing here prints the key.
 */

import process from 'node:process';
import { filterCatalog, loadOrcaCatalog } from '../apps/worker/dist/ai/orcarouter/catalog.js';
import { maskOrcaKey, resolveOrcaCredential } from '../apps/worker/dist/ai/orcarouter/credentials.js';
import { resolveOrcaEndpoints } from '../apps/worker/dist/ai/orcarouter/endpoints.js';
import { resolveModelSelection } from '../apps/worker/dist/ai/models.js';

function fail(message, hint) {
  console.error(`\nFAILED: ${message}`);
  if (hint) console.error(hint);
  process.exit(1);
}

const credential = resolveOrcaCredential();
if (!credential) {
  fail(
    'no OrcaRouter credential is configured.',
    'Export ORCAROUTER_API_KEY (or ORCA_API_KEY), or run `npx @keygraph/shannon connect`.',
  );
}

const endpoints = resolveOrcaEndpoints();
console.log('OrcaRouter live check');
console.log(`  credential   ${maskOrcaKey(credential.apiKey)} (via ${credential.method})`);
console.log(`  auth origin  ${endpoints.authBaseUrl}`);
console.log(`  api  origin  ${endpoints.apiBaseUrl}`);

// 1. Inference and discovery must use the api origin, never the auth origin.
if (endpoints.apiBaseUrl.includes('www.orcarouter.ai')) {
  fail('the inference origin resolved to the auth origin.');
}

// 2. Live discovery, through the same call the provider registration makes.
const catalog = await loadOrcaCatalog({ endpoints, apiKey: credential.apiKey, capability: 'chat' });
console.log(`\n  catalog      ${catalog.source} (${catalog.models.length} models)`);
if (catalog.source !== 'live') {
  fail(`model discovery did not return a live catalogue (reason: ${catalog.reason}).`);
}

const chat = filterCatalog(catalog.models, { capability: 'chat' });
const vision = filterCatalog(catalog.models, { capability: 'chat', modality: 'image' });
console.log(`  chat models  ${chat.length}`);
console.log(`  image-input  ${vision.length}${vision.length ? ` (${vision.map((m) => m.id).join(', ')})` : ''}`);
if (chat.length === 0) {
  fail('the chat selector would offer no models.');
}

// 3. A real completion through the resolved model, on the same path a scan uses.
// Prefer a concrete vendor model over a routing alias such as `orcarouter/auto`, which
// resolves per request and is not a stable thing to assert a text reply against.
const concrete = chat.find((model) => !model.id.startsWith('orcarouter/')) ?? chat[0];
const preferred = process.env.SHANNON_AI_MODEL ?? `orcarouter:${concrete.id}`;
process.env.SHANNON_AI_MODEL = preferred;
const selection = await resolveModelSelection();
console.log(`\n  model        ${selection.providerId}:${selection.modelId}`);
console.log(`  endpoint     ${selection.model.baseUrl}`);

const response = await selection.modelRuntime.completeSimple(
  selection.model,
  { messages: [{ role: 'user', content: 'Reply with exactly: ORCA_OK' }] },
  { maxTokens: 256 },
);
const text = (response.content ?? [])
  .filter((part) => part.type === 'text')
  .map((part) => part.text)
  .join('')
  .trim();

console.log(`  response     ${JSON.stringify(text)}`);
if (!text) fail('the model returned no text.', 'Check that the selected model is enabled for this workspace.');
console.log(`  tokens       ${response.usage?.totalTokens ?? 'n/a'} (stop: ${response.stopReason ?? 'n/a'})`);

console.log('\nOK: discovery, chat filtering, and a real completion all went through the provider path.');
