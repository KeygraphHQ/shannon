// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * OrcaRouter model discovery and capability filtering.
 *
 * `GET <apiBase>/models` on the configured inference origin is the only source of
 * truth for which models a workspace can call. It is read with the user's own
 * OrcaRouter key, so the answer is scoped to their account rather than to a
 * catalogue someone else can see. Model IDs keep their `vendor/model` namespace
 * exactly as returned.
 *
 * A live response is authoritative. When it cannot be read, a small verified seed
 * keeps a fresh installation usable, and the caller is told the result is degraded
 * so it can say so instead of silently showing five stale names as the whole world.
 *
 * Everything a catalog response can influence is bounded here — timeout, response
 * bytes, item count, accepted item shape, and the endpoint types this client can
 * actually speak — so a hostile or broken response cannot consume unbounded memory
 * or advertise a route the OpenAI-compatible adapter cannot call.
 *
 * Mirrors apps/cli/src/orcarouter/catalog.ts; the CLI cannot import from the worker
 * package (it ships as a standalone bundle), so the file is duplicated verbatim and
 * the two copies must stay in sync (`catalog.mirror.test.ts` enforces that).
 */

import { apiUrl, type OrcaEndpoints, resolveOrcaEndpoints } from './endpoints.js';

/**
 * Maps a thinking level to a provider-specific value, with `null` marking a level the
 * model does not support. Structurally identical to the harness's own type; declared
 * here so this module carries no import of the harness and the CLI copy stays verbatim.
 */
export type OrcaThinkingLevelMap = Partial<
  Record<'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max', string | null>
>;

// === Limits ===

/** Catalog request budget. A slow catalog must not stall a scan's startup. */
export const ORCA_CATALOG_TIMEOUT_MS = 10_000;

/** Largest catalog body accepted, in bytes. */
export const ORCA_CATALOG_MAX_BYTES = 512 * 1024;

/** Most catalog entries accepted. Entries beyond this are dropped, not truncated silently. */
export const ORCA_CATALOG_MAX_ITEMS = 1000;

// === Endpoint types ===

/**
 * Endpoint types the OpenAI-compatible adapter behind this provider can speak. A
 * catalog entry advertising only routes outside this set is not selectable: the
 * request would fail at the wire level, not at the model level.
 */
export const ORCA_SUPPORTED_ENDPOINT_TYPES: readonly string[] = ['openai', 'openai-response', 'anthropic', 'gemini'];

/** Endpoint types that mark a model as non-text, whatever else it advertises. */
const NON_TEXT_ENDPOINT_TYPES: readonly string[] = ['image-generation', 'openai-video', 'jina-rerank', 'embeddings'];

/** Modalities a chat model may accept as input, most specific first. */
export type OrcaInputModality = 'image' | 'audio' | 'video';

export type OrcaCapability = 'chat' | 'embedding' | 'image' | 'video' | 'rerank';

/** The `?capability=` value sent for each capability, when the endpoint supports it. */
const CAPABILITY_QUERY: Readonly<Record<OrcaCapability, string>> = {
  chat: 'chat',
  embedding: 'embedding',
  image: 'image',
  video: 'video',
  rerank: 'rerank',
};

/** Endpoint type that proves each non-chat capability, for the strict match. */
const CAPABILITY_ENDPOINT_TYPE: Readonly<Record<Exclude<OrcaCapability, 'chat'>, string>> = {
  embedding: 'embeddings',
  image: 'image-generation',
  video: 'openai-video',
  rerank: 'jina-rerank',
};

// === Catalog model ===

/** One model as this client understands it, after validation and normalization. */
export interface OrcaCatalogModel {
  readonly id: string;
  readonly name: string;
  readonly contextWindow: number;
  readonly maxTokens: number;
  /** Every input modality the catalog declared, unclipped. */
  readonly inputModalities: readonly string[];
  readonly reasoning: boolean;
  readonly thinkingLevelMap?: OrcaThinkingLevelMap;
  readonly endpointTypes: readonly string[];
  /** Where this entry came from. `seed` means discovery failed. */
  readonly origin: 'live' | 'seed';
}

/** pi's `Model.input` covers text and image only; other modalities stay catalog-level. */
export function toPiInput(modalities: readonly string[]): ('text' | 'image')[] {
  const input: ('text' | 'image')[] = [];
  if (modalities.includes('text')) input.push('text');
  if (modalities.includes('image')) input.push('image');
  return input.length > 0 ? input : ['text'];
}

// === Verified seed ===

/**
 * Cold-start fallback, used only when live discovery fails. Each entry is a model
 * whose OrcaRouter availability and metadata were verified against the public
 * catalogue; it is not a sample of the catalogue and never merges into a live result.
 */
