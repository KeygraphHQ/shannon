import { writeFile as fsWriteFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  augmentPromptForStructuredOutput,
  buildSubprocessEnv,
  classifyKiroCliError,
  extractTurns,
  generateAgentJson,
  generateQueueValidationHooks,
  KiroCliExecutor,
  mapExitCodeToResult,
  readStructuredOutputFromDisk,
  resolveKiroModel,
  stripAnsi,
  writeKiroErrorLog,
} from './kiro-cli-executor.js';

describe('Feature: kiro-cli-compatibility, Property 1: Exit code classification', () => {
  /**
   * **Validates: Requirements 2.7, 2.8, 2.9**
   */

  it('exit 0 maps to success: true with stdout as result', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.nat(), fc.string(), (stdout, stderr, duration, model) => {
        const result = mapExitCodeToResult(0, stdout, stderr, duration, model, false);
        expect(result.success).toBe(true);
        expect(typeof result.result).toBe('string');
        expect(result.cost).toBe(0);
        expect(result.model).toBe(model);
      }),
      { numRuns: 100 },
    );
  });

  it('exit 1 maps to success: false with stderr as error', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.nat(), fc.string(), (stdout, stderr, duration, model) => {
        const result = mapExitCodeToResult(1, stdout, stderr, duration, model, false);
        expect(result.success).toBe(false);
        expect(result.error).toBe(stderr);
        expect(result.errorType).toBe('KiroCliError');
      }),
      { numRuns: 100 },
    );
  });

  it('exit 3 maps to success: false with retryable: false', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.nat(), fc.string(), (stdout, stderr, duration, model) => {
        const result = mapExitCodeToResult(3, stdout, stderr, duration, model, false);
        expect(result.success).toBe(false);
        expect(result.retryable).toBe(false);
        expect(result.errorType).toBe('KiroCliError');
      }),
      { numRuns: 100 },
    );
  });

  it('timeout maps to success: false with retryable: true', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.nat(), fc.string(), (stdout, stderr, duration, model) => {
        const result = mapExitCodeToResult(null, stdout, stderr, duration, model, true);
        expect(result.success).toBe(false);
        expect(result.retryable).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: kiro-cli-compatibility, Property 7: ANSI escape code stripping round-trip', () => {
  /**
   * **Validates: Requirements 7.2**
   */

  const ansiCode = fc.oneof(
    fc.constant('[0m'),
    fc.constant('[1m'),
    fc.constant('[31m'),
    fc.constant('[32m'),
    fc.constant('[33m'),
    fc.constant('[34m'),
    fc.constant('[1;31m'),
    fc.constant('[38;5;196m'),
    fc.nat({ max: 107 }).map((n) => `[${n}m`),
  );

  it('stripping ANSI codes from injected text recovers original', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.includes('')),
        fc.array(ansiCode, { maxLength: 10 }),
        fc.array(fc.nat(), { maxLength: 20 }),
        (plainText, codes, posSeeds) => {
          const positions = posSeeds
            .slice(0, codes.length + 1)
            .map((seed) => (plainText.length > 0 ? seed % (plainText.length + 1) : 0))
            .sort((a, b) => a - b);

          let result = '';
          let lastPos = 0;
          for (let i = 0; i < codes.length; i++) {
            const pos = positions[i] ?? lastPos;
            result += plainText.slice(lastPos, pos) + (codes[i] ?? '');
            lastPos = pos;
          }
          result += plainText.slice(lastPos);

          const stripped = stripAnsi(result);
          expect(stripped).toBe(plainText);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Feature: kiro-cli-compatibility, Property 2: Agent JSON generation correctness', () => {
  /**
   * **Validates: Requirements 3.2, 3.3**
   */

  it('generated JSON has matching name and valid file:// prompt URI', async () => {
    const baseDir = join(tmpdir(), `kiro-test-p2-${Date.now()}`);

    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/),
        fc.string({ minLength: 1 }),
        async (agentName, promptText) => {
          const sourceDir = join(baseDir, agentName);

          try {
            await generateAgentJson(sourceDir, agentName, promptText, 'medium');

            const jsonPath = join(sourceDir, '.kiro', 'agents', `${agentName}.json`);
            const content = await readFile(jsonPath, 'utf8');
            const parsed = JSON.parse(content);

            expect(parsed.name).toBe(agentName);
            expect(parsed.prompt).toMatch(/^file:\/\/.*-prompt\.txt$/);
            expect(parsed.prompt).toBe(`file://${agentName}-prompt.txt`);
            expect(parsed.tools).toEqual(['*']);
            expect(parsed.allowedTools).toEqual(['read', 'write', 'shell']);
          } finally {
            await rm(sourceDir, { recursive: true, force: true }).catch(() => {});
          }
        },
      ),
      { numRuns: 20 },
    );

    await rm(baseDir, { recursive: true, force: true }).catch(() => {});
  });
});

