import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import fs, { cp, link, lstat, mkdir, readFile, readdir, rename, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createOwnedWorkspace, removeOwnedWorkspace } from '../../../scripts/test-reporting-install.mjs';

const access = await import('../dist/blackbox-observation/access-index.js');
const { loadAccessComparison } = await import('../dist/blackbox-observation/access-files.js');
const { writeFixedOutput } = await import('../dist/blackbox-observation/files.js');
const { runAccessWorker } = await import('../dist/blackbox-observation/isolate.js');
const { AccessComparisonOutputError, accessComparisonLimits, compareAccessDirectory, compareAccessObservation } = access;

const provenance = { actor: 'blackbox-recon', taskId: 'saved-task', baseRevision: 0 };
const fingerprint = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const exchange = (number, identity, pathValue = '/items') => ({
  exchangeId: `ex_${number.toString(16).padStart(24, '0')}`,
  routeSignature: `route_${pathValue === '/items' ? 'a' : 'b'.repeat(24)}`,
  identity,
  captureSequence: number,
  method: 'GET',
  origin: 'https://example.invalid',
  path: pathValue,
  queryKeys: [],
  bodyShape: 'empty',
  requestContentType: null,
  responseStatus: 200,
  responseContentType: 'text/plain',
  responseFingerprint: fingerprint(`response-${number}`),
  candidateObjectReferences: [],
  provenance,
});

function board(exchanges = [], identities = []) {
  return {
    schemaVersion: 1,
    revision: 1,
    targetOrigin: 'https://example.invalid',
    runStatus: 'complete',
    failure: null,
    identities: identities.map(name => ({ name, role: 'reader', authenticated: true })),
    exchanges: structuredClone(exchanges),
    resources: [],
    transitions: [],
    hypotheses: [],
    actions: [],
    candidateProofs: [],
    verifications: [],
    tasks: [],
    rejectedTasks: [],
  };
}

