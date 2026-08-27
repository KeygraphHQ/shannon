// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Coherence proofs over durable report-stage checkpoints in the deliverables Git repo. */

import { createHash } from 'node:crypto';
import path from 'node:path';
import { $ } from 'zx';
import {
  ASSEMBLED_REPORT_FILENAME,
  REPORT_FINALIZATION_MANIFEST_FILENAME,
  REPORT_JSON_FILENAME,
  SARIF_FILENAME,
} from '../paths.js';
import { ErrorCode } from '../types/errors.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import type { ReportProgress } from '../types/run-state.js';
import { fileExists } from '../utils/file-io.js';
import { PentestError } from './error-handling.js';
import { classifyHeadReadFailure, withGitRepoLock } from './git-manager.js';
import { isReportFinalizationManifest } from './report-finalization.js';
import type { ReportData } from './report-renderer.js';

function sha256(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function transientCheckpointReadError(operation: string): PentestError {
  return new PentestError(
    'A durable report checkpoint could not be read because of a transient repository error',
    'filesystem',
    true,
    { operation },
    ErrorCode.GIT_CHECKPOINT_FAILED,
  );
}

export type CheckpointReadResult =
  | { readonly state: 'present'; readonly contents: string }
  | { readonly state: 'absent' }
  | { readonly state: 'corrupt' };

/**
 * Read one file at a specific checkpoint, preserving the proven-present, proven-absent,
 * corrupt, and transient outcomes. Transient failures throw so the activity retry policy
 * stays authoritative instead of a Git blip erasing a paid-for draft or masquerading as
 * workspace corruption.
 */
export async function readFileAtCheckpoint(
  deliverablesPath: string,
  checkpoint: string,
  relPath: string,
): Promise<CheckpointReadResult> {
  return withGitRepoLock(async () => {
    const result = await $`cd ${deliverablesPath} && git show ${`${checkpoint}:${relPath}`}`.nothrow().quiet();
    if (result.exitCode === 0) {
      return { state: 'present', contents: result.stdout };
    }
    const failure = classifyHeadReadFailure(result.stderr);
    if (failure === 'absent') return { state: 'absent' };
    if (failure === 'corrupt') return { state: 'corrupt' };
    throw transientCheckpointReadError('read-report-checkpoint-file');
  });
}

export async function checkpointFileContents(
  deliverablesPath: string,
  checkpoint: string,
  relPath: string,
): Promise<string | null> {
  const read = await readFileAtCheckpoint(deliverablesPath, checkpoint, relPath);
  return read.state === 'present' ? read.contents : null;
}

/** Resolve a revision to a commit hash; absent/corrupt yields null, transient throws. */
export async function resolveCheckpointCommit(deliverablesPath: string, revision: string): Promise<string | null> {
  return withGitRepoLock(async () => {
    const result = await $`cd ${deliverablesPath} && git rev-parse --verify ${`${revision}^{commit}`}`
      .nothrow()
      .quiet();
    if (result.exitCode === 0) return result.stdout.trim();
    const failure = classifyHeadReadFailure(result.stderr);
    if (failure === 'transient') throw transientCheckpointReadError('resolve-report-checkpoint');
    return null;
  });
}

/** Ancestor check that keeps transient Git failures retryable instead of proof-invalid. */
export async function checkpointIsAncestor(
  ancestor: string,
  descendant: string,
  deliverablesPath: string,
): Promise<boolean> {
  return withGitRepoLock(async () => {
    const result = await $`cd ${deliverablesPath} && git merge-base --is-ancestor ${ancestor} ${descendant}`
      .nothrow()
      .quiet();
    if (result.exitCode === 0) return true;
    if (result.exitCode === 1 && result.stderr.trim() === '') return false;
    const failure = classifyHeadReadFailure(result.stderr);
    if (failure === 'transient') throw transientCheckpointReadError('verify-report-checkpoint-ancestry');
    return false;
  });
}

async function checkpointIsReachable(deliverablesPath: string, checkpoint: string): Promise<boolean> {
  const head = await resolveCheckpointCommit(deliverablesPath, 'HEAD');
  return head !== null && (await checkpointIsAncestor(checkpoint, head, deliverablesPath));
}

/**
 * Prove one report checkpoint is trustworthy: its report.json parses with meta and findings,
 * its recorded failed-class set equals the durable `failedClasses` list, and the commit is
 * still reachable from HEAD. Reachability matters because rollback can rewrite the branch;
 * a dangling checkpoint would validate content that publication has since discarded.
 */
export async function reportCheckpointIsCoherent(
  deliverablesPath: string,
  checkpoint: string,
  failedClasses: readonly ReconciliationClass[],
): Promise<boolean> {
  const contents = await checkpointFileContents(deliverablesPath, checkpoint, REPORT_JSON_FILENAME);
  if (contents === null || !(await checkpointIsReachable(deliverablesPath, checkpoint))) return false;
  try {
    const decoded = JSON.parse(contents) as ReportData;
    return (
      decoded !== null &&
      typeof decoded === 'object' &&
      decoded.report_meta !== null &&
      typeof decoded.report_meta === 'object' &&
      Array.isArray(decoded.findings) &&
      arraysEqual(decoded.reconciliation_failed ?? [], failedClasses)
    );
  } catch {
    return false;
  }
}

export type DraftValidation = 'coherent' | 'invalid-model' | 'invalid-canonical';

/**
 * Grade a durable draft for resume. `invalid-model` means the model-authored checkpoint itself
 * cannot be trusted and the report stage must re-run; `invalid-canonical` means the model
 * checkpoint stands but the canonical rebuild on top of it does not, so only that later work
 * repeats. A pending draft is vacuously coherent.
 */
export async function validateDraftProgress(
  deliverablesPath: string,
  progress: ReportProgress,
): Promise<DraftValidation> {
  if (progress.stage === 'pending') return 'coherent';
  if (
    !(await reportCheckpointIsCoherent(deliverablesPath, progress.model_checkpoint, progress.renumber_failed_classes))
  ) {
    return 'invalid-model';
  }
  if (progress.canonical_checkpoint === undefined) return progress.stage === 'draft' ? 'coherent' : 'invalid-canonical';
  if (!(await checkpointIsAncestor(progress.model_checkpoint, progress.canonical_checkpoint, deliverablesPath))) {
    return 'invalid-canonical';
  }
  const canonicalCoherent = await reportCheckpointIsCoherent(
    deliverablesPath,
    progress.canonical_checkpoint,
    progress.renumber_failed_classes,
  );
  return canonicalCoherent ? 'coherent' : 'invalid-canonical';
}

export async function draftProgressIsCoherent(deliverablesPath: string, progress: ReportProgress): Promise<boolean> {
  return (await validateDraftProgress(deliverablesPath, progress)) === 'coherent';
}

export async function finalProgressIsCoherent(deliverablesPath: string, progress: ReportProgress): Promise<boolean> {
  if (progress.stage !== 'finalized' || !(await draftProgressIsCoherent(deliverablesPath, progress))) return false;
  if (!(await checkpointIsAncestor(progress.canonical_checkpoint, progress.final_checkpoint, deliverablesPath))) {
    return false;
  }
  if (!(await checkpointIsReachable(deliverablesPath, progress.final_checkpoint))) return false;

  const manifestContents = await checkpointFileContents(
    deliverablesPath,
    progress.final_checkpoint,
    REPORT_FINALIZATION_MANIFEST_FILENAME,
  );
  if (manifestContents === null || sha256(manifestContents) !== progress.finalization_manifest_sha256) return false;

  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestContents) as unknown;
  } catch {
    return false;
  }
  // The durable digest covers the manifest's exact bytes, so the committed file must also be in
  // canonical serialization; a manifest that parses but is formatted differently is not the one
  // finalization wrote.
  if (!isReportFinalizationManifest(manifest) || manifestContents !== `${JSON.stringify(manifest, null, 2)}\n`) {
    return false;
  }
  if (manifest.artifacts.sarif.disposition !== progress.sarif_disposition) return false;

  const reportJson = await checkpointFileContents(deliverablesPath, progress.final_checkpoint, REPORT_JSON_FILENAME);
  const markdown = await checkpointFileContents(deliverablesPath, progress.final_checkpoint, ASSEMBLED_REPORT_FILENAME);
  if (
    reportJson === null ||
    markdown === null ||
    sha256(reportJson) !== manifest.artifacts.report_json.sha256 ||
    sha256(markdown) !== manifest.artifacts.markdown.sha256
  ) {
    return false;
  }
  try {
    const decodedReport = JSON.parse(reportJson) as ReportData;
    if (!arraysEqual(decodedReport.reconciliation_failed ?? [], progress.renumber_failed_classes)) return false;
  } catch {
    return false;
  }

  const sarif = await checkpointFileContents(deliverablesPath, progress.final_checkpoint, SARIF_FILENAME);
  if (manifest.artifacts.sarif.disposition !== 'committed') {
    // A non-committed disposition also requires the worktree to be clean of SARIF: a stray
    // uncommitted file would otherwise be surfaced to the customer as though it were finalized.
    return sarif === null && !(await fileExists(path.join(deliverablesPath, SARIF_FILENAME)));
  }
  return sarif !== null && sha256(sarif) === manifest.artifacts.sarif.sha256;
}
