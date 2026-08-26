/** Centralized path constants for the worker package */

import fs from 'node:fs';
import path from 'node:path';

/** Worker package root (apps/worker/) resolved from compiled dist/ files */
const WORKER_ROOT = path.resolve(import.meta.dirname, '..');

export const PROMPTS_DIR = path.join(WORKER_ROOT, 'prompts');
export const CONFIGS_DIR = path.join(WORKER_ROOT, 'configs');

/** Bundled Typst template that renders report.json into the PDF report. */
export const TYPST_TEMPLATE = path.join(WORKER_ROOT, 'templates', 'typst', 'report.typ');

/** Compiled pi extension dir that enforces bounded `bash` timeouts (resolved from dist/) */
export const BASH_TIMEOUT_EXTENSION_DIR = path.join(import.meta.dirname, 'ai', 'extensions', 'bash-timeout');

/** Default deliverables subdirectory relative to repoPath */
export const DEFAULT_DELIVERABLES_SUBDIR = '.shannon/deliverables';

/** Default audit log directory */
export const DEFAULT_AUDIT_DIR = './workspaces';

/**
 * Hidden subdirectory inside each run directory that holds all internals
 * (logs, prompts, session state, deliverables, browser artifacts). Keeps the
 * run folder's top level clean so only the final report is visible.
 */
export const INTERNAL_DIR = '.shannon';

/** Filename of the assembled report inside the deliverables dir (internal, source of the surfaced copy) */
export const ASSEMBLED_REPORT_FILENAME = 'comprehensive_security_assessment_report.md';

/** Filename of the compiled PDF report inside the deliverables dir (internal, source of the surfaced copy) */
export const ASSEMBLED_REPORT_PDF_FILENAME = 'comprehensive_security_assessment_report.pdf';

/** Filename of the human-facing PDF report surfaced at the run directory root */
export const FINAL_REPORT_PDF_FILENAME = 'Security-Assessment-Report.pdf';

/** Filename of the human-facing markdown report surfaced at the run directory root, alongside the PDF */
export const FINAL_REPORT_MD_FILENAME = 'Security-Assessment-Report.md';

/** Structured findings the report agent emits; the markdown report is rendered from it. */
export const REPORT_JSON_FILENAME = 'report.json';

/** SARIF 2.1.0 log, written for exploit=true runs unless report.sarif is set to false. */
export const SARIF_FILENAME = 'report.sarif';

/**
 * Resolve the session.json path for a run directory, preferring the current
 * `.shannon/` location and falling back to the legacy run-root location so
 * pre-restructure workspaces remain listable and resumable.
 */
export function resolveSessionJsonPath(runDir: string): string {
  const current = path.join(runDir, INTERNAL_DIR, 'session.json');
  if (fs.existsSync(current)) {
    return current;
  }
  const legacy = path.join(runDir, 'session.json');
  if (fs.existsSync(legacy)) {
    return legacy;
  }
  return current;
}

/**
 * Resolve the deliverables directory for a given repoPath and optional subdir override.
 * @param repoPath - Absolute path to the target repository
 * @param subdir - Subdirectory relative to repoPath (default: '.shannon/deliverables')
 */
export function deliverablesDir(repoPath: string, subdir: string = DEFAULT_DELIVERABLES_SUBDIR): string {
  return path.join(repoPath, ...subdir.split('/'));
}

/**
 * Repository root — walk up from WORKER_ROOT looking for pnpm-workspace.yaml.
 * Falls back to two levels up (apps/worker/ → repo root) if not found.
 */
function findRepoRoot(): string {
  let dir = WORKER_ROOT;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(WORKER_ROOT, '..', '..');
}

const REPO_ROOT = findRepoRoot();
export const WORKSPACES_DIR = path.join(REPO_ROOT, 'workspaces');
