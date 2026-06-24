import { vi } from 'vitest';
import type { ActivityLogger } from '../types/activity-logger.js';

// Mock child_process before importing preflight
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, stdout: Buffer.from('hi'), stderr: Buffer.from('') })),
}));

// Mock fs to bypass repo validation
vi.mock('node:fs/promises', async () => {
  return {
    default: {
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      access: vi.fn().mockResolvedValue(undefined),
    },
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    access: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock dns to bypass target URL validation
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn().mockResolvedValue({
    address: '93.184.216.34',
  }),
}));

// Mock http/https for target URL check
vi.mock('node:http', () => ({
  default: {
    request: vi.fn((_url: string, _opts: unknown, cb: (res: { resume: () => void; statusCode: number }) => void) => {
      cb({ resume: () => {}, statusCode: 200 });
      return {
        on: vi.fn(),
        end: vi.fn(),
      };
    }),
  },
}));

vi.mock('node:https', () => ({
  default: {
    request: vi.fn((_url: string, _opts: unknown, cb: (res: { resume: () => void; statusCode: number }) => void) => {
      cb({ resume: () => {}, statusCode: 200 });
      return {
        on: vi.fn(),
        end: vi.fn(),
      };
    }),
  },
}));

// Mock SDK query to avoid real API calls
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock config parser
vi.mock('../config-parser.js', () => ({
  parseConfig: vi.fn(),
}));

// Mock models
vi.mock('../ai/models.js', () => ({
  resolveModel: vi.fn(() => 'claude-haiku-4.5'),
}));

const mockLogger: ActivityLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('kiro-cli preflight validation', () => {
  let origKey: string | undefined;

  beforeEach(() => {
    origKey = process.env.KIRO_API_KEY;
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    if (origKey !== undefined) {
      process.env.KIRO_API_KEY = origKey;
    } else {
      delete process.env.KIRO_API_KEY;
    }
  });

  it('returns AUTH_FAILED when KIRO_API_KEY missing', async () => {
    delete process.env.KIRO_API_KEY;

    // Dynamic import after mocks are set up
    const { runPreflightChecks } = await import('./preflight.js');

    const result = await runPreflightChecks(
      'https://example.com',
      '/tmp/fake-repo',
      undefined,
      mockLogger,
      true, // skipGitCheck
      undefined,
      undefined,
      'kiro-cli',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTH_FAILED');
      expect(result.error.message).toContain('KIRO_API_KEY');
    }
  });

  it('returns ok when kiro-cli succeeds', async () => {
    process.env.KIRO_API_KEY = 'test-key-123';

    const cp = await import('node:child_process');
    const spawnSyncMock = vi.mocked(cp.spawnSync);
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: Buffer.from('hi'),
      stderr: Buffer.from(''),
      pid: 1234,
      output: [null, Buffer.from('hi'), Buffer.from('')],
      signal: null,
    });

    const { runPreflightChecks } = await import('./preflight.js');

    const result = await runPreflightChecks(
      'https://example.com',
      '/tmp/fake-repo',
      undefined,
      mockLogger,
      true,
      undefined,
      undefined,
      'kiro-cli',
    );

    // Credential check passes but URL check may fail
    // We only care that it got past credentials
    if (!result.ok) {
      // Should not be AUTH_FAILED
      expect(result.error.code).not.toBe('AUTH_FAILED');
    }
  });

  it('returns AUTH_FAILED on auth error', async () => {
    process.env.KIRO_API_KEY = 'bad-key';

    const cp = await import('node:child_process');
    const spawnSyncMock = vi.mocked(cp.spawnSync);
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from('authentication failed'),
      pid: 1234,
      output: [null, Buffer.from(''), Buffer.from('authentication failed')],
      signal: null,
    });

    const { runPreflightChecks } = await import('./preflight.js');

    const result = await runPreflightChecks(
      'https://example.com',
      '/tmp/fake-repo',
      undefined,
      mockLogger,
      true,
      undefined,
      undefined,
      'kiro-cli',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AUTH_FAILED');
    }
  });
});
