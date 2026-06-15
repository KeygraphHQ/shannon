// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Writes the @gotgenes/pi-permission-system global config from `code_path` avoid
 * patterns. The executor loads the extension (see claude-executor) and pi enforces
 * these path denies at the tool layer for every agent. Written to the global config
 * dir under `agentDir` — the project-scoped path is gated behind project trust,
 * which our headless runs do not grant; the global path is not.
 */

import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { fs, path } from 'zx';
import type { DistributedConfig } from '../types/config.js';

/** Absolute path to the pi-permission-system global config.json. */
export function permissionConfigPath(): string {
  return path.join(getAgentDir(), 'extensions', 'pi-permission-system', 'config.json');
}

/**
 * Write (or remove) the pi-permission-system config derived from `code_path`
 * avoid patterns.
 *
 * Each avoid maps to a cross-cutting `path` deny — the strongest surface, blocking
 * the path across every tool and bash command, and not overridable by a per-tool
 * allow. `"*": "allow"` keeps everything else permitted so the extension does not
 * fall back to its default `ask` (which would block all access headlessly). When
 * there are no avoids the config is removed, so the executor skips loading the
 * extension entirely.
 */
export async function writeCodePathPermissionConfig(config: DistributedConfig | null): Promise<void> {
  const avoidPatterns = (config?.avoid ?? []).filter((r) => r.type === 'code_path').map((r) => r.value);
  const configPath = permissionConfigPath();

  if (avoidPatterns.length === 0) {
    await fs.remove(configPath);
    return;
  }

  // pi's matcher (wildcard-matcher.ts) has NO `**` globstar — it splits on each `*`
  // and joins with `.*`, and a single `*` already matches any chars incl. `/`. Tool
  // paths are compared as absolute (path-utils resolves them against cwd), so we
  // collapse `**`→`*` and add a `*/`-prefixed variant that matches the path under
  // any repo prefix. (A bare pattern never matches an absolute path.)
  const pathDeny: Record<string, 'allow' | 'deny'> = { '*': 'allow' };
  for (const pattern of avoidPatterns) {
    const clean = pattern.replace(/^[./]+/, '').replace(/\*\*/g, '*');
    // Deny the contents (under any repo prefix and as written)...
    pathDeny[`*/${clean}`] = 'deny';
    pathDeny[clean] = 'deny';
    // ...and the folder path itself, so the directory entry is denied too — the
    // contents patterns (…/*) require a trailing segment and wouldn't match it.
    if (clean.endsWith('/*')) {
      const folder = clean.slice(0, -2);
      if (folder) {
        pathDeny[`*/${folder}`] = 'deny';
        pathDeny[folder] = 'deny';
      }
    }
  }

  const permissionConfig = {
    permission: {
      '*': 'allow',
      path: pathDeny,
    },
  };

  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, permissionConfig, { spaces: 2 });
}
