/** TOML config writer for ~/.shannon/config.toml. */

import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'smol-toml';
import { getConfigFile } from '../home.js';

// === Types ===

export interface ShannonConfig {
  core?: { model?: string; base_url?: string };
  anthropic?: { api_key?: string; oauth_token?: string };
  openai?: { api_key?: string; format?: string };
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
