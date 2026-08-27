// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';

import type { ExploitationDecision } from '../types/agents.js';
import { ErrorCode } from '../types/errors.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import { err, ok, type Result } from '../types/result.js';
import { asyncPipe } from '../utils/functional.js';
import { PentestError } from './error-handling.js';

export type { ExploitationDecision, VulnType } from '../types/agents.js';

interface VulnTypeConfigItem {
  deliverable: string;
  queue: string;
  deliverableRequired: boolean;
}

type VulnTypeConfig = Record<ReconciliationClass, VulnTypeConfigItem>;

type ErrorMessageResolver = string | ((context: ExistenceContext) => string);

interface ValidationRule {
  predicate: (context: ExistenceContext) => boolean;
  errorMessage: ErrorMessageResolver;
  retryable: boolean;
}

interface FileExistence {
  deliverableExists: boolean;
  queueExists: boolean;
}

interface ExistenceContext {
  existence: FileExistence;
  deliverableRequired: boolean;
}

interface PathsBase {
  vulnType: ReconciliationClass;
  deliverable: string;
  queue: string;
  sourceDir: string;
}

interface PathsWithExistence extends PathsBase {
  existence: FileExistence;
}

interface PathsWithQueue extends PathsWithExistence {
  queueData: QueueData;
}

interface PathsWithError {
  error: PentestError;
}

interface QueueData {
  vulnerabilities: unknown[];
  [key: string]: unknown;
}

interface QueueValidationResult {
  valid: boolean;
  data: QueueData | null;
  error: string | null;
}

function isRetryableQueueFileSystemError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code !== undefined && !['EACCES', 'EINVAL', 'EISDIR', 'ENAMETOOLONG', 'ENOTDIR', 'EPERM'].includes(code);
}

/**
 * Result type for safe validation - explicit error handling.
 */
export type ReconciliationExploitationDecision<T extends ReconciliationClass = ReconciliationClass> = Omit<
  ExploitationDecision,
  'vulnType'
> & {
  vulnType: T;
};

export type SafeValidationResult<T extends ReconciliationClass = ReconciliationClass> = Result<
  ReconciliationExploitationDecision<T>,
  PentestError
>;

// Vulnerability type configuration as immutable data
const VULN_TYPE_CONFIG: VulnTypeConfig = Object.freeze({
  injection: Object.freeze({
    deliverable: 'injection_analysis_deliverable.md',
    queue: 'injection_exploitation_queue.json',
    deliverableRequired: true,
  }),
  xss: Object.freeze({
    deliverable: 'xss_analysis_deliverable.md',
    queue: 'xss_exploitation_queue.json',
    deliverableRequired: true,
  }),
  auth: Object.freeze({
    deliverable: 'auth_analysis_deliverable.md',
    queue: 'auth_exploitation_queue.json',
    deliverableRequired: true,
  }),
  ssrf: Object.freeze({
    deliverable: 'ssrf_analysis_deliverable.md',
    queue: 'ssrf_exploitation_queue.json',
    deliverableRequired: true,
  }),
  authz: Object.freeze({
    deliverable: 'authz_analysis_deliverable.md',
    queue: 'authz_exploitation_queue.json',
    deliverableRequired: true,
  }),
  miscellaneous: Object.freeze({
    deliverable: 'miscellaneous_analysis_deliverable.md',
    queue: 'miscellaneous_exploitation_queue.json',
    deliverableRequired: false,
  }),
}) as VulnTypeConfig;

// Pure function to create validation rule
function createValidationRule(
  predicate: (context: ExistenceContext) => boolean,
  errorMessage: ErrorMessageResolver,
  retryable: boolean = true,
): ValidationRule {
  return Object.freeze({ predicate, errorMessage, retryable });
}

// A queue is always required. Analysis-backed classes also require their analysis deliverable;
// the analysis-less `miscellaneous` class deliberately has no such artifact.
const fileExistenceRules: readonly ValidationRule[] = Object.freeze([
  createValidationRule(
    ({ existence, deliverableRequired }) =>
      existence.queueExists && (!deliverableRequired || existence.deliverableExists),
    getExistenceErrorMessage,
  ),
]);

// Generate appropriate error message based on which files are missing
function getExistenceErrorMessage({ existence, deliverableRequired }: ExistenceContext): string {
  const { deliverableExists, queueExists } = existence;

  if (!deliverableRequired) {
    return 'Analysis failed: Queue file missing. A queue is required.';
  }
  if (!deliverableExists && !queueExists) {
    return 'Analysis failed: Neither deliverable nor queue file exists. Both are required.';
  }
  if (!queueExists) {
    return 'Analysis incomplete: Deliverable exists but queue file missing. Both are required.';
  }
  return 'Analysis incomplete: Queue exists but deliverable file missing. Both are required.';
}

// Pure function to create file paths
const createPaths = (vulnType: ReconciliationClass, sourceDir: string): PathsBase | PathsWithError => {
  const config = VULN_TYPE_CONFIG[vulnType];
  if (!config) {
    return {
      error: new PentestError(`Unknown vulnerability type: ${vulnType}`, 'validation', false, { vulnType }),
    };
  }

  return Object.freeze({
    vulnType,
    deliverable: path.join(sourceDir, config.deliverable),
    queue: path.join(sourceDir, config.queue),
    sourceDir,
  });
};

