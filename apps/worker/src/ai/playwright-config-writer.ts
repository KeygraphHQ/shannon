// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Writes <sourceDir>/.playwright/cli.config.json with stealth defaults so
 * `playwright-cli open` auto-loads them from the agent's cwd. Skipped when a
 * config already exists so user-provided files are never clobbered.
 *
 * NOTE: Playwright's MCP browser config treats `initScript` entries as file
 * paths, not inline source. The stealth script is written alongside the config
 * and referenced by absolute path. Inline strings silently fail the daemon.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const STEALTH_INIT_SCRIPT = `delete Object.getPrototypeOf(navigator).webdriver;

Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const arr = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
    ];
    arr.__proto__ = PluginArray.prototype;
    return arr;
  },
});

window.chrome = window.chrome || {};
window.chrome.runtime = window.chrome.runtime || {
  PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
  PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
  PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
  RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
  OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
  OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
};
`;

function buildStealthConfig(initScriptPath: string, options: PlaywrightConfigOptions) {
  const browser = {
    browserName: 'chromium',
    launchOptions: {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
      ...(options.proxyUrl !== undefined ? { proxy: { server: options.proxyUrl } } : {}),
    },
    contextOptions: {
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ...(options.ignoreHTTPSErrors !== undefined ? { ignoreHTTPSErrors: options.ignoreHTTPSErrors } : {}),
    },
    initScript: [initScriptPath],
  };
  return {
    browser,
  };
}

export interface PlaywrightConfigOptions {
  readonly proxyUrl?: string;
  readonly ignoreHTTPSErrors?: boolean;
  readonly overwrite?: boolean;
}

function validateProxyUrl(proxyUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new Error(`Invalid proxy URL: ${proxyUrl}`);
  }
  if (parsed.protocol !== 'http:' || parsed.hostname.length === 0) {
    throw new Error(`Proxy URL must use http:// and include a host: ${proxyUrl}`);
  }
}

export type StealthConfigWriteResult = 'wrote' | 'skipped-existing';

export async function writePlaywrightStealthConfig(
  sourceDir: string,
  options: PlaywrightConfigOptions = {},
): Promise<{ result: StealthConfigWriteResult; configPath: string }> {
  if (options.proxyUrl !== undefined) validateProxyUrl(options.proxyUrl);

  const playwrightDir = path.join(sourceDir, '.playwright');
  const configPath = path.join(playwrightDir, 'cli.config.json');
  if (!options.overwrite && (await pathExists(configPath))) {
    return { result: 'skipped-existing', configPath };
  }
  const initScriptPath = path.join(playwrightDir, 'scripts', 'stealth.js');
  await fs.mkdir(path.dirname(initScriptPath), { recursive: true });
  await fs.writeFile(initScriptPath, STEALTH_INIT_SCRIPT);
  await fs.writeFile(configPath, JSON.stringify(buildStealthConfig(initScriptPath, options), null, 2));
  return { result: 'wrote', configPath };
}
