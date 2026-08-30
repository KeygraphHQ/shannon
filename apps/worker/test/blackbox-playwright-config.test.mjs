import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writePlaywrightStealthConfig } from '../dist/ai/playwright-config-writer.js';

async function tempSourceDir() {
  return mkdtemp(path.join(os.tmpdir(), 'shannon-playwright-'));
}

async function readConfig(sourceDir) {
  return JSON.parse(await readFile(path.join(sourceDir, '.playwright', 'cli.config.json'), 'utf8'));
}

const EXPECTED_BROWSER = {
  browserName: 'chromium',
  launchOptions: {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  },
  contextOptions: {
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
};

test('no options preserve the existing stealth config shape and script', async (t) => {
  const sourceDir = await tempSourceDir();
  t.after(async () => rm(sourceDir, { recursive: true, force: true }));

  const result = await writePlaywrightStealthConfig(sourceDir);
  const configPath = path.join(sourceDir, '.playwright', 'cli.config.json');

  assert.deepEqual(result, { result: 'wrote', configPath });
  const config = await readConfig(sourceDir);
  assert.deepEqual(config.browser, {
    ...EXPECTED_BROWSER,
    initScript: [path.join(sourceDir, '.playwright', 'scripts', 'stealth.js')],
  });
  assert.equal(await readFile(path.join(sourceDir, '.playwright', 'scripts', 'stealth.js'), 'utf8').then((value) => value.includes('webdriver')), true);
  assert.equal('proxy' in config.browser.launchOptions, false);
  assert.equal('ignoreHTTPSErrors' in config.browser.contextOptions, false);
});

test('an existing config is preserved unless overwrite is requested', async (t) => {
  const sourceDir = await tempSourceDir();
  t.after(async () => rm(sourceDir, { recursive: true, force: true }));
  const configPath = path.join(sourceDir, '.playwright', 'cli.config.json');
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, '{"userOwned":true}\n');

  assert.deepEqual(await writePlaywrightStealthConfig(sourceDir), { result: 'skipped-existing', configPath });
  assert.equal(await readFile(configPath, 'utf8'), '{"userOwned":true}\n');
  await assert.rejects(stat(path.join(sourceDir, '.playwright', 'scripts', 'stealth.js')), /ENOENT/);

  assert.deepEqual(
    await writePlaywrightStealthConfig(sourceDir, {
      proxyUrl: 'http://127.0.0.1:9876',
      ignoreHTTPSErrors: true,
      overwrite: true,
    }),
    { result: 'wrote', configPath },
  );
  const config = await readConfig(sourceDir);
  assert.deepEqual(config.browser.launchOptions.proxy, { server: 'http://127.0.0.1:9876' });
  assert.equal(config.browser.contextOptions.ignoreHTTPSErrors, true);
});

test('proxy validation rejects unsupported, malformed, and hostless URLs before writing', async (t) => {
  for (const proxyUrl of ['https://127.0.0.1:9876', 'ftp://127.0.0.1:9876', 'not-a-url', 'http://']) {
    const sourceDir = await tempSourceDir();
    t.after(async () => rm(sourceDir, { recursive: true, force: true }));

    await assert.rejects(writePlaywrightStealthConfig(sourceDir, { proxyUrl }), /proxy|URL|host/i, proxyUrl);
    await assert.rejects(access(path.join(sourceDir, '.playwright', 'cli.config.json')), /ENOENT/);
    await assert.rejects(access(path.join(sourceDir, '.playwright', 'scripts', 'stealth.js')), /ENOENT/);
  }
});
