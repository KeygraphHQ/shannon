// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * code_path "avoid" enforcement for the pi harness, delegated to the
 * @gotgenes/pi-permission-system extension.
 *
 * Each `code_path` avoid is translated into the extension's cross-cutting `path`
 * deny surface — the strongest gate, blocking file access (read/edit/write/grep/
 * find/ls) AND recognized bash file commands (cat/grep/sed/…) on any matching path,
 * across every tool and child `task` session, not overridable by a per-tool allow.
 *
 * `external_directory: allow` keeps the extension from gating the agent's legitimate
 * access outside the working directory once it is loaded (the pentest agent shells
 * out to tools/paths outside the mounted repo). When there are no avoids the config
 * is removed so the executor skips loading the extension entirely.
 */

import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { fs, path } from 'zx';
import type { DistributedConfig } from '../../types/config.js';

/** Absolute path to the pi-permission-system global config.json. */
export function permissionConfigPath(): string {
  return path.join(getAgentDir(), 'extensions', 'pi-permission-system', 'config.json');
}

/**
 * Translate one avoid value into the extension's flat-wildcard `path` patterns.
 *
 * The extension's `*` already spans path separators (no `**` globstar), and tool
 * paths are compared as absolute. A plain directory value is expanded to cover the
 * directory itself and everything under it, in both cwd-relative and prefixed
 * (absolute) positions. Glob values fold `**`→`*`; a `dir/*` contents glob also
 * denies the directory entry itself.
 */
export function toPathPatterns(value: string): string[] {
  const base = value.replace(/^[./]+/, '').replace(/\/+$/, '');
  if (!base) return [];

  if (base.includes('*') || base.includes('?')) {
    // The extension's `*` already spans path separators, so fold `**` to `*`.
    const flat = base.replace(/\*\*\//g, '*/').replace(/\*\*/g, '*');
    const tail = flat.replace(/^(?:\*\/)+/, '');
    const patterns = [flat, `*/${tail}`];
    // Depth-agnostic catch-all only for a bare-name tail (so `**/*.env` hits a
    // root-level `.env`); a structured tail would over-match sibling names.
    if (!tail.includes('/')) {
      patterns.push(tail.startsWith('*') ? tail : `*${tail}`);
    }
    // A `dir/*` contents glob should also deny the directory entry itself — the
    // contents patterns require a trailing segment and wouldn't match the folder.
    if (flat.endsWith('/*')) {
      const folder = flat.slice(0, -2);
      if (folder && !folder.includes('*')) {
        patterns.push(folder, `*/${folder}`);
      }
    }
    return [...new Set(patterns)];
  }

  return [base, `${base}/*`, `*/${base}`, `*/${base}/*`];
}

interface PermissionSystemConfig {
  permission: {
    '*': 'allow';
    path: Record<string, 'allow' | 'deny'>;
    external_directory: 'allow';
  };
}

/** Build the extension config that denies every avoid pattern across all tools. */
export function buildPermissionConfig(patterns: readonly string[]): PermissionSystemConfig {
  // Default allow first; deny entries are appended so they win (last match wins).
  const pathRules: Record<string, 'allow' | 'deny'> = { '*': 'allow' };
  for (const pattern of patterns) {
    for (const expanded of toPathPatterns(pattern)) {
      pathRules[expanded] = 'deny';
    }
  }
  return {
    permission: {
      '*': 'allow',
      path: pathRules,
      external_directory: 'allow',
    },
  };
}

/**
 * Write (or remove) the pi-permission-system config derived from `code_path`
 * avoid patterns. When there are no avoids the config is removed, so the executor
 * skips loading the extension entirely.
 */
export async function writeCodePathPermissionConfig(config: DistributedConfig | null): Promise<void> {
  const avoidPatterns = (config?.avoid ?? []).filter((r) => r.type === 'code_path').map((r) => r.value);
  const configPath = permissionConfigPath();

  if (avoidPatterns.length === 0) {
    await fs.remove(configPath);
    return;
  }

  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, buildPermissionConfig(avoidPatterns), { spaces: 2 });
}
