// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * CI/CD Integration Module
 * Handles GitHub Actions and GitLab CI integration with proper exit codes
 */

import type { CiConfig, CiPlatform } from '../types/config.js';
import type { Finding, Severity } from '../findings/types.js';

export interface CiOptions {
  enabled: boolean;
  platforms: CiPlatform[];
  failOn: Severity;
  generateSarif: boolean;
  generateGitlabSast: boolean;
}

// Severity ranking for comparison (higher = more severe)
const SEVERITY_RANK: Readonly<Record<Severity, number>> = Object.freeze({
  Info: 1,
  Low: 2,
  Medium: 3,
  High: 4,
  Critical: 5,
});

// Valid severity values for validation
const VALID_SEVERITIES = new Set<string>(['Critical', 'High', 'Medium', 'Low', 'Info']);

// Valid platforms
const VALID_PLATFORMS = new Set<string>(['github', 'gitlab']);

/**
 * Validate and normalize severity string
 */
const normalizeSeverity = (severity: string | undefined, defaultValue: Severity): Severity => {
  if (!severity) return defaultValue;
  
  // Handle case-insensitive matching
  const normalized = severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
  
  if (VALID_SEVERITIES.has(normalized)) {
    return normalized as Severity;
  }
  
  console.warn(`⚠️  Invalid severity "${severity}", using default "${defaultValue}"`);
  return defaultValue;
};

/**
 * Validate and normalize platforms array
 */
const normalizePlatforms = (platforms: string[] | undefined): CiPlatform[] => {
  if (!platforms || platforms.length === 0) {
    return ['github', 'gitlab'];
  }

  const normalized: CiPlatform[] = [];
  const invalid: string[] = [];

  for (const platform of platforms) {
    const lower = platform.toLowerCase().trim();
    if (VALID_PLATFORMS.has(lower)) {
      normalized.push(lower as CiPlatform);
    } else {
      invalid.push(platform);
    }
  }

  if (invalid.length > 0) {
    console.warn(`⚠️  Invalid CI platforms ignored: ${invalid.join(', ')}`);
  }

  if (normalized.length === 0) {
    console.warn('⚠️  No valid CI platforms specified, using defaults');
    return ['github', 'gitlab'];
  }

  return normalized;
};

/**
 * Resolve CI options from config and CLI arguments
 * CLI arguments take precedence over config values
 */
export const resolveCiOptions = (
  config: CiConfig | undefined,
  cli: Partial<CiOptions>
): CiOptions => {
  // Determine if CI is enabled (CLI takes precedence)
  const enabled = cli.enabled ?? config?.enabled ?? false;

  // If not enabled, return minimal options
  if (!enabled) {
    return {
      enabled: false,
      platforms: ['github', 'gitlab'],
      failOn: 'High',
      generateSarif: true,
      generateGitlabSast: true,
    };
  }

  // Resolve platforms with validation
  const platforms = cli.platforms ?? normalizePlatforms(config?.platforms);

  // Resolve failOn with validation
  const failOn = cli.failOn ?? normalizeSeverity(config?.fail_on, 'High');

  // Resolve artifact generation flags
  const generateSarif = cli.generateSarif ?? config?.generate_sarif ?? true;
  const generateGitlabSast = cli.generateGitlabSast ?? config?.generate_gitlab_sast ?? true;

  return {
    enabled,
    platforms,
    failOn,
    generateSarif,
    generateGitlabSast,
  };
};

/**
 * Compute CI exit code based on findings and threshold
 * Returns 0 for success (no findings at or above threshold)
 * Returns 1 for failure (findings at or above threshold exist)
 */
export const computeCiExitCode = (
  findings: Finding[] | null | undefined,
  failOn: Severity
): number => {
  // Handle null/undefined findings gracefully
  if (!findings || !Array.isArray(findings)) {
    console.warn('⚠️  No findings array provided, assuming success');
    return 0;
  }

  // Handle empty findings
  if (findings.length === 0) {
    return 0;
  }

  // Get threshold rank
  const threshold = SEVERITY_RANK[failOn];
  if (threshold === undefined) {
    console.warn(`⚠️  Invalid failOn severity "${failOn}", using High as default`);
    return computeCiExitCode(findings, 'High');
  }

  // Check if any finding meets or exceeds threshold
  const shouldFail = findings.some((finding) => {
    // Handle missing or invalid severity
    if (!finding || typeof finding !== 'object') {
      console.warn('⚠️  Invalid finding object encountered');
      return false;
    }

    const findingSeverity = finding.severity;
    if (!findingSeverity || !VALID_SEVERITIES.has(findingSeverity)) {
      console.warn(`⚠️  Finding "${finding.id || 'unknown'}" has invalid severity "${findingSeverity}"`);
      return false;
    }

    const findingRank = SEVERITY_RANK[findingSeverity as Severity];
    return findingRank >= threshold;
  });

  return shouldFail ? 1 : 0;
};

/**
 * Get summary of findings by severity for CI output
 */
export const getFindingsSummary = (findings: Finding[] | null | undefined): Record<Severity, number> => {
  const summary: Record<Severity, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
    Info: 0,
  };

  if (!findings || !Array.isArray(findings)) {
    return summary;
  }

  for (const finding of findings) {
    if (finding?.severity && VALID_SEVERITIES.has(finding.severity)) {
      summary[finding.severity as Severity]++;
    }
  }

  return summary;
};

/**
 * Generate CI status message for output
 */
export const getCiStatusMessage = (
  findings: Finding[] | null | undefined,
  options: CiOptions
): string => {
  const summary = getFindingsSummary(findings);
  const exitCode = computeCiExitCode(findings, options.failOn);
  const total = Object.values(summary).reduce((a, b) => a + b, 0);

  const lines: string[] = [
    `Shannon Security Scan Results`,
    `=============================`,
    `Total findings: ${total}`,
    ``,
    `By severity:`,
    `  Critical: ${summary.Critical}`,
    `  High:     ${summary.High}`,
    `  Medium:   ${summary.Medium}`,
    `  Low:      ${summary.Low}`,
    `  Info:     ${summary.Info}`,
    ``,
    `Fail threshold: ${options.failOn}`,
    `Exit code: ${exitCode}`,
    `Status: ${exitCode === 0 ? 'PASSED ✓' : 'FAILED ✗'}`,
  ];

  return lines.join('\n');
};

/**
 * Check if CI environment is detected
 */
export const detectCiEnvironment = (): {
  detected: boolean;
  platform?: 'github' | 'gitlab' | 'other';
  details?: Record<string, string>;
} => {
  // GitHub Actions
  if (process.env.GITHUB_ACTIONS === 'true') {
    return {
      detected: true,
      platform: 'github',
      details: {
        workflow: process.env.GITHUB_WORKFLOW || 'unknown',
        runId: process.env.GITHUB_RUN_ID || 'unknown',
        repository: process.env.GITHUB_REPOSITORY || 'unknown',
      },
    };
  }

  // GitLab CI
  if (process.env.GITLAB_CI === 'true') {
    return {
      detected: true,
      platform: 'gitlab',
      details: {
        pipelineId: process.env.CI_PIPELINE_ID || 'unknown',
        projectPath: process.env.CI_PROJECT_PATH || 'unknown',
        jobName: process.env.CI_JOB_NAME || 'unknown',
      },
    };
  }

  // Generic CI detection
  if (process.env.CI === 'true' || process.env.CONTINUOUS_INTEGRATION === 'true') {
    return {
      detected: true,
      platform: 'other',
    };
  }

  return { detected: false };
};
