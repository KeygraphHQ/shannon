// Copyright (C) 2025 Keygraph, Inc.
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
import type { AuthFinding, AuthzFinding, InjectionFinding, SsrfFinding, XssFinding } from '../ai/queue-schemas.js';
import { deliverablesDir } from '../paths.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { VulnClass } from '../types/config.js';

const ANALYSIS_ONLY_DISCLAIMER = [
  '> Exploitation phase was not run for this assessment. Each entry documents a',
  '> vulnerability identified through static analysis; live exploitation steps and',
  '> proof of impact are not included.',
].join('\n');

const EMPTY_EXPLOIT_QUEUE_DISCLAIMER = [
  '> Exploitation was enabled for this assessment, but vulnerability analysis produced',
  '> no candidates in this class for the exploitation phase.',
].join('\n');

interface ClassConfig<T> {
  readonly heading: string;
  readonly evidenceHeading: string;
  readonly noneFoundLabel: string;
  readonly queueFile: string;
  readonly findingsFile: string;
  readonly renderEntry: (entry: T) => string;
}

interface QueueDocument<T> {
  vulnerabilities?: T[];
}

// === Common Render Helpers ===

function summaryRow(label: string, value: string | undefined | null | boolean): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return `- **${label}:** ${value}`;
}

function rating(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatLocation(endpoint: string | undefined, codeLocation: string | undefined): string {
  if (endpoint && codeLocation) return `${endpoint} (${codeLocation})`;
  return endpoint ?? codeLocation ?? '';
}

function buildEntry(
  id: string,
  title: string,
  summaryRows: ReadonlyArray<string | null>,
  notes: string | undefined,
): string {
  const lines: string[] = [];
  lines.push(`### ${id}: ${title}`);
  lines.push('');
  lines.push('**Summary:**');
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
    [
      summaryRow('Vulnerable location', formatLocation(e.source_endpoint, e.vulnerable_code_location)),
      summaryRow('Overview', e.missing_defense),
      summaryRow('Impact', e.exploitation_hypothesis),
      summaryRow('Severity', rating(e.severity)),
      summaryRow('Confidence', rating(e.confidence)),
    ],
    e.notes,
  );
}

function renderSsrfEntry(e: SsrfFinding): string {
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    [
      summaryRow('Vulnerable location', formatLocation(e.source_endpoint, e.vulnerable_code_location)),
      summaryRow('Overview', e.missing_defense),
      summaryRow('Impact', e.exploitation_hypothesis),
      summaryRow('Severity', rating(e.severity)),
      summaryRow('Confidence', rating(e.confidence)),
    ],
    e.notes,
  );
}

function renderAuthzEntry(e: AuthzFinding): string {
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    [
      summaryRow('Vulnerable location', formatLocation(e.endpoint, e.vulnerable_code_location)),
      summaryRow('Overview', e.guard_evidence),
      summaryRow('Impact', e.side_effect),
      summaryRow('Severity', rating(e.severity)),
      summaryRow('Confidence', rating(e.confidence)),
    ],
    e.notes,
  );
}

function renderInjectionEntry(e: InjectionFinding): string {
  const location = e.path && e.sink_call ? `${e.sink_call} (path: ${e.path})` : (e.sink_call ?? e.path);
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    [
      summaryRow('Vulnerable location', location),
      summaryRow('Overview', e.mismatch_reason),
      summaryRow('Severity', rating(e.severity)),
      summaryRow('Confidence', rating(e.confidence)),
    ],
    e.notes,
  );
}

function renderXssEntry(e: XssFinding): string {
  const location = e.path && e.sink_function ? `${e.sink_function} (path: ${e.path})` : (e.sink_function ?? e.path);
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    [
      summaryRow('Vulnerable location', location),
      summaryRow('Overview', e.mismatch_reason),
      summaryRow('Severity', rating(e.severity)),
      summaryRow('Confidence', rating(e.confidence)),
    ],
    e.notes,
  );
}

// === Class Registry ===

