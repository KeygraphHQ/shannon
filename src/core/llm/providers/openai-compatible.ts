import { BaseLLMProvider, LLMProviderError, type LLMCompletionRequest, type LLMCompletionResponse } from '../base.js';
import { withExponentialBackoff } from '../retry.js';

interface OpenAICompatibleConfig {
  providerName: string;
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
}

export class OpenAICompatibleProvider extends BaseLLMProvider {
  constructor(private readonly config: OpenAICompatibleConfig) {
    super();
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    return withExponentialBackoff(async () => {
      const start = Date.now();
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          tools: request.tools,
          response_format: request.jsonSchema
            ? {
                type: 'json_schema',
                json_schema: {
                  name: 'response',
                  schema: request.jsonSchema,
                },
              }
            : undefined,
          stream: Boolean(request.stream),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new LLMProviderError(
          `OpenAI-compatible request failed: ${response.status} ${text}`,
          this.config.providerName,
          response.status >= 500 || response.status === 429
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string; tool_calls?: Array<Record<string, unknown>> } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const message = data.choices?.[0]?.message;

      return {
        provider: this.config.providerName,
        model: this.config.model,
        content: message?.content ?? '',
        ...(message?.tool_calls ? { toolCalls: message.tool_calls } : {}),
        usage: {
          tokensIn: data.usage?.prompt_tokens ?? 0,
          tokensOut: data.usage?.completion_tokens ?? 0,
        },
        latencyMs: Date.now() - start,
        raw: data,
      };
    });
  }
}
