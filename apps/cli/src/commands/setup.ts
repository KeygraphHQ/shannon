/**
 * `npx @keygraph/shannon setup` — interactive TUI wizard for one-time credential configuration.
 *
 * Walks the user through selecting a provider, entering credentials, and naming
 * the model that runs the whole scan, then persists everything to
 * ~/.shannon/config.toml with 0o600 permissions.
 */

import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import { type ShannonConfig, saveConfig } from '../config/writer.js';
import { CURATED_PROVIDERS, type CuratedProviderId, isCuratedProvider } from '../model-spec.js';
import { loadOrcaCatalog } from '../orcarouter/catalog.js';
import {
  ORCAROUTER_API_KEY_ENV,
  ORCAROUTER_AUTH_METHOD_ENV,
  resolveOrcaCredential,
} from '../orcarouter/credentials.js';
import { resolveOrcaEndpoints } from '../orcarouter/endpoints.js';
import { ORCAROUTER_PROVIDER_ID } from '../orcarouter/provider-id.js';
import { buildModelChoices, describeCatalogSource, reconcileSelection } from '../orcarouter/selection.js';
import { displaySplash } from '../splash.js';
import { requireInteractive } from '../tty.js';
import { getVersion } from '../version.js';

const SHANNON_HOME = path.join(os.homedir(), '.shannon');

const CUSTOM_MODEL = '__custom__';
const CUSTOM_BASE_URL = '__custom_base_url__';
const OTHER_PROVIDER = '__other_provider__';

/**
 * API dialects reachable through the gateway route. The dialect picks the provider
 * that supplies the credential and names the wire protocol the endpoint must speak.
 */
const GATEWAY_DIALECTS: readonly {
  value: string;
  label: string;
  provider: 'anthropic' | 'openai';
}[] = [
  { value: 'anthropic', label: 'Anthropic Messages', provider: 'anthropic' },
  { value: 'openai', label: 'OpenAI Responses', provider: 'openai' },
];

/** Suggested models per curated provider, best-first. Free-text entry accepts any model in the provider's catalogue. */
const MODEL_SUGGESTIONS: Readonly<Record<CuratedProviderId, readonly string[]>> = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-5.6-sol', 'gpt-5.5', 'gpt-5.4'],
  xai: ['grok-4.5'],
  'amazon-bedrock': ['us.anthropic.claude-sonnet-4-6', 'us.anthropic.claude-opus-4-8', 'us.anthropic.claude-opus-4-7'],
  orcarouter: [],
};

/** Placeholder shown in the free-text model ID prompt, per curated provider. */
const MODEL_ID_PLACEHOLDER: Readonly<Record<CuratedProviderId, string>> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5.6-sol',
  xai: 'grok-4.5',
  'amazon-bedrock': 'us.anthropic.claude-opus-4-8',
  orcarouter: 'orcarouter/auto',
};

const REFRESH_MODELS = '__refresh_models__';

/** Model ID placeholder for a provider, absent when the provider is not curated. */
function modelIdPlaceholder(provider: string): string | undefined {
  return isCuratedProvider(provider) ? MODEL_ID_PLACEHOLDER[provider] : undefined;
}

export async function setup(): Promise<void> {
  requireInteractive('setup', 'For non-interactive use, export credentials as env vars (e.g. ANTHROPIC_API_KEY).');
  displaySplash(getVersion());
  p.intro('Setup');

  // 1. Select provider. "Custom Base URL" is a route, not a provider — it asks
  //    which API dialect the gateway speaks and configures that provider. "Other
  //    provider" reaches any pi-supported provider Shannon does not curate.
  const selected = await p.select({
    message: 'Select your AI provider',
    options: [
      { value: 'anthropic' as const, label: 'Anthropic', hint: 'Claude models - recommended' },
      { value: 'openai' as const, label: 'OpenAI', hint: 'GPT models' },
      { value: 'xai' as const, label: 'xAI', hint: 'Grok models' },
      { value: 'amazon-bedrock' as const, label: 'AWS Bedrock', hint: 'Claude models via AWS' },
      {
        value: 'orcarouter' as const,
        label: 'OrcaRouter',
        hint: 'gateway for models and agents; API key or account sign-in',
      },
      {
        value: CUSTOM_BASE_URL as typeof CUSTOM_BASE_URL,
        label: 'Custom Base URL',
        hint: 'route through a proxy or LLM gateway',
      },
      {
        value: OTHER_PROVIDER as typeof OTHER_PROVIDER,
        label: 'Other provider',
        hint: 'any other Pi-supported provider',
      },
    ],
  });
  if (p.isCancel(selected)) return cancelAndExit();

  // 2. Credentials, and any endpoint override. A base URL overrides the endpoint
  //    for whichever provider is chosen — the curated gateway route names it via
  //    the dialect, the "Other provider" route asks for it directly.
  const { provider, config, baseUrl } = await setupSelection(selected);

  // 3. The model that runs every phase.
  const modelId = await promptModel(provider);
  config.core = { ...config.core, model: `${provider}:${modelId}` };
  if (baseUrl) config.core = { ...config.core, base_url: baseUrl };

  saveConfig(config);

  const configPath = path.join(SHANNON_HOME, 'config.toml');
  const summary = [`Provider   ${provider}`, `Model      ${modelId}`];
  if (baseUrl) summary.push(`Endpoint   ${baseUrl}`);

  p.log.success(`Configuration saved to ${configPath}`);
  p.log.info(summary.join('\n'));
  p.outro('Run `npx @keygraph/shannon start` to begin a scan.');
}

