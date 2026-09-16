/** TOML config writer for ~/.shannon/config.toml. */

import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'smol-toml';
import { getConfigFile } from '../home.js';

// === Types ===

export interface ShannonConfig {
  core?: { model?: string; base_url?: string };
  anthropic?: { api_key?: string; oauth_token?: string };
  openai?: { api_key?: string };
  xai?: { api_key?: string };
  bedrock?: { region?: string; token?: string };
  /** Generic credential for any provider Shannon does not curate. Maps to SHANNON_AI_API_KEY. */
  provider?: { api_key?: string };
}

// === File Operations ===

/** Write the config to ~/.shannon/config.toml with 0o600 permissions. */
export function saveConfig(config: ShannonConfig): void {
  const configPath = getConfigFile();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });

  const content = stringify(config);
  fs.writeFileSync(configPath, content, { mode: 0o600 });
}

/**
 * Set variables in a dotenv file, creating it when absent and preserving every other
 * line — including comments, blank lines, and unrelated variables. A variable already
 * present is replaced in place, so a key written by an earlier run never accumulates a
 * second definition that dotenv would resolve differently.
 *
 * Local mode reads credentials from `./.env` (npx mode reads `~/.shannon/config.toml`),
 * so this is where a credential goes when the repository is run from a clone.
 */
export function upsertEnvFile(envPath: string, values: Readonly<Record<string, string>>): void {
  const remaining = new Map(Object.entries(values));
  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : [];

  const updated = lines.map((line) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    const name = match?.[1];
    if (name === undefined || !remaining.has(name)) return line;
    const value = remaining.get(name) ?? '';
    remaining.delete(name);
    return `${name}=${value}`;
  });

  // Drop the trailing empty element a final newline produces, then append what is left.
  if (updated.length > 0 && updated[updated.length - 1] === '') updated.pop();
  for (const [name, value] of remaining) updated.push(`${name}=${value}`);

  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, `${updated.join('\n')}\n`, { mode: 0o600 });
}