export const ORCA_SEED_MODELS: readonly OrcaCatalogModel[] = [
  {
    id: 'openai/gpt-5.5',
    name: 'GPT-5.5',
    contextWindow: 400_000,
    maxTokens: 128_000,
    inputModalities: ['text', 'image'],
    reasoning: true,
    // The verified reasoning-effort ladder. Dropping this would silently cap a
    // reasoning model at its default effort.
    thinkingLevelMap: { minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' },
    endpointTypes: ['openai', 'openai-response'],
    origin: 'seed',
  },
  {
    id: 'anthropic/claude-opus-4.8',
    name: 'Claude Opus 4.8',
    contextWindow: 200_000,
    maxTokens: 64_000,
    inputModalities: ['text', 'image'],
    reasoning: true,
    endpointTypes: ['anthropic', 'openai'],
    origin: 'seed',
  },
  {
    id: 'google/gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    contextWindow: 1_000_000,
    maxTokens: 65_536,
    inputModalities: ['text', 'image'],
    reasoning: true,
    endpointTypes: ['gemini', 'openai'],
    origin: 'seed',
  },
  {
    id: 'deepseek/deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    contextWindow: 131_072,
    maxTokens: 32_768,
    inputModalities: ['text'],
    reasoning: true,
    endpointTypes: ['openai', 'anthropic'],
    origin: 'seed',
  },
  {
    id: 'orcarouter/auto',
    name: 'OrcaRouter Auto',
    contextWindow: 200_000,
    maxTokens: 32_768,
    inputModalities: ['text'],
    reasoning: false,
    endpointTypes: ['openai'],
    origin: 'seed',
  },
];

// === Response parsing ===

/** Accepted item shape, read defensively: `unknown` in, catalog entry or undefined out. */
interface RawCatalogModel {
  id: string;
  name?: string;
  context_length?: number;
  max_completion_tokens?: number;
  input_modalities?: string[];
  supported_endpoint_types?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.length > 0) out.push(entry);
  }
  return out;
}

function asPositiveInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

/** Read one catalog entry. Returns undefined for anything that is not a usable shape. */
function parseCatalogModel(value: unknown): RawCatalogModel | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return undefined;

  const architecture = asRecord(record.architecture);
  const modalities = asStringArray(architecture?.input_modalities);
  const endpointTypes = asStringArray(record.supported_endpoint_types);
  const contextLength = asPositiveInt(record.context_length);
  const maxCompletionTokens = asPositiveInt(record.max_completion_tokens);

  return {
    id,
    ...(typeof record.name === 'string' && record.name ? { name: record.name } : {}),
    ...(contextLength !== undefined ? { context_length: contextLength } : {}),
    ...(maxCompletionTokens !== undefined ? { max_completion_tokens: maxCompletionTokens } : {}),
    ...(modalities ? { input_modalities: modalities } : {}),
    ...(endpointTypes ? { supported_endpoint_types: endpointTypes } : {}),
  };
}

/** Defaults applied when the catalog omits metadata pi needs. */
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;

/**
 * Turn a validated entry into a catalog model.
 *
 * A model with no declared `architecture.input_modalities` is treated as text-only
 * rather than assumed multimodal: multimodal selection fails closed.
 */
export function toCatalogModel(raw: RawCatalogModel, origin: 'live' | 'seed'): OrcaCatalogModel {
  const endpointTypes = raw.supported_endpoint_types ?? [];
  const declaredModalities = raw.input_modalities ?? ['text'];

  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    contextWindow: raw.context_length ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: raw.max_completion_tokens ?? DEFAULT_MAX_TOKENS,
    inputModalities: declaredModalities,
    // The public catalogue advertises no reasoning flag, so reasoning support is claimed
    // only where a verified seed entry states it. A live entry stays conservative.
    reasoning: false,
    endpointTypes,
    origin,
  };
}

/** Parse a catalog body into entries, bounded by item count. */
export function parseCatalogBody(body: unknown, origin: 'live' | 'seed' = 'live'): OrcaCatalogModel[] {
  const record = asRecord(body);
  const list = Array.isArray(body) ? body : record && Array.isArray(record.data) ? record.data : undefined;
  if (!list) return [];

  const models: OrcaCatalogModel[] = [];
  for (const entry of list.slice(0, ORCA_CATALOG_MAX_ITEMS)) {
    const parsed = parseCatalogModel(entry);
    if (parsed) models.push(toCatalogModel(parsed, origin));
  }
  return models;
}

// === Capability filtering ===

