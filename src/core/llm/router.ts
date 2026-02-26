import { fs, path } from 'zx';
import yaml from 'js-yaml';
import type { ActivityLogger } from '../../types/activity-logger.js';
import { BaseLLMProvider, LLMProviderError, type LLMCompletionRequest, type LLMCompletionResponse } from './base.js';
import { GeminiProvider } from './providers/gemini.js';
import { GroqProvider } from './providers/groq.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.js';
import { logUsage } from './observability.js';

interface ProviderRoutingConfig {
  providers: {
    default: string;
    recon?: string;
    exploit?: string;
    reporting?: string;
    fallback?: string[];
  };
  groq?: { api_key?: string; model: string; base_url?: string };
  gemini?: { api_key?: string; model: string };
  ollama?: { host: string; model: string; context_window?: number };
  openai?: { api_key?: string; model: string; base_url?: string };
  azure?: { api_key?: string; model: string; base_url: string };
  openrouter?: { api_key?: string; model: string; base_url?: string };
}

export class LLMRouter {
  private readonly providers = new Map<string, BaseLLMProvider>();
  private constructor(private readonly config: ProviderRoutingConfig, private readonly logger?: ActivityLogger) {}

  static async create(logger?: ActivityLogger): Promise<LLMRouter> {
    const configPath = path.join(process.cwd(), 'config', 'models.yaml');
    if (!(await fs.pathExists(configPath))) {
      throw new Error(`Missing model routing config: ${configPath}`);
    }

    const parsed = yaml.load(await fs.readFile(configPath, 'utf8')) as ProviderRoutingConfig;
    const router = new LLMRouter(parsed, logger);
    router.validate();
    router.bootstrapProviders();
    return router;
  }

  async complete(task: 'recon' | 'exploit' | 'reporting' | 'default', request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const primary = this.providerForTask(task);
    const fallback = this.config.providers.fallback ?? [];

    for (const providerName of [primary, ...fallback]) {
      const provider = this.providers.get(providerName);
      if (!provider) continue;

      try {
        const result = await provider.complete(request);
        if (this.logger) {
          logUsage(this.logger, {
            provider: result.provider,
            model: result.model,
            tokensIn: result.usage.tokensIn,
            tokensOut: result.usage.tokensOut,
            latencyMs: result.latencyMs,
          });
        }
        return result;
      } catch (error) {
        const providerError = error as LLMProviderError;
        this.logger?.warn(`Provider ${providerName} failed, trying fallback`, {
          error: providerError.message,
          retryable: providerError.retryable,
        });
      }
    }

    throw new Error('All configured LLM providers failed');
  }

  private providerForTask(task: 'recon' | 'exploit' | 'reporting' | 'default'): string {
    return this.config.providers[task] ?? this.config.providers.default;
  }

  private validate(): void {
    if (!this.config.providers?.default) {
      throw new Error('config/models.yaml must define providers.default');
    }
  }

  private bootstrapProviders(): void {
    if (this.config.groq) {
      this.providers.set('groq', new GroqProvider({
        apiKey: resolveEnv(this.config.groq.api_key),
        model: this.config.groq.model,
        baseUrl: this.config.groq.base_url,
      }));
    }
    if (this.config.gemini) {
      this.providers.set('gemini', new GeminiProvider({
        apiKey: resolveEnv(this.config.gemini.api_key),
        model: this.config.gemini.model,
      }));
    }
    if (this.config.ollama) {
      this.providers.set('ollama', new OllamaProvider({
        host: this.config.ollama.host,
        model: this.config.ollama.model,
        contextWindow: this.config.ollama.context_window,
      }));
    }
    if (this.config.openai) {
      this.providers.set('openai', new OpenAICompatibleProvider({
        providerName: 'openai_compatible',
        baseUrl: this.config.openai.base_url ?? 'https://api.openai.com/v1',
        apiKey: resolveEnv(this.config.openai.api_key),
        model: this.config.openai.model,
      }));
    }
    if (this.config.azure) {
      this.providers.set('azure', new OpenAICompatibleProvider({
        providerName: 'openai_compatible',
        baseUrl: this.config.azure.base_url,
        apiKey: resolveEnv(this.config.azure.api_key),
        model: this.config.azure.model,
      }));
    }
    if (this.config.openrouter) {
      this.providers.set('openrouter', new OpenAICompatibleProvider({
        providerName: 'openai_compatible',
        baseUrl: this.config.openrouter.base_url ?? 'https://openrouter.ai/api/v1',
        apiKey: resolveEnv(this.config.openrouter.api_key),
        model: this.config.openrouter.model,
      }));
    }
  }
}

function resolveEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const envMatch = value.match(/^\$\{([A-Z0-9_]+)\}$/);
  if (!envMatch) return value;
  const envName = envMatch[1];
  return envName ? process.env[envName] : undefined;
}
