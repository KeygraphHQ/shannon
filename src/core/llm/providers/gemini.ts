import { BaseLLMProvider, LLMProviderError, type LLMCompletionRequest, type LLMCompletionResponse } from '../base.js';
import { withExponentialBackoff } from '../retry.js';

interface GeminiConfig {
  apiKey: string | undefined;
  model: string;
}

function toGeminiContents(messages: LLMCompletionRequest['messages']): Array<Record<string, unknown>> {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

export class GeminiProvider extends BaseLLMProvider {
  constructor(private readonly config: GeminiConfig) {
    super();
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    return withExponentialBackoff(async () => {
      const start = Date.now();
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey ?? ''}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: toGeminiContents(request.messages),
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxTokens,
            responseMimeType: request.jsonSchema ? 'application/json' : undefined,
            responseSchema: request.jsonSchema,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new LLMProviderError(`Gemini request failed: ${response.status} ${text}`, 'gemini', response.status >= 500 || response.status === 429);
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      return {
        provider: 'gemini',
        model: this.config.model,
        content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
        usage: {
          tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
          tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
        latencyMs: Date.now() - start,
        raw: data,
      };
    });
  }
}
