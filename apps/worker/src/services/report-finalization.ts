// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Canonical report publication and derived-PDF regeneration. */

import { createHash } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  ASSEMBLED_REPORT_FILENAME,
  ASSEMBLED_REPORT_PDF_FILENAME,
  REPORT_FINALIZATION_MANIFEST_FILENAME,
  REPORT_JSON_FILENAME,
  SARIF_FILENAME,
  TYPST_TEMPLATE,
} from '../paths.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { DistributedReportConfig } from '../types/config.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import { isOrderedPartialReasonSet, type PartialReason } from '../types/run-state.js';
import type { ExactOutputCommit, ExactOutputFile } from './exact-output-commit.js';
import { writeAndCommitExactFiles } from './exact-output-commit.js';
import { orderFindings } from './finding-order.js';
import { readCommittedFile, withGitRepoLock } from './git-manager.js';
import { type PdfProvenance, pdfProvenanceIsCurrent, readPdfProvenance, renderReportPdf } from './pdf-renderer.js';
import { buildReportCoverage, type ReportData, renderReport } from './report-renderer.js';
import { renderSarif } from './sarif-renderer.js';

const FINALIZATION_SCHEMA_VERSION = 1;
// Renderer versions feed the input fingerprint: bumping one invalidates adoption of an existing
// finalization, forcing a re-render instead of adopting output from an older renderer.
const REPORT_RENDERER_VERSION = '4.13.1';
const SARIF_RENDERER_VERSION = '4.13.1';

interface CommittedArtifactReceipt {
  readonly path: string;
  readonly disposition: 'committed';
  readonly sha256: string;
}

export type ReportSarifDisposition = 'committed' | 'absent' | 'render_failed';

interface ConditionalArtifactReceipt {
  readonly path: string;
  readonly disposition: ReportSarifDisposition;
  readonly sha256?: string;
}

interface DerivedArtifactReceipt {
  readonly path: string;
  readonly disposition: 'derived_uncommitted';
}

export interface ReportFinalizationManifest {
  readonly schema_version: typeof FINALIZATION_SCHEMA_VERSION;
  readonly input_fingerprint: string;
  readonly artifacts: {
    readonly report_json: CommittedArtifactReceipt;
    readonly markdown: CommittedArtifactReceipt;
    readonly sarif: ConditionalArtifactReceipt;
    readonly pdf: DerivedArtifactReceipt;
  };
}

export interface FinalizeReportResult {
  readonly commit: ExactOutputCommit;
  readonly manifest: ReportFinalizationManifest;
  readonly pdfGenerated: boolean;
  readonly pdfProvenance: PdfProvenance | null;
  readonly warnings: readonly string[];
}

/** Stable service error preserved as retryable by the Temporal integration wrapper. */
export class ReportSarifRenderError extends Error {
  readonly retryable = true;

  constructor(cause: unknown) {
    super('Report SARIF rendering failed.', { cause });
    this.name = 'ReportSarifRenderError';
  }
}

/**
 * Canonical report, manifest, or committed-byte corruption detected during finalization.
 * Always terminal: canonical corruption never degrades into a partial result or a warning.
 */
export class ReportFinalizationIntegrityError extends Error {
  readonly retryable = false;
  readonly checkCode: string;

  constructor(checkCode: string) {
    super('Report finalization integrity validation failed.');
    this.name = 'ReportFinalizationIntegrityError';
    this.checkCode = checkCode;
  }
}

