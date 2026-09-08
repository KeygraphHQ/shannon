import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { renderBlackboxArtifacts } from '../dist/blackbox/artifacts.js';
import { exportReportLibrary } from '../dist/reporting/report-library.js';

async function fixture(t) {
  const parent = await fs.realpath(tmpdir());
  const root = await fs.mkdtemp(path.join(parent, 'report-library-test-'));
  const identity = await fs.lstat(root, { bigint: true });
  t.after(async () => {
    const resolved = await fs.realpath(root);
    const current = await fs.lstat(root, { bigint: true });
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('report-library-test-'));
    assert.equal(current.ino, identity.ino);
    assert.equal(current.dev, identity.dev);
    assert.equal(current.isSymbolicLink(), false);
    await fs.rm(resolved, { recursive: true });
  });
  const source = path.join(root, 'Saved reports ü 東京');
  const destination = path.join(root, 'Local library ü 東京');
  const bundle = path.join(source, 'Saved result');
  await fs.mkdir(bundle, { recursive: true });
  const files = renderBlackboxArtifacts({ snapshot: {
    schemaVersion: 1, revision: 0, targetOrigin: 'https://private-source-sentinel.example',
    identities: [], exchanges: [], resources: [], transitions: [], hypotheses: [], actions: [],
    candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [], runStatus: 'complete', operationReceipts: [],
  }, findings: [], status: 'complete', failure: null });
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(bundle, name), content, { flag: 'wx' });
  return { root, source, bundle, files, destination };
}
const hasCode = code => error => error.issues?.some(issue => issue.code === code);

test('library publishes an offline private snapshot and preserves every source byte', async t => {
  const { source, destination, files, bundle } = await fixture(t);
  const catalog = await exportReportLibrary(source, destination);
  assert.equal(catalog.complete, true);
  assert.equal(catalog.totals.valid, 1);
  assert.deepEqual((await fs.readdir(destination)).sort(), ['catalog.json', 'index.html']);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(destination, 'catalog.json'), 'utf8')), catalog);
  const html = await fs.readFile(path.join(destination, 'index.html'), 'utf8');
  assert.ok(html.includes('Saved result'));
  assert.ok(!html.includes('private-source-sentinel'));
  for (const [name, content] of Object.entries(files)) assert.equal(await fs.readFile(path.join(bundle, name), 'utf8'), content);
});

test('library rejects existing and overlapping destinations without changing them', async t => {
  const { root, source, destination } = await fixture(t);
  await fs.mkdir(destination);
  await fs.writeFile(path.join(destination, 'keep.txt'), 'preserve');
  await assert.rejects(exportReportLibrary(source, destination), hasCode('destination_exists'));
  for (const target of [source, path.join(source, 'nested'), root])
    await assert.rejects(exportReportLibrary(source, target), hasCode('overlapping_destination'));
  assert.equal(await fs.readFile(path.join(destination, 'keep.txt'), 'utf8'), 'preserve');
  assert.deepEqual(await fs.readdir(source), ['Saved result']);
});

test('ordinary partial write failures roll back exclusively owned files and directory', async t => {
  const { source, destination } = await fixture(t);
  await assert.rejects(exportReportLibrary(source, destination, { async writeFile(handle, bytes) {
    await handle.writeFile(bytes.subarray(0, 8));
    throw new Error('injected private failure');
  } }), error => hasCode('library_failed')(error) && !JSON.stringify(error.issues).includes('injected private'));
  await assert.rejects(fs.lstat(destination), { code: 'ENOENT' });
});

test('silent truncated writes fail verification and roll back', async t => {
  const { source, destination } = await fixture(t);
  await assert.rejects(exportReportLibrary(source, destination, {
    writeFile: (handle, bytes) => handle.writeFile(bytes.subarray(0, 8)),
  }), hasCode('write_verification_failed'));
  await assert.rejects(fs.lstat(destination), { code: 'ENOENT' });
});

test('changes to an earlier output during a later write cannot pass publication verification', async t => {
  const { source, destination } = await fixture(t);
  let writes = 0;
  await assert.rejects(exportReportLibrary(source, destination, { async writeFile(handle, bytes) {
    await handle.writeFile(bytes);
    if (++writes === 2) await fs.writeFile(path.join(destination, 'catalog.json'), '{}');
  } }), hasCode('write_verification_failed'));
  await assert.rejects(fs.lstat(destination), { code: 'ENOENT' });
});

test('rollback preserves files introduced by another writer and reports cleanup failure', async t => {
  const { source, destination } = await fixture(t);
  await assert.rejects(exportReportLibrary(source, destination, { async writeFile(handle, bytes) {
    await handle.writeFile(bytes);
    await fs.writeFile(path.join(destination, 'keep.txt'), 'unowned');
    throw new Error('injected failure');
  } }), hasCode('cleanup_failed'));
  assert.deepEqual(await fs.readdir(destination), ['keep.txt']);
  assert.equal(await fs.readFile(path.join(destination, 'keep.txt'), 'utf8'), 'unowned');
});

test('linked discovery makes catalog incomplete and prevents library creation', async t => {
  const { root, source, destination } = await fixture(t);
  const outside = path.join(root, 'Outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(exportReportLibrary(source, destination), hasCode('catalog_incomplete'));
  await assert.rejects(fs.lstat(destination), { code: 'ENOENT' });
});

test('linked destination parents are rejected before any output is created', async t => {
  const { root, source } = await fixture(t);
  const real = path.join(root, 'real-parent');
  const link = path.join(root, 'linked-parent');
  await fs.mkdir(real);
  await fs.symlink(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(exportReportLibrary(source, path.join(link, 'output')), hasCode('unsafe_directory'));
  assert.deepEqual(await fs.readdir(real), []);
});
