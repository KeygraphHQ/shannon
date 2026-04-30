// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Writes ~/.claude/settings.json with permissions.deny rules derived from
 * `code_path` avoid patterns. The SDK reads this via `settingSources: ['user']`;
 * deny rules fire even in `bypassPermissions` mode.
 */

import os from 'node:os';
import { fs, path } from 'zx';
import type { DistributedConfig } from '../types/config.js';

const FILE_TOOLS = ['Read', 'Edit'] as const;

function denyEntriesFor(pattern: string): string[] {
  const arg = `./${pattern.replace(/^[./]+/, '')}`;
  return FILE_TOOLS.map((tool) => `${tool}(${arg})`);
}

export async function writeUserSettingsForCodePathAvoids(config: DistributedConfig | null): Promise<void> {
  const avoidPatterns = (config?.avoid ?? []).filter((r) => r.type === 'code_path').map((r) => r.value);
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  if (avoidPatterns.length === 0) {
    await fs.remove(settingsPath);
    return;
  }

  const settings = {
    permissions: {
      deny: avoidPatterns.flatMap(denyEntriesFor),
    },
  };

  await fs.ensureDir(path.dirname(settingsPath));
  await fs.writeJson(settingsPath, settings, { spaces: 2 });
}
