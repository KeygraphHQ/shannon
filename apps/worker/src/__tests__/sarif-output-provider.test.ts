/**
 * Behavioural tests for SarifReportOutputProvider.
 *
 * Covers the contract that consumers (GitHub Code Scanning, GitLab,
 * Defect Dojo) actually depend on:
 *   - SARIF 2.1.0 envelope with the expected top-level fields
 *   - Tool driver advertises the five built-in vulnerability rules
 *   - One result per non-empty evidence file, ruleId matching the rule
 *   - Empty / missing evidence files do not produce results
 *   - Result messages are truncated rather than dropping out at limit
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SarifReportOutputProvider } from '../services/sarif-output-provider.js';
import type { ActivityInput } from '../temporal/activities.js';
import type { ActivityLogger } from '../types/activity-logger.js';

const noopLogger: ActivityLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

async function setupRepoWithDeliverables(
  evidence: Record<string, string>,
): Promise<{ repoPath: string; cleanup: () => Promise<void> }> {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'shannon-sarif-test-'));
  const deliverablesPath = path.join(repoPath, '.shannon', 'deliverables');
  await fs.mkdir(deliverablesPath, { recursive: true });
  for (const [name, body] of Object.entries(evidence)) {
    await fs.writeFile(path.join(deliverablesPath, name), body, 'utf8');
  }
  return {
    repoPath,
    cleanup: () => fs.rm(repoPath, { recursive: true, force: true }),
  };
}

function makeInput(repoPath: string): ActivityInput {
  return {
    webUrl: 'https://example.com',
    repoPath,
    workflowId: 'wf-test',
    sessionId: 'sess-test',
  };
}

describe('SarifReportOutputProvider', () => {
  let cleanup: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }
  });

  it('emits a valid SARIF 2.1.0 envelope when at least one finding exists', async () => {
    const setup = await setupRepoWithDeliverables({
      'injection_exploitation_evidence.md': '## SQL injection in /api/users\n\nProof: `' + "1' OR '1'='1" + '`',
    });
    cleanup = setup.cleanup;

    const provider = new SarifReportOutputProvider('1.1.0');
    const result = await provider.generate(makeInput(setup.repoPath), noopLogger);

    expect(result.outputPath).toBeDefined();
    const sarif = JSON.parse(await fs.readFile(result.outputPath as string, 'utf8'));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toMatch(/sarif-schema-2\.1\.0/);
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe('Shannon');
    expect(sarif.runs[0].tool.driver.version).toBe('1.1.0');
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(5);
    expect(sarif.runs[0].results).toHaveLength(1);
    expect(sarif.runs[0].results[0].ruleId).toBe('shannon.injection');
    expect(sarif.runs[0].results[0].message.text).toMatch(/SQL injection/);
  });

  it('emits one result per non-empty evidence file', async () => {
    const setup = await setupRepoWithDeliverables({
      'injection_exploitation_evidence.md': 'finding',
      'xss_exploitation_evidence.md': 'finding',
      'authz_exploitation_evidence.md': 'finding',
    });
    cleanup = setup.cleanup;

    const provider = new SarifReportOutputProvider();
    const result = await provider.generate(makeInput(setup.repoPath), noopLogger);
    const sarif = JSON.parse(await fs.readFile(result.outputPath as string, 'utf8'));

    expect(sarif.runs[0].results.map((r: { ruleId: string }) => r.ruleId).sort()).toEqual([
      'shannon.authz',
      'shannon.injection',
      'shannon.xss',
    ]);
  });

  it('skips empty and missing evidence files', async () => {
    const setup = await setupRepoWithDeliverables({
      'injection_exploitation_evidence.md': '',
      'xss_exploitation_evidence.md': '   \n  \t\n',
      // auth/ssrf/authz: not written at all
    });
    cleanup = setup.cleanup;

    const provider = new SarifReportOutputProvider();
    const result = await provider.generate(makeInput(setup.repoPath), noopLogger);
    const sarif = JSON.parse(await fs.readFile(result.outputPath as string, 'utf8'));

    expect(sarif.runs[0].results).toHaveLength(0);
    // Even with zero results, the envelope must be valid.
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(5);
  });

  it('truncates oversized evidence rather than dropping it', async () => {
    const huge = 'A'.repeat(64 * 1024); // 64 KiB, well above the 16 KiB limit
    const setup = await setupRepoWithDeliverables({
      'auth_exploitation_evidence.md': huge,
    });
    cleanup = setup.cleanup;

    const provider = new SarifReportOutputProvider();
    const result = await provider.generate(makeInput(setup.repoPath), noopLogger);
    const sarif = JSON.parse(await fs.readFile(result.outputPath as string, 'utf8'));
    const messageText = sarif.runs[0].results[0].message.text as string;

    expect(sarif.runs[0].results).toHaveLength(1);
    expect(messageText.length).toBeLessThan(huge.length);
    expect(messageText).toMatch(/\[truncated\]$/);
  });

  it('writes the SARIF file alongside the markdown report', async () => {
    const setup = await setupRepoWithDeliverables({
      'ssrf_exploitation_evidence.md': 'finding',
    });
    cleanup = setup.cleanup;

    const provider = new SarifReportOutputProvider();
    const result = await provider.generate(makeInput(setup.repoPath), noopLogger);

    expect(result.outputPath).toBe(
      path.join(setup.repoPath, '.shannon', 'deliverables', 'comprehensive_security_assessment_report.sarif'),
    );
    await expect(fs.access(result.outputPath as string)).resolves.toBeUndefined();
  });
});