interface Selection {
  provider: string;
  config: ShannonConfig;
  baseUrl?: string;
}

/** Resolve the provider selection into a provider id and its credential config. */
async function setupSelection(
  selected: CuratedProviderId | typeof CUSTOM_BASE_URL | typeof OTHER_PROVIDER,
): Promise<Selection> {
  if (selected === CUSTOM_BASE_URL) {
    const gateway = await setupGateway();
    return { provider: gateway.provider, config: gateway.config, baseUrl: gateway.baseUrl };
  }
  if (selected === OTHER_PROVIDER) {
    return setupOtherProvider();
  }
  return { provider: selected, config: await setupProvider(selected) };
}

async function setupProvider(provider: CuratedProviderId): Promise<ShannonConfig> {
  switch (provider) {
    case 'amazon-bedrock':
      return setupBedrock();
    case 'anthropic':
      return setupAnthropic();
    case 'openai':
      return { openai: { api_key: await promptSecret('Enter your OpenAI API key') } };
    case 'xai':
      return { xai: { api_key: await promptSecret('Enter your xAI API key') } };
    case 'orcarouter':
      return setupOrcaRouter();
  }
}

/**
 * Any pi provider Shannon does not curate. The id is free text — the worker's
 * preflight validates it — and the key is stored generically as SHANNON_AI_API_KEY.
 * An optional base URL points that provider at a proxy or LLM gateway; left blank, the
 * provider's own endpoint is used.
 */
async function setupOtherProvider(): Promise<Selection> {
  p.log.info('Browse supported providers and models at https://pi.dev/models');
  const provider = await p.text({
    message: 'Provider ID',
    validate: (value) => {
      const id = value?.trim();
      if (!id) return 'Provider ID is required';
      if (isCuratedProvider(id)) return `${id} has its own option.`;
      return undefined;
    },
  });
  if (p.isCancel(provider)) return cancelAndExit();

  const apiKey = await promptSecret('Enter the API key');
  const baseUrl = await promptOptionalBaseUrl();

  return {
    provider: provider.trim(),
    config: { provider: { api_key: apiKey } },
    ...(baseUrl && { baseUrl }),
  };
}

// === Provider Setup Flows ===

async function setupAnthropic(): Promise<ShannonConfig> {
  const authMethod = await p.select({
    message: 'Authentication method',
    options: [
      { value: 'api_key' as const, label: 'API Key' },
      { value: 'oauth' as const, label: 'OAuth Token' },
    ],
  });
  if (p.isCancel(authMethod)) return cancelAndExit();

  if (authMethod === 'oauth') {
    const token = await promptSecret('Enter your OAuth token');
    return { anthropic: { oauth_token: token } };
  }

  const apiKey = await promptSecret('Enter your Anthropic API key');
  return { anthropic: { api_key: apiKey } };
}

/**
 * OrcaRouter's two entry points. Pasting an `sk-orca-…` key and signing in through the
 * browser both end at the same credential, so the choice is about the user's situation,
 * not about which key they get: someone who already has a key never needs a browser, and
 * someone without one never has to go and create it first.
 */
