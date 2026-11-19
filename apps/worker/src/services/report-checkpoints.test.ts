import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { validateDraftProgress } from './report-checkpoints.js';

const execFileAsync = promisify(execFile);

async function createDraftCheckpoint(
  reportMeta: Record<string, unknown>,
): Promise<{ dir: string; checkpoint: string }> {
  const dir = await mkdtemp(path.join(process.env.TMPDIR ?? tmpdir(), 'shannon-report-checkpoint-'));
  await execFileAsync('git', ['init', '--quiet', dir]);
  await execFileAsync('git', ['-C', dir, 'config', 'user.name', 'Shannon Test']);
  await execFileAsync('git', ['-C', dir, 'config', 'user.email', 'shannon-test@example.test']);
  await writeFile(path.join(dir, 'report.json'), `${JSON.stringify({ report_meta: reportMeta, findings: [] })}\n`);
  await execFileAsync('git', ['-C', dir, 'add', 'report.json']);
  await execFileAsync('git', ['-C', dir, 'commit', '--quiet', '-m', 'report draft']);
  const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', 'HEAD']);
  return { dir, checkpoint: stdout.trim() };
}

test('marks a resumed draft with a blank executive summary invalid-model', async () => {
  const { dir, checkpoint } = await createDraftCheckpoint({
    target: 'https://example.test',
    assessment_date: '2026-11-09',
    scope: 'XSS',
    executive_summary: ' \t\n',
  });

  try {
    const result = await validateDraftProgress(dir, {
      stage: 'draft',
      model_checkpoint: checkpoint,
      renumber_failed_classes: [],
      partial_reasons: [],
    });
    assert.equal(result, 'invalid-model');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