// Pure function to check file existence
const checkFileExistence = async (paths: PathsBase | PathsWithError): Promise<PathsWithExistence | PathsWithError> => {
  if ('error' in paths) return paths;

  let deliverableExists: boolean;
  let queueExists: boolean;
  try {
    [deliverableExists, queueExists] = await Promise.all([
      fs.pathExists(paths.deliverable),
      fs.pathExists(paths.queue),
    ]);
  } catch (error) {
    return {
      error: new PentestError(
        'Queue validation could not inspect the required files.',
        'filesystem',
        isRetryableQueueFileSystemError(error),
        { vulnType: paths.vulnType },
      ),
    };
  }

  return Object.freeze({
    ...paths,
    existence: Object.freeze({ deliverableExists, queueExists }),
  });
};

// Validates deliverable/queue symmetry - both must exist or neither
const validateExistenceRules = (
  pathsWithExistence: PathsWithExistence | PathsWithError,
): PathsWithExistence | PathsWithError => {
  if ('error' in pathsWithExistence) return pathsWithExistence;

  const { existence, vulnType } = pathsWithExistence;
  const { deliverableRequired } = VULN_TYPE_CONFIG[vulnType];
  const context: ExistenceContext = { existence, deliverableRequired };

  // Find the first rule that fails
  const failedRule = fileExistenceRules.find((rule) => !rule.predicate(context));

  if (failedRule) {
    const message =
      typeof failedRule.errorMessage === 'function' ? failedRule.errorMessage(context) : failedRule.errorMessage;

    return {
      error: new PentestError(
        `${message} (${vulnType})`,
        'validation',
        failedRule.retryable,
        {
          vulnType,
          existence,
        },
        ErrorCode.DELIVERABLE_NOT_FOUND,
      ),
    };
  }

  return pathsWithExistence;
};

// Pure function to validate queue structure
const validateQueueStructure = (content: string): QueueValidationResult => {
  try {
    const parsed = JSON.parse(content) as unknown;
    const isValid =
      typeof parsed === 'object' &&
      parsed !== null &&
      'vulnerabilities' in parsed &&
      Array.isArray((parsed as QueueData).vulnerabilities);

    return Object.freeze({
      valid: isValid,
      data: isValid ? (parsed as QueueData) : null,
      error: null,
    });
  } catch {
    return Object.freeze({
      valid: false,
      data: null,
      error: 'invalid_json',
    });
  }
};

// Queue parse failures are retryable - agent can fix malformed JSON on retry
const validateQueueContent = async (
  pathsWithExistence: PathsWithExistence | PathsWithError,
): Promise<PathsWithQueue | PathsWithError> => {
  if ('error' in pathsWithExistence) return pathsWithExistence;

  try {
    const queueContent = await fs.readFile(pathsWithExistence.queue, 'utf8');
    const queueValidation = validateQueueStructure(queueContent);

    if (!queueValidation.valid) {
      // Rule 6: Both exist, queue invalid
      return {
        error: new PentestError(
          queueValidation.error
            ? `Queue validation failed for ${pathsWithExistence.vulnType}: Invalid JSON structure. Analysis agent must fix queue format.`
            : `Queue validation failed for ${pathsWithExistence.vulnType}: Missing or invalid 'vulnerabilities' array. Analysis agent must fix queue structure.`,
          'validation',
          true, // retryable
          {
            vulnType: pathsWithExistence.vulnType,
          },
        ),
      };
    }

    return Object.freeze({
      ...pathsWithExistence,
      queueData: queueValidation.data as QueueData,
    });
  } catch (readError) {
    return {
      error: new PentestError(
        `Queue file for ${pathsWithExistence.vulnType} could not be read.`,
        'filesystem',
        isRetryableQueueFileSystemError(readError),
        {
          vulnType: pathsWithExistence.vulnType,
        },
      ),
    };
  }
};

// Final decision: skip if queue says no vulns, proceed if vulns found, error otherwise
const determineExploitationDecision = (
  validatedData: PathsWithQueue | PathsWithError,
): ReconciliationExploitationDecision => {
  if ('error' in validatedData) {
    throw validatedData.error;
  }

  const hasVulnerabilities = validatedData.queueData.vulnerabilities.length > 0;

  // Rule 4: Both exist, queue valid and populated
  // Rule 5: Both exist, queue valid but empty
  return Object.freeze({
    shouldExploit: hasVulnerabilities,
    shouldRetry: false,
    vulnerabilityCount: validatedData.queueData.vulnerabilities.length,
    vulnType: validatedData.vulnType,
  });
};

// Main functional validation pipeline
export async function validateQueueAndDeliverable<T extends ReconciliationClass>(
  vulnType: T,
  sourceDir: string,
): Promise<ReconciliationExploitationDecision<T>> {
  return asyncPipe<ReconciliationExploitationDecision<T>>(
    createPaths(vulnType, sourceDir),
    checkFileExistence,
    validateExistenceRules,
    validateQueueContent,
    determineExploitationDecision,
  );
}

/**
 * Safely validate queue and deliverable files.
 * Returns Result<ExploitationDecision, PentestError> for explicit error handling.
 */
export async function validateQueueSafe<T extends ReconciliationClass>(
  vulnType: T,
  sourceDir: string,
): Promise<SafeValidationResult<T>> {
  try {
    const result = await validateQueueAndDeliverable(vulnType, sourceDir);
    return ok(result);
  } catch (error) {
    if (error instanceof PentestError) return err(error);
    return err(
      new PentestError('Queue validation failed closed on an internal invariant.', 'unknown', false, { vulnType }),
    );
  }
}
