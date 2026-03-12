// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Incremental Scanner Service
 *
 * Detects changed files between runs using git diff to enable incremental scanning.
 * Only analyzes files that have changed since the last run, reducing LLM costs.
 */

import { $ } from 'zx';
import { fs, path } from 'zx';
import { executeGitCommandWithRetry, isGitRepository } from './git-manager.js';
import type { ActivityLogger } from '../types/activity-logger.js';

export interface ChangedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  oldPath?: string; // For renamed files
}

export interface IncrementalScanResult {
  changedFiles: ChangedFile[];
  allFiles: string[];
  scanMode: 'incremental' | 'full';
}

/**
 * Service for detecting changed files and enabling incremental scanning.
 */
export class IncrementalScanner {
  private readonly repoPath: string;
  private readonly logger: ActivityLogger;
  private readonly lastScanCommitFile: string;

  constructor(repoPath: string, workspaceDir: string, logger: ActivityLogger) {
    this.repoPath = repoPath;
    this.logger = logger;
    this.lastScanCommitFile = path.join(workspaceDir, '.last-scan-commit');
  }

  /**
   * Get the commit hash of the last scan.
   */
  private async getLastScanCommit(): Promise<string | null> {
    try {
      if (await fs.pathExists(this.lastScanCommitFile)) {
        const commitHash = (await fs.readFile(this.lastScanCommitFile, 'utf8')).trim();
        return commitHash || null;
      }
    } catch (error) {
      this.logger.warn(`Failed to read last scan commit: ${error}`);
    }
    return null;
  }

  /**
   * Save the current commit hash as the last scan commit.
   */
  async saveScanCommit(commitHash: string): Promise<void> {
    try {
      await fs.writeFile(this.lastScanCommitFile, commitHash, 'utf8');
      this.logger.info(`Saved scan commit: ${commitHash}`);
    } catch (error) {
      this.logger.warn(`Failed to save scan commit: ${error}`);
    }
  }

  /**
   * Get current git commit hash.
   */
  async getCurrentCommit(): Promise<string | null> {
    if (!(await isGitRepository(this.repoPath))) {
      return null;
    }
    try {
      const result = await executeGitCommandWithRetry(
        ['git', 'rev-parse', 'HEAD'],
        this.repoPath,
        'get current commit'
      );
      return result.stdout.trim() || null;
    } catch (error) {
      this.logger.warn(`Failed to get current commit: ${error}`);
      return null;
    }
  }

  /**
   * Get list of changed files since last scan.
   */
  async getChangedFiles(sinceCommit?: string | null): Promise<ChangedFile[]> {
    if (!(await isGitRepository(this.repoPath))) {
      this.logger.info('Not a git repository, incremental scanning disabled');
      return [];
    }

    const lastCommit = sinceCommit || (await this.getLastScanCommit());
    if (!lastCommit) {
      this.logger.info('No previous scan found, performing full scan');
      return [];
    }

    try {
      // Check if commit exists
      const commitExists = await executeGitCommandWithRetry(
        ['git', 'cat-file', '-e', lastCommit],
        this.repoPath,
        'check commit exists'
      ).then(() => true).catch(() => false);

      if (!commitExists) {
        this.logger.warn(`Previous scan commit ${lastCommit} not found, performing full scan`);
        return [];
      }

      // Get diff between last scan and current HEAD
      const diffResult = await executeGitCommandWithRetry(
        ['git', 'diff', '--name-status', '--diff-filter=ACDMR', lastCommit, 'HEAD'],
        this.repoPath,
        'get changed files'
      );

      const changedFiles: ChangedFile[] = [];
      const lines = diffResult.stdout.trim().split('\n').filter(line => line.length > 0);

      for (const line of lines) {
        const match = line.match(/^([AMD]|R\d+)\s+(.+?)(?:\s+(.+))?$/);
        if (!match) continue;

        const statusCode = match[1];
        const filePath = match[2];
        const oldPath = match[3];

        let status: ChangedFile['status'];
        if (statusCode.startsWith('R')) {
          status = 'renamed';
        } else if (statusCode === 'A') {
          status = 'added';
        } else if (statusCode === 'D') {
          status = 'deleted';
        } else {
          status = 'modified';
        }

        changedFiles.push({
          path: filePath,
          status,
          ...(oldPath && { oldPath }),
        });
      }

      this.logger.info(`Found ${changedFiles.length} changed files since last scan`);
      return changedFiles;
    } catch (error) {
      this.logger.warn(`Failed to get changed files: ${error}`);
      return [];
    }
  }

  /**
   * Get all source files in the repository.
   */
  async getAllSourceFiles(): Promise<string[]> {
    try {
      // Get all tracked files from git
      const result = await executeGitCommandWithRetry(
        ['git', 'ls-files'],
        this.repoPath,
        'get all tracked files'
      );

      const files = result.stdout
        .trim()
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => path.join(this.repoPath, line));

      // Filter to source code files (common extensions)
      const sourceExtensions = [
        '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs',
        '.php', '.rb', '.cs', '.cpp', '.c', '.h', '.swift', '.kt',
        '.scala', '.clj', '.sh', '.yaml', '.yml', '.json', '.xml',
      ];

      return files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return sourceExtensions.includes(ext);
      });
    } catch (error) {
      this.logger.warn(`Failed to get all source files: ${error}`);
      return [];
    }
  }

  /**
   * Determine scan mode and get files to analyze.
   */
  async determineScanMode(): Promise<IncrementalScanResult> {
    const changedFiles = await this.getChangedFiles();
    const allFiles = await this.getAllSourceFiles();

    if (changedFiles.length === 0) {
      this.logger.info('No changes detected, performing full scan');
      return {
        changedFiles: [],
        allFiles,
        scanMode: 'full',
      };
    }

    // For incremental scan, prioritize changed files but include related files
    const changedPaths = new Set(changedFiles.map(f => f.path));
    const filesToAnalyze = allFiles.filter(file => {
      const relPath = path.relative(this.repoPath, file);
      return changedPaths.has(relPath);
    });

    this.logger.info(
      `Incremental scan mode: ${filesToAnalyze.length} files to analyze ` +
      `(out of ${allFiles.length} total files)`
    );

    return {
      changedFiles,
      allFiles: filesToAnalyze,
      scanMode: 'incremental',
    };
  }

  /**
   * Check if incremental scanning should be enabled.
   */
  async shouldUseIncrementalScan(): Promise<boolean> {
    if (!(await isGitRepository(this.repoPath))) {
      return false;
    }

    const lastCommit = await this.getLastScanCommit();
    return lastCommit !== null;
  }
}
