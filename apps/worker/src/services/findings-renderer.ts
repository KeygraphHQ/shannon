// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Deterministic queue-JSON to findings-MD renderer.
 *
 * Used when exploit=false: the exploit agents didn't run, so there is no
 * `*_exploitation_evidence.md` to concatenate into the report. This module
 * reads each `*_exploitation_queue.json` (already validated by the submit tool against the
 * schemas in ../ai/queue-schemas.ts) and writes a `*_findings.md` per class
 * in the canonical body shape that report-executive.txt's cleanup expects.
 *
 * No LLM in the loop — every field maps directly from a JSON key.
 */

import { fs, path } from 'zx';
import type {
  AuthFinding,
  AuthzFinding,
  InjectionFinding,
  MiscellaneousFinding,
  SsrfFinding,
  XssFinding,
} from '../ai/queue-schemas.js';
import { deliverablesDir } from '../paths.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { ALL_VULN_CLASSES } from '../types/config.js';
import type { ReconciliationClass } from '../types/reconciliation.js';

const DISCLAIMER = [
  '> Exploitation phase was not run for this assessment. Each entry documents a',
  '> vulnerability identified through static analysis; live exploitation steps and',
  '> proof of impact are not included.',
].join('\n');

interface ClassConfig<T> {
  readonly heading: string;
  readonly noneFoundLabel: string;
  readonly queueFile: string;
  readonly findingsFile: string;
  readonly renderEntry: (entry: T) => string;
}

interface QueueDocument<T> {
  readonly vulnerabilities: readonly T[];
}

export interface RenderFindingsResult {
  readonly failedClasses: readonly ReconciliationClass[];
}

// === Common Render Helpers ===

function summaryRow(label: string, value: string | undefined | null | boolean): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return `- **${label}:** ${value}`;
}

function parseQueueDocument(value: unknown): QueueDocument<unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('queue document is malformed');
  }
  const vulnerabilities = (value as Record<string, unknown>).vulnerabilities;
  if (!Array.isArray(vulnerabilities)) {
    throw new Error('queue document vulnerabilities are malformed');
  }
  return { vulnerabilities };
}

function formatLocation(endpoint: string | undefined, codeLocation: string | undefined): string {
  if (endpoint && codeLocation) return `${endpoint} (${codeLocation})`;
  return endpoint ?? codeLocation ?? '';
}

/** The analysis queue carries no severity, so confidence is the only rating. */
interface CommonEntryFields {
  readonly confidence: string;
}

function buildEntry(
  id: string,
  title: string,
  common: CommonEntryFields,
  summaryRows: ReadonlyArray<string | null>,
  notes: string | undefined,
): string {
  const lines: string[] = [];
  lines.push(`### ${id}: ${title}`);
  lines.push('');
  lines.push('**Summary:**');
  lines.push(`- **Confidence:** ${common.confidence}`);
  for (const row of summaryRows) {
    if (row !== null) lines.push(row);
  }
  lines.push('');
  if (notes && notes.trim() !== '') {
    lines.push(`**Notes:** ${notes.trim()}`);
  }
  return lines.join('\n').trimEnd();
}

// === Per-Class Renderers ===

function renderAuthEntry(e: AuthFinding): string {
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    { confidence: e.confidence },
    [
      summaryRow('Vulnerable location', formatLocation(e.source_endpoint, e.vulnerable_code_location)),
      summaryRow('Overview', e.missing_defense),
      summaryRow('Impact', e.exploitation_hypothesis),
    ],
    e.notes,
  );
}

function renderSsrfEntry(e: SsrfFinding): string {
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    { confidence: e.confidence },
    [
      summaryRow('Vulnerable location', formatLocation(e.source_endpoint, e.vulnerable_code_location)),
      summaryRow('Overview', e.missing_defense),
      summaryRow('Impact', e.exploitation_hypothesis),
    ],
    e.notes,
  );
}

function renderMiscellaneousEntry(e: MiscellaneousFinding): string {
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    { confidence: e.confidence },
    [
      summaryRow('Vulnerable location', formatLocation(e.source_endpoint, e.vulnerable_code_location)),
      summaryRow('Overview', e.missing_defense),
      summaryRow('Impact', e.exploitation_hypothesis),
    ],
    e.notes,
  );
}

function renderAuthzEntry(e: AuthzFinding): string {
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    { confidence: e.confidence },
    [
      summaryRow('Vulnerable location', formatLocation(e.endpoint, e.vulnerable_code_location)),
      summaryRow('Overview', e.guard_evidence),
      summaryRow('Impact', e.side_effect),
    ],
    e.notes,
  );
}

function renderInjectionEntry(e: InjectionFinding): string {
  const location = e.path && e.sink_call ? `${e.sink_call} (path: ${e.path})` : (e.sink_call ?? e.path);
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    { confidence: e.confidence },
    [summaryRow('Vulnerable location', location), summaryRow('Overview', e.mismatch_reason)],
    e.notes,
  );
}