async function setupOrcaRouter(): Promise<ShannonConfig> {
  const method = await p.select({
    message: 'How do you want to connect to OrcaRouter?',
    options: [
      { value: 'api_key' as const, label: 'API key', hint: 'paste an existing sk-orca-… key' },
      { value: 'oauth' as const, label: 'Sign in with OrcaRouter', hint: 'opens your browser; issues a key' },
    ],
  });
  if (p.isCancel(method)) return cancelAndExit();

  if (method === 'oauth') {
    // The connect flow owns the loopback listener and stores the issued key.
    const { runConnectFlow } = await import('./connect.js');
    const result = await runConnectFlow();
    process.env[ORCAROUTER_AUTH_METHOD_ENV] = 'pkce';
    process.env[ORCAROUTER_API_KEY_ENV] = result.apiKey;
    return { provider: { api_key: result.apiKey } };
  }

  const apiKey = await promptSecret('Enter your OrcaRouter API key');
  process.env[ORCAROUTER_AUTH_METHOD_ENV] = 'api-key';
  process.env[ORCAROUTER_API_KEY_ENV] = apiKey;
  return { provider: { api_key: apiKey } };
}

async function setupBedrock(): Promise<ShannonConfig> {
  const region = await p.text({
    message: 'AWS Region',
    placeholder: 'us-east-1',
    validate: required('AWS Region is required'),
  });
  if (p.isCancel(region)) return cancelAndExit();

  const token = await promptSecret('Enter your AWS Bearer Token');

  return { bedrock: { region, token } };
}

interface GatewaySetup {
  provider: CuratedProviderId;
  config: ShannonConfig;
  baseUrl: string;
}

/**
 * Gateway route: the endpoint decides where requests go, but the dialect still
 * picks a real provider, because that is what supplies the credential and the
 * wire protocol.
 */
async function setupGateway(): Promise<GatewaySetup> {
  const choice = await p.select({
    message: 'API format',
    options: GATEWAY_DIALECTS.map(({ value, label }) => ({ value, label })),
  });
  if (p.isCancel(choice)) return cancelAndExit();

  const dialect = GATEWAY_DIALECTS.find((entry) => entry.value === choice);
  if (!dialect) return cancelAndExit();
  const provider = dialect.provider;

  const baseUrl = await p.text({
    message: 'Endpoint URL',
    placeholder: 'https://llm-gateway.example.com',
    validate: (value) => {
      if (!value) return 'Endpoint URL is required';
      try {
        new URL(value);
      } catch {
        return 'Must be a valid URL';
      }
      return undefined;
    },
  });
  if (p.isCancel(baseUrl)) return cancelAndExit();

  const authToken = await promptSecret('Enter the auth token for the endpoint');
  const config: ShannonConfig =
    provider === 'anthropic' ? { anthropic: { api_key: authToken } } : { openai: { api_key: authToken } };

  return { provider, config, baseUrl };
}

// === Model Selection ===

/**
 * Ask for the one model that runs every phase. Providers with suggestions offer a
 * pick list with a free-text escape hatch; the rest go straight to free text.
 */
async function promptModel(provider: string): Promise<string> {
  // OrcaRouter's list comes from the provider's own API, so it is a real selector rather
  // than a suggestion list with a free-text escape hatch.
  if (provider === ORCAROUTER_PROVIDER_ID) return promptOrcaRouterModel();

  const suggestions = isCuratedProvider(provider) ? MODEL_SUGGESTIONS[provider] : [];

  if (suggestions.length === 0) {
    return promptModelId(provider, modelIdPlaceholder(provider));
  }

  const choice = await p.select({
    message: 'Model',
    options: [
      ...suggestions.map((model) => ({ value: model, label: model })),
      { value: CUSTOM_MODEL, label: 'Enter a model ID…' },
    ],
  });
  if (p.isCancel(choice)) return cancelAndExit();

  if (choice === CUSTOM_MODEL) {
    return promptModelId(provider, modelIdPlaceholder(provider));
  }
  return choice as string;
}

/**
 * Choose the OrcaRouter model from the live catalogue.
 *
 * The list is read with the key that was just configured, so it is the set of models this
 * workspace can actually call. When the catalogue cannot be read the verified seed is
 * shown with the reason, and that degraded state is stated rather than passed off as the
 * real list. Free-text entry is deliberately absent: guessing a model id the workspace
 * cannot call is exactly what this selector exists to prevent.
 */
