/**
 * `npx @keygraph/shannon setup` — interactive TUI wizard for one-time credential configuration.
 *
 * Walks the user through selecting a provider and entering credentials,
 * then persists everything to ~/.shannon/config.toml with 0o600 permissions.
 */

import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import { type ShannonConfig, saveConfig } from '../config/writer.js';
import { requireInteractive } from '../tty.js';

const SHANNON_HOME = path.join(os.homedir(), '.shannon');

type Provider = 'anthropic' | 'custom_base_url' | 'bedrock';

export async function setup(): Promise<void> {
  requireInteractive('setup', 'For non-interactive use, export credentials as env vars (e.g. ANTHROPIC_API_KEY).');
  p.intro('Shannon Setup');

  // 1. Select provider
  const provider = await p.select({
    message: 'Select your AI provider',
    options: [
      { value: 'anthropic' as const, label: 'Claude Direct', hint: 'recommended' },
      { value: 'custom_base_url' as const, label: 'Custom Base URL', hint: 'proxies, gateways' },
      { value: 'bedrock' as const, label: 'Claude via AWS Bedrock' },
    ],
  });
  if (p.isCancel(provider)) return cancelAndExit();

  const config = await setupProvider(provider as Provider);

  // 2. Adaptive thinking
  await maybePromptAdaptiveThinking(config);

  // 3. Save config
  saveConfig(config);

  const configPath = path.join(SHANNON_HOME, 'config.toml');
  p.log.success(`Configuration saved to ${configPath}`);
  p.outro('Run `npx @keygraph/shannon start` to begin a scan.');
}

async function setupProvider(provider: Provider): Promise<ShannonConfig> {
  switch (provider) {
    case 'anthropic':
      return setupAnthropic();
    case 'custom_base_url':
      return setupCustomBaseUrl();
    case 'bedrock':
      return setupBedrock();
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

  const config: ShannonConfig = {};

  if (authMethod === 'oauth') {
    const token = await promptSecret('Enter your OAuth token');
    config.anthropic = { oauth_token: token };
  } else {
    const apiKey = await promptSecret('Enter your Anthropic API key');
    config.anthropic = { api_key: apiKey };
  }

  const customizeModels = await p.confirm({
    message:
      'Do you want to change the default models?\n' +
      '    Small  - claude-haiku-4-5-20251001\n' +
      '    Medium - claude-sonnet-4-6\n' +
      '    Large  - claude-opus-4-8',
    initialValue: false,
  });
  if (p.isCancel(customizeModels)) return cancelAndExit();

  if (customizeModels) {
    const small = await p.text({
      message: 'Small model ID',
      initialValue: 'claude-haiku-4-5-20251001',
      validate: required('Small model ID is required'),
    });
    if (p.isCancel(small)) return cancelAndExit();

    const medium = await p.text({
      message: 'Medium model ID',
      initialValue: 'claude-sonnet-4-6',
      validate: required('Medium model ID is required'),
    });
    if (p.isCancel(medium)) return cancelAndExit();

    const large = await p.text({
      message: 'Large model ID',
      initialValue: 'claude-opus-4-8',
      validate: required('Large model ID is required'),
    });
    if (p.isCancel(large)) return cancelAndExit();

    config.models = { small, medium, large };
  }

  return config;
}

async function setupCustomBaseUrl(): Promise<ShannonConfig> {
  const baseUrl = await p.text({
    message: 'Endpoint URL',
    placeholder: 'https://your-proxy.example.com',
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

  const authToken = await promptSecret('Enter the auth token for the custom endpoint');

  const config: ShannonConfig = {
    custom_base_url: { base_url: baseUrl, auth_token: authToken },
  };

  const customizeModels = await p.confirm({
    message:
      'Do you want to change the default models?\n' +
      '    Small  - claude-haiku-4-5-20251001\n' +
      '    Medium - claude-sonnet-4-6\n' +
      '    Large  - claude-opus-4-8',
    initialValue: false,
  });
  if (p.isCancel(customizeModels)) return cancelAndExit();

  if (customizeModels) {
    const small = await p.text({
      message: 'Small model ID',
      initialValue: 'claude-haiku-4-5-20251001',
      validate: required('Small model ID is required'),
    });
    if (p.isCancel(small)) return cancelAndExit();

    const medium = await p.text({
      message: 'Medium model ID',
      initialValue: 'claude-sonnet-4-6',
      validate: required('Medium model ID is required'),
    });
    if (p.isCancel(medium)) return cancelAndExit();

    const large = await p.text({
      message: 'Large model ID',
      initialValue: 'claude-opus-4-8',
      validate: required('Large model ID is required'),
    });
    if (p.isCancel(large)) return cancelAndExit();

    config.models = { small, medium, large };
  }

  return config;
}

async function setupBedrock(): Promise<ShannonConfig> {
  const region = await p.text({
    message: 'AWS Region',
    placeholder: 'us-east-1',
    validate: required('AWS Region is required'),
  });
  if (p.isCancel(region)) return cancelAndExit();

  const token = await promptSecret('Enter your AWS Bearer Token');

  const small = await p.text({
    message: 'Small model ID',
    placeholder: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    validate: required('Small model ID is required'),
  });
  if (p.isCancel(small)) return cancelAndExit();

  const medium = await p.text({
    message: 'Medium model ID',
    placeholder: 'us.anthropic.claude-sonnet-4-6',
    validate: required('Medium model ID is required'),
  });
  if (p.isCancel(medium)) return cancelAndExit();

  const large = await p.text({
    message: 'Large model ID',
    placeholder: 'us.anthropic.claude-opus-4-8',
    validate: required('Large model ID is required'),
  });
  if (p.isCancel(large)) return cancelAndExit();

  return {
    bedrock: { use: true, region, token },
    models: { small, medium, large },
  };
}

// === Helpers ===

async function maybePromptAdaptiveThinking(config: ShannonConfig): Promise<void> {
  const m = config.models;
  const hasAdaptiveModel = !m || [m.small, m.medium, m.large].some((v) => v && /opus-4-[678]/.test(v));
  if (!hasAdaptiveModel) return;

  const enable = await p.confirm({
    message: 'Enable adaptive thinking on Opus 4.6/4.7/4.8? Claude decides when and how deeply to reason.',
    initialValue: true,
  });
  if (p.isCancel(enable)) return cancelAndExit();

  config.core = { ...config.core, adaptive_thinking: enable };
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
