// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import { PentestError } from './error-handling.js';

export type VulnType = 'injection' | 'xss' | 'auth' | 'ssrf' | 'authz';

interface VulnTypeConfigItem {
  deliverable: string;
  queue: string;
}

type VulnTypeConfig = Record<VulnType, VulnTypeConfigItem>;

interface ValidationRule {
  predicate: (existence: FileExistence) => boolean;
  errorMessage: string;
  retryable: boolean;
}

interface FileExistence {
  deliverableExists: boolean;
  queueExists: boolean;
}

interface PathsBase {
  vulnType: VulnType;
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

export interface ExploitationDecision {
  shouldExploit: boolean;
  shouldRetry: boolean;
  vulnerabilityCount: number;
  vulnType: VulnType;
}

export interface SafeValidationResult {
  success: boolean;
  data?: ExploitationDecision;
  error?: PentestError;
}

// Vulnerability type configuration as immutable data
const VULN_TYPE_CONFIG: VulnTypeConfig = Object.freeze({
  injection: Object.freeze({
    deliverable: 'injection_analysis_deliverable.md',
    queue: 'injection_exploitation_queue.json',
  }),
  xss: Object.freeze({
    deliverable: 'xss_analysis_deliverable.md',
    queue: 'xss_exploitation_queue.json',
  }),
  auth: Object.freeze({
    deliverable: 'auth_analysis_deliverable.md',
    queue: 'auth_exploitation_queue.json',
  }),
  ssrf: Object.freeze({
    deliverable: 'ssrf_analysis_deliverable.md',
    queue: 'ssrf_exploitation_queue.json',
  }),
  authz: Object.freeze({
    deliverable: 'authz_analysis_deliverable.md',
    queue: 'authz_exploitation_queue.json',
  }),
}) as VulnTypeConfig;

// Functional composition utilities - async pipe for promise chain
type PipeFunction = (x: any) => any | Promise<any>;

const pipe =
  (...fns: PipeFunction[]) =>
  (x: any): Promise<any> =>
    fns.reduce(async (v, f) => f(await v), Promise.resolve(x));

// Pure function to create validation rule
const createValidationRule = (
  predicate: (existence: FileExistence) => boolean,
  errorMessage: string,
  retryable: boolean = true
): ValidationRule => Object.freeze({ predicate, errorMessage, retryable });

// Validation rules for file existence (following QUEUE_VALIDATION_FLOW.md)
const fileExistenceRules: readonly ValidationRule[] = Object.freeze([
  // Rule 1: Neither deliverable nor queue exists
  createValidationRule(
    ({ deliverableExists, queueExists }) => deliverableExists || queueExists,
    'Analysis failed: Neither deliverable nor queue file exists. Analysis agent must create both files.'
  ),
  // Rule 2: Queue doesn't exist but deliverable exists
  createValidationRule(
    ({ deliverableExists, queueExists }) => !(!queueExists && deliverableExists),
    'Analysis incomplete: Deliverable exists but queue file missing. Analysis agent must create both files.'
  ),
  // Rule 3: Queue exists but deliverable doesn't exist
  createValidationRule(
    ({ deliverableExists, queueExists }) => !(queueExists && !deliverableExists),
    'Analysis incomplete: Queue exists but deliverable file missing. Analysis agent must create both files.'
  ),
]);

// Pure function to create file paths
const createPaths = (
  vulnType: VulnType,
  sourceDir: string
): PathsBase | PathsWithError => {
  const config = VULN_TYPE_CONFIG[vulnType];
  if (!config) {
    return {
      error: new PentestError(
        `Unknown vulnerability type: ${vulnType}`,
        'validation',
        false,
        { vulnType }
      ),
    };
  }

  return Object.freeze({
    vulnType,
    deliverable: path.join(sourceDir, 'deliverables', config.deliverable),
    queue: path.join(sourceDir, 'deliverables', config.queue),
    sourceDir,
  });
};

// Pure function to check file existence
const checkFileExistence = async (
  paths: PathsBase | PathsWithError
): Promise<PathsWithExistence | PathsWithError> => {
  if ('error' in paths) return paths;

  const [deliverableExists, queueExists] = await Promise.all([
    fs.pathExists(paths.deliverable),
    fs.pathExists(paths.queue),
  ]);

  return Object.freeze({
    ...paths,
    existence: Object.freeze({ deliverableExists, queueExists }),
  });
};

// Pure function to validate existence rules
const validateExistenceRules = (
  pathsWithExistence: PathsWithExistence | PathsWithError
): PathsWithExistence | PathsWithError => {
  if ('error' in pathsWithExistence) return pathsWithExistence;

  const { existence, vulnType } = pathsWithExistence;

  // Find the first rule that fails
  const failedRule = fileExistenceRules.find((rule) => !rule.predicate(existence));

  if (failedRule) {
    return {
      error: new PentestError(
        `${failedRule.errorMessage} (${vulnType})`,
        'validation',
        failedRule.retryable,
        {
          vulnType,
          deliverablePath: pathsWithExistence.deliverable,
          queuePath: pathsWithExistence.queue,
          existence,
        }
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
  } catch (parseError) {
    return Object.freeze({
      valid: false,
      data: null,
      error: parseError instanceof Error ? parseError.message : String(parseError),
    });
  }
};

// Pure function to read and validate queue content
const validateQueueContent = async (
  pathsWithExistence: PathsWithExistence | PathsWithError
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
            queuePath: pathsWithExistence.queue,
            originalError: queueValidation.error,
            queueStructure: queueValidation.data ? Object.keys(queueValidation.data) : [],
          }
        ),
      };
    }

    return Object.freeze({
      ...pathsWithExistence,
      queueData: queueValidation.data!,
    });
  } catch (readError) {
    return {
      error: new PentestError(
        `Failed to read queue file for ${pathsWithExistence.vulnType}: ${readError instanceof Error ? readError.message : String(readError)}`,
        'filesystem',
        false,
        {
          vulnType: pathsWithExistence.vulnType,
          queuePath: pathsWithExistence.queue,
          originalError: readError instanceof Error ? readError.message : String(readError),
        }
      ),
    };
  }
};

// Pure function to determine exploitation decision
const determineExploitationDecision = (
  validatedData: PathsWithQueue | PathsWithError
): ExploitationDecision => {
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
export const validateQueueAndDeliverable = async (
  vulnType: VulnType,
  sourceDir: string
): Promise<ExploitationDecision> =>
  (await pipe(
    () => createPaths(vulnType, sourceDir),
    checkFileExistence,
    validateExistenceRules,
    validateQueueContent,
    determineExploitationDecision
  )(() => createPaths(vulnType, sourceDir))) as ExploitationDecision;

// Pure function to safely validate (returns result instead of throwing)
export const safeValidateQueueAndDeliverable = async (
  vulnType: VulnType,
  sourceDir: string
): Promise<SafeValidationResult> => {
  try {
    const result = await validateQueueAndDeliverable(vulnType, sourceDir);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error as PentestError };
  }
};