async function promptOrcaRouterModel(): Promise<string> {
  const endpoints = resolveOrcaEndpoints();
  const credential = resolveOrcaCredential();

  if (!credential) {
    p.log.warn('No OrcaRouter credential is available, so the model list cannot be read.');
    cancelAndExit();
  }

  const result = await loadOrcaCatalog({ endpoints, apiKey: credential.apiKey, capability: 'chat' });
  const note = describeCatalogSource(result);
  if (note) p.log.warn(note);

  const choices = buildModelChoices(result.models, { capability: 'chat' });
  if (choices.length === 0) {
    p.log.error('OrcaRouter returned no models this client can use. Check the key and try again.');
    cancelAndExit();
  }

  // A model already chosen for a previous scan is re-checked here: one that is no longer in
  // the compatible list is dropped and said so, rather than silently carried forward.
  const current = process.env.SHANNON_AI_MODEL;
  const reconciliation = reconcileSelection(
    current?.startsWith(`${ORCAROUTER_PROVIDER_ID}:`) ? current : undefined,
    choices,
  );
  if (reconciliation.cleared) {
    p.log.warn(`${current} is no longer offered by OrcaRouter. Choose a replacement.`);
  }

  const choice = await p.select({
    message: `Model (${choices.length} available${result.source === 'seed' ? ', verified fallback list' : ''})`,
    options: [
      ...choices.map((model) => ({ value: model.value, label: model.label, hint: model.hint })),
      { value: REFRESH_MODELS, label: 'Refresh model list', hint: 're-read the catalogue from OrcaRouter' },
    ],
    ...(reconciliation.selected ? { initialValue: reconciliation.selected } : {}),
  });
  if (p.isCancel(choice)) return cancelAndExit();
  if (choice === REFRESH_MODELS) return promptOrcaRouterModel();

  return (choice as string).slice(ORCAROUTER_PROVIDER_ID.length + 1);
}

/**
 * A leading `<provider>:` naming a supported provider other than the selected
 * one. Bedrock model IDs carry their own colons (`…-v1:0`), so only a genuine
 * provider id counts as a prefix.
 */
function conflictingProviderPrefix(provider: string, value: string): string | undefined {
  const separator = value.indexOf(':');
  if (separator === -1) return undefined;

  const head = value.slice(0, separator);
  if (head === provider) return undefined;
  return (CURATED_PROVIDERS as readonly string[]).includes(head) ? head : undefined;
}

/**
 * Ask for a model ID. The provider is already chosen, so this takes the bare ID
 * and the caller pairs it with the provider — pasting a full `<provider>:<model>`
 * spec just has its redundant prefix dropped.
 */
async function promptModelId(provider: string, placeholder?: string): Promise<string> {
  const modelId = await p.text({
    message: 'Model ID',
    ...(placeholder && { placeholder }),
    validate: (value) => {
      if (!value) return 'Model ID is required';
      const conflicting = conflictingProviderPrefix(provider, value);
      if (conflicting) return `That model ID is for ${conflicting}, but you selected ${provider}.`;
      return undefined;
    },
  });
  if (p.isCancel(modelId)) return cancelAndExit();

  return modelId.startsWith(`${provider}:`) ? modelId.slice(provider.length + 1) : modelId;
}

// === Helpers ===

/**
 * Optional endpoint override. Empty input means the provider's default endpoint;
 * any value must be a valid URL.
 */
async function promptOptionalBaseUrl(): Promise<string | undefined> {
  const baseUrl = await p.text({
    message: 'Custom base URL (optional, leave blank for the provider default)',
    placeholder: 'https://llm-gateway.example.com',
    validate: (value) => {
      const trimmed = value?.trim();
      if (!trimmed) return undefined;
      try {
        new URL(trimmed);
      } catch {
        return 'Must be a valid URL';
      }
      return undefined;
    },
  });
  if (p.isCancel(baseUrl)) return cancelAndExit();

  const trimmed = baseUrl?.trim();
  return trimmed ? trimmed : undefined;
}

async function promptSecret(message: string): Promise<string> {
  const value = await p.password({
    message,
    validate: required(`${message.replace(/^Enter /, '')} is required`),
  });
  if (p.isCancel(value)) return cancelAndExit();
  return value;
}

function required(errorMessage: string): (value: string | undefined) => string | undefined {
  return (value) => {
    if (!value) return errorMessage;
    return undefined;
  };
}

function cancelAndExit(): never {
  p.cancel('Setup cancelled.');
  process.exit(0);
}
