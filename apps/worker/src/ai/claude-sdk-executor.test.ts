import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutorOptions } from '../interfaces/executor.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { ClaudePromptResult } from './claude-executor.js';

vi.mock('./claude-executor.js', () => ({
  runClaudePrompt: vi.fn(),
}));

import { runClaudePrompt } from './claude-executor.js';
import { ClaudeSdkExecutor } from './claude-sdk-executor.js';

const mockRunClaudePrompt = vi.mocked(runClaudePrompt);

function createMockLogger(): ActivityLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

const MOCK_RESULT: ClaudePromptResult = {
  result: 'test output',
  success: true,
  duration: 1234,
  cost: 0.05,
  model: 'claude-sonnet-4-6',
  turns: 3,
};

describe('ClaudeSdkExecutor', () => {
  let executor: ClaudeSdkExecutor;
  let logger: ActivityLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new ClaudeSdkExecutor();
    logger = createMockLogger();
    mockRunClaudePrompt.mockResolvedValue(MOCK_RESULT);
  });

  it('delegates to runClaudePrompt with all options', async () => {
    const options: ExecutorOptions = {
      context: 'some context',
      description: 'test description',
      auditSession: null,
      outputFormat: { type: 'json_schema', schema: {} },
      apiKey: 'sk-test-key',
      deliverablesSubdir: '.shannon/deliverables',
      providerConfig: { providerType: 'anthropic_api', apiKey: 'pk-test' },
    };

    const result = await executor.execute('test prompt', '/repo', 'recon', 'medium', logger, options);

    expect(result).toBe(MOCK_RESULT);
    expect(mockRunClaudePrompt).toHaveBeenCalledOnce();
    expect(mockRunClaudePrompt).toHaveBeenCalledWith(
      'test prompt',
      '/repo',
      'some context',
      'test description',
      'recon',
      null,
      logger,
      'medium',
      { type: 'json_schema', schema: {} },
      'sk-test-key',
      '.shannon/deliverables',
      { providerType: 'anthropic_api', apiKey: 'pk-test' },
    );
  });

  it('uses default values when options are not provided', async () => {
    const result = await executor.execute('prompt text', '/workspace', 'xss', 'large', logger);

    expect(result).toBe(MOCK_RESULT);
    expect(mockRunClaudePrompt).toHaveBeenCalledOnce();
    expect(mockRunClaudePrompt).toHaveBeenCalledWith(
      'prompt text',
      '/workspace',
      '', // context defaults to ''
      'xss', // description defaults to agentName
      'xss',
      null, // auditSession defaults to null
      logger,
      'large',
      undefined, // outputFormat
      undefined, // apiKey
      undefined, // deliverablesSubdir
      undefined, // providerConfig
    );
  });

  it('defaults context to empty string when options.context is undefined', async () => {
    const options: ExecutorOptions = {
      description: 'custom desc',
    };

    await executor.execute('p', '/dir', 'auth', 'small', logger, options);

    const args = mockRunClaudePrompt.mock.calls[0];
    expect(args?.[2]).toBe(''); // context
    expect(args?.[3]).toBe('custom desc'); // description
  });

  it('defaults description to agentName when options.description is undefined', async () => {
    const options: ExecutorOptions = {
      context: 'ctx',
    };

    await executor.execute('p', '/dir', 'ssrf', 'medium', logger, options);

    const args = mockRunClaudePrompt.mock.calls[0];
    expect(args?.[2]).toBe('ctx'); // context
    expect(args?.[3]).toBe('ssrf'); // description defaults to agentName
  });

  it('forwards each model tier correctly', async () => {
    const tiers: ModelTier[] = ['small', 'medium', 'large'];

    for (const tier of tiers) {
      vi.clearAllMocks();
      mockRunClaudePrompt.mockResolvedValue(MOCK_RESULT);
      await executor.execute('p', '/dir', 'agent', tier, logger);
      expect(mockRunClaudePrompt.mock.calls[0]?.[7]).toBe(tier);
    }
  });

  it('returns the result from runClaudePrompt unchanged', async () => {
    const customResult: ClaudePromptResult = {
      result: null,
      success: false,
      duration: 0,
      cost: 0,
      error: 'something failed',
      errorType: 'PentestError',
      retryable: true,
    };
    mockRunClaudePrompt.mockResolvedValue(customResult);

    const result = await executor.execute('p', '/dir', 'a', 'medium', logger);
    expect(result).toBe(customResult);
  });
});
