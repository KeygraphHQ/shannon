#!/usr/bin/env node

// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * set-report-meta CLI
 *
 * Writes top-level report metadata to report.json.
 * Called once by the report agent before recording individual findings.
 * Overwrites any existing report_meta — idempotent.
 *
 * Usage:
 *   set-report-meta --target "https://example.com" --assessment-date "2026-05-07" \
 *     --scope "injection, xss, auth, authz, ssrf" --executive-summary "..."
 *
 * Output (JSON to stdout):
 *   { "status": "success" }
 *   { "status": "error", "message": "...", "retryable": true }
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPORT_FILENAME = 'report.json';

interface ReportMeta {
  target: string;
  assessment_date: string;
  scope: string;
  executive_summary: string;
}

interface ReportFile {
  report_meta?: ReportMeta;
  findings: Array<Record<string, unknown>>;
}

const HELP = `set-report-meta — write top-level report metadata to report.json

Usage:
  set-report-meta --target "https://example.com" --assessment-date "2026-05-07" \\
    --scope "injection, xss, auth" --executive-summary "..."

Required flags: --target, --assessment-date, --scope, --executive-summary

Output: JSON to stdout with status "success" or "error".`;

function getFlag(argv: string[], flag: string): string | undefined {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1] && !argv[i + 1]!.startsWith('--')) {
      return argv[i + 1]!;
    }
  }
  return undefined;
}

function readReportFile(filePath: string): ReportFile {
  if (!existsSync(filePath)) {
    return { findings: [] };
  }
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as ReportFile;
}

function writeReportFile(filePath: string, data: ReportFile): void {
  const tmpPath = `${filePath}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  try {
    writeFileSync(tmpPath, payload, 'utf-8');
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* best-effort */
    }
    throw err;
  }
}

function main(): void {
  if (process.argv[2] === '--help' || process.argv[2] === '-h') {
    console.log(HELP);
    return;
  }

  const target = getFlag(process.argv, '--target');
  const assessmentDate = getFlag(process.argv, '--assessment-date');
  const scope = getFlag(process.argv, '--scope');
  const executiveSummary = getFlag(process.argv, '--executive-summary');

  if (!target) {
    console.log(JSON.stringify({ status: 'error', message: 'Missing required --target flag', retryable: true }));
    process.exit(1);
  }
  if (!assessmentDate) {
    console.log(
      JSON.stringify({ status: 'error', message: 'Missing required --assessment-date flag', retryable: true }),
    );
    process.exit(1);
  }
  if (!scope) {
    console.log(JSON.stringify({ status: 'error', message: 'Missing required --scope flag', retryable: true }));
    process.exit(1);
  }
  if (!executiveSummary) {
    console.log(
      JSON.stringify({ status: 'error', message: 'Missing required --executive-summary flag', retryable: true }),
    );
    process.exit(1);
  }

  const subdir = process.env.SHANNON_DELIVERABLES_SUBDIR || '.shannon/deliverables';
  const deliverablesDir = resolve(process.cwd(), ...subdir.split('/'));
  mkdirSync(deliverablesDir, { recursive: true });
  const filePath = resolve(deliverablesDir, REPORT_FILENAME);
  const data = readReportFile(filePath);
  data.report_meta = {
    target,
    assessment_date: assessmentDate,
    scope,
    executive_summary: executiveSummary,
  };
  writeReportFile(filePath, data);

  console.log(JSON.stringify({ status: 'success' }));
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify({ status: 'error', message, retryable: true }));
  process.exit(1);
}
