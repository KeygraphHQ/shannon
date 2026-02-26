import { BaseLLMProvider, LLMProviderError, type LLMCompletionRequest, type LLMCompletionResponse } from '../base.js';
import { withExponentialBackoff } from '../retry.js';

interface OllamaConfig {
  host: string;
  model: string;
  contextWindow: number | undefined;
}

export class OllamaProvider extends BaseLLMProvider {
  constructor(private readonly config: OllamaConfig) {
    super();
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    return withExponentialBackoff(async () => {
      const start = Date.now();
      const response = await fetch(`${this.config.host.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: request.messages,
          stream: false,
          options: {
            temperature: request.temperature,
            num_predict: request.maxTokens,
            num_ctx: this.config.contextWindow ?? 8192,
          },
          format: request.jsonSchema ?? undefined,
          tools: request.tools,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        const missingModel = response.status === 404 && text.includes('model');
        throw new LLMProviderError(
          missingModel ? `Ollama model not installed: ${this.config.model}` : `Ollama error: ${response.status} ${text}`,
          'ollama',
          !missingModel
        );
      }

      const data = (await response.json()) as {
        message?: { content?: string; tool_calls?: Array<Record<string, unknown>> };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      return {
        provider: 'ollama',
        model: this.config.model,
        content: data.message?.content ?? '',
        ...(data.message?.tool_calls ? { toolCalls: data.message.tool_calls } : {}),
        usage: {
          tokensIn: data.prompt_eval_count ?? 0,
          tokensOut: data.eval_count ?? 0,
        },
        latencyMs: Date.now() - start,
        raw: data,
      };
    });
  }
}
