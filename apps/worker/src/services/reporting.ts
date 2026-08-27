// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import { ASSEMBLED_REPORT_FILENAME, deliverablesDir } from '../paths.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { ErrorCode } from '../types/errors.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import { PentestError } from './error-handling.js';
import { renderExploitDeliverable } from './exploit-renderer.js';
import { readCommittedFile } from './git-manager.js';
import { surfaceReportOutputs } from './report-output-surface.js';

interface DeliverableFile {
  vulnerabilityClass: ReconciliationClass;
  name: string;
  /** Candidate filenames in priority order. First one that exists wins. */
  paths: readonly string[];
  required: boolean;
}

const DELIVERABLE_BY_CLASS: Readonly<
  Record<ReconciliationClass, { readonly name: string; readonly exploit: string; readonly analysis: string }>
> = Object.freeze({
  injection: {
    name: 'Injection',
    exploit: 'injection_exploitation_evidence.md',
    analysis: 'injection_findings.md',
  },
  xss: { name: 'XSS', exploit: 'xss_exploitation_evidence.md', analysis: 'xss_findings.md' },
  auth: {
    name: 'Authentication',
    exploit: 'auth_exploitation_evidence.md',
    analysis: 'auth_findings.md',
  },
  ssrf: { name: 'SSRF', exploit: 'ssrf_exploitation_evidence.md', analysis: 'ssrf_findings.md' },
  authz: {
    name: 'Authorization',
    exploit: 'authz_exploitation_evidence.md',
    analysis: 'authz_findings.md',
  },
  miscellaneous: {
    name: 'Miscellaneous',
    exploit: 'miscellaneous_exploitation_evidence.md',
    analysis: 'miscellaneous_findings.md',
  },
});

// `miscellaneous` is absent on purpose: it joins the report only when the workflow passes it in
// `participatingClasses`, since the class exists only on runs that produced miscellaneous-class tasks.
const DEFAULT_REPORT_CLASS_ORDER = [
  'injection',
  'xss',
  'auth',
  'ssrf',
  'authz',
] as const satisfies readonly ReconciliationClass[];

export interface AssembleFinalReportOptions {
  /** Explicit mode prevents an exploitative report from falling back to analysis artifacts. */
  readonly exploit?: boolean;
  /** Caller-owned order is preserved verbatim. */
  readonly participatingClasses?: readonly ReconciliationClass[];
  /** Classes already known to have failed during analysis-only findings rendering. */
  readonly knownFailedClasses?: readonly ReconciliationClass[];
}

export interface AssembleFinalReportResult {
  readonly content: string;
  readonly failedClasses: readonly ReconciliationClass[];
}

/**
 * Distinguish an assessed class with no actionable findings from a class whose exploit evidence
 * disappeared. The committed reconciled queue is authoritative across retries and resume; the
 * workflow's in-memory skipped-agent list is not.
 */
async function renderCommittedEmptyClass(dir: string, vulnerabilityClass: ReconciliationClass): Promise<string | null> {
  const queueRead = await readCommittedFile(dir, `${vulnerabilityClass}_exploitation_queue.json`);
  if (queueRead.state !== 'present') return null;

  let queue: unknown;
  try {
    queue = JSON.parse(queueRead.contents) as unknown;
  } catch {
    return null;
  }
  if (
    queue === null ||
    typeof queue !== 'object' ||
    !Array.isArray((queue as { vulnerabilities?: unknown }).vulnerabilities) ||
    (queue as { vulnerabilities: unknown[] }).vulnerabilities.length !== 0
  ) {
    return null;
  }

  return renderExploitDeliverable(vulnerabilityClass, [], new Map());
}

