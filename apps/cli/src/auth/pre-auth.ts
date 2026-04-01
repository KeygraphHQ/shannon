/**
 * Interactive pre-authentication via Playwright.
 *
 * Opens a headed (visible) Chromium browser, navigates to the login URL,
 * and waits for the user to complete authentication (e.g., Google OAuth + 2FA).
 * Once the success condition is met, captures the browser's storage state
 * (cookies + localStorage) and writes it to auth-state.json.
 *
 * Playwright is NOT a bundled dependency — it must be installed on the host:
 *   npm install -g playwright && npx playwright install chromium
 */

import fs from 'node:fs';
import path from 'node:path';

export interface PreAuthOptions {
  loginUrl: string;
  successType: string;
  successValue: string;
  outputPath: string;
}

interface PlaywrightBrowser {
  newContext(): Promise<PlaywrightContext>;
  close(): Promise<void>;
}

interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>;
  storageState(): Promise<unknown>;
  close(): Promise<void>;
}

interface PlaywrightPage {
  goto(url: string, opts?: { waitUntil?: string }): Promise<void>;
  url(): string;
  textContent(selector: string): Promise<string | null>;
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
}

interface PlaywrightChromium {
  launch(opts: { headless: boolean }): Promise<PlaywrightBrowser>;
}

async function loadPlaywright(): Promise<PlaywrightChromium> {
  try {
    // Dynamic import — playwright is an optional peer dependency, not bundled
    const pw = await (Function('return import("playwright")')() as Promise<{ chromium: PlaywrightChromium }>);
    return pw.chromium;
  } catch {
    console.error('\nERROR: Playwright is required for interactive authentication.');
    console.error('Install it with:\n');
    console.error('  npm install -g playwright');
    console.error('  npx playwright install chromium\n');
    process.exit(1);
  }
}

function checkSuccessCondition(page: PlaywrightPage, successType: string, successValue: string): boolean {
  switch (successType) {
    case 'url_contains':
      return page.url().includes(successValue);
    case 'url_equals_exactly':
      return page.url() === successValue;
    default:
      // element_present and text_contains are checked asynchronously below
      return false;
  }
}

async function checkAsyncSuccessCondition(
  page: PlaywrightPage,
  successType: string,
  successValue: string,
): Promise<boolean> {
  try {
    switch (successType) {
      case 'element_present':
        await page.waitForSelector(successValue, { timeout: 500 });
        return true;
      case 'text_contains': {
        const text = await page.textContent('body');
        return text ? text.includes(successValue) : false;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function runPreAuth(opts: PreAuthOptions): Promise<void> {
  const chromium = await loadPlaywright();

  console.log('\nOpening browser for interactive login...');
  console.log(`  Login URL: ${opts.loginUrl}`);
  console.log(`  Success:   ${opts.successType} = "${opts.successValue}"`);
  console.log('\nComplete the login in the browser window.');
  console.log('Shannon will detect when you are done and continue automatically.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(opts.loginUrl, { waitUntil: 'domcontentloaded' });

    // Poll for success condition
    const deadline = Date.now() + TIMEOUT_MS;
    let authenticated = false;

    while (Date.now() < deadline) {
      // Check URL-based conditions synchronously
      if (checkSuccessCondition(page, opts.successType, opts.successValue)) {
        authenticated = true;
        break;
      }

      // Check DOM-based conditions asynchronously
      if (opts.successType === 'element_present' || opts.successType === 'text_contains') {
        if (await checkAsyncSuccessCondition(page, opts.successType, opts.successValue)) {
          authenticated = true;
          break;
        }
      }

      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    if (!authenticated) {
      console.error('\nERROR: Login timed out after 5 minutes.');
      console.error('The success condition was not met. Please try again.');
      process.exit(1);
    }

    // Capture storage state (cookies including HttpOnly + localStorage)
    const storageState = await context.storageState();

    // Write to output path
    const outputDir = path.dirname(opts.outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(opts.outputPath, JSON.stringify(storageState, null, 2), 'utf-8');

    console.log('\nAuthentication successful!');
    console.log(`Session state saved to: ${opts.outputPath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}
