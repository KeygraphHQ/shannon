import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { buildEnvFlags } from './env.js';

const CONCURRENCY_VAR = 'SHANNON_MAX_CONCURRENT_PIPELINES';

afterEach(() => {
  delete process.env[CONCURRENCY_VAR];
});

test('buildEnvFlags forwards the concurrency knob by name only when it is set', () => {
  delete process.env[CONCURRENCY_VAR];
  const without = buildEnvFlags();
  assert.equal(without.includes(CONCURRENCY_VAR), false);

  process.env[CONCURRENCY_VAR] = '1';
  const flags = buildEnvFlags();
  const index = flags.indexOf(CONCURRENCY_VAR);
  assert.notEqual(index, -1);
  // Passed by name so the value never appears in the docker run argv.
  assert.equal(flags[index - 1], '-e');
});
