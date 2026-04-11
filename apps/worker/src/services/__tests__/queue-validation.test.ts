// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Tests for queue-validation.ts
 *
 * Covers the full validateQueueAndDeliverable / validateQueueSafe pipeline:
 *   - Unknown vuln type → immediate error
 *   - Missing deliverable + queue → retryable validation error
 *   - Queue missing, deliverable present → retryable validation error
 *   - Deliverable missing, queue present → retryable validation error
 *   - Both files present, invalid JSON →  error message contains the actual parse error
 *   - Both files present, valid JSON but wrong shape → "Missing or invalid 'vulnerabilities' array"
 *   - Both files present, valid JSON, empty vulnerabilities → shouldExploit = false
 *   - Both files present, valid JSON, populated vulnerabilities → shouldExploit = true
 */

import { fs, path } from 'zx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateQueueAndDeliverable, validateQueueSafe } from '../queue-validation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a temporary directory and returns its path + a cleanup fn. */
async function makeTempDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp('/tmp/queue-validation-test-');
  return {
    dir,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}

/**
 * Writes the pair of files that validateQueueAndDeliverable expects to find
 * under `<dir>/deliverables/`.
 */
async function writeDeliverables(
  dir: string,
  vulnType: string,
  opts: { deliverable?: boolean; queue?: string | false } = {},
): Promise<void> {
  const deliverableDir = path.join(dir, 'deliverables');
  await fs.mkdirp(deliverableDir);

  const filenames: Record<string, { deliverable: string; queue: string }> = {
    injection: { deliverable: 'injection_analysis_deliverable.md', queue: 'injection_exploitation_queue.json' },
    xss: { deliverable: 'xss_analysis_deliverable.md', queue: 'xss_exploitation_queue.json' },
    auth: { deliverable: 'auth_analysis_deliverable.md', queue: 'auth_exploitation_queue.json' },
    ssrf: { deliverable: 'ssrf_analysis_deliverable.md', queue: 'ssrf_exploitation_queue.json' },
    authz: { deliverable: 'authz_analysis_deliverable.md', queue: 'authz_exploitation_queue.json' },
  };

  const names = filenames[vulnType];
  if (!names) throw new Error(`Unknown vulnType in test helper: ${vulnType}`);

  if (opts.deliverable !== false) {
    await fs.writeFile(path.join(deliverableDir, names.deliverable), '# Analysis\n');
  }

  if (opts.queue !== false) {
    const content = opts.queue ?? JSON.stringify({ vulnerabilities: [] });
    await fs.writeFile(path.join(deliverableDir, names.queue), content);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateQueueAndDeliverable', () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir());
  });

  afterEach(async () => {
    await cleanup();
  });

  // ------------------------------------------------------------------
  // Unknown vuln type
  // ------------------------------------------------------------------
  it('throws immediately for an unknown vulnerability type', async () => {
    await expect(
      // @ts-expect-error intentionally passing invalid type
      validateQueueAndDeliverable('unknown-type', dir),
    ).rejects.toThrow('Unknown vulnerability type: unknown-type');
  });

  // ------------------------------------------------------------------
  // Missing files
  // ------------------------------------------------------------------
  it('throws when both deliverable and queue are missing', async () => {
    await fs.mkdirp(path.join(dir, 'deliverables'));

    await expect(validateQueueAndDeliverable('injection', dir)).rejects.toMatchObject({
      message: expect.stringContaining('Neither deliverable nor queue file exists'),
      retryable: true,
    });
  });

  it('throws when deliverable exists but queue is missing', async () => {
    await writeDeliverables(dir, 'xss', { queue: false });

    await expect(validateQueueAndDeliverable('xss', dir)).rejects.toMatchObject({
      message: expect.stringContaining('Deliverable exists but queue file missing'),
      retryable: true,
    });
  });

  it('throws when queue exists but deliverable is missing', async () => {
    await writeDeliverables(dir, 'auth', { deliverable: false });

    await expect(validateQueueAndDeliverable('auth', dir)).rejects.toMatchObject({
      message: expect.stringContaining('Queue exists but deliverable file missing'),
      retryable: true,
    });
  });

  // ------------------------------------------------------------------
  // BUG FIX: error message for invalid JSON must include the parse error
  // ------------------------------------------------------------------
  it('includes the actual parse error detail in the message for malformed JSON (bug fix)', async () => {
    await writeDeliverables(dir, 'ssrf', { queue: 'not valid json {{{{' });

    const error = await validateQueueAndDeliverable('ssrf', dir).catch((e: unknown) => e);

    expect(error).toMatchObject({ retryable: true });

    // The fix: the real JSON parse error must appear in the message so that
    // operators can diagnose exactly what the AI agent produced wrong.
    const message = (error as Error).message;
    expect(message).toMatch(/Invalid JSON/i);
    // Parse error detail must be present (was silently dropped before fix)
    expect(message).not.toBe(
      `Queue validation failed for ssrf: Invalid JSON structure. Analysis agent must fix queue format.`,
    );
    expect(message).toMatch(/ssrf/);
  });

  it('reports missing vulnerabilities array for valid JSON with wrong shape', async () => {
    await writeDeliverables(dir, 'authz', {
      queue: JSON.stringify({ items: [], results: 'none' }),
    });

    await expect(validateQueueAndDeliverable('authz', dir)).rejects.toMatchObject({
      message: expect.stringContaining("Missing or invalid 'vulnerabilities' array"),
      retryable: true,
    });
  });

  it('reports missing vulnerabilities array when vulnerabilities is not an array', async () => {
    await writeDeliverables(dir, 'injection', {
      queue: JSON.stringify({ vulnerabilities: 'should-be-an-array' }),
    });

    await expect(validateQueueAndDeliverable('injection', dir)).rejects.toMatchObject({
      message: expect.stringContaining("Missing or invalid 'vulnerabilities' array"),
    });
  });

  // ------------------------------------------------------------------
  // Valid queue: empty vs populated
  // ------------------------------------------------------------------
  it('returns shouldExploit=false for a valid queue with no vulnerabilities', async () => {
    await writeDeliverables(dir, 'injection', {
      queue: JSON.stringify({ vulnerabilities: [] }),
    });

    const decision = await validateQueueAndDeliverable('injection', dir);

    expect(decision.shouldExploit).toBe(false);
    expect(decision.vulnerabilityCount).toBe(0);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.vulnType).toBe('injection');
  });

  it('returns shouldExploit=true for a valid queue with vulnerabilities', async () => {
    const vuln = {
      ID: 'INJ-001',
      vulnerability_type: 'SQL Injection',
      externally_exploitable: true,
      confidence: 'high',
      path: '/api/users',
      sink_call: 'db.query()',
    };
    await writeDeliverables(dir, 'injection', {
      queue: JSON.stringify({ vulnerabilities: [vuln, vuln] }),
    });

    const decision = await validateQueueAndDeliverable('injection', dir);

    expect(decision.shouldExploit).toBe(true);
    expect(decision.vulnerabilityCount).toBe(2);
    expect(decision.vulnType).toBe('injection');
  });

  it('works correctly for all five supported vulnerability types', async () => {
    const vulnTypes = ['injection', 'xss', 'auth', 'ssrf', 'authz'] as const;

    for (const vt of vulnTypes) {
      const { dir: d, cleanup: c } = await makeTempDir();
      try {
        await writeDeliverables(d, vt, {
          queue: JSON.stringify({ vulnerabilities: [{ ID: '001', vulnerability_type: vt, externally_exploitable: true, confidence: 'medium' }] }),
        });
        const decision = await validateQueueAndDeliverable(vt, d);
        expect(decision.vulnType).toBe(vt);
        expect(decision.shouldExploit).toBe(true);
      } finally {
        await c();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// validateQueueSafe (Result wrapper)
// ---------------------------------------------------------------------------
describe('validateQueueSafe', () => {
  let dir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ dir, cleanup } = await makeTempDir());
  });

  afterEach(async () => {
    await cleanup();
  });

  it('returns Ok result on success', async () => {
    await writeDeliverables(dir, 'xss', {
      queue: JSON.stringify({ vulnerabilities: [] }),
    });

    const result = await validateQueueSafe('xss', dir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.vulnType).toBe('xss');
    }
  });

  it('returns Err result on failure instead of throwing', async () => {
    await fs.mkdirp(path.join(dir, 'deliverables'));

    const result = await validateQueueSafe('auth', dir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/Neither deliverable nor queue file exists/);
    }
  });

  it('Err result carries retryable flag', async () => {
    await writeDeliverables(dir, 'ssrf', { queue: '{ bad json' });

    const result = await validateQueueSafe('ssrf', dir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.retryable).toBe(true);
    }
  });
});
