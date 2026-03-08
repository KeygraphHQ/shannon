// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Pre-recon cache service.
 *
 * Manages cached pre-recon deliverables to avoid redundant full scans.
 * When a cached analysis exists and source code has changed, provides
 * git diff context for the delta agent to produce an incremental update.
 */

import path from 'path';
import fs from 'fs/promises';
import { $ } from 'zx';
import { fileExists, readJson, atomicWrite } from '../utils/file-io.js';
import type { ActivityLogger } from '../types/activity-logger.js';

interface PrereconCacheMetadata {
  commitHash: string;
  timestamp: string;
  repoId: string;
}

export type CacheCheckResult =
  | { action: 'full' }
  | { action: 'skip' }
  | { action: 'delta'; diffSummary: string; cachedAnalysis: string };

const CACHE_FILENAME = '.prerecon-cache.json';
const DELIVERABLE_FILENAME = 'code_analysis_deliverable.md';

/**
 * Get a stable identifier for the repo (git remote URL or folder name).
 */
async function getRepoId(repoPath: string): Promise<string> {
  try {
    const result = await $`cd ${repoPath} && git remote get-url origin`.quiet();
    return result.stdout.trim();
  } catch {
    return path.basename(repoPath);
  }
}

/**
 * Check whether a commit exists in the repo's history.
 */
async function commitExists(repoPath: string, commitHash: string): Promise<boolean> {
  try {
    await $`cd ${repoPath} && git cat-file -t ${commitHash}`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current HEAD commit hash.
 */
async function getHeadCommit(repoPath: string): Promise<string> {
  const result = await $`cd ${repoPath} && git rev-parse HEAD`.quiet();
  return result.stdout.trim();
}

/**
 * Generate a diff summary between two commits.
 * Returns a compact summary including file list and stats.
 */
async function generateDiffSummary(
  repoPath: string,
  fromCommit: string,
  toCommit: string
): Promise<string> {
  // 1. Get list of changed files with stats
  const diffStat = await $`cd ${repoPath} && git diff --stat ${fromCommit}..${toCommit}`.quiet();

  // 2. Get the actual diff (truncated for very large diffs)
  const diffResult = await $`cd ${repoPath} && git diff ${fromCommit}..${toCommit}`.quiet();
  const fullDiff = diffResult.stdout;

  const MAX_DIFF_LENGTH = 100_000;
  const diff = fullDiff.length > MAX_DIFF_LENGTH
    ? fullDiff.slice(0, MAX_DIFF_LENGTH) + '\n\n[... diff truncated, too large to include in full ...]'
    : fullDiff;

  return `## Changed Files Summary\n\n\`\`\`\n${diffStat.stdout}\`\`\`\n\n## Full Diff\n\n\`\`\`diff\n${diff}\n\`\`\``;
}

/**
 * Check the pre-recon cache and determine what action to take.
 *
 * Returns:
 * - { action: 'full' } — no cache or invalid, run full pre-recon
 * - { action: 'skip' } — cache is current, skip pre-recon
 * - { action: 'delta', diffSummary, cachedAnalysis } — cache exists but code changed
 */
export async function checkPrereconCache(
  repoPath: string,
  logger: ActivityLogger
): Promise<CacheCheckResult> {
  const deliverablesDir = path.join(repoPath, 'deliverables');
  const cachePath = path.join(deliverablesDir, CACHE_FILENAME);
  const deliverablePath = path.join(deliverablesDir, DELIVERABLE_FILENAME);

  // 1. Check if cache metadata exists
  if (!await fileExists(cachePath)) {
    logger.info('No pre-recon cache found, running full analysis');
    return { action: 'full' };
  }

  // 2. Check if deliverable exists
  if (!await fileExists(deliverablePath)) {
    logger.info('Cache metadata exists but deliverable missing, running full analysis');
    return { action: 'full' };
  }

  // 3. Parse cache metadata
  let metadata: PrereconCacheMetadata;
  try {
    metadata = await readJson<PrereconCacheMetadata>(cachePath);
  } catch {
    logger.warn('Failed to parse cache metadata, running full analysis');
    return { action: 'full' };
  }

  // 4. Validate cached commit exists in repo history
  if (!await commitExists(repoPath, metadata.commitHash)) {
    logger.warn(`Cached commit ${metadata.commitHash} not found in repo history, running full analysis`);
    return { action: 'full' };
  }

  // 5. Compare cached commit to current HEAD
  let headCommit: string;
  try {
    headCommit = await getHeadCommit(repoPath);
  } catch {
    logger.warn('Failed to get HEAD commit, running full analysis');
    return { action: 'full' };
  }

  if (metadata.commitHash === headCommit) {
    logger.info('Source code unchanged since last pre-recon, skipping');
    return { action: 'skip' };
  }

  // 6. Generate diff summary for delta agent
  try {
    logger.info(`Source code changed (${metadata.commitHash.slice(0, 8)}..${headCommit.slice(0, 8)}), preparing delta analysis`);
    const diffSummary = await generateDiffSummary(repoPath, metadata.commitHash, headCommit);
    const cachedAnalysis = await fs.readFile(deliverablePath, 'utf8');

    return { action: 'delta', diffSummary, cachedAnalysis };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to generate diff summary: ${errMsg}, running full analysis`);
    return { action: 'full' };
  }
}

/**
 * Save pre-recon cache metadata after a successful analysis.
 */
export async function savePrereconCache(
  repoPath: string,
  logger: ActivityLogger
): Promise<void> {
  const deliverablesDir = path.join(repoPath, 'deliverables');
  const cachePath = path.join(deliverablesDir, CACHE_FILENAME);

  const headCommit = await getHeadCommit(repoPath);
  const repoId = await getRepoId(repoPath);

  const metadata: PrereconCacheMetadata = {
    commitHash: headCommit,
    timestamp: new Date().toISOString(),
    repoId,
  };

  await atomicWrite(cachePath, metadata);
  logger.info(`Pre-recon cache saved at commit ${headCommit.slice(0, 8)}`);
}