async function fixture(t, options = {}) {
  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  const input = path.join(owner.directory, '比較 inputs 日本');
  await mkdir(input);
  const exchanges = options.exchanges ?? [];
  const identities = options.identities ?? [];
  const files = {
    'traffic_inventory.json': exchanges,
    'blackbox_blackboard.json': board(exchanges, identities),
    'blackbox_authz_findings.json': [],
    ...options.files,
  };
  for (const [name, value] of Object.entries(files)) {
    if (value !== undefined)
      await writeFile(path.join(input, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return { root: owner.directory, input };
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('file comparison API is exported and deterministic over Unicode saved inputs', async t => {
  assert.equal(typeof compareAccessDirectory, 'function');
  const saved = [exchange(1, 'alice'), exchange(2, 'bob')];
  const { input } = await fixture(t, { exchanges: saved, identities: ['alice', 'bob'] });
  const before = new Map(await Promise.all((await readdir(input)).map(async name => [name, await readFile(path.join(input, name))])));
  const first = await compareAccessDirectory(input);
  const second = await compareAccessDirectory(input);

  assert.equal(first.result.status, 'completed');
  assert.equal(first.json, second.json);
  assert.equal(first.markdown, second.markdown);
  assert.deepEqual(JSON.parse(first.json), first.result);
  for (const source of first.result.sources.filter(value => value.availability === 'available')) {
    const bytes = before.get(source.file);
    assert.equal(source.sha256, hash(bytes));
    assert.equal(source.bytes, bytes.length);
    assert.deepEqual(await readFile(path.join(input, source.file)), bytes);
  }
});

test('recorded-only comparison works and raw loading selects only reconciled native IDs', async t => {
  const omitted = await fixture(t, { exchanges: [exchange(1, 'alice'), exchange(2, 'bob')], identities: ['alice', 'bob'] });
  const recorded = await compareAccessDirectory(omitted.input);
  assert.equal(recorded.result.status, 'completed');
  assert.equal(recorded.result.sources.some(value => value.source === 'raw'), false);

  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  const input = path.join(owner.directory, 'selected raw 日本');
  await cp(new URL('./fixtures/blackbox-observation/sets/raw-quality/', import.meta.url), input, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  const rawDirectory = path.join(input, 'raw');
  await writeFile(path.join(rawDirectory, 'PRIVATE_IRRELEVANT.json'), 'PRIVATE_RAW_SENTINEL invalid JSON');
  const report = await compareAccessDirectory(input, { rawDirectory });
  assert.equal(report.result.status, 'completed');
  const rawSources = report.result.sources.filter(value => value.source === 'raw');
  assert.equal(rawSources.length, 4);
  for (const source of rawSources) {
    assert.match(source.file, /^ex_[a-f0-9]{24}\.json$/);
    const bytes = await readFile(path.join(rawDirectory, source.file));
    assert.equal(source.sha256, hash(bytes));
    assert.equal(source.bytes, bytes.length);
  }
  assert.doesNotMatch(report.json + report.markdown, /PRIVATE_(?:IRRELEVANT|RAW_SENTINEL)/);
});

test('missing, linked, hard-linked, and nonregular inputs fail without reflected private text', async t => {
  const missing = await fixture(t, { files: { 'traffic_inventory.json': undefined } });
  assert.equal((await compareAccessDirectory(missing.input)).result.status, 'failed');

  const original = await fixture(t);
  const alias = path.join(original.root, 'PRIVATE_LINK_SENTINEL');
  await symlink(original.input, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const linked = await compareAccessDirectory(alias);
  assert.equal(linked.result.status, 'failed');
  assert.doesNotMatch(linked.json + linked.markdown, /PRIVATE_LINK_SENTINEL/);

  await link(path.join(original.input, 'traffic_inventory.json'), path.join(original.root, 'hardlink.json'));
  assert.equal((await compareAccessDirectory(original.input)).result.status, 'failed');

  const nonregular = await fixture(t, { files: { 'traffic_inventory.json': undefined } });
  await mkdir(path.join(nonregular.input, 'traffic_inventory.json'));
  assert.equal((await compareAccessDirectory(nonregular.input)).result.status, 'failed');

  const rawAliasRoot = await fixture(t);
  const raw = path.join(rawAliasRoot.root, 'raw');
  await mkdir(raw);
  const rawAlias = path.join(rawAliasRoot.root, 'PRIVATE_RAW_LINK');
  await symlink(raw, rawAlias, process.platform === 'win32' ? 'junction' : 'dir');
  const rawLinked = await compareAccessDirectory(rawAliasRoot.input, { rawDirectory: rawAlias });
  assert.equal(rawLinked.result.status, 'failed');
  assert.doesNotMatch(rawLinked.json + rawLinked.markdown, /PRIVATE_RAW_LINK/);

  const hardlinkOwner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(hardlinkOwner));
  const hardlinkInput = path.join(hardlinkOwner.directory, 'selected raw hardlink');
  await cp(new URL('./fixtures/blackbox-observation/sets/raw-quality/', import.meta.url), hardlinkInput, {
    recursive: true, force: false, errorOnExist: true,
  });
  const hardlinkRaw = path.join(hardlinkInput, 'raw');
  const selected = (await readdir(hardlinkRaw)).find(name => /^ex_[a-f0-9]{24}\.json$/.test(name));
  await link(path.join(hardlinkRaw, selected), path.join(hardlinkOwner.directory, 'PRIVATE_RAW_HARDLINK.json'));
  const hardlinked = await compareAccessDirectory(hardlinkInput, { rawDirectory: hardlinkRaw });
  assert.equal(hardlinked.result.status, 'failed');
  assert.doesNotMatch(hardlinked.json + hardlinked.markdown, /PRIVATE_RAW_HARDLINK/);
});

test('physical output aliases of captured input roots fail as unsafe before creating output', async t => {
  const { input, root } = await fixture(t);
  const alias = path.join(root, 'lexically separate input alias');
  await symlink(input, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const outputDirectory = path.join(alias, 'must-not-exist');
  const report = await compareAccessDirectory(input, { outputDirectory });
  assert.equal(report.result.status, 'failed');
  assert.deepEqual(report.result.diagnostics.map(value => value.code), ['unsafe-output']);
  await assert.rejects(lstat(outputDirectory), { code: 'ENOENT' });
});

test('already-read native and selected raw files are rehashed after comparison before output', async t => {
  const native = await fixture(t, {
    exchanges: [exchange(1, 'alice'), exchange(2, 'bob')],
    identities: ['alice', 'bob'],
  });
  const rawOwner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(rawOwner));
  const rawInput = path.join(rawOwner.directory, 'raw replacement');
  await cp(new URL('./fixtures/blackbox-observation/sets/raw-quality/', import.meta.url), rawInput, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  const rawDirectory = path.join(rawInput, 'raw');
  const selectedRaw = (await readdir(rawDirectory)).find(name => /^ex_[a-f0-9]{24}\.json$/.test(name));
  assert.ok(selectedRaw);

  for (const [label, directory, selected, raw] of [
    ['native', native.input, path.join(native.input, 'traffic_inventory.json'), undefined],
    ['raw', rawInput, path.join(rawDirectory, selectedRaw), rawDirectory],
  ]) {
    const outputDirectory = path.join(path.dirname(directory), `${label} output must not exist`);
    const report = await loadAccessComparison(
      {
        directory,
        ...(raw ? { rawDirectory: raw } : {}),
        outputDirectory,
        limits: accessComparisonLimits(),
      },
      (input, limits) => {
        writeFileSync(selected, label === 'native' ? '[ ]' : '{}');
        return compareAccessObservation(input, limits);
      },
    );
    assert.equal(report.result.status, 'failed', label);
    assert.deepEqual(report.result.diagnostics.map(value => value.code), ['source-changed'], label);
    await assert.rejects(lstat(outputDirectory), { code: 'ENOENT' });
  }
});

test('comparison limits fail closed across files, structure, population, raw input, and output', async t => {
  const saved = [
    exchange(1, 'alice', '/items'),
    exchange(2, 'bob', '/items'),
    exchange(3, 'alice', '/other'),
    exchange(4, 'bob', '/other'),
  ];
  const { input } = await fixture(t, { exchanges: saved, identities: ['alice', 'bob'] });
  for (const limits of [
    { maxNativeBytes: 8 },
    { maxTotalBytes: 8 },
    { maxNodes: 2 },
    { maxDepth: 1 },
    { maxExchanges: 1 },
    { maxRoutes: 1 },
    { maxIdentities: 1 },
    { maxRecords: 1 },
    { maxComparisons: 1 },
    { maxSourcesPerComparison: 1 },
  ]) {
    assert.equal((await compareAccessDirectory(input, { limits })).result.status, 'failed', JSON.stringify(limits));
  }
  const transitionBoard = board(saved, ['alice', 'bob']);
  transitionBoard.transitions = [1, 2].map(number => ({
    transitionId: `transition-${number}`,
    identity: 'alice',
    captureSequence: number,
    fromState: 'before',
    toState: 'after',
    triggerExchangeId: saved[0].exchangeId,
    resourceId: null,
    provenance,
  }));
  const transitionFixture = await fixture(t, {
    exchanges: saved,
    identities: ['alice', 'bob'],
    files: { 'blackbox_blackboard.json': transitionBoard },
  });
  assert.equal(
    (await compareAccessDirectory(transitionFixture.input, { limits: { maxTransitions: 1 } })).result.status,
    'failed',
  );
  await assert.rejects(compareAccessDirectory(input, { limits: { maxOutputBytes: 8 } }), error =>
    error instanceof AccessComparisonOutputError && error.message === 'Comparison output exceeds the enforced limit.');
  for (const limits of [
    { maxOutputBytes: 16 * 1024 * 1024 + 1 },
    { maxComparisons: 1.5 },
    { maxSourcesPerComparison: Number.NaN },
    { timeoutMs: Number.POSITIVE_INFINITY },
  ]) {
    await assert.rejects(compareAccessDirectory(input, { limits }), { message: 'Invalid access comparison limits.' });
  }

  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  const rawInput = path.join(owner.directory, 'raw limits');
  await cp(new URL('./fixtures/blackbox-observation/sets/raw-quality/', import.meta.url), rawInput, {
    recursive: true, force: false, errorOnExist: true,
  });
  for (const limits of [{ maxRawFiles: 1 }, { maxRawBytes: 1 }]) {
    assert.equal((await compareAccessDirectory(rawInput, { rawDirectory: path.join(rawInput, 'raw'), limits })).result.status, 'failed');
  }
});

test('pre-abort and deadline reap the comparison worker without output or input changes', async t => {
  const { input, root } = await fixture(t);
  const before = await readFile(path.join(input, 'blackbox_blackboard.json'));
  const outputDirectory = path.join(root, 'not-created');
  const controller = new AbortController();
  controller.abort();
  const started = Date.now();
  for (const options of [{ signal: controller.signal }, { limits: { timeoutMs: 1 } }]) {
    const report = await compareAccessDirectory(input, { ...options, outputDirectory });
    assert.equal(report.result.status, 'failed');
    assert.ok(report.result.diagnostics.some(value => value.code === 'processing-timeout'));
  }
  assert.ok(Date.now() - started < 5_000);
  assert.deepEqual(await readFile(path.join(input, 'blackbox_blackboard.json')), before);
  await assert.rejects(lstat(outputDirectory), { code: 'ENOENT' });
});

test('comparison worker accepts an absolute monotonic deadline and does not spawn after expiry', async () => {
  const outcome = await runAccessWorker({}, process.hrtime.bigint() - 1n);
  assert.deepEqual(outcome, { code: 'processing-timeout' });
});

test('output is exclusive, outside both inputs, exact for nonfailed reports, and never overwritten', async t => {
  const partial = await fixture(t, { files: { 'blackbox_authz_findings.json': '{' } });
  const rawDirectory = path.join(partial.root, 'raw');
  await mkdir(rawDirectory);
  for (const outputDirectory of [
    partial.input,
    path.join(partial.input, 'new'),
    partial.root,
    rawDirectory,
    path.join(rawDirectory, 'new'),
  ]) {
    const report = await compareAccessDirectory(partial.input, { rawDirectory, outputDirectory });
    assert.equal(report.result.status, 'failed');
  }
  await assert.rejects(
    compareAccessDirectory(partial.input, {
      rawDirectory,
      outputDirectory: path.join(partial.root, 'absent-parent', 'new'),
    }),
    { message: 'Saved comparison processing failed.' },
  );
  const outputDirectory = path.join(partial.root, '比較 output 日本');
  const report = await compareAccessDirectory(partial.input, { outputDirectory });
  assert.equal(report.result.status, 'partial');
  assert.deepEqual((await readdir(outputDirectory)).sort(), ['comparison.json', 'comparison.md']);
  assert.equal(await readFile(path.join(outputDirectory, 'comparison.json'), 'utf8'), report.json);
  assert.equal(await readFile(path.join(outputDirectory, 'comparison.md'), 'utf8'), report.markdown);
  const saved = await readFile(path.join(outputDirectory, 'comparison.json'));
  await assert.rejects(compareAccessDirectory(partial.input, { outputDirectory }), {
    message: 'Saved comparison processing failed.',
  });
  assert.deepEqual(await readFile(path.join(outputDirectory, 'comparison.json')), saved);

  const failed = await fixture(t, { files: { 'traffic_inventory.json': undefined } });
  const failedOutput = path.join(failed.root, 'must-not-exist');
  assert.equal((await compareAccessDirectory(failed.input, { outputDirectory: failedOutput })).result.status, 'failed');
  await assert.rejects(lstat(failedOutput), { code: 'ENOENT' });
});

test('output replacement between validation and open cannot redirect report bytes', { concurrency: false }, async t => {
  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  const input = path.join(owner.directory, 'input');
  const output = path.join(owner.directory, 'output');
  const moved = path.join(owner.directory, 'moved-owned-output');
  const replacement = path.join(owner.directory, 'replacement');
  await mkdir(input);
  await mkdir(replacement);
  const target = path.join(output, 'comparison.json');
  const leaked = path.join(replacement, 'comparison.json');
  const originalOpen = fs.open;
  let replaced = false;
  fs.open = async (file, ...args) => {
    if (!replaced && path.resolve(String(file)) === target) {
      replaced = true;
      await rename(output, moved);
      await symlink(replacement, output, process.platform === 'win32' ? 'junction' : 'dir');
    }
    return originalOpen.call(fs, file, ...args);
  };
  try {
    await assert.rejects(
      writeFixedOutput(
        { directory: input, outputDirectory: output },
        [
          ['comparison.json', 'PRIVATE_REDIRECTED_JSON'],
          ['comparison.md', 'PRIVATE_REDIRECTED_MARKDOWN'],
        ],
        { roots: [], sources: [] },
      ),
      { message: 'Saved observation processing failed.' },
    );
  } finally {
    fs.open = originalOpen;
  }
  assert.equal(replaced, true);
  const escaped = await readFile(leaked, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  assert.doesNotMatch(escaped, /PRIVATE_REDIRECTED/);
});

test('a hardlink added during retained-handle write is detected and scrubbed', { concurrency: false }, async t => {
  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  const input = path.join(owner.directory, 'input');
  const output = path.join(owner.directory, 'output');
  const inputFile = path.join(input, 'traffic_inventory.json');
  const externalLink = path.join(owner.directory, 'external-hardlink.json');
  await mkdir(input);
  await writeFile(inputFile, 'PRIVATE_INPUT_UNCHANGED');
  const inputBefore = await readFile(inputFile);
  const target = path.join(output, 'comparison.json');
  const originalOpen = fs.open;
  let linked = false;
  fs.open = async (file, ...args) => {
    const handle = await originalOpen.call(fs, file, ...args);
    if (path.resolve(String(file)) === target) {
      const originalWriteFile = handle.writeFile.bind(handle);
      handle.writeFile = async (...writeArgs) => {
        if (!linked) {
          linked = true;
          await link(target, externalLink);
        }
        return originalWriteFile(...writeArgs);
      };
    }
    return handle;
  };
  try {
    await assert.rejects(
      writeFixedOutput(
        { directory: input, outputDirectory: output },
        [
          ['comparison.json', 'PRIVATE_HARDLINKED_JSON'],
          ['comparison.md', 'PRIVATE_HARDLINKED_MARKDOWN'],
        ],
        { roots: [], sources: [] },
      ),
      { message: 'Saved observation processing failed.' },
    );
  } finally {
    fs.open = originalOpen;
  }
  assert.equal(linked, true);
  assert.equal((await readFile(externalLink)).length, 0);
  assert.deepEqual(await readFile(inputFile), inputBefore);
});

test('worker environment and IPC do not disclose preload, provider, or raw sentinels', async t => {
  const request = 'POST /PRIVATE_TARGET HTTP/1.1\r\nHost: example.invalid\r\nAuthorization: PRIVATE_HEADER\r\nCookie: PRIVATE_COOKIE\r\nContent-Length: 20\r\n\r\nPRIVATE_REQUEST_BODY';
  const response = 'HTTP/1.1 200 OK\r\nContent-Length: 21\r\nContent-Type: text/plain\r\n\r\nPRIVATE_RESPONSE_BODY';
  const historyHash = hash(`${request}\0${response}`);
  const exchanges = ['alice', 'bob'].map((identity, index) => ({
    ...exchange(index + 1, identity),
    exchangeId: `ex_${hash(`${provenance.taskId}\0${identity}\0${index + 1}\0${historyHash}`).slice(0, 24)}`,
    method: 'POST',
    responseFingerprint: fingerprint(response),
  }));
  const { input, root } = await fixture(t, { exchanges, identities: ['alice', 'bob'] });
  const rawDirectory = path.join(root, 'selected raw sentinels');
  await mkdir(rawDirectory);
  for (const [index, saved] of exchanges.entries()) {
    await writeFile(
      path.join(rawDirectory, `${saved.exchangeId}.json`),
      JSON.stringify({ request, response, notes: 'PRIVATE_NOTE', occurrence: index + 1 }),
    );
  }
  const previousNode = process.env.NODE_OPTIONS;
  const previousProvider = process.env.OPENAI_API_KEY;
  process.env.NODE_OPTIONS = '--require=PRIVATE_PRELOAD_SENTINEL';
  process.env.OPENAI_API_KEY = 'PRIVATE_PROVIDER_CREDENTIAL';
  try {
    const report = await compareAccessDirectory(input, { rawDirectory });
    assert.equal(report.result.status, 'completed');
    assert.doesNotMatch(
      report.json + report.markdown,
      /PRIVATE_(?:PRELOAD_SENTINEL|PROVIDER_CREDENTIAL|TARGET|HEADER|COOKIE|REQUEST_BODY|RESPONSE_BODY|NOTE)/,
    );
  } finally {
    if (previousNode === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previousNode;
    if (previousProvider === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousProvider;
  }
});
