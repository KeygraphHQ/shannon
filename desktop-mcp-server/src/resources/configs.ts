/**
 * Config Resources Provider
 *
 * Exposes config YAML files as MCP resources.
 * URI pattern: shannon://configs/{filename}
 */

import fs from 'fs/promises';
import path from 'path';
import type { PathResolver } from '../infrastructure/path-resolver.js';
import type { ResourceEntry } from './audit-logs.js';

/**
 * List all config file resources.
 */
export async function listConfigResources(paths: PathResolver): Promise<ResourceEntry[]> {
  const configNames = await paths.listConfigs();

  return configNames.map((name) => ({
    uri: `shannon://configs/${name}`,
    name,
    mimeType: 'text/yaml',
    description: `Shannon configuration file: ${name}`,
  }));
}

/**
 * Read a specific config resource.
 */
export async function readConfigResource(
  paths: PathResolver,
  filename: string
): Promise<string | null> {
  const configPath = path.join(paths.configsDir, filename);

  // Prevent path traversal
  const resolved = path.resolve(configPath);
  if (!resolved.startsWith(paths.configsDir)) return null;

  try {
    return await fs.readFile(resolved, 'utf8');
  } catch {
    return null;
  }
}