/** Whether a model can serve text chat on this client's adapter. */
export function isChatCapable(model: OrcaCatalogModel): boolean {
  const speaksText = model.endpointTypes.some((type) => ORCA_SUPPORTED_ENDPOINT_TYPES.includes(type));
  if (!speaksText) return false;
  return !model.endpointTypes.some((type) => NON_TEXT_ENDPOINT_TYPES.includes(type) && type !== 'embeddings');
}

/** Whether a model declares the endpoint type that proves a non-chat capability. */
function declaresCapability(model: OrcaCatalogModel, capability: OrcaCapability): boolean {
  if (capability === 'chat') return isChatCapable(model);
  return model.endpointTypes.includes(CAPABILITY_ENDPOINT_TYPE[capability]);
}

export interface CapabilityFilter {
  readonly capability: OrcaCapability;
  /**
   * For `chat`, the non-text modality the entry point actually uploads. A model that
   * does not declare it is excluded — an undeclared capability is not an assumed one.
   */
  readonly modality?: OrcaInputModality;
}

/**
 * Filter a catalog down to the models an entry point can actually call.
 *
 * This is what feeds a model selector's options. It is not a send-time guard: a
 * selector built from this list cannot offer an incompatible model in the first place.
 */
export function filterCatalog(models: readonly OrcaCatalogModel[], filter: CapabilityFilter): OrcaCatalogModel[] {
  return models.filter((model) => {
    if (!declaresCapability(model, filter.capability)) return false;
    if (filter.capability !== 'chat' || !filter.modality) return true;
    return model.inputModalities.includes(filter.modality);
  });
}

// === Live discovery ===

export type OrcaCatalogFailureReason = 'network' | 'timeout' | 'http' | 'malformed' | 'oversized';

export interface OrcaCatalogResult {
  readonly models: readonly OrcaCatalogModel[];
  /** `live` when the endpoint answered; `seed` when the verified fallback is in use. */
  readonly source: 'live' | 'seed';
  /** Set only when `source` is `seed`, so callers can show a degraded state. */
  readonly reason?: OrcaCatalogFailureReason;
}

export interface FetchCatalogOptions {
  readonly endpoints?: OrcaEndpoints;
  readonly apiKey: string;
  /** Capability query sent to the endpoint. Defaults to `chat`. */
  readonly capability?: OrcaCapability;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/**
 * Read the live catalog for one capability.
 *
 * The capability is sent as a query parameter so the server does the coarse
 * filtering; `filterCatalog` then applies this client's own rules to whatever comes
 * back. A non-2xx response is an error, never an empty catalogue — "no models" and
 * "could not ask" are different answers and must not be conflated.
 */
export async function fetchOrcaCatalog(options: FetchCatalogOptions): Promise<OrcaCatalogResult> {
  const endpoints = options.endpoints ?? resolveOrcaEndpoints();
  const doFetch = options.fetchImpl ?? fetch;
  const capability = options.capability ?? 'chat';

  const url = new URL(apiUrl(endpoints, '/models'));
  url.searchParams.set('capability', CAPABILITY_QUERY[capability]);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? ORCA_CATALOG_TIMEOUT_MS);
  const onExternalAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await doFetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) return { models: [], source: 'seed', reason: 'http' };

    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength > ORCA_CATALOG_MAX_BYTES) return { models: [], source: 'seed', reason: 'oversized' };

    const text = await response.text();
    if (text.length > ORCA_CATALOG_MAX_BYTES) return { models: [], source: 'seed', reason: 'oversized' };

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { models: [], source: 'seed', reason: 'malformed' };
    }

    const models = parseCatalogBody(body);
    if (models.length === 0) return { models: [], source: 'seed', reason: 'malformed' };
    return { models, source: 'live' };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    // An external abort is the caller cancelling, not a catalog timeout; both fall back
    // to the seed, which is the safe answer either way.
    return { models: [], source: 'seed', reason: aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * The catalog an entry point should offer.
 *
 * Live discovery wins outright when it succeeds and the seed is never mixed into it.
 * On failure the verified seed is returned with the failure reason attached, so the
 * UI can label it as degraded instead of presenting it as the live catalogue.
 */
export async function loadOrcaCatalog(options: FetchCatalogOptions): Promise<OrcaCatalogResult> {
  const live = await fetchOrcaCatalog(options);
  if (live.source === 'live') return live;

  const capability = options.capability ?? 'chat';
  return {
    models: filterCatalog(ORCA_SEED_MODELS, { capability }),
    source: 'seed',
    ...(live.reason ? { reason: live.reason } : {}),
  };
}
