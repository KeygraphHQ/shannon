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
import { type OpenAiFormat, type ProviderId, SUPPORTED_PROVIDERS } from '../model-spec.js';
import { requireInteractive } from '../tty.js';

const SHANNON_HOME = path.join(os.homedir(), '.shannon');

const CUSTOM_MODEL = '__custom__';
const CUSTOM_BASE_URL = '__custom_base_url__';

/**
 * Wire formats reachable through the gateway route. The format picks the provider
 * that supplies the credential, and for OpenAI it also picks which of the two
 * OpenAI APIs Shannon calls.
 */
const GATEWAY_DIALECTS: readonly {
  value: string;
  label: string;
  provider: 'anthropic' | 'openai';
  format?: OpenAiFormat;
}[] = [
  { value: 'anthropic', label: 'Anthropic Messages', provider: 'anthropic' },
  {
    value: 'openai-chat-completions',
    label: 'OpenAI Chat Completions',
    provider: 'openai',
    format: 'chat-completions',
  },
  { value: 'openai-responses', label: 'OpenAI Responses', provider: 'openai', format: 'responses' },
];

/** Suggested models per provider, best-first. Free-text entry accepts any model in the provider's catalogue. */
const MODEL_SUGGESTIONS: Readonly<Record<ProviderId, readonly string[]>> = {
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-5.6-sol', 'gpt-5.5', 'gpt-5.4'],
  xai: ['grok-4.5'],
  'amazon-bedrock': ['us.anthropic.claude-sonnet-4-6', 'us.anthropic.claude-opus-4-8', 'us.anthropic.claude-opus-4-7'],
};

/** Placeholder shown in the free-text model ID prompt. */
const MODEL_ID_PLACEHOLDER: Readonly<Record<ProviderId, string>> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5.6-sol',
  xai: 'grok-4.5',
  'amazon-bedrock': 'us.anthropic.claude-opus-4-8',
};

export async function setup(): Promise<void> {
  requireInteractive('setup', 'For non-interactive use, export credentials as env vars (e.g. ANTHROPIC_API_KEY).');
  p.intro('Shannon Setup');

  // 1. Select provider. "Custom Base URL" is a route, not a provider — it asks
  //    which API dialect the gateway speaks and configures that provider.
  const selected = await p.select({
    message: 'Select your AI provider',
    options: [
      { value: 'anthropic' as const, label: 'Anthropic', hint: 'Claude models - recommended' },
      { value: 'openai' as const, label: 'OpenAI', hint: 'GPT models' },
      { value: 'xai' as const, label: 'xAI', hint: 'Grok models' },
      { value: 'amazon-bedrock' as const, label: 'AWS Bedrock', hint: 'Claude models via AWS' },
      { value: CUSTOM_BASE_URL as typeof CUSTOM_BASE_URL, label: 'Custom Base URL', hint: 'your own proxy or gateway' },
    ],
  });
  if (p.isCancel(selected)) return cancelAndExit();

  // 2. Credentials — and, on the gateway route, the endpoint and its dialect.
  const gateway = selected === CUSTOM_BASE_URL ? await setupGateway() : undefined;
  const provider = gateway?.provider ?? (selected as ProviderId);
  const config = gateway?.config ?? (await setupProvider(provider));

  // 3. The model that runs every phase.
  const modelId = await promptModel(provider);
  config.core = { ...config.core, model: `${provider}:${modelId}` };
  if (gateway) config.core = { ...config.core, base_url: gateway.baseUrl };

  saveConfig(config);

  const configPath = path.join(SHANNON_HOME, 'config.toml');
  const summary = [`Provider   ${provider}`, `Model      ${modelId}`];
  if (gateway) summary.push(`Endpoint   ${gateway.baseUrl}`);
  if (gateway?.format) summary.push(`API        ${gateway.format}`);

  p.log.success(`Configuration saved to ${configPath}`);
  p.log.info(summary.join('\n'));
  p.outro('Run `npx @keygraph/shannon start` to begin a scan.');
}

async function setupProvider(provider: ProviderId): Promise<ShannonConfig> {
  switch (provider) {
    case 'amazon-bedrock':
      return setupBedrock();
    case 'anthropic':
      return setupAnthropic();
    case 'openai':
      return { openai: { api_key: await promptSecret('Enter your OpenAI API key') } };
    case 'xai':
      return { xai: { api_key: await promptSecret('Enter your xAI API key') } };
  }
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
  provider: ProviderId;
  config: ShannonConfig;
  baseUrl: string;
  format?: OpenAiFormat;
}

/**
 * Gateway route: the endpoint decides where requests go, but the format still
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
    provider === 'anthropic'
      ? { anthropic: { api_key: authToken } }
      : { openai: { api_key: authToken, ...(dialect.format && { format: dialect.format }) } };

  return { provider, config, baseUrl, ...(dialect.format && { format: dialect.format }) };
}

// === Model Selection ===

/**
 * Ask for the one model that runs every phase. Providers with suggestions offer a
 * pick list with a free-text escape hatch; the rest go straight to free text.
 */
async function promptModel(provider: ProviderId): Promise<string> {
  const suggestions = MODEL_SUGGESTIONS[provider];

  if (suggestions.length === 0) {
    return promptModelId(provider, MODEL_ID_PLACEHOLDER[provider]);
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
    return promptModelId(provider, MODEL_ID_PLACEHOLDER[provider]);
  }
  return choice as string;
}

/**
 * A leading `<provider>:` naming a supported provider other than the selected
 * one. Bedrock model IDs carry their own colons (`…-v1:0`), so only a genuine
 * provider id counts as a prefix.
 */
function conflictingProviderPrefix(provider: ProviderId, value: string): string | undefined {
  const separator = value.indexOf(':');
  if (separator === -1) return undefined;

  const head = value.slice(0, separator);
  if (head === provider) return undefined;
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(head) ? head : undefined;
}

/**
 * Ask for a model ID. The provider is already chosen, so this takes the bare ID
 * and the caller pairs it with the provider — pasting a full `<provider>:<model>`
 * spec just has its redundant prefix dropped.
 */
async function promptModelId(provider: ProviderId, placeholder: string): Promise<string> {
  const modelId = await p.text({
    message: 'Model ID',
    placeholder,
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
