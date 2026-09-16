/**
 * The OrcaRouter model selector.
 *
 * These tests bind the option list to the code the setup wizard actually renders from, so
 * what is asserted is the set of choices a user sees, not a filtered array computed
 * somewhere else. The two properties that matter: options come from the API rather than a
 * hand-written list, and attaching an image leaves only models that declare image input —
 * which is a different thing from refusing to send an image afterwards.
 */

import { describe, expect, it } from 'vitest';
import { type OrcaCatalogModel, parseCatalogBody } from './catalog.js';
import { ORCAROUTER_PROVIDER_ID } from './provider-id.js';
import { buildModelChoices, describeCatalogSource, reconcileSelection } from './selection.js';

const TEXT_ONLY = {
  id: 'deepseek/deepseek-v4-pro',
  name: 'DeepSeek V4 Pro',
  supported_endpoint_types: ['openai', 'anthropic'],
  context_length: 131072,
  architecture: { input_modalities: ['text'] },
};

const IMAGE_INPUT = {
  id: 'deepseek/deepseek-v4-flash-vision-exp',
  name: 'DeepSeek V4 Flash Vision',
  supported_endpoint_types: ['openai', 'anthropic'],
  context_length: 1048576,
  architecture: { input_modalities: ['text', 'image'] },
};

const EMBEDDING = { id: 'vendor/embed', supported_endpoint_types: ['embeddings'] };

const CATALOG: OrcaCatalogModel[] = parseCatalogBody({
  data: [TEXT_ONLY, IMAGE_INPUT, EMBEDDING],
});

describe('buildModelChoices', () => {
  it('builds provider-qualified options from the API response, in catalogue order', () => {
    const choices = buildModelChoices(CATALOG, { capability: 'chat' });

    expect(choices.map((choice) => choice.value)).toEqual([
      `${ORCAROUTER_PROVIDER_ID}:deepseek/deepseek-v4-pro`,
      `${ORCAROUTER_PROVIDER_ID}:deepseek/deepseek-v4-flash-vision-exp`,
    ]);
    // The vendor namespace survives into the value the run is configured with.
    expect(choices[0]?.value).toContain('deepseek/deepseek-v4-pro');
  });

  it('takes its labels from the catalogue rather than from a list in this repository', () => {
    const choices = buildModelChoices(CATALOG, { capability: 'chat' });
    expect(choices.map((choice) => choice.label)).toEqual(['DeepSeek V4 Pro', 'DeepSeek V4 Flash Vision']);
  });

  it('narrows the options to image-capable models once an image is attached', () => {
    const textOnly = buildModelChoices(CATALOG, { capability: 'chat' });
    const withImage = buildModelChoices(CATALOG, { capability: 'chat', modality: 'image' });

    expect(textOnly).toHaveLength(2);
    expect(withImage.map((choice) => choice.value)).toEqual([
      `${ORCAROUTER_PROVIDER_ID}:deepseek/deepseek-v4-flash-vision-exp`,
    ]);
    // The text-only model is gone from the options, not merely guarded against at send time.
    expect(withImage.some((choice) => choice.value.endsWith('deepseek-v4-pro'))).toBe(false);
  });

  it('offers nothing for a capability the catalogue does not provide', () => {
    expect(buildModelChoices(CATALOG, { capability: 'image' })).toHaveLength(0);
  });

  it('carries a hint describing the window and declared modalities', () => {
    const choices = buildModelChoices(CATALOG, { capability: 'chat', modality: 'image' });
    expect(choices[0]?.hint).toContain('1024K context');
    expect(choices[0]?.hint).toContain('accepts image');
  });
});

describe('reconcileSelection', () => {
  it('keeps a selection that is still offered', () => {
    const choices = buildModelChoices(CATALOG, { capability: 'chat' });
    const result = reconcileSelection(`${ORCAROUTER_PROVIDER_ID}:deepseek/deepseek-v4-pro`, choices);

    expect(result.selected).toBe(`${ORCAROUTER_PROVIDER_ID}:deepseek/deepseek-v4-pro`);
    expect(result.cleared).toBe(false);
  });

  it('clears a selection the entry point can no longer call', () => {
    const withImage = buildModelChoices(CATALOG, { capability: 'chat', modality: 'image' });
    const result = reconcileSelection(`${ORCAROUTER_PROVIDER_ID}:deepseek/deepseek-v4-pro`, withImage);

    expect(result.selected).toBeUndefined();
    expect(result.cleared).toBe(true);
  });

  it('reports nothing to clear when there was no previous selection', () => {
    expect(reconcileSelection(undefined, [])).toEqual({ selected: undefined, cleared: false });
  });
});

describe('describeCatalogSource', () => {
  it('says nothing when the catalogue came from the API', () => {
    expect(describeCatalogSource({ models: CATALOG, source: 'live' })).toBeUndefined();
  });

  it('labels a seed list as a fallback and explains why', () => {
    for (const reason of ['network', 'timeout', 'http', 'oversized', 'malformed'] as const) {
      const note = describeCatalogSource({ models: [], source: 'seed', reason });
      expect(note).toBeDefined();
      expect(note).not.toMatch(/^$/);
    }
  });

  it('gives an actionable remedy for a refused or unreachable catalogue', () => {
    expect(describeCatalogSource({ models: [], source: 'seed', reason: 'network' })).toContain('Re-run');
    expect(describeCatalogSource({ models: [], source: 'seed', reason: 'http' })).toContain('key');
  });
});
