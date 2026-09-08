import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { renderBlackboxArtifacts } from '../apps/worker/dist/blackbox/artifacts.js';

const repository = fileURLToPath(new URL('../', import.meta.url));
const secret = 'source-private-c7af382e';

test('documented pnpm reports commands preserve evidence and export a sanitized bundle in Unicode paths', { timeout: 120_000 }, async t => {
  const pnpm = process.env.npm_execpath;
  assert.ok(pnpm && /\.(c?js|mjs)$/.test(pnpm), 'Run this smoke test through pnpm test:reporting:bundles');
  const parent = await realpath(tmpdir());
  const root = await mkdtemp(path.join(parent, 'reporting-cli-smoke-'));
  const owned = await lstat(root, { bigint: true });
  t.after(async () => {
    const resolved = await realpath(root);
    const stat = await lstat(root, { bigint: true });
    assert.equal(path.dirname(resolved), parent);
    assert.equal(resolved, root);
    assert.ok(path.basename(resolved).startsWith('reporting-cli-smoke-'));
    assert.equal(stat.ino, owned.ino);
    assert.equal(stat.dev, owned.dev);
    assert.equal(stat.isSymbolicLink(), false);
    await rm(resolved, { recursive: true, force: false });
  });
  const source = path.join(root, `Saved evidence ü 東京 ${secret}`);
  const archive = path.join(root, 'Private archive ü 東京');
  const share = path.join(root, 'Shared report ü 東京');
  await mkdir(source);
  const files = renderBlackboxArtifacts({
    snapshot: {
      schemaVersion: 1, revision: 0, targetOrigin: `https://${secret}.example`,
      identities: [], exchanges: [], resources: [], transitions: [], hypotheses: [],
      actions: [], candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [],
      runStatus: 'complete', operationReceipts: [],
    }, findings: [], status: 'complete', failure: null,
  });
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(source, name), text, { flag: 'wx' });
  const outputs = [];
  function reports(args, expected = 0, json = true, privateOutput = false) {
    const result = spawnSync(process.execPath, [pnpm, '--silent', 'reports', ...args], {
      cwd: repository, env: process.env, shell: false, windowsHide: true,
      encoding: 'utf8', timeout: 20_000, maxBuffer: 1_048_576,
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`);
    if (!privateOutput) outputs.push(result.stdout, result.stderr);
    return json ? JSON.parse(result.stdout) : result.stdout;
  }
  assert.match(reports(['--help'], 0, false), /check/);
  const legacy = reports(['check', source]);
  assert.equal(legacy.valid, true);
  assert.equal(legacy.integrity, 'unavailable');
  assert.equal(reports(['check', source, '--require-integrity'], 1).integrity, 'unavailable');
  assert.equal(reports(['archive', source, archive]).integrity, 'matched');
  assert.equal(reports(['check', archive, '--require-integrity']).valid, true);
  assert.equal(reports(['share', source, share]).integrity, 'matched');
  assert.equal(reports(['check', share, '--require-integrity']).profile, 'sanitized');
  for (const [name, text] of Object.entries(files)) {
    assert.deepEqual(await readFile(path.join(source, name)), Buffer.from(text));
    assert.deepEqual(await readFile(path.join(archive, name)), Buffer.from(text));
  }
  for (const name of await readdir(share)) outputs.push(await readFile(path.join(share, name), 'utf8'));
  assert.ok(outputs.every(text => !text.includes(secret)), 'Private source values must not appear in shared output or CLI diagnostics');
  const markdown = path.join(archive, 'blackbox_authz_evidence.md');
  await writeFile(markdown, `${await readFile(markdown, 'utf8')}\nTampered\n`);
  const tampered = reports(['check', archive, '--require-integrity'], 1);
  assert.equal(tampered.valid, false);
  assert.equal(tampered.integrity, 'failed');
  assert.ok(tampered.issues.some(issue => issue.code === 'content_mismatch'));
  assert.ok(outputs.every(text => !text.includes(secret)));
  // Catalog JSON intentionally retains local folder names, unlike diagnostics/share.
  const catalog = reports(['catalog', root], 0, true, true);
  assert.equal(catalog.complete, true);
  assert.equal(catalog.totals.bundles, 3);
  assert.equal(catalog.totals.invalid, 1);
  assert.equal(catalog.entries.find(entry => entry.check.valid === false).summary, null);
  assert.ok(JSON.stringify(catalog).includes(secret));
  const library = path.join(root, 'Library output');
  // Use a bundle source so the new destination remains outside its scanned root.
  const published = reports(['library', source, library]);
  assert.equal(published.complete, true);
  assert.deepEqual(published.files, ['catalog.json', 'index.html']);
  assert.equal(JSON.parse(await readFile(path.join(library, 'catalog.json'), 'utf8')).entries.length, 1);
  assert.equal(reports(['library', source, library], 1).issues[0].code, 'destination_exists');
  assert.equal(reports(['catalog', path.join(root, 'missing-private-folder')], 1, true, true).complete, false);
  assert.ok(outputs.every(text => !text.includes(secret)));
});
