/** TOML config writer for ~/.shannon/config.toml. */

import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'smol-toml';
import { getConfigFile } from '../home.js';

// === Types ===

export interface ShannonConfig {
  core?: { max_tokens?: number };
  anthropic?: { api_key?: string; oauth_token?: string };
  custom_base_url?: { base_url?: string; auth_token?: string };
  bedrock?: { use?: boolean; region?: string; token?: string };
  vertex?: { use?: boolean; region?: string; project_id?: string; key_path?: string };
  router?: { default?: string; openai_key?: string; openrouter_key?: string };
  models?: { small?: string; medium?: string; large?: string };
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