function sha256(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseReportData(contents: string): ReportData {
  let decoded: unknown;
  try {
    decoded = JSON.parse(contents) as unknown;
  } catch {
    throw new ReportFinalizationIntegrityError('finalization-report-not-json');
  }
  if (!isRecord(decoded) || !isRecord(decoded.report_meta) || !Array.isArray(decoded.findings)) {
    throw new ReportFinalizationIntegrityError('finalization-report-malformed');
  }
  const meta = decoded.report_meta;
  if (
    typeof meta.target !== 'string' ||
    typeof meta.assessment_date !== 'string' ||
    typeof meta.scope !== 'string' ||
    typeof meta.executive_summary !== 'string' ||
    meta.scope.trim() === '' ||
    meta.executive_summary.trim() === ''
  ) {
    throw new ReportFinalizationIntegrityError('finalization-report-meta-malformed');
  }
  return decoded as unknown as ReportData;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

/** Runtime guard for manifests read back from the deliverables repo during resume and repair. */
export function isReportFinalizationManifest(value: unknown): value is ReportFinalizationManifest {
  if (!isRecord(value) || value.schema_version !== FINALIZATION_SCHEMA_VERSION || !isSha256(value.input_fingerprint)) {
    return false;
  }
  if (!isRecord(value.artifacts)) return false;
  const reportJson = value.artifacts.report_json;
  const markdown = value.artifacts.markdown;
  const sarif = value.artifacts.sarif;
  const pdf = value.artifacts.pdf;
  if (!isRecord(reportJson) || !isRecord(markdown) || !isRecord(sarif) || !isRecord(pdf)) return false;
  if (
    reportJson.path !== REPORT_JSON_FILENAME ||
    reportJson.disposition !== 'committed' ||
    !isSha256(reportJson.sha256)
  ) {
    return false;
  }
  if (
    markdown.path !== ASSEMBLED_REPORT_FILENAME ||
    markdown.disposition !== 'committed' ||
    !isSha256(markdown.sha256)
  ) {
    return false;
  }
  const validSarif =
    sarif.path === SARIF_FILENAME &&
    (((sarif.disposition === 'absent' || sarif.disposition === 'render_failed') && sarif.sha256 === undefined) ||
      (sarif.disposition === 'committed' && isSha256(sarif.sha256)));
  return validSarif && pdf.path === ASSEMBLED_REPORT_PDF_FILENAME && pdf.disposition === 'derived_uncommitted';
}

/**
 * Derive the one canonical report from the model-authored report.json: fixed finding order,
 * workflow-owned exploit flag and coverage, and a de-duplicated reconciliation-failed set. Every
 * finalization attempt (including a retried or degraded re-drive) must produce byte-identical
 * output from the same inputs, since `buildInputFingerprint` and the adoption check in
 * `readExistingFinalization` both compare against this canonical form rather than the raw model
 * output.
 */
function canonicalizeReport(args: {
  readonly report: ReportData;
  readonly exploit: boolean;
  readonly partialReasons: readonly PartialReason[];
  readonly reconciliationFailedClasses?: readonly ReconciliationClass[];
}): ReportData {
  if (!isOrderedPartialReasonSet(args.partialReasons)) {
    throw new ReportFinalizationIntegrityError('finalization-partial-reasons-invalid');
  }
  const reconciliationFailed = args.reconciliationFailedClasses ?? args.report.reconciliation_failed ?? [];
  if (new Set(reconciliationFailed).size !== reconciliationFailed.length) {
    throw new ReportFinalizationIntegrityError('finalization-failed-class-duplicate');
  }
  if (
    args.reconciliationFailedClasses !== undefined &&
    JSON.stringify(args.report.reconciliation_failed ?? []) !== JSON.stringify(args.reconciliationFailedClasses)
  ) {
    throw new ReportFinalizationIntegrityError('finalization-failed-class-set-mismatch');
  }
  return {
    ...args.report,
    report_meta: {
      ...args.report.report_meta,
      exploit: args.exploit,
      coverage: buildReportCoverage(args.partialReasons),
    },
    findings: orderFindings(args.report.findings),
    reconciliation_failed: [...reconciliationFailed],
  };
}

// The fingerprint covers everything that determines the finalized bytes. Degraded-SARIF mode is
// deliberately excluded: a degraded re-drive must produce the same fingerprint as the ordinary
// attempt so it can adopt an existing coherent commit instead of publishing a rival one.
function buildInputFingerprint(args: {
  readonly canonicalJson: string;
  readonly exploit: boolean;
  readonly workspaceName: string;
  readonly reportConfig: DistributedReportConfig;
}): string {
  return sha256(
    JSON.stringify({
      canonical_report_sha256: sha256(args.canonicalJson),
      exploit: args.exploit,
      workspace_name: args.workspaceName,
      report_config: {
        min_severity: args.reportConfig.min_severity ?? null,
        min_confidence: args.reportConfig.min_confidence ?? null,
        guidance_sha256: args.reportConfig.guidance === undefined ? null : sha256(args.reportConfig.guidance),
        sarif: args.reportConfig.sarif,
      },
      report_renderer_version: REPORT_RENDERER_VERSION,
      sarif_renderer_version: SARIF_RENDERER_VERSION,
    }),
  );
}

function buildManifest(args: {
  readonly canonicalJson: string;
  readonly markdown: string;
  readonly sarif: string | null;
  readonly sarifDisposition: ReportSarifDisposition;
  readonly exploit: boolean;
  readonly workspaceName: string;
  readonly reportConfig: DistributedReportConfig;
}): ReportFinalizationManifest {
  return {
    schema_version: FINALIZATION_SCHEMA_VERSION,
    input_fingerprint: buildInputFingerprint(args),
    artifacts: {
      report_json: {
        path: REPORT_JSON_FILENAME,
        disposition: 'committed',
        sha256: sha256(args.canonicalJson),
      },
      markdown: {
        path: ASSEMBLED_REPORT_FILENAME,
        disposition: 'committed',
        sha256: sha256(args.markdown),
      },
      sarif:
        args.sarifDisposition === 'committed' && args.sarif !== null
          ? { path: SARIF_FILENAME, disposition: 'committed', sha256: sha256(args.sarif) }
          : { path: SARIF_FILENAME, disposition: args.sarifDisposition },
      pdf: { path: ASSEMBLED_REPORT_PDF_FILENAME, disposition: 'derived_uncommitted' },
    },
  };
}

/**
 * Load a previously committed finalization for adoption. Returns null when none exists, the
 * verified manifest and SARIF when the committed state matches the current inputs byte for
 * byte, and throws a terminal integrity error on any conflict or corruption. This runs before
 * any new render, so a lost acknowledgement re-drive (including a degraded one) adopts the
 * earlier coherent commit rather than replacing it.
 */
async function readExistingFinalization(args: {
  readonly deliverablesDir: string;
  readonly canonicalJson: string;
  readonly markdown: string;
  readonly exploit: boolean;
  readonly workspaceName: string;
  readonly reportConfig: DistributedReportConfig;
}): Promise<{
  readonly manifest: ReportFinalizationManifest;
  readonly manifestContents: string;
  readonly sarif: string | null;
} | null> {
  const read = await readCommittedFile(args.deliverablesDir, REPORT_FINALIZATION_MANIFEST_FILENAME);
  if (read.state === 'absent') return null;
  if (read.state !== 'present') {
    throw new ReportFinalizationIntegrityError('finalization-manifest-unreadable');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(read.contents) as unknown;
  } catch {
    throw new ReportFinalizationIntegrityError('finalization-manifest-not-json');
  }
  if (!isReportFinalizationManifest(decoded) || read.contents !== `${JSON.stringify(decoded, null, 2)}\n`) {
    throw new ReportFinalizationIntegrityError('finalization-manifest-conflict');
  }
  const expectedInputFingerprint = buildInputFingerprint(args);
  if (
    decoded.input_fingerprint !== expectedInputFingerprint ||
    decoded.artifacts.report_json.sha256 !== sha256(args.canonicalJson) ||
    decoded.artifacts.markdown.sha256 !== sha256(args.markdown)
  ) {
    throw new ReportFinalizationIntegrityError('finalization-manifest-conflict');
  }
  const markdownRead = await readCommittedFile(args.deliverablesDir, ASSEMBLED_REPORT_FILENAME);
  if (markdownRead.state !== 'present' || markdownRead.contents !== args.markdown) {
    throw new ReportFinalizationIntegrityError('finalization-markdown-digest-mismatch');
  }
  const sarifRead = await readCommittedFile(args.deliverablesDir, SARIF_FILENAME);
  let sarif: string | null = null;
  if (decoded.artifacts.sarif.disposition !== 'committed') {
    if (sarifRead.state !== 'absent') {
      throw new ReportFinalizationIntegrityError('finalization-stale-sarif');
    }
  } else {
    if (
      sarifRead.state !== 'present' ||
      decoded.artifacts.sarif.sha256 === undefined ||
      sha256(sarifRead.contents) !== decoded.artifacts.sarif.sha256
    ) {
      throw new ReportFinalizationIntegrityError('finalization-sarif-digest-mismatch');
    }
    sarif = sarifRead.contents;
  }
  return { manifest: decoded, manifestContents: read.contents, sarif };
}

/**
 * Finalize all canonical report outputs in one exact-path commit, then regenerate the uncommitted
 * PDF from those same canonical bytes. PDF failure is warning-only and cannot change the commit.
 */
export async function finalizeReport(args: {
  readonly deliverablesDir: string;
  readonly exploit: boolean;
  readonly partialReasons: readonly PartialReason[];
  readonly reconciliationFailedClasses?: readonly ReconciliationClass[];
  readonly reportConfig: DistributedReportConfig;
  readonly workspaceName: string;
  readonly logger: ActivityLogger;
  readonly templatePath?: string;
  readonly renderPdf?: typeof renderReportPdf;
  readonly renderSarif?: typeof renderSarif;
  /** Used only after ordinary SARIF attempts have exhausted their Temporal retry policy. */
  readonly degradedSarif?: boolean;
  /** Durable provenance from an earlier successful PDF publication, when available. */
  readonly priorPdfProvenance?: PdfProvenance;
  readonly afterCommit?: (commit: { commitHash: string; changedPaths: readonly string[] }) => void | Promise<void>;
}): Promise<FinalizeReportResult> {
  const warnings: string[] = [];
  const finalized = await withGitRepoLock(async () => {
    const reportRead = await readCommittedFile(args.deliverablesDir, REPORT_JSON_FILENAME);
    if (reportRead.state !== 'present') {
      throw new ReportFinalizationIntegrityError('finalization-report-unreadable');
    }
    const canonicalReport = canonicalizeReport({
      report: parseReportData(reportRead.contents),
      exploit: args.exploit,
      partialReasons: args.partialReasons,
      ...(args.reconciliationFailedClasses !== undefined && {
        reconciliationFailedClasses: args.reconciliationFailedClasses,
      }),
    });
    const canonicalJson = `${JSON.stringify(canonicalReport, null, 2)}\n`;
    const markdown = renderReport(canonicalReport);
    const existing = await readExistingFinalization({
      deliverablesDir: args.deliverablesDir,
      canonicalJson,
      markdown,
      exploit: args.exploit,
      workspaceName: args.workspaceName,
      reportConfig: args.reportConfig,
    });
    if (existing !== null) {
      const files: readonly ExactOutputFile[] = [
        { relPath: REPORT_JSON_FILENAME, contents: canonicalJson },
        { relPath: ASSEMBLED_REPORT_FILENAME, contents: markdown },
        { relPath: SARIF_FILENAME, contents: existing.sarif },
        { relPath: REPORT_FINALIZATION_MANIFEST_FILENAME, contents: existing.manifestContents },
      ];
      const commit = await writeAndCommitExactFiles(
        args.deliverablesDir,
        files,
        'Finalize canonical report outputs',
        args.logger,
        args.afterCommit === undefined ? {} : { afterCommit: args.afterCommit },
      );
      return { canonicalReport, commit, manifest: existing.manifest };
    }

    const sarifRequested = args.exploit && args.reportConfig.sarif;
    let sarif: string | null = null;
    let sarifDisposition: ReportSarifDisposition = 'absent';
    // Reaching this point in degraded mode means no coherent finalization existed to adopt, so
    // the manifest records `render_failed` and the null SARIF contents below make the exact-path
    // commit delete any SARIF a partial earlier attempt left behind.
    if (sarifRequested && args.degradedSarif === true) {
      sarifDisposition = 'render_failed';
    } else if (sarifRequested) {
      try {
        sarif = (args.renderSarif ?? renderSarif)(canonicalReport, args);
        sarifDisposition = 'committed';
      } catch (error: unknown) {
        throw new ReportSarifRenderError(error);
      }
    }
    const manifest = buildManifest({
      canonicalJson,
      markdown,
      sarif,
      sarifDisposition,
      exploit: args.exploit,
      workspaceName: args.workspaceName,
      reportConfig: args.reportConfig,
    });
    if (!isReportFinalizationManifest(manifest)) {
      throw new ReportFinalizationIntegrityError('finalization-manifest-self-invalid');
    }
    const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`;

    const files: readonly ExactOutputFile[] = [
      { relPath: REPORT_JSON_FILENAME, contents: canonicalJson },
      { relPath: ASSEMBLED_REPORT_FILENAME, contents: markdown },
      { relPath: SARIF_FILENAME, contents: sarif },
      { relPath: REPORT_FINALIZATION_MANIFEST_FILENAME, contents: manifestContents },
    ];
    const commit = await writeAndCommitExactFiles(
      args.deliverablesDir,
      files,
      'Finalize canonical report outputs',
      args.logger,
      args.afterCommit === undefined ? {} : { afterCommit: args.afterCommit },
    );
    return { canonicalReport, commit, manifest };
  });

  let pdfGenerated = false;
  let pdfProvenance: PdfProvenance | null = null;
  const pdfPath = path.join(args.deliverablesDir, ASSEMBLED_REPORT_PDF_FILENAME);
  const renderPdf = args.renderPdf ?? renderReportPdf;
  const templatePath = args.templatePath ?? TYPST_TEMPLATE;
  const canonicalReportSha256 = finalized.manifest.artifacts.report_json.sha256;
  try {
    await renderPdf({
      reportData: finalized.canonicalReport,
      templatePath,
      outputPath: pdfPath,
    });
    pdfProvenance = await readPdfProvenance({ pdfPath, canonicalReportSha256, templatePath });
    pdfGenerated = true;
  } catch (error) {
    const label = error instanceof Error ? ((error as NodeJS.ErrnoException).code ?? error.name) : 'unknown error';
    const warning = `The PDF report could not be produced (${label}). The Markdown report and the structured findings are unaffected.`;
    warnings.push(warning);
    args.logger.warn(warning);
    // Keep an old PDF only when its bytes still prove out against the current canonical report;
    // otherwise remove it so a stale PDF is never served alongside fresh JSON and Markdown.
    const canPreservePriorPdf =
      args.priorPdfProvenance !== undefined &&
      (await pdfProvenanceIsCurrent({
        pdfPath,
        canonicalReportSha256,
        provenance: args.priorPdfProvenance,
        templatePath,
      }));
    if (canPreservePriorPdf) {
      pdfProvenance = args.priorPdfProvenance;
    } else {
      await unlink(pdfPath).catch((cleanupError: unknown) => {
        if (cleanupError instanceof Error && (cleanupError as NodeJS.ErrnoException).code === 'ENOENT') return;
        const cleanupLabel =
          cleanupError instanceof Error
            ? ((cleanupError as NodeJS.ErrnoException).code ?? cleanupError.name)
            : 'unknown error';
        const cleanupWarning = `An out-of-date PDF could not be deleted (${cleanupLabel}). Ignore any PDF in this workspace and use the Markdown report.`;
        warnings.push(cleanupWarning);
        args.logger.warn(cleanupWarning);
      });
    }
  }

  return { commit: finalized.commit, manifest: finalized.manifest, pdfGenerated, pdfProvenance, warnings };
}
