/**
 * `shannon auth` command — interactive pre-authentication.
 *
 * Opens a visible browser for the user to complete OAuth/SSO login (e.g.,
 * Google Sign-In with 2FA). Captures the authenticated session state and
 * saves it so `shannon start` can distribute it to agents.
 *
 * Requires: login_type "interactive" in the YAML config.
 * Requires: Playwright installed on the host (npm install -g playwright).
 */

import fs from 'node:fs';
import path from 'node:path';
import { runPreAuth } from '../auth/pre-auth.js';
import { getWorkspacesDir, initHome } from '../home.js';

export interface AuthArgs {
  config: string;
  workspace?: string;
}

interface AuthenticationBlock {
  login_type?: string;
  login_url?: string;
  success_condition?: {
    type?: string;
    value?: string;
  };
}

/**
 * Minimal YAML parser for extracting the authentication block.
 * Avoids adding js-yaml as a dependency — only needs login_url,
 * success_condition.type, and success_condition.value.
 */
function parseAuthFromYaml(content: string): AuthenticationBlock | null {
  const lines = content.split('\n');
  const auth: AuthenticationBlock = {};
  let inAuth = false;
  let inSuccessCondition = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const stripped = line.replace(/#.*$/, '').trimEnd();
    if (!stripped) continue;

    const indent = line.search(/\S/);

    // Top-level key
    if (indent === 0) {
      inAuth = stripped.startsWith('authentication:');
      inSuccessCondition = false;
      continue;
    }

    if (!inAuth) continue;

    // Authentication-level keys (indent 2)
    if (indent === 2 && stripped.includes('login_type:')) {
      auth.login_type = extractYamlValue(stripped);
    } else if (indent === 2 && stripped.includes('login_url:')) {
      auth.login_url = extractYamlValue(stripped);
    } else if (indent === 2 && stripped.includes('success_condition:')) {
      inSuccessCondition = true;
      auth.success_condition = {};
    } else if (indent === 2) {
      inSuccessCondition = false;
    }

    // Success condition keys (indent 4)
    if (inSuccessCondition && indent === 4) {
      if (stripped.includes('type:')) {
        auth.success_condition!.type = extractYamlValue(stripped);
      } else if (stripped.includes('value:')) {
        auth.success_condition!.value = extractYamlValue(stripped);
      }
    }
  }

  return auth.login_type ? auth : null;
}

function extractYamlValue(line: string): string {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return '';
  const raw = line.slice(colonIdx + 1).trim();
  // Strip surrounding quotes
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

export async function auth(args: AuthArgs): Promise<void> {
  initHome();

  // 1. Read and parse the config file
  const configPath = path.resolve(args.config);
  if (!fs.existsSync(configPath)) {
    console.error(`ERROR: Config file not found: ${configPath}`);
    process.exit(1);
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const authBlock = parseAuthFromYaml(configContent);

  if (!authBlock) {
    console.error('ERROR: No authentication section found in config file.');
    process.exit(1);
  }

  if (authBlock.login_type !== 'interactive') {
    console.error(`ERROR: login_type must be "interactive" for the auth command (got: "${authBlock.login_type}").`);
    console.error('The auth command is only for interactive pre-authentication (OAuth, SSO, etc.).');
    process.exit(1);
  }

  if (!authBlock.login_url) {
    console.error('ERROR: authentication.login_url is required.');
    process.exit(1);
  }

  if (!authBlock.success_condition?.type || !authBlock.success_condition?.value) {
    console.error('ERROR: authentication.success_condition (type + value) is required.');
    process.exit(1);
  }

  // 2. Resolve workspace name
  let workspaceName: string;
  if (args.workspace) {
    workspaceName = args.workspace;
  } else {
    try {
      const hostname = new URL(authBlock.login_url).hostname.replace(/[^a-zA-Z0-9-]/g, '-');
      workspaceName = `${hostname}_shannon-${Date.now()}`;
    } catch {
      console.error(`ERROR: Invalid login_url: ${authBlock.login_url}`);
      process.exit(1);
    }
  }

  // 3. Run pre-auth
  const workspacesDir = getWorkspacesDir();
  const workspaceDir = path.join(workspacesDir, workspaceName);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const authStatePath = path.join(workspaceDir, 'auth-state.json');

  await runPreAuth({
    loginUrl: authBlock.login_url,
    successType: authBlock.success_condition.type,
    successValue: authBlock.success_condition.value,
    outputPath: authStatePath,
  });

  // 4. Show next steps
  const prefix = process.env.SHANNON_LOCAL === '1' ? './shannon' : 'npx @keygraph/shannon';
  console.log(`\nNext step — start the scan with the same workspace:\n`);
  console.log(`  ${prefix} start -u <target-url> -r <repo> -c ${args.config} -w ${workspaceName}\n`);
}
