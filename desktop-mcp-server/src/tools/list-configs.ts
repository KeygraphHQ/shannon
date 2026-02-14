/**
 * list_configs Tool
 *
 * Lists available YAML configuration files in the configs/ directory.
 * Reads and summarizes each config's contents.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import type { PathResolver } from '../infrastructure/path-resolver.js';
import { toolSuccess, type ToolResult, type Config } from '../types.js';

interface ConfigSummary {
  name: string;
  path: string;
  hasAuthentication: boolean;
  loginType: string | null;
  avoidRules: number;
  focusRules: number;
}

export async function listConfigs(paths: PathResolver): Promise<ToolResult> {
  const configNames = await paths.listConfigs();

  const configs: ConfigSummary[] = [];
  for (const name of configNames) {
    const configPath = path.join(paths.configsDir, name);
    const summary = await summarizeConfig(name, configPath);
    configs.push(summary);
  }

  return toolSuccess({
    total: configs.length,
    configsDir: paths.configsDir,
    configs,
  });
}

async function summarizeConfig(name: string, configPath: string): Promise<ConfigSummary> {
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const parsed = yaml.load(content, { schema: yaml.FAILSAFE_SCHEMA }) as Config | null;

    if (!parsed || typeof parsed !== 'object') {
      return {
        name,
        path: configPath,
        hasAuthentication: false,
        loginType: null,
        avoidRules: 0,
        focusRules: 0,
      };
    }

    return {
      name,
      path: configPath,
      hasAuthentication: !!parsed.authentication,
      loginType: parsed.authentication?.login_type ?? null,
      avoidRules: parsed.rules?.avoid?.length ?? 0,
      focusRules: parsed.rules?.focus?.length ?? 0,
    };
  } catch {
    return {
      name,
      path: configPath,
      hasAuthentication: false,
      loginType: null,
      avoidRules: 0,
      focusRules: 0,
    };
  }
}
