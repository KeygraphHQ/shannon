import fc from 'fast-check';
import type { ContainerConfig } from '../types/config.js';
import { resolveExecutorBackend } from './container.js';

type Backend = 'claude-sdk' | 'kiro-cli';
const backends = fc.constantFrom('claude-sdk', 'kiro-cli') as fc.Arbitrary<Backend>;

function withEnvRestore(fn: () => void): void {
  const orig = process.env.SHANNON_EXECUTOR_BACKEND;
  try {
    fn();
  } finally {
    if (orig) {
      process.env.SHANNON_EXECUTOR_BACKEND = orig;
    } else {
      delete process.env.SHANNON_EXECUTOR_BACKEND;
    }
  }
}

function makeConfig(backend?: Backend): ContainerConfig {
  return {
    deliverablesSubdir: '.shannon/deliverables',
    auditDir: './workspaces',
    ...(backend !== undefined ? { executorBackend: backend } : {}),
  };
}

/**
 * Property 4: Backend selection precedence
 *
 * Validates: Requirements 4.5
 */
describe('Property 4: Backend selection precedence', () => {
  it('env var takes precedence over config', () => {
    fc.assert(
      fc.property(backends, backends, (envVal, cfgVal) => {
        withEnvRestore(() => {
          process.env.SHANNON_EXECUTOR_BACKEND = envVal;
          const result = resolveExecutorBackend(makeConfig(cfgVal));
          expect(result).toBe(envVal);
        });
      }),
      { numRuns: 100 },
    );
  });

  it('config used when env var is unset', () => {
    fc.assert(
      fc.property(backends, (cfgVal) => {
        withEnvRestore(() => {
          delete process.env.SHANNON_EXECUTOR_BACKEND;
          const result = resolveExecutorBackend(makeConfig(cfgVal));
          expect(result).toBe(cfgVal);
        });
      }),
      { numRuns: 100 },
    );
  });

  it('defaults to claude-sdk when nothing set', () => {
    withEnvRestore(() => {
      delete process.env.SHANNON_EXECUTOR_BACKEND;
      const result = resolveExecutorBackend(makeConfig());
      expect(result).toBe('claude-sdk');
    });
  });
});
