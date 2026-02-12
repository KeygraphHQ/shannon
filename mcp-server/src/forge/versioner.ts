// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Skill Forge — Versioner
 *
 * Manages skill version lifecycle: checkpoint, promote, reject, rollback.
 *
 * Versions are stored as files in ~/.shannon/forge/versions/{skill_id}/
 * with metadata tracked in the skill_versions table of forge.db.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getForgeDb } from './db.js';
import { hashContent } from './profiler.js';
import type { SkillVersion, ForgeConfig } from './types.js';

// ---------------------------------------------------------------------------
// Default paths
// ---------------------------------------------------------------------------

const DEFAULT_VERSIONS_DIR = path.join(os.homedir(), '.shannon', 'forge', 'versions');

function getVersionsDir(config?: Partial<ForgeConfig>): string {
  return config?.versioning?.versions_dir ?? DEFAULT_VERSIONS_DIR;
}

// ---------------------------------------------------------------------------
// Checkpoint: save the current version of a skill
// ---------------------------------------------------------------------------

/**
 * Create a checkpoint of the current skill content.
 * Returns the version_id of the saved checkpoint.
 */
export function checkpointSkill(
  skillId: string,
  content: string,
  config?: Partial<ForgeConfig>
): string {
  const db = getForgeDb(config);
  const versionsDir = getVersionsDir(config);
  const skillDir = path.join(versionsDir, skillId);

  // Ensure directory exists
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true });
  }

  // Determine version number
  const existingVersions = db.getVersions(skillId);
  const nextNum = existingVersions.length + 1;
  const versionId = `v${nextNum}`;

  // Write content to file
  const contentHash = hashContent(content);
  const filename = `${versionId}.txt`;
  const contentPath = path.join(skillDir, filename);
  fs.writeFileSync(contentPath, content, 'utf-8');

  // Check if this is the first version — make it active by default
  const isFirst = existingVersions.length === 0;

  // Record in database
  const version: Omit<SkillVersion, 'id'> = {
    skill_id: skillId,
    version_id: versionId,
    created_at: new Date().toISOString(),
    content_hash: contentHash,
    content_path: contentPath,
    is_active: isFirst,
    promoted_from: null,
    promotion_reason: null,
    rollback_of: null,
  };

  db.insertVersion(version);

  return versionId;
}

// ---------------------------------------------------------------------------
// Promote: swap to a new version
// ---------------------------------------------------------------------------

/**
 * Promote a candidate version to active.
 * Records the promotion reason and deactivates the old version.
 */
export function promoteVersion(
  skillId: string,
  candidateVersionId: string,
  reason: string,
  config?: Partial<ForgeConfig>
): void {
  const db = getForgeDb(config);

  // Get previous active version
  const previousActive = db.getActiveVersion(skillId);

  // Set new active version
  db.setActiveVersion(skillId, candidateVersionId);

  // Update the candidate's metadata with promotion info
  const versions = db.getVersions(skillId);
  const candidate = versions.find((v) => v.version_id === candidateVersionId);
  if (candidate) {
    candidate.promoted_from = previousActive?.version_id ?? null;
    candidate.promotion_reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Rollback: revert to a previous version
// ---------------------------------------------------------------------------

/**
 * Roll back to a specific previous version.
 * Creates a new version entry that references the rollback source.
 */
export function rollbackVersion(
  skillId: string,
  targetVersionId: string,
  config?: Partial<ForgeConfig>
): string {
  const db = getForgeDb(config);

  // Verify target version exists
  const versions = db.getVersions(skillId);
  const targetVersion = versions.find((v) => v.version_id === targetVersionId);
  if (!targetVersion) {
    throw new Error(`Version ${targetVersionId} not found for skill ${skillId}`);
  }

  // Read the target version's content
  if (!fs.existsSync(targetVersion.content_path)) {
    throw new Error(`Version file not found: ${targetVersion.content_path}`);
  }
  const content = fs.readFileSync(targetVersion.content_path, 'utf-8');

  // Create a new version as rollback
  const versionsDir = getVersionsDir(config);
  const skillDir = path.join(versionsDir, skillId);
  const nextNum = versions.length + 1;
  const rollbackVersionId = `v${nextNum}`;
  const filename = `${rollbackVersionId}.txt`;
  const contentPath = path.join(skillDir, filename);
  fs.writeFileSync(contentPath, content, 'utf-8');

  const rollbackEntry: Omit<SkillVersion, 'id'> = {
    skill_id: skillId,
    version_id: rollbackVersionId,
    created_at: new Date().toISOString(),
    content_hash: targetVersion.content_hash,
    content_path: contentPath,
    is_active: true,
    promoted_from: null,
    promotion_reason: `Rollback to ${targetVersionId}`,
    rollback_of: targetVersionId,
  };

  db.insertVersion(rollbackEntry);
  db.setActiveVersion(skillId, rollbackVersionId);

  return rollbackVersionId;
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Get the content of a specific version.
 */
export function getVersionContent(
  skillId: string,
  versionId: string,
  config?: Partial<ForgeConfig>
): string | null {
  const db = getForgeDb(config);
  const versions = db.getVersions(skillId);
  const version = versions.find((v) => v.version_id === versionId);
  if (!version) return null;

  try {
    return fs.readFileSync(version.content_path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Get the active version's content for a skill.
 */
export function getActiveVersionContent(
  skillId: string,
  config?: Partial<ForgeConfig>
): string | null {
  const db = getForgeDb(config);
  const active = db.getActiveVersion(skillId);
  if (!active) return null;

  try {
    return fs.readFileSync(active.content_path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * List all versions for a skill with their metadata.
 */
export function listVersions(
  skillId: string,
  config?: Partial<ForgeConfig>
): SkillVersion[] {
  const db = getForgeDb(config);
  return db.getVersions(skillId);
}

/**
 * Enforce max versions limit: remove oldest non-active versions.
 */
export function pruneVersions(
  skillId: string,
  config?: Partial<ForgeConfig>
): number {
  const maxVersions = config?.versioning?.max_versions_per_skill ?? 10;
  const db = getForgeDb(config);
  const versions = db.getVersions(skillId);

  if (versions.length <= maxVersions) return 0;

  // Sort by id (oldest first), skip active
  const prunable = versions
    .filter((v) => !v.is_active)
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

  const toRemove = prunable.slice(0, versions.length - maxVersions);
  let removed = 0;

  for (const version of toRemove) {
    try {
      if (fs.existsSync(version.content_path)) {
        fs.unlinkSync(version.content_path);
      }
      removed++;
    } catch {
      // Best-effort cleanup
    }
  }

  return removed;
}
