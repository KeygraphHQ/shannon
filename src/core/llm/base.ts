export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface LLMCompletionRequest {
  messages: LLMMessage[];
  temperature: number;
  maxTokens: number;
  tools?: ToolDefinition[];
  jsonSchema?: Record<string, unknown>;
  stream?: boolean;
}

export interface LLMCompletionResponse {
  provider: string;
  model: string;
  content: string;
  toolCalls?: Array<Record<string, unknown>>;
  usage: {
    tokensIn: number;
    tokensOut: number;
  };
  latencyMs: number;
  raw?: unknown;
}

export abstract class BaseLLMProvider {
  abstract complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;
}

export class LLMProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly retryable: boolean,
    readonly causeError?: unknown
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}