async function assembleFinalReportInternal(
  sourceDir: string,
  deliverablesSubdir: string | undefined,
  logger: ActivityLogger,
  options: AssembleFinalReportOptions,
  collectClassFailures: boolean,
): Promise<AssembleFinalReportResult> {
  const participatingClasses = options.participatingClasses ?? DEFAULT_REPORT_CLASS_ORDER;
  const deliverableFiles: readonly DeliverableFile[] = participatingClasses.map((vulnerabilityClass) => {
    const definition = DELIVERABLE_BY_CLASS[vulnerabilityClass];
    let paths: readonly string[];
    if (options.exploit === true) {
      paths = [definition.exploit];
    } else if (options.exploit === false) {
      paths = [definition.analysis];
    } else {
      paths = [definition.exploit, definition.analysis];
    }
    return { vulnerabilityClass, name: definition.name, paths, required: false };
  });

  const dir = deliverablesDir(sourceDir, deliverablesSubdir);
  const sections: string[] = [];
  const failedClassSet = new Set(options.knownFailedClasses ?? []);

  for (const file of deliverableFiles) {
    if (failedClassSet.has(file.vulnerabilityClass)) {
      logger.warn(`${file.name}: omitted because findings rendering failed`);
      continue;
    }
    let added = false;
    for (const candidate of file.paths) {
      try {
        // Exploit runs assemble from committed Git state, not the worktree: evidence is only
        // trustworthy once checkpointed, and a corrupt committed object is a class failure
        // rather than a silently skipped section.
        if (options.exploit === true) {
          const committed = await readCommittedFile(dir, candidate);
          if (committed.state === 'corrupt') {
            throw new Error('committed artifact is corrupt');
          }
          if (committed.state === 'present') {
            sections.push(committed.contents);
            logger.info(`Added ${file.name} section from ${candidate}`);
            added = true;
            break;
          }
        } else {
          const filePath = path.join(dir, candidate);
          if (!(await fs.pathExists(filePath))) continue;
          const content = await fs.readFile(filePath, 'utf8');
          sections.push(content);
          logger.info(`Added ${file.name} section from ${candidate}`);
          added = true;
          break;
        }
      } catch (error) {
        if (!collectClassFailures) throw error;
        const err = error as Error;
        logger.warn(`Could not read ${candidate}: ${err.message}`);
        failedClassSet.add(file.vulnerabilityClass);
        break;
      }
    }
    if (!added && options.exploit === true && !failedClassSet.has(file.vulnerabilityClass)) {
      const emptyClassSection = await renderCommittedEmptyClass(dir, file.vulnerabilityClass);
      if (emptyClassSection !== null) {
        sections.push(emptyClassSection);
        logger.info(`Added ${file.name} section from its committed empty exploitation queue`);
        added = true;
      }
    }
    if (!added) {
      if (file.required) {
        throw new PentestError(
          `Required deliverable file not found: ${file.paths.join(' or ')}`,
          'filesystem',
          false,
          { deliverableFile: file.paths, sourceDir },
          ErrorCode.DELIVERABLE_NOT_FOUND,
        );
      }
      logger.info(`No ${file.name} deliverable found`);
      failedClassSet.add(file.vulnerabilityClass);
    }
  }

  const finalContent = sections.join('\n\n');
  const finalReportPath = path.join(dir, ASSEMBLED_REPORT_FILENAME);

  try {
    await fs.ensureDir(dir);
    await fs.writeFile(finalReportPath, finalContent);
    logger.info(`Final report assembled at ${finalReportPath}`);
  } catch (error) {
    const err = error as Error;
    throw new PentestError(`Failed to write final report: ${err.message}`, 'filesystem', false, {
      finalReportPath,
      originalError: err.message,
    });
  }

  return {
    content: finalContent,
    failedClasses: participatingClasses.filter((vulnerabilityClass) => failedClassSet.has(vulnerabilityClass)),
  };
}

/**
 * Assemble report inputs while returning class-local omissions for `not_assessed` integration.
 * Canonical output write failures still throw.
 */
export async function assembleFinalReportWithEvidence(
  sourceDir: string,
  deliverablesSubdir: string | undefined,
  logger: ActivityLogger,
  options: AssembleFinalReportOptions = {},
): Promise<AssembleFinalReportResult> {
  return assembleFinalReportInternal(sourceDir, deliverablesSubdir, logger, options, true);
}

/**
 * Assemble the final report from per-class deliverables and return only the content. With an
 * explicit exploit mode each class reads exactly its evidence or findings file; without one,
 * evidence is preferred and findings are the fallback. The boolean form of the last parameter
 * is shorthand for `{ exploit }`. In exploit mode a read failure throws instead of being
 * collected, because canonical evidence assembly must not silently omit a class.
 */
export async function assembleFinalReport(
  sourceDir: string,
  deliverablesSubdir: string | undefined,
  logger: ActivityLogger,
  optionsOrExploit: AssembleFinalReportOptions | boolean = {},
): Promise<string> {
  const options: AssembleFinalReportOptions =
    typeof optionsOrExploit === 'boolean' ? { exploit: optionsOrExploit } : optionsOrExploit;
  const result = await assembleFinalReportInternal(
    sourceDir,
    deliverablesSubdir,
    logger,
    options,
    options.exploit !== true,
  );
  return result.content;
}

/**
 * Surface the run's deliverables at the run directory's top level, so a customer opening the run
 * folder sees the report without digging through internals. Sources stay in the deliverables dir
 * (git-checkpointed, used by resume). Both the PDF and the markdown report are surfaced here as the
 * customer-facing copies.
 *
 * The SARIF log is surfaced beside it when present, since a CI step consuming it needs a stable
 * path and cannot be expected to reach into the internals directory. It is absent whenever the
 * run was analysis-only or `report.sarif` was set to false.
 */
export async function copyReportToRunRoot(
  repoPath: string,
  deliverablesSubdir: string | undefined,
  runDir: string,
  logger: ActivityLogger,
): Promise<void> {
  const dir = deliverablesDir(repoPath, deliverablesSubdir);
  await surfaceReportOutputs({ deliverablesDir: dir, customerDir: runDir, logger });
}