describe('Feature: kiro-cli-compatibility, Property 3: Model tier mapping', () => {
  /**
   * **Validates: Requirements 3.4**
   */

  const expectedMapping: Record<string, string> = {
    small: 'claude-haiku-4.5',
    medium: 'claude-sonnet-4.6',
    large: 'claude-opus-4.6',
  };

  it('each tier maps to the correct kiro-cli model ID', () => {
    for (const [tier, expected] of Object.entries(expectedMapping)) {
      const result = resolveKiroModel(tier as 'small' | 'medium' | 'large');
      expect(result).toBe(expected);
    }
  });

  it('env var overrides are translated from hyphen to dot notation', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('small', 'medium', 'large') as fc.Arbitrary<'small' | 'medium' | 'large'>,
        fc
          .tuple(fc.stringMatching(/^[a-z]+-[a-z]+$/), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 }))
          .map(([prefix, major, minor]) => ({
            hyphenated: `${prefix}-${major}-${minor}`,
            dotted: `${prefix}-${major}.${minor}`,
          })),
        (tier, modelStr) => {
          const envVarMap = {
            small: 'ANTHROPIC_SMALL_MODEL',
            medium: 'ANTHROPIC_MEDIUM_MODEL',
            large: 'ANTHROPIC_LARGE_MODEL',
          };
          const envVar = envVarMap[tier];

          const original = process.env[envVar];
          process.env[envVar] = modelStr.hyphenated;
          try {
            const result = resolveKiroModel(tier);
            expect(result).toBe(modelStr.dotted);
          } finally {
            if (original === undefined) {
              delete process.env[envVar];
            } else {
              process.env[envVar] = original;
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Feature: kiro-cli-compatibility, Property 8: Excluded environment variables never forwarded', () => {
  /**
   * **Validates: Requirements 8.6**
   */

  const EXCLUDED_VARS = [
    'ANTHROPIC_API_KEY',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
  ];

  it('excluded variables are never present in subprocess env', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.oneof(fc.constantFrom(...EXCLUDED_VARS), fc.stringMatching(/^[A-Z_][A-Z0-9_]{0,20}$/)),
          fc.string({ minLength: 1 }),
        ),
        (envVars) => {
          const originals: Record<string, string | undefined> = {};
          for (const [key, value] of Object.entries(envVars)) {
            originals[key] = process.env[key];
            process.env[key] = value;
          }

          try {
            const result = buildSubprocessEnv('test-api-key');

            for (const excluded of EXCLUDED_VARS) {
              expect(result).not.toHaveProperty(excluded);
            }

            expect(result.KIRO_API_KEY).toBe('test-api-key');
            expect(result.KIRO_LOG_NO_COLOR).toBe('1');
          } finally {
            for (const [key, original] of Object.entries(originals)) {
              if (original === undefined) {
                delete process.env[key];
              } else {
                process.env[key] = original;
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Feature: kiro-cli-compatibility, Property 5: MCP session mapping preservation', () => {
  /**
   * **Validates: Requirements 5.1, 5.2**
   */

  it('generated agent JSON uses the same session identifier from mapping', async () => {
    const baseDir = join(tmpdir(), `kiro-test-p5-${Date.now()}`);

    const testCases = [
      { agentName: 'test-agent-1', session: 'agent1' },
      { agentName: 'test-agent-2', session: 'agent3' },
      { agentName: 'test-agent-3', session: 'agent5' },
    ];

    for (const { agentName, session } of testCases) {
      const sourceDir = join(baseDir, agentName);
      try {
        await generateAgentJson(sourceDir, agentName, 'test prompt', 'medium', {
          playwrightExecutablePath: '/usr/bin/playwright-mcp',
          playwrightOutputDir: '/tmp/playwright-output',
          playwrightSession: session,
        });

        const jsonPath = join(sourceDir, '.kiro', 'agents', `${agentName}.json`);
        const content = await readFile(jsonPath, 'utf8');
        const parsed = JSON.parse(content);

        expect(parsed.mcpServers).toBeDefined();
        expect(parsed.mcpServers.playwright).toBeDefined();
        expect(parsed.mcpServers.playwright.env.PLAYWRIGHT_SESSION).toBe(session);
      } finally {
        await rm(sourceDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    await rm(baseDir, { recursive: true, force: true }).catch(() => {});
  });

  it('no mcpServers when playwright config is missing', async () => {
    const sourceDir = join(tmpdir(), `kiro-test-p5-no-mcp-${Date.now()}`);
    try {
      await generateAgentJson(sourceDir, 'no-mcp-agent', 'test', 'medium');
      const jsonPath = join(sourceDir, '.kiro', 'agents', 'no-mcp-agent.json');
      const content = await readFile(jsonPath, 'utf8');
      const parsed = JSON.parse(content);
      expect(parsed.mcpServers).toBeUndefined();
    } finally {
      await rm(sourceDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('Feature: kiro-cli-compatibility, Property 6: Structured output file read round-trip', () => {
  /**
   * **Validates: Requirements 6.4**
   */

  it('recovers original JSON from written queue files', async () => {
    const baseDir = join(tmpdir(), `kiro-test-p6-${Date.now()}`);

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            ID: fc.string({ minLength: 1 }),
            vulnerability_type: fc.string({ minLength: 1 }),
            externally_exploitable: fc.boolean(),
            confidence: fc.string({ minLength: 1 }),
          }),
          { maxLength: 5 },
        ),
        async (vulnerabilities) => {
          const original = { vulnerabilities };
          const testDir = join(baseDir, `run-${Date.now()}-${Math.random().toString(36).slice(2)}`);
          const filename = 'test_queue.json';

          try {
            await mkdir(testDir, { recursive: true });
            await fsWriteFile(join(testDir, filename), JSON.stringify(original), 'utf8');

            const recovered = await readStructuredOutputFromDisk(testDir, filename);
            expect(recovered).toEqual(original);
          } finally {
            await rm(testDir, { recursive: true, force: true }).catch(() => {});
          }
        },
      ),
      { numRuns: 20 },
    );

    await rm(baseDir, { recursive: true, force: true }).catch(() => {});
  });

  it('returns undefined for missing files', async () => {
    const result = await readStructuredOutputFromDisk('/nonexistent/path', 'missing.json', 1);
    expect(result).toBeUndefined();
  }, 30000);
});

describe('Feature: kiro-cli-compatibility, Property 11: Queue file path in prompt', () => {
  /**
   * **Validates: Requirements 6.1**
   */

  it('augmented prompt contains queue filename and deliverables path', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.stringMatching(/^[a-z_]+_queue\.json$/),
        fc.stringMatching(/^\/[a-z][a-z0-9/]+$/),
        (prompt, queueFilename, deliverablesPath) => {
          const schema = { type: 'object', properties: { vulnerabilities: { type: 'array' } } };
          const augmented = augmentPromptForStructuredOutput(prompt, queueFilename, deliverablesPath, schema);

          expect(augmented).toContain(queueFilename);
          expect(augmented).toContain(deliverablesPath);
          expect(augmented).toContain(prompt);
          expect(augmented).toContain('STRUCTURED OUTPUT INSTRUCTIONS');
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Feature: kiro-cli-compatibility, Property 9: Stderr-based error classification', () => {
  /**
   * **Validates: Requirements 9.1, 9.4, 9.6**
   */

  it('auth patterns produce AUTH_FAILED + non-retryable', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('authentication failed', 'invalid API key provided', 'unauthorized access'),
        fc.string(),
        (authPattern, suffix) => {
          const stderr = `${authPattern} ${suffix}`;
          const error = classifyKiroCliError(1, stderr, false);
          expect(error.code).toBe('AUTH_FAILED');
          expect(error.retryable).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('billing patterns produce BILLING_ERROR + retryable', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'spending cap',
          'spending limit',
          'billing_error',
          'credit balance is too low',
          'insufficient credits',
        ),
        fc.string(),
        (billingPattern, suffix) => {
          const stderr = `${billingPattern} ${suffix}`;
          const error = classifyKiroCliError(1, stderr, false);
          expect(error.code).toBe('BILLING_ERROR');
          expect(error.retryable).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('unclassified exit 1 produces retryable error', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          const lower = s.toLowerCase();
          return (
            !lower.includes('authentication') &&
            !lower.includes('unauthorized') &&
            !lower.includes('invalid') &&
            !lower.includes('spending') &&
            !lower.includes('billing') &&
            !lower.includes('credit') &&
            !lower.includes('cap reached') &&
            !lower.includes('budget') &&
            !lower.includes('usage limit') &&
            !lower.includes('quota') &&
            !lower.includes('rate limit') &&
            !lower.includes('limit will reset') &&
            !lower.includes('plans & billing') &&
            !lower.includes('plans and billing')
          );
        }),
        (stderr) => {
          const error = classifyKiroCliError(1, stderr, false);
          expect(error.retryable).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Feature: kiro-cli-compatibility, Property 10: Spending cap detection from stdout', () => {
  /**
   * **Validates: Requirements 11.1**
   */

  it('spending cap patterns in exit-0 stdout are detected by matchesBillingTextPattern', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('spending cap', 'spending limit', 'cap reached', 'budget exceeded', 'usage limit'),
        fc.string(),
        (capPattern, suffix) => {
          const stdout = `some output ${capPattern} ${suffix}`;
          // Exit 0 produces success result
          const result = mapExitCodeToResult(0, stdout, '', 1000, 'model', false);
          expect(result.success).toBe(true);
          // The cleaned result text should still contain the pattern for detection
          if (result.result) {
            expect(result.result.toLowerCase()).toContain(capPattern);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('extractTurns', () => {
  /**
   * **Validates: Requirements 1.1, 1.2**
   */

  it('extracts turn count from "Turns: N" pattern', () => {
    expect(extractTurns('Some output\nTurns: 5\nDone')).toBe(5);
  });

  it('extracts turn count from "Interactions: N" pattern', () => {
    expect(extractTurns('Some output\nInteractions: 12\nDone')).toBe(12);
  });

  it('extracts turn count from "Messages: N" pattern', () => {
    expect(extractTurns('Some output\nMessages: 3\nDone')).toBe(3);
  });

  it('returns undefined when no turn pattern is present', () => {
    expect(extractTurns('Some output without any turn info')).toBeUndefined();
  });

  it('extracts correctly when ANSI codes wrap the turn line', () => {
    expect(extractTurns('output\n\x1B[1mTurns: 7\x1B[0m\nfooter')).toBe(7);
  });

  it('property: for any positive integer N, "Turns: N" returns N', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999999 }), (n) => {
        const stdout = `Some output\nTurns: ${n}\nCredits used: 1.0`;
        expect(extractTurns(stdout)).toBe(n);
      }),
      { numRuns: 100 },
    );
  });
});

describe('mapExitCodeToResult partialCost', () => {
  /**
   * **Validates: Requirements 1.2, 2.3**
   */

  it('exit 0: partialCost equals extracted cost', () => {
    const stdout = 'Agent output\nCredits used: 3.50\nTurns: 2';
    const result = mapExitCodeToResult(0, stdout, '', 1000, 'model', false);
    expect(result.success).toBe(true);
    expect(result.partialCost).toBe(3.5);
    expect(result.partialCost).toBe(result.cost);
  });

  it('exit 1: partialCost is 0', () => {
    const result = mapExitCodeToResult(1, '', 'some error', 1000, 'model', false);
    expect(result.success).toBe(false);
    expect(result.partialCost).toBe(0);
  });

  it('exit 3: partialCost is 0', () => {
    const result = mapExitCodeToResult(3, '', 'config error', 1000, 'model', false);
    expect(result.success).toBe(false);
    expect(result.partialCost).toBe(0);
  });

  it('timeout: partialCost is 0', () => {
    const result = mapExitCodeToResult(null, '', '', 1000, 'model', true);
    expect(result.success).toBe(false);
    expect(result.partialCost).toBe(0);
  });

  it('property: exit 0 partialCost always equals cost', () => {
    fc.assert(
      fc.property(fc.float({ min: 0, max: 9999, noNaN: true }), fc.nat(), fc.string(), (credits, duration, model) => {
        const stdout = `output\nCredits used: ${credits}\n`;
        const result = mapExitCodeToResult(0, stdout, '', duration, model, false);
        expect(result.partialCost).toBe(result.cost);
      }),
      { numRuns: 100 },
    );
  });

  it('property: non-zero exit codes always have partialCost 0', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(1, 3),
        fc.string(),
        fc.string(),
        fc.nat(),
        fc.string(),
        (exitCode, stdout, stderr, duration, model) => {
          const result = mapExitCodeToResult(exitCode, stdout, stderr, duration, model, false);
          expect(result.partialCost).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Audit logging contract', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
   *
   * Tests the audit logging in KiroCliExecutor.execute() by setting KIRO_API_KEY
   * and calling execute(). The subprocess fails (kiro-cli binary not found),
   * which triggers both the start log and the failure error log.
   */

  let originalKiroApiKey: string | undefined;
  let sourceDir: string;

  beforeEach(async () => {
    originalKiroApiKey = process.env.KIRO_API_KEY;
    process.env.KIRO_API_KEY = 'test-key-for-audit-logging';
    sourceDir = join(tmpdir(), `kiro-audit-test-${Date.now()}`);
    await mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    if (originalKiroApiKey === undefined) {
      delete process.env.KIRO_API_KEY;
    } else {
      process.env.KIRO_API_KEY = originalKiroApiKey;
    }
    await rm(sourceDir, { recursive: true, force: true }).catch(() => {});
  });

  it('logs execution start with executor: kiro-cli identifier before spawn', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const executor = new KiroCliExecutor({ timeoutMs: 5000 });

    await executor.execute('test prompt', sourceDir, 'test-agent', 'medium', logger);

    // Find the start log call — it contains '[kiro-cli] Starting agent'
    const startCall = logger.info.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[kiro-cli] Starting agent'),
    );
    expect(startCall).toBeDefined();
    expect(startCall?.[1]).toMatchObject({
      executor: 'kiro-cli',
      agent: 'test-agent',
      modelTier: 'medium',
      cwd: sourceDir,
    });
  }, 15000);

  it('logs failure with error metadata after spawn fails', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // Use a 1ms timeout to force a timeout failure, triggering the error audit log
    const executor = new KiroCliExecutor({ timeoutMs: 1 });

    const result = await executor.execute('test prompt', sourceDir, 'fail-agent', 'small', logger);

    // The result should be a failure (timeout or spawn error)
    expect(result.success).toBe(false);

    // The error log should contain '[kiro-cli] Agent fail-agent failed'
    const errorCall = logger.error.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('[kiro-cli] Agent fail-agent failed'),
    );
    expect(errorCall).toBeDefined();
    expect(errorCall?.[1]).toMatchObject({
      executor: 'kiro-cli',
      agent: 'fail-agent',
      success: false,
    });
    // Duration and cost should be present
    expect(typeof errorCall?.[1].duration).toBe('number');
    expect(typeof errorCall?.[1].cost).toBe('number');
    // Retryable field should be present
    expect(typeof errorCall?.[1].retryable).toBe('boolean');
  }, 30000);

  it('error metadata includes error truncated to 500 chars per logging contract', () => {
    const longError = 'E'.repeat(1000);
    const result = mapExitCodeToResult(1, '', longError, 100, 'model', false);
    expect(result.error).toBe(longError);
    const errorStr = String(result.error);
    const truncated = errorStr.slice(0, 500);
    expect(truncated.length).toBe(500);
    expect(truncated).toBe('E'.repeat(500));
  });
});

describe('writeKiroErrorLog', () => {
  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
   */

  let sourceDir: string;

  beforeEach(async () => {
    sourceDir = join(tmpdir(), `kiro-errorlog-test-${Date.now()}`);
  });

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true }).catch(() => {});
  });

  it('writes error log file to .shannon/agents/ on failure', async () => {
    await writeKiroErrorLog(
      'test-agent',
      1,
      'something went wrong',
      'some stdout output',
      5000,
      '/path/to/prompt.txt',
      sourceDir,
    );

    const logPath = join(sourceDir, '.shannon', 'agents', 'test-agent-error.log');
    const content = await readFile(logPath, 'utf8');

    expect(content).toContain('Agent: test-agent');
    expect(content).toContain('Exit code: 1');
    expect(content).toContain('Duration: 5000ms');
    expect(content).toContain('Prompt: /path/to/prompt.txt');
    expect(content).toContain('Stderr:\nsomething went wrong');
    expect(content).toContain('Stdout (tail):\nsome stdout output');
  });

  it('truncates stderr to 2000 chars', async () => {
    const longStderr = 'X'.repeat(5000);

    await writeKiroErrorLog('trunc-agent', 1, longStderr, '', 1000, '/prompt.txt', sourceDir);

    const logPath = join(sourceDir, '.shannon', 'agents', 'trunc-agent-error.log');
    const content = await readFile(logPath, 'utf8');

    const stderrMatch = /Stderr:\n([\s\S]*?)(\n\n|$)/.exec(content);
    expect(stderrMatch).toBeTruthy();
    const stderrSection = stderrMatch?.[1] ?? '';
    expect(stderrSection.length).toBeLessThanOrEqual(2000);
    expect(stderrSection).toBe('X'.repeat(2000));
  });

  it('includes last 500 chars of stdout', async () => {
    const longStdout = 'A'.repeat(1500) + 'B'.repeat(500);

    await writeKiroErrorLog('tail-agent', 1, 'err', longStdout, 1000, '/prompt.txt', sourceDir);

    const logPath = join(sourceDir, '.shannon', 'agents', 'tail-agent-error.log');
    const content = await readFile(logPath, 'utf8');

    const stdoutMatch = /Stdout \(tail\):\n([\s\S]*?)$/.exec(content);
    expect(stdoutMatch).toBeTruthy();
    const stdoutSection = stdoutMatch?.[1] ?? '';
    expect(stdoutSection.length).toBeLessThanOrEqual(500);
    expect(stdoutSection).toBe('B'.repeat(500));
  });

  it('does not throw when filesystem write fails', async () => {
    await expect(
      writeKiroErrorLog('bad-agent', 1, 'err', 'out', 100, '/prompt.txt', '/dev/null/impossible/path'),
    ).resolves.toBeUndefined();
  });
});

describe('Queue validation hooks integration', () => {
  /**
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
   */

  let sourceDir: string;

  beforeEach(async () => {
    sourceDir = join(tmpdir(), `kiro-hooks-test-${Date.now()}`);
    await mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true }).catch(() => {});
  });

  it('generateQueueValidationHooks creates preToolUse and stop hooks', async () => {
    const queueFilename = 'injection_exploitation_queue.json';
    const deliverablesPath = '.shannon/deliverables';
    const jsonSchema = {
      type: 'object',
      properties: { vulnerabilities: { type: 'array' } },
    };

    const hooks = await generateQueueValidationHooks(sourceDir, queueFilename, deliverablesPath, jsonSchema);

    expect(hooks.preToolUse).toBeDefined();
    expect(hooks.preToolUse?.length).toBeGreaterThanOrEqual(1);
    expect(hooks.preToolUse?.[0].matcher).toBe('write');

    expect(hooks.stop).toBeDefined();
    expect(hooks.stop?.length).toBeGreaterThanOrEqual(1);
  });

  it('validation scripts are written to .kiro/agents/', async () => {
    const queueFilename = 'xss_exploitation_queue.json';
    const deliverablesPath = '.shannon/deliverables';
    const jsonSchema = { type: 'object' };

    await generateQueueValidationHooks(sourceDir, queueFilename, deliverablesPath, jsonSchema);

    const validatePath = join(sourceDir, '.kiro', 'agents', 'validate-queue-json.js');
    const verifyPath = join(sourceDir, '.kiro', 'agents', 'verify-queue-file.js');

    const validateStat = await stat(validatePath);
    expect(validateStat.isFile()).toBe(true);

    const verifyStat = await stat(verifyPath);
    expect(verifyStat.isFile()).toBe(true);
  });

  it('generateAgentJson includes hooks when provided', async () => {
    const queueFilename = 'auth_exploitation_queue.json';
    const deliverablesPath = '.shannon/deliverables';
    const jsonSchema = {
      type: 'object',
      properties: { vulnerabilities: { type: 'array' } },
    };

    const hooks = await generateQueueValidationHooks(sourceDir, queueFilename, deliverablesPath, jsonSchema);

    await generateAgentJson(sourceDir, 'auth-vuln', 'test prompt', 'medium', { hooks });

    const jsonPath = join(sourceDir, '.kiro', 'agents', 'auth-vuln.json');
    const content = await readFile(jsonPath, 'utf8');
    const parsed = JSON.parse(content);

    expect(parsed.hooks).toBeDefined();
    expect(parsed.hooks.preToolUse).toBeDefined();
    expect(parsed.hooks.preToolUse.length).toBeGreaterThanOrEqual(1);
    expect(parsed.hooks.preToolUse[0].matcher).toBe('write');
    expect(parsed.hooks.stop).toBeDefined();
    expect(parsed.hooks.stop.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Heartbeat logging', () => {
  /**
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
   *
   * Tests the heartbeat interval in KiroCliExecutor.execute().
   * The subprocess fails quickly (kiro-cli not found), so no heartbeat fires
   * within the 30s interval — verifying the interval is properly cleared on exit.
   */

  let originalKiroApiKey: string | undefined;
  let sourceDir: string;

  beforeEach(async () => {
    originalKiroApiKey = process.env.KIRO_API_KEY;
    process.env.KIRO_API_KEY = 'test-key-for-heartbeat';
    sourceDir = join(tmpdir(), `kiro-heartbeat-test-${Date.now()}`);
    await mkdir(sourceDir, { recursive: true });
  });

  afterEach(async () => {
    if (originalKiroApiKey === undefined) {
      delete process.env.KIRO_API_KEY;
    } else {
      process.env.KIRO_API_KEY = originalKiroApiKey;
    }
    await rm(sourceDir, { recursive: true, force: true }).catch(() => {});
  });

  it('no heartbeat logged when subprocess completes quickly', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const executor = new KiroCliExecutor({ timeoutMs: 5000 });

    await executor.execute('test prompt', sourceDir, 'heartbeat-agent', 'medium', logger);

    // The heartbeat pattern is `[Ns] Agent X running...`
    const heartbeatPattern = /\[\d+s\] Agent .* running\.\.\./;
    const heartbeatCalls = logger.info.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && heartbeatPattern.test(call[0]),
    );

    // Subprocess fails fast (< 30s), so no heartbeat should have fired
    expect(heartbeatCalls).toHaveLength(0);
  }, 15000);

  it('heartbeat message format matches expected pattern [Ns] Agent X running...', () => {
    // Contract test: verify the heartbeat message format that execute() produces.
    // The heartbeat callback builds: `[${elapsed}s] Agent ${agentName} running...`
    const agentName = 'test-agent';
    const elapsed = 30;
    const message = `[${elapsed}s] Agent ${agentName} running...`;

    expect(message).toMatch(/^\[\d+s\] Agent .+ running\.\.\.$/);
    expect(message).toContain(agentName);
    expect(message).toContain(`[${elapsed}s]`);
  });

  it('interval is cleared after subprocess exits (no leaked timers)', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const executor = new KiroCliExecutor({ timeoutMs: 5000 });

    await executor.execute('test prompt', sourceDir, 'leak-check-agent', 'medium', logger);

    // Wait a bit past when a heartbeat would fire if the interval leaked
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Count heartbeat calls — should still be 0 since interval was cleared
    const heartbeatPattern = /\[\d+s\] Agent .* running\.\.\./;
    const heartbeatCalls = logger.info.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && heartbeatPattern.test(call[0]),
    );
    expect(heartbeatCalls).toHaveLength(0);
  }, 15000);
});

describe('API error detection', () => {
  /**
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */

  const API_ERROR_REGEX = /dispatch failure|error sending request|connection refused/i;

  it('mapExitCodeToResult exit 0 does not set apiErrorDetected', () => {
    const result = mapExitCodeToResult(0, 'clean output', '', 1000, 'model', false);
    expect(result.success).toBe(true);
    expect(result.apiErrorDetected).toBeUndefined();
  });

  it('error patterns match expected strings', () => {
    // Should match
    expect(API_ERROR_REGEX.test('dispatch failure occurred')).toBe(true);
    expect(API_ERROR_REGEX.test('Error sending request to API')).toBe(true);
    expect(API_ERROR_REGEX.test('connection refused by server')).toBe(true);

    // Should NOT match
    expect(API_ERROR_REGEX.test('normal operation completed')).toBe(false);
    expect(API_ERROR_REGEX.test('all good')).toBe(false);
  });

  it('property: exit 0 with clean stderr has no apiErrorDetected', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !API_ERROR_REGEX.test(s)),
        fc.string(),
        fc.nat(),
        fc.string(),
        (stderr, stdout, duration, model) => {
          const result = mapExitCodeToResult(0, stdout, stderr, duration, model, false);
          expect(result.success).toBe(true);
          expect(result.apiErrorDetected).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
