import type { ActivityLogger } from '../../types/activity-logger.js';

const COST_PER_1K_TOKENS: Record<string, { in: number; out: number }> = {
  groq: { in: 0.0005, out: 0.0015 },
  gemini: { in: 0.00125, out: 0.005 },
  ollama: { in: 0, out: 0 },
  openai_compatible: { in: 0.005, out: 0.015 },
};

export interface UsagePayload {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
}

export function estimateCost(payload: UsagePayload): number {
  const rates = COST_PER_1K_TOKENS[payload.provider] || COST_PER_1K_TOKENS.openai_compatible || { in: 0, out: 0 };
  return (payload.tokensIn / 1000) * rates.in + (payload.tokensOut / 1000) * rates.out;
}

export function logUsage(logger: ActivityLogger, payload: UsagePayload): void {
  const costUsd = estimateCost(payload);
  logger.info('llm_usage', {
    provider: payload.provider,
    model: payload.model,
    tokens_in: payload.tokensIn,
    tokens_out: payload.tokensOut,
    latency_ms: payload.latencyMs,
    cost_usd: Number(costUsd.toFixed(6)),
  });
}
