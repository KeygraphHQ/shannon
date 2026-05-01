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
 * reads each `*_exploitation_queue.json` (already SDK-validated against the
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
  SsrfFinding,
  XssFinding,
} from '../ai/queue-schemas.js';
import { deliverablesDir } from '../paths.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { VulnClass } from '../types/config.js';

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
  vulnerabilities?: T[];
}

// === Common Render Helpers ===

function summaryRow(label: string, value: string | undefined | null | boolean): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return `- **${label}:** ${value}`;
}

function formatLocation(endpoint: string | undefined, codeLocation: string | undefined): string {
  if (endpoint && codeLocation) return `${endpoint} (${codeLocation})`;
  return endpoint ?? codeLocation ?? '';
}

interface ExploitStep {
  /** Plain prefix text — single line, safe for the numbered-list item. */
  readonly prefix: string;
  /** Optional payload to render as inline code or a fenced block depending on shape. */
  readonly payload?: string;
}

function renderExploitStep(step: ExploitStep): string[] {
  const { prefix, payload } = step;
  if (!payload) return [`1. ${prefix}`];
  if (payload.includes('\n')) {
    return [`1. ${prefix}`, '', '```', payload, '```'];
  }
  return [`1. ${prefix} \`${payload}\``];
}

function buildEntry(
  id: string,
  title: string,
  summaryRows: ReadonlyArray<string | null>,
  exploitStep: ExploitStep | null,
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
  if (exploitStep !== null) {
    lines.push('**Exploitation Steps (proposed):**');
    for (const stepLine of renderExploitStep(exploitStep)) {
      lines.push(stepLine);
    }
    lines.push('');
  }
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
      summaryRow('Confidence', e.confidence),
      summaryRow('Externally exploitable', String(e.externally_exploitable)),
    ],
    e.suggested_exploit_technique ? { prefix: 'Technique:', payload: e.suggested_exploit_technique } : null,
    e.notes,
  );
}

function renderSsrfEntry(e: SsrfFinding): string {
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    [
      summaryRow('Vulnerable location', formatLocation(e.source_endpoint, e.vulnerable_code_location)),
      summaryRow('Vulnerable parameter', e.vulnerable_parameter),
      summaryRow('Overview', e.missing_defense),
      summaryRow('Impact', e.exploitation_hypothesis),
      summaryRow('Confidence', e.confidence),
      summaryRow('Externally exploitable', String(e.externally_exploitable)),
    ],
    e.suggested_exploit_technique ? { prefix: 'Technique:', payload: e.suggested_exploit_technique } : null,
    e.notes,
  );
}

function renderAuthzEntry(e: AuthzFinding): string {
  return buildEntry(
    e.ID,
    e.vulnerability_type,
    [
      summaryRow('Vulnerable location', formatLocation(e.endpoint, e.vulnerable_code_location)),
      summaryRow('Role context', e.role_context),
      summaryRow('Overview', e.guard_evidence),
      summaryRow('Impact', e.side_effect),
      summaryRow('Reason', e.reason),
      summaryRow('Confidence', e.confidence),
      summaryRow('Externally exploitable', String(e.externally_exploitable)),
    ],
    e.minimal_witness ? { prefix: e.minimal_witness } : null,
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
      summaryRow('Source', e.source),
      summaryRow('Combined sources', e.combined_sources),
      summaryRow('Slot', e.slot_type),
      summaryRow('Overview', e.mismatch_reason),
      summaryRow('Sanitization observed', e.sanitization_observed),
      summaryRow('Verdict', e.verdict),
      summaryRow('Confidence', e.confidence),
      summaryRow('Externally exploitable', String(e.externally_exploitable)),
    ],
    e.witness_payload ? { prefix: 'Payload:', payload: e.witness_payload } : null,
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
      summaryRow('Source', e.source),
      summaryRow('Source detail', e.source_detail),
      summaryRow('Render context', e.render_context),
      summaryRow('Overview', e.mismatch_reason),
      summaryRow('Encoding observed', e.encoding_observed),
      summaryRow('Verdict', e.verdict),
      summaryRow('Confidence', e.confidence),
      summaryRow('Externally exploitable', String(e.externally_exploitable)),
    ],
    e.witness_payload ? { prefix: 'Payload:', payload: e.witness_payload } : null,
    e.notes,
  );
}

// === Class Registry ===

const CLASSES: Record<VulnClass, ClassConfig<unknown>> = {
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
 * Idempotent: skips classes whose findings file already exists, or whose queue
 * is missing (class out of scope this run). Per-class failures are logged and
 * other classes still proceed.
 */
export async function renderFindingsFromQueues(
  sourceDir: string,
  deliverablesSubdir: string | undefined,
  logger: ActivityLogger,
): Promise<void> {
  const dir = deliverablesDir(sourceDir, deliverablesSubdir);

  for (const config of Object.values(CLASSES)) {
    const queuePath = path.join(dir, config.queueFile);
    const findingsPath = path.join(dir, config.findingsFile);

    if (await fs.pathExists(findingsPath)) {
      logger.info(`${config.heading}: ${config.findingsFile} already exists, skipping`);
      continue;
    }
    if (!(await fs.pathExists(queuePath))) {
      logger.info(`${config.heading}: no queue file (class out of scope), skipping`);
      continue;
    }

    try {
      const doc = (await fs.readJson(queuePath)) as QueueDocument<unknown>;
      const entries = doc.vulnerabilities ?? [];
      const markdown = renderClassFile(config, entries);
      await fs.writeFile(findingsPath, markdown);
      logger.info(`${config.heading}: rendered ${entries.length} finding(s) to ${config.findingsFile}`);
    } catch (error) {
      const err = error as Error;
      logger.warn(`${config.heading}: failed to render findings from ${config.queueFile}: ${err.message}`);
    }
  }
}
