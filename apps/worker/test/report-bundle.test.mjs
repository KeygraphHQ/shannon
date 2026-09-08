import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { renderBlackboxArtifacts } from '../dist/blackbox/artifacts.js';
import { MANIFEST_FILE, PRIVATE_FILES, SHARE_FILES } from '../dist/reporting/bundle-types.js';
import { BundleOperationError, checkReportBundle, exportReportBundle, MAX_ARTIFACT_BYTES } from '../dist/reporting/bundle.js';

const cli = fileURLToPath(new URL('../dist/scripts/report-bundle.js', import.meta.url));
const SECRET = 'private-source-credential-77e9';

function fixture() {
  return renderBlackboxArtifacts({
    snapshot: {
      schemaVersion: 1, revision: 0, targetOrigin: `https://${SECRET}.example`,
      identities: [], exchanges: [], resources: [], transitions: [], hypotheses: [],
      actions: [], candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [],
      runStatus: 'complete', operationReceipts: [],
    },
    findings: [], status: 'complete', failure: null,
  });
}

async function workspace(t) {
  // Realpath handles systems where the OS temp root is itself an alias.
  const parent = await fs.realpath(tmpdir());
  const root = await fs.mkdtemp(path.join(parent, 'report-bundle-test-'));
  t.after(async () => {
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('report-bundle-test-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const source = path.join(root, SECRET);
  await fs.mkdir(source);
  const files = fixture();
  for (const name of PRIVATE_FILES) await fs.writeFile(path.join(source, name), files[name]);
  return { root, source, files };
}

async function contents(directory) {
  const names = (await fs.readdir(directory)).sort();
  return Object.fromEntries(await Promise.all(names.map(async name => [name, await fs.readFile(path.join(directory, name))])));
}

const hasIssue = (code) => (error) => error instanceof BundleOperationError && error.issues.some(issue => issue.code === code);

test('legacy check is read-only and explicitly lacks recorded hash evidence', async t => {
  const { source } = await workspace(t);
  const before = await contents(source);
  const checked = await checkReportBundle(source);
  assert.equal(checked.valid, true, JSON.stringify(checked.issues));
  assert.equal(checked.integrity, 'unavailable');
  assert.equal(checked.authenticity, 'not-established');
  assert.match(checked.warnings.join(' '), /No manifest/);
  assert.deepEqual(await contents(source), before);
});

test('private archive preserves exact bytes, including formatting, and copies validate', async t => {
  const { source, root } = await workspace(t);
  const inventory = path.join(source, PRIVATE_FILES[0]);
  await fs.writeFile(inventory, ' [ ] \r\n');
  const before = await contents(source);
  const destination = path.join(root, 'archive');
  const checked = await exportReportBundle(source, destination, 'private');
  assert.equal(checked.valid, true);
  assert.equal(checked.integrity, 'matched');
  const output = await contents(destination);
  const manifest = JSON.parse(output[MANIFEST_FILE]);
  assert.equal(manifest.profile, 'private');
  for (const name of PRIVATE_FILES) {
    assert.deepEqual(output[name], before[name]);
    assert.deepEqual(manifest.files.find(entry => entry.name === name), {
      name, bytes: before[name].length, sha256: createHash('sha256').update(before[name]).digest('hex'),
    });
  }
  const copy = path.join(root, 'copy');
  await fs.cp(destination, copy, { recursive: true });
  assert.equal((await checkReportBundle(copy)).valid, true);
  assert.deepEqual(await contents(source), before);
  assert.deepEqual((await fs.readdir(root)).sort(), [SECRET, 'archive', 'copy'].sort());
});

test('same-length and length-changing tampering both fail manifest validation', async t => {
  const { source, root } = await workspace(t);
  const destination = path.join(root, 'archive');
  await exportReportBundle(source, destination, 'private');
  const file = path.join(destination, PRIVATE_FILES[3]);
  const original = await fs.readFile(file);
  const tampered = Buffer.from(original);
  tampered[0] = tampered[0] === 35 ? 36 : 35;
  for (const bytes of [tampered, Buffer.concat([original, Buffer.from('\n')])]) {
    await fs.writeFile(file, bytes);
    const checked = await checkReportBundle(destination);
    assert.equal(checked.valid, false);
    assert.equal(checked.integrity, 'failed');
    assert.ok(checked.issues.some(issue => issue.code === 'content_mismatch'));
  }
});

test('manifest rejects duplicate entries, unsafe names, extension keys and unsupported profiles', async t => {
  const { source, root } = await workspace(t);
  const destination = path.join(root, 'archive');
  await exportReportBundle(source, destination, 'private');
  const file = path.join(destination, MANIFEST_FILE);
  const original = JSON.parse(await fs.readFile(file, 'utf8'));
  const mutations = [
    m => { m.files[1] = m.files[0]; },
    m => { m.files[0].name = `../${SECRET}`; },
    m => { m[SECRET] = SECRET; },
    m => { m.profile = SECRET; },
    m => { m.files[0].bytes = -1; },
    m => { m.files[0].sha256 = SECRET; },
  ];
  for (const mutate of mutations) {
    const manifest = structuredClone(original);
    mutate(manifest);
    await fs.writeFile(file, JSON.stringify(manifest));
    const checked = await checkReportBundle(destination);
    assert.equal(checked.valid, false);
    assert.ok(checked.issues.some(issue => issue.code === 'invalid_manifest'));
    assert.ok(!JSON.stringify(checked).includes(SECRET));
  }
});

test('missing, unexpected, malformed, invalid UTF-8 and oversized sources fail before export', async t => {
  const { root, source, files } = await workspace(t);
  const file = path.join(source, PRIVATE_FILES[0]);
  const destination = path.join(root, 'archive');
  await fs.unlink(file);
  assert.ok((await checkReportBundle(source)).issues.some(issue => issue.code === 'missing_file'));
  await fs.writeFile(file, '[malformed');
  await assert.rejects(exportReportBundle(source, destination, 'private'), BundleOperationError);
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
  await fs.writeFile(file, Buffer.from([0xff]));
  assert.ok((await checkReportBundle(source)).issues.some(issue => issue.code === 'invalid_encoding'));
  const handle = await fs.open(file, 'w');
  await handle.truncate(MAX_ARTIFACT_BYTES + 1);
  await handle.close();
  assert.ok((await checkReportBundle(source)).issues.some(issue => issue.code === 'file_too_large'));
  await fs.writeFile(file, files[PRIVATE_FILES[0]]);
  await fs.writeFile(path.join(source, SECRET), SECRET);
  const checked = await checkReportBundle(source);
  assert.ok(checked.issues.some(issue => issue.code === 'unexpected_file'));
  assert.ok(!JSON.stringify(checked).includes(SECRET));
});

test('exports refuse existing and source-overlapping destinations without modifying them', async t => {
  const { source, root } = await workspace(t);
  const before = await contents(source);
  const existing = path.join(root, 'existing');
  await fs.mkdir(existing);
  await fs.writeFile(path.join(existing, 'keep'), SECRET);
  await assert.rejects(exportReportBundle(source, existing, 'private'), hasIssue('destination_exists'));
  for (const destination of [source, path.join(source, 'nested'), root]) {
    await assert.rejects(exportReportBundle(source, destination, 'sanitized'), hasIssue('overlapping_destination'));
  }
  assert.equal(await fs.readFile(path.join(existing, 'keep'), 'utf8'), SECRET);
  assert.deepEqual(await contents(source), before);
});

test('hard-linked artifacts are rejected without touching their other names', async t => {
  const { source, root } = await workspace(t);
  const file = path.join(source, PRIVATE_FILES[0]);
  const other = path.join(root, 'linked-file');
  await fs.link(file, other);
  const checked = await checkReportBundle(source);
  assert.ok(checked.issues.some(issue => issue.code === 'unsafe_file'));
  await assert.rejects(exportReportBundle(source, path.join(root, 'archive'), 'private'), hasIssue('unsafe_file'));
  assert.equal(await fs.readFile(other, 'utf8'), '[]\n');
});

test('directory links are rejected for sources and destination parents', async t => {
  const { source, root } = await workspace(t);
  const alias = path.join(root, 'directory-link');
  await fs.symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.ok((await checkReportBundle(alias)).issues.some(issue => issue.code === 'unsafe_directory'));
  await assert.rejects(exportReportBundle(source, path.join(alias, 'archive'), 'private'), hasIssue('unsafe_directory'));
  await fs.unlink(alias);
});

test('partial write failures at every staged and published file leave no destination or staging directory', async t => {
  const { source, root } = await workspace(t);
  const before = await contents(source);
  for (let failAt = 1; failAt <= 2 * (PRIVATE_FILES.length + 1); failAt++) {
    let writes = 0;
    const destination = path.join(root, `failure-${failAt}`);
    await assert.rejects(exportReportBundle(source, destination, 'private', {
      async writeFile(handle, bytes) {
        if (++writes === failAt) {
          await handle.writeFile(bytes.subarray(0, 1));
          throw new Error(SECRET);
        }
        await handle.writeFile(bytes);
      },
    }), error => hasIssue('export_failed')(error) && !JSON.stringify(error).includes(SECRET));
    await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
    assert.deepEqual(await fs.readdir(root), [SECRET]);
  }
  assert.deepEqual(await contents(source), before);
});

test('staged or published validation failures roll back owned output', async t => {
  const { source, root } = await workspace(t);
  for (const corruptAt of [1, PRIVATE_FILES.length + 2]) {
    let writes = 0;
    const destination = path.join(root, `invalid-${corruptAt}`);
    await assert.rejects(exportReportBundle(source, destination, 'private', {
      async writeFile(handle, bytes) { await handle.writeFile(++writes === corruptAt ? Buffer.from('null') : bytes); },
    }), hasIssue('content_mismatch'));
    await assert.rejects(fs.stat(destination), { code: 'ENOENT' });
    assert.deepEqual(await fs.readdir(root), [SECRET]);
  }
});

test('a destination claimed by another writer during staging is preserved', async t => {
  const { source, root } = await workspace(t);
  const destination = path.join(root, 'raced');
  let writes = 0;
  await assert.rejects(exportReportBundle(source, destination, 'private', {
    async writeFile(handle, bytes) {
      await handle.writeFile(bytes);
      if (++writes === PRIVATE_FILES.length + 1) {
        await fs.mkdir(destination);
        await fs.writeFile(path.join(destination, 'keep'), SECRET);
      }
    },
  }), hasIssue('destination_exists'));
  assert.equal(await fs.readFile(path.join(destination, 'keep'), 'utf8'), SECRET);
  assert.deepEqual((await fs.readdir(root)).sort(), [SECRET, 'raced'].sort());
});

test('cleanup preserves an unrelated file introduced during a failed publication', async t => {
  const { source, root } = await workspace(t);
  const destination = path.join(root, 'interference');
  let writes = 0;
  await assert.rejects(exportReportBundle(source, destination, 'private', {
    async writeFile(handle, bytes) {
      await handle.writeFile(bytes);
      if (++writes === PRIVATE_FILES.length + 2) {
        await fs.writeFile(path.join(destination, 'keep'), SECRET);
        throw new Error('interrupted');
      }
    },
  }), hasIssue('cleanup_failed'));
  assert.deepEqual(await fs.readdir(destination), ['keep']);
  assert.equal(await fs.readFile(path.join(destination, 'keep'), 'utf8'), SECRET);
  assert.deepEqual((await fs.readdir(root)).sort(), [SECRET, 'interference'].sort());
});

test('share includes only its own artifacts and hashes, leaves source untouched and requires its manifest', async t => {
  const { source, root } = await workspace(t);
  const before = await contents(source);
  const destination = path.join(root, 'share');
  const checked = await exportReportBundle(source, destination, 'sanitized');
  assert.equal(checked.valid, true);
  assert.equal(checked.profile, 'sanitized');
  assert.equal(checked.integrity, 'matched');
  const output = await contents(destination);
  assert.deepEqual(Object.keys(output).sort(), [...SHARE_FILES, MANIFEST_FILE].sort());
  for (const bytes of Object.values(output)) {
    assert.ok(!bytes.toString().includes(SECRET));
    for (const privateBytes of Object.values(before)) {
      assert.ok(!bytes.toString().includes(createHash('sha256').update(privateBytes).digest('hex')));
    }
  }
  assert.deepEqual(await contents(source), before);
  await fs.unlink(path.join(destination, MANIFEST_FILE));
  assert.ok((await checkReportBundle(destination)).issues.some(issue => issue.code === 'manifest_missing'));
});

test('CLI emits one JSON result, correct exit codes, and no source values in diagnostics', async t => {
  const { source, root } = await workspace(t);
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 15000 });
    assert.ifError(result.error);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout.trim().split('\n').length, 1);
    assert.ok(!result.stdout.includes(SECRET));
    return { status: result.status, json: JSON.parse(result.stdout) };
  };
  assert.equal(run('check', source).status, 0);
  assert.equal(run('check', source, '--require-integrity').status, 1);
  const archived = path.join(root, 'archive');
  assert.equal(run('archive', source, archived).status, 0);
  assert.equal(run('check', archived, '--require-integrity').status, 0);
  assert.equal(run('share', source, path.join(root, 'share')).status, 0);
  assert.equal(run('archive', source, archived).status, 1);
  assert.equal(run('check', path.join(root, SECRET, SECRET)).status, 1);
  assert.equal(run(SECRET, SECRET).status, 2);
  assert.equal(run('check', source, SECRET).status, 2);
});
