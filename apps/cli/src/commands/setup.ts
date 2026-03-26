/**
 * `shn setup` — interactive TUI wizard for one-time credential configuration.
 *
 * Walks the user through selecting a provider and entering credentials,
 * then persists everything to ~/.shannon/config.toml with 0o600 permissions.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import { type ShannonConfig, saveConfig } from '../config/writer.js';

const SHANNON_HOME = path.join(os.homedir(), '.shannon');

type Provider = 'anthropic' | 'custom_base_url' | 'bedrock' | 'vertex' | 'router';

export async function setup(): Promise<void> {
  p.intro('Shannon Setup');

  // 1. Select provider
  const provider = await p.select({
    message: 'Select your AI provider',
    options: [
      { value: 'anthropic' as const, label: 'Claude Direct', hint: 'recommended' },
      { value: 'custom_base_url' as const, label: 'Custom Base URL', hint: 'proxies, gateways' },
      { value: 'bedrock' as const, label: 'Claude via AWS Bedrock' },
      { value: 'vertex' as const, label: 'Claude via Google Vertex AI' },
      { value: 'router' as const, label: 'Router', hint: 'experimental' },
    ],
  });
  if (p.isCancel(provider)) return cancelAndExit();

  const config = await setupProvider(provider as Provider);

  // 2. Save config
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
    case 'vertex':
      return setupVertex();
    case 'router':
      return setupRouter();
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
      '    Large  - claude-opus-4-6',
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
      initialValue: 'claude-opus-4-6',
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
      '    Large  - claude-opus-4-6',
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
      initialValue: 'claude-opus-4-6',
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
    placeholder: 'us.anthropic.claude-opus-4-6',
    validate: required('Large model ID is required'),
  });
  if (p.isCancel(large)) return cancelAndExit();

  return {
    bedrock: { use: true, region, token },
    models: { small, medium, large },
  };
}

async function setupVertex(): Promise<ShannonConfig> {
  // 1. Collect region and project ID
  const region = await p.text({
    message: 'Google Cloud region',
    placeholder: 'us-east5',
    validate: required('Region is required'),
  });
  if (p.isCancel(region)) return cancelAndExit();

  const projectId = await p.text({
    message: 'GCP Project ID',
    validate: required('Project ID is required'),
  });
  if (p.isCancel(projectId)) return cancelAndExit();

  // 2. File picker for service account key
  p.log.info('Select the path to your GCP Service Account JSON key file.');
  const keySourcePath = await p.path({
    message: 'Service Account JSON key file',
    validate: (value) => {
      if (!value) return 'Path is required';
      if (!fs.existsSync(value)) return 'File not found';
      if (!value.endsWith('.json')) return 'Must be a .json file';
      return undefined;
    },
  });
  if (p.isCancel(keySourcePath)) return cancelAndExit();

  // 3. Copy key to ~/.shannon/ and lock permissions
  const destPath = path.join(SHANNON_HOME, 'google-sa-key.json');
  fs.mkdirSync(SHANNON_HOME, { recursive: true });
  fs.copyFileSync(keySourcePath, destPath);
  fs.chmodSync(destPath, 0o600);
  p.log.success(`Key copied to ${destPath} (permissions: 0600)`);

  // 4. Model tiers
  const models = await p.group({
    small: () =>
      p.text({
        message: 'Small model ID',
        placeholder: 'claude-haiku-4-5@20251001',
        validate: required('Small model ID is required'),
      }),
    medium: () =>
      p.text({
        message: 'Medium model ID',
        placeholder: 'claude-sonnet-4-6',
        validate: required('Medium model ID is required'),
      }),
    large: () =>
      p.text({
        message: 'Large model ID',
        placeholder: 'claude-opus-4-6',
        validate: required('Large model ID is required'),
      }),
  });
  if (p.isCancel(models)) return cancelAndExit();

  return {
    vertex: {
      use: true,
      region,
      project_id: projectId,
      key_path: destPath,
    },
    models: { small: models.small, medium: models.medium, large: models.large },
  };
}

async function setupRouter(): Promise<ShannonConfig> {
  const routerProvider = await p.select({
    message: 'Router provider',
    options: [
      { value: 'openai' as const, label: 'OpenAI' },
      { value: 'openrouter' as const, label: 'OpenRouter' },
    ],
  });
  if (p.isCancel(routerProvider)) return cancelAndExit();

  const apiKey = await promptSecret(
    routerProvider === 'openai' ? 'Enter your OpenAI API key' : 'Enter your OpenRouter API key',
  );

  let defaultModel: string;
  if (routerProvider === 'openai') {
    const model = await p.select({
      message: 'Default model',
      options: [
        { value: 'gpt-5.2' as const, label: 'GPT-5.2' },
        { value: 'gpt-5-mini' as const, label: 'GPT-5 Mini' },
      ],
    });
    if (p.isCancel(model)) return cancelAndExit();
    defaultModel = `openai,${model}`;
  } else {
    const model = await p.select({
      message: 'Default model',
      options: [{ value: 'google/gemini-3-flash-preview' as const, label: 'Google Gemini 3 Flash Preview' }],
    });
    if (p.isCancel(model)) return cancelAndExit();
    defaultModel = `openrouter,${model}`;
  }

  const router: ShannonConfig['router'] = { default: defaultModel };
  if (routerProvider === 'openai') {
    router.openai_key = apiKey;
  } else {
    router.openrouter_key = apiKey;
  }

  return { router };
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
