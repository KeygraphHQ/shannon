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

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { DistributedConfig } from '../../types/config.js';

const PERMISSION_EXTENSION_ID = 'pi-permission-system';

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
  // Strip only leading path prefixes ("/", "./", "../"); preserve a dotfile's dot
  // (so `.env` stays `.env`, not `env`).
  const base = value.replace(/^(?:\.{0,2}\/)+/, '').replace(/\/+$/, '');
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

/** Path to the extension's global config under the agent directory. */
export function permissionSystemConfigPath(agentDir: string): string {
  return path.join(agentDir, 'extensions', PERMISSION_EXTENSION_ID, 'config.json');
}

/** True when a pi-permission-system config has been written (avoid rules exist). */
export function permissionSystemConfigExists(agentDir: string): boolean {
  return fs.existsSync(permissionSystemConfigPath(agentDir));
}

/**
 * Sync the distributed config's `code_path` avoids into the extension's global
 * config (`<agentDir>/extensions/pi-permission-system/config.json`). When there
 * are no avoids the config is removed so the executor skips loading the extension.
 *
 * Global (not project) config is used deliberately: it loads synchronously at
 * extension init without depending on a session_start/ctx, it keeps the config
 * out of the scanned repo, and it is idempotent across the agents of one run.
 */
export function syncPermissionSystemConfig(config: DistributedConfig | null): void {
  const configPath = permissionSystemConfigPath(getAgentDir());
  const avoidRules = (config?.avoid ?? []).filter((r) => r.type === 'code_path');

  if (avoidRules.length === 0) {
    fs.rmSync(configPath, { force: true });
    return;
  }

  // Single-repo (fixed mount): patterns are the raw avoid values.
  const patterns = avoidRules.map((r) => r.value);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(buildPermissionConfig(patterns), null, 2));
}

/**
 * Absolute path to the installed @gotgenes/pi-permission-system package directory,
 * suitable for `DefaultResourceLoader`'s `additionalExtensionPaths`. The loader
 * reads the package's `pi.extensions` manifest and loads the extension itself.
 *
 * The package's `.` export points at its service module, so we resolve that and
 * walk up to the package root. Throws if the package is not resolvable.
 */
export function permissionSystemPackageDir(): string {
  const require = createRequire(import.meta.url);
  const servicePath = require.resolve('@gotgenes/pi-permission-system');
  return path.resolve(path.dirname(servicePath), '..');
}