const CLASSES: Record<VulnClass, ClassConfig<unknown>> = {
  auth: {
    heading: 'Authentication',
    evidenceHeading: 'Authentication Exploitation Evidence',
    noneFoundLabel: 'authentication',
    queueFile: 'auth_exploitation_queue.json',
    findingsFile: 'auth_findings.md',
    renderEntry: (e) => renderAuthEntry(e as AuthFinding),
  },
  authz: {
    heading: 'Authorization',
    evidenceHeading: 'Authorization Exploitation Evidence',
    noneFoundLabel: 'authorization',
    queueFile: 'authz_exploitation_queue.json',
    findingsFile: 'authz_findings.md',
    renderEntry: (e) => renderAuthzEntry(e as AuthzFinding),
  },
  injection: {
    heading: 'Injection',
    evidenceHeading: 'Injection Exploitation Evidence',
    noneFoundLabel: 'injection',
    queueFile: 'injection_exploitation_queue.json',
    findingsFile: 'injection_findings.md',
    renderEntry: (e) => renderInjectionEntry(e as InjectionFinding),
  },
  xss: {
    heading: 'XSS',
    evidenceHeading: 'Cross-Site Scripting (XSS) Exploitation Evidence',
    noneFoundLabel: 'XSS',
    queueFile: 'xss_exploitation_queue.json',
    findingsFile: 'xss_findings.md',
    renderEntry: (e) => renderXssEntry(e as XssFinding),
  },
  ssrf: {
    heading: 'SSRF',
    evidenceHeading: 'SSRF Exploitation Evidence',
    noneFoundLabel: 'SSRF',
    queueFile: 'ssrf_exploitation_queue.json',
    findingsFile: 'ssrf_findings.md',
    renderEntry: (e) => renderSsrfEntry(e as SsrfFinding),
  },
};

// === Class File Assembly ===

function renderClassFile(
  config: ClassConfig<unknown>,
  entries: readonly unknown[],
  disclaimer: string,
  exploitEnabled: boolean,
): string {
  const sections: string[] = [];
  sections.push(`# ${exploitEnabled ? config.evidenceHeading : `${config.heading} Findings`}`);
  sections.push('');
  sections.push(disclaimer);
  sections.push('');
  sections.push(exploitEnabled ? '## Successfully Exploited Vulnerabilities' : '## Identified Vulnerabilities');
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
 * Idempotent: deterministically rewrites findings for each selected class whose
 * queue exists. Missing queues are treated as out of scope; malformed queues
 * fail closed so a stale findings file can never survive a retry.
 */
export async function renderFindingsFromQueues(
  sourceDir: string,
  deliverablesSubdir: string | undefined,
  logger: ActivityLogger,
  selectedVulnClasses?: readonly VulnClass[],
  emptyQueuesOnly = false,
): Promise<void> {
  const dir = deliverablesDir(sourceDir, deliverablesSubdir);
  const selectedSet = selectedVulnClasses ? new Set(selectedVulnClasses) : null;

  for (const [vulnClass, config] of Object.entries(CLASSES) as Array<[VulnClass, ClassConfig<unknown>]>) {
    if (selectedSet && !selectedSet.has(vulnClass)) continue;
    const queuePath = path.join(dir, config.queueFile);
    const findingsPath = path.join(dir, config.findingsFile);

    if (!(await fs.pathExists(queuePath))) {
      logger.info(`${config.heading}: no queue file (class out of scope), skipping`);
      continue;
    }

    const doc = (await fs.readJson(queuePath)) as QueueDocument<unknown>;
    if (!Array.isArray(doc.vulnerabilities)) {
      throw new Error(`${config.queueFile} does not contain a vulnerabilities array`);
    }
    const entries = doc.vulnerabilities;
    if (emptyQueuesOnly && entries.length > 0) continue;
    const markdown = renderClassFile(
      config,
      entries,
      emptyQueuesOnly ? EMPTY_EXPLOIT_QUEUE_DISCLAIMER : ANALYSIS_ONLY_DISCLAIMER,
      emptyQueuesOnly,
    );
    await fs.writeFile(findingsPath, markdown);
    logger.info(`${config.heading}: rendered ${entries.length} finding(s) to ${config.findingsFile}`);
  }
}
