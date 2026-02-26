import { OpenAICompatibleProvider } from './openai-compatible.js';

interface GroqConfig {
  apiKey: string | undefined;
  model: string;
  baseUrl: string | undefined;
}

export class GroqProvider extends OpenAICompatibleProvider {
  constructor(config: GroqConfig) {
    super({
      providerName: 'groq',
      baseUrl: config.baseUrl ?? 'https://api.groq.com/openai/v1',
      apiKey: config.apiKey,
      model: config.model,
    });
  }
}