function renderXssEntry(e: XssFinding): string {
  const location = e.path && e.sink_function ? `${e.sink_function} (path: ${e.path})` : (e.sink_function ?? e.path);
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    { confidence: e.confidence },
    [summaryRow('Vulnerable location', location), summaryRow('Overview', e.mismatch_reason)],
    e.notes,
  );
}

// === Class Registry ===

const CLASSES: Record<ReconciliationClass, ClassConfig<unknown>> = {
  auth: {
    heading: 'Authentication',
    noneFoundLabel: 'authentication',
    queueFile: 'auth_exploitation_queue.json',
    findingsFile: 'auth_findings.md',
    renderEntry: (e) => renderAuthEntry(e as AuthFinding),
  },
  authz: {
    heading: 'Authorization',
    noneFoundLabel: 'authorization',
    queueFile: 'authz_exploitation_queue.json',
    findingsFile: 'authz_findings.md',
    renderEntry: (e) => renderAuthzEntry(e as AuthzFinding),
  },
  injection: {
    heading: 'Injection',
    noneFoundLabel: 'injection',
    queueFile: 'injection_exploitation_queue.json',
    findingsFile: 'injection_findings.md',
    renderEntry: (e) => renderInjectionEntry(e as InjectionFinding),
  },
  xss: {
    heading: 'XSS',
    noneFoundLabel: 'XSS',
    queueFile: 'xss_exploitation_queue.json',
    findingsFile: 'xss_findings.md',
    renderEntry: (e) => renderXssEntry(e as XssFinding),
  },
  ssrf: {
    heading: 'SSRF',
    noneFoundLabel: 'SSRF',
    queueFile: 'ssrf_exploitation_queue.json',
    findingsFile: 'ssrf_findings.md',
    renderEntry: (e) => renderSsrfEntry(e as SsrfFinding),
  },
  miscellaneous: {
    heading: 'Miscellaneous',
    noneFoundLabel: 'miscellaneous',
    queueFile: 'miscellaneous_exploitation_queue.json',
    findingsFile: 'miscellaneous_findings.md',
    renderEntry: (e) => renderMiscellaneousEntry(e as MiscellaneousFinding),
  },
};

// === Class File Assembly ===

function renderClassFile(config: ClassConfig<unknown>, entries: readonly unknown[]): string {
  const sections: string[] = [];
  sections.push(`# ${config.heading} Findings`);
  sections.push('');
  sections.push(DISCLAIMER);
  sections.push('');
  sections.push('## Identified Vulnerabilities');
  sections.push('');
  if (entries.length === 0) {
    sections.push(`No ${config.noneFoundLabel} vulnerabilities were identified.`);
    sections.push('');
  } else {
    for (const entry of entries) {
      sections.push(config.renderEntry(entry));
      sections.push('');
    }
  }
  return `${sections.join('\n').trimEnd()}\n`;
}

// === Public Entry Point ===

/**
 * Render `*_findings.md` per class from each `*_exploitation_queue.json`.
 *
 * Idempotent: rewrites each present class from its queue; a missing queue means the class was out of
 * scope. Per-class failures are logged and other classes still proceed.
 */
export async function renderFindingsFromQueues(
  sourceDir: string,
  deliverablesSubdir: string | undefined,
  logger: ActivityLogger,
  participatingClasses: readonly ReconciliationClass[] = ALL_VULN_CLASSES,
): Promise<RenderFindingsResult> {
  const dir = deliverablesDir(sourceDir, deliverablesSubdir);
  const failedClasses: ReconciliationClass[] = [];

  for (const vulnerabilityClass of participatingClasses) {
    const config = CLASSES[vulnerabilityClass];
    const queuePath = path.join(dir, config.queueFile);
    const findingsPath = path.join(dir, config.findingsFile);

    if (!(await fs.pathExists(queuePath))) {
      logger.info(`${config.heading}: no queue file (class out of scope), skipping`);
      continue;
    }

    try {
      const doc = parseQueueDocument(await fs.readJson(queuePath));
      const entries = doc.vulnerabilities;
      const markdown = renderClassFile(config, entries);
      await fs.writeFile(findingsPath, markdown);
      logger.info(`${config.heading}: rendered ${entries.length} finding(s) to ${config.findingsFile}`);
    } catch (error) {
      // One class's render failure does not abort the others. The failed class is returned so
      // the report can mark it not_assessed rather than presenting it as a clean result.
      const err = error as Error;
      failedClasses.push(vulnerabilityClass);
      logger.warn(`${config.heading}: failed to render findings from ${config.queueFile}: ${err.message}`);
    }
  }

  return { failedClasses };
}
