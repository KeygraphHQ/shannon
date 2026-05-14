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

import { fs, path } from 'zx';

const STEALTH_INIT_SCRIPT = `Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
`;

function buildStealthConfig(initScriptPath: string) {
  return {
    browser: {
      browserName: 'chromium',
      launchOptions: {
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
        ignoreDefaultArgs: ['--enable-automation'],
      },
      contextOptions: {
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      initScript: [initScriptPath],
    },
  };
}

export type StealthConfigWriteResult = 'wrote' | 'skipped-existing';

export async function writePlaywrightStealthConfig(
  sourceDir: string,
): Promise<{ result: StealthConfigWriteResult; configPath: string }> {
  const playwrightDir = path.join(sourceDir, '.playwright');
  const configPath = path.join(playwrightDir, 'cli.config.json');
  if (await fs.pathExists(configPath)) {
    return { result: 'skipped-existing', configPath };
  }
  const initScriptPath = path.join(playwrightDir, 'scripts', 'stealth.js');
  await fs.ensureDir(path.dirname(initScriptPath));
  await fs.writeFile(initScriptPath, STEALTH_INIT_SCRIPT);
  await fs.writeJson(configPath, buildStealthConfig(initScriptPath), { spaces: 2 });
  return { result: 'wrote', configPath };
}
