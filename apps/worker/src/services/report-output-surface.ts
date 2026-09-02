// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Best-effort, narrow customer output publication. */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ASSEMBLED_REPORT_FILENAME,
  ASSEMBLED_REPORT_PDF_FILENAME,
  FINAL_REPORT_MD_FILENAME,
  FINAL_REPORT_PDF_FILENAME,
  SARIF_FILENAME,
} from '../paths.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { type PdfProvenance, pdfMatchesProvenance } from './pdf-renderer.js';

interface SurfaceOutput {
  readonly source: string;
  readonly destination: string;
  readonly removeWhenSourceMissing: boolean;
}

export interface ReportOutputSurfaceResult {
  readonly surfaced: readonly string[];
  readonly removedStale: readonly string[];
  readonly warnings: readonly string[];
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

function errorLabel(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  return (error as NodeJS.ErrnoException).code ?? error.name;
}

async function removeIfPresent(filePath: string): Promise<boolean> {
  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return false;
    throw error;
  }
}

async function atomicCopy(sourcePath: string, destinationPath: string): Promise<void> {
  const contents = await readFile(sourcePath);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  try {
    const existing = await readFile(destinationPath);
    if (existing.equals(contents)) return;
  } catch (error) {
    if (!isErrno(error, 'ENOENT')) throw error;
  }
  // Write to a unique temp path then rename, so a crash mid-write never leaves a partial file
  // at the customer destination. `wx` fails rather than reusing a leftover temp file.
  const temporaryPath = `${destinationPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, contents, { flag: 'wx' });
    await rename(temporaryPath, destinationPath);
    const verified = await readFile(destinationPath);
    if (!verified.equals(contents)) {
      const error = new Error('customer copy verification failed') as NodeJS.ErrnoException;
      error.code = 'EIO';
      throw error;
    }
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

/**
 * Surface the PDF only when its bytes verify against the current canonical report's provenance.
 * A matching deliverables PDF is copied out; otherwise the unverifiable source is removed, and
 * an already-verified customer PDF is preserved rather than deleted. Every failure here is a
 * warning: the PDF is a secondary artifact and cannot fail the run or change its status.
 */
async function surfaceProvenancedPdf(args: {
  readonly deliverablesDir: string;
  readonly customerDir: string;
  readonly canonicalReportSha256: string;
  readonly provenance: PdfProvenance | null;
  readonly logger: ActivityLogger;
  readonly copyOutput: (sourcePath: string, destinationPath: string) => Promise<void>;
  readonly surfaced: string[];
  readonly removedStale: string[];
  readonly warnings: string[];
}): Promise<void> {
  const sourcePath = path.join(args.deliverablesDir, ASSEMBLED_REPORT_PDF_FILENAME);
  const destinationPath = path.join(args.customerDir, FINAL_REPORT_PDF_FILENAME);
  const sourceMatches =
    args.provenance !== null &&
    (await pdfMatchesProvenance({
      pdfPath: sourcePath,
      canonicalReportSha256: args.canonicalReportSha256,
      provenance: args.provenance,
    }));

  if (sourceMatches) {
    try {
      await args.copyOutput(sourcePath, destinationPath);
      args.surfaced.push(FINAL_REPORT_PDF_FILENAME);
      args.logger.info(`Surfaced ${FINAL_REPORT_PDF_FILENAME}`);
    } catch (error) {
      const warning = `The PDF report could not be produced (${errorLabel(error)}). The Markdown report and the structured findings are unaffected.`;
      args.warnings.push(warning);
      args.logger.warn(warning);
    }
    return;
  }

  try {
    await removeIfPresent(sourcePath);
  } catch (error) {
    const warning = `An out-of-date PDF could not be deleted (${errorLabel(error)}). Ignore any PDF in this workspace and use the Markdown report.`;
    args.warnings.push(warning);
    args.logger.warn(warning);
  }

  const customerMatches =
    args.provenance !== null &&
    (await pdfMatchesProvenance({
      pdfPath: destinationPath,
      canonicalReportSha256: args.canonicalReportSha256,
      provenance: args.provenance,
    }));
  if (customerMatches) {
    args.logger.info(`Preserved verified ${FINAL_REPORT_PDF_FILENAME}`);
    return;
  }

  try {
    if (await removeIfPresent(destinationPath)) args.removedStale.push(FINAL_REPORT_PDF_FILENAME);
  } catch (error) {
    const warning = `An out-of-date PDF could not be deleted (${errorLabel(error)}). Ignore any PDF in this workspace and use the Markdown report.`;
    args.warnings.push(warning);
    args.logger.warn(warning);
  }
}

/**
 * Surface only Markdown, PDF, and optional SARIF. A copy failure never changes workflow status;
 * it produces a warning and leaves any previous destination atomically intact.
 */
export async function surfaceReportOutputs(args: {
  readonly deliverablesDir: string;
  readonly customerDir: string;
  readonly logger: ActivityLogger;
  readonly copyOutput?: (sourcePath: string, destinationPath: string) => Promise<void>;
  /** Enables verified PDF reuse once the integration layer supplies durable provenance. */
  readonly pdfVerification?: {
    readonly canonicalReportSha256: string;
    readonly provenance: PdfProvenance | null;
  };
}): Promise<ReportOutputSurfaceResult> {
  const outputs: SurfaceOutput[] = [
    {
      source: ASSEMBLED_REPORT_FILENAME,
      destination: FINAL_REPORT_MD_FILENAME,
      removeWhenSourceMissing: false,
    },
  ];
  // With provenance supplied, the PDF is surfaced by surfaceProvenancedPdf under a byte check;
  // without it, the PDF falls back to the same unconditional copy as the other outputs.
  if (args.pdfVerification === undefined) {
    outputs.push({
      source: ASSEMBLED_REPORT_PDF_FILENAME,
      destination: FINAL_REPORT_PDF_FILENAME,
      removeWhenSourceMissing: true,
    });
  }
  outputs.push({ source: SARIF_FILENAME, destination: SARIF_FILENAME, removeWhenSourceMissing: true });
  const copyOutput = args.copyOutput ?? atomicCopy;
  const surfaced: string[] = [];
  const removedStale: string[] = [];
  const warnings: string[] = [];

  for (const output of outputs) {
    const sourcePath = path.join(args.deliverablesDir, output.source);
    const destinationPath = path.join(args.customerDir, output.destination);
    try {
      await copyOutput(sourcePath, destinationPath);
      surfaced.push(output.destination);
      args.logger.info(`Surfaced ${output.destination}`);
    } catch (error) {
      // An absent optional source is the expected state, not a degradation: drop any stale copy
      // left by an earlier run and move on without a warning the operator would learn to ignore.
      const sourceLegitimatelyAbsent = isErrno(error, 'ENOENT') && output.removeWhenSourceMissing;
      if (sourceLegitimatelyAbsent) {
        try {
          if (await removeIfPresent(destinationPath)) removedStale.push(output.destination);
        } catch (cleanupError) {
          const warning = `Could not remove stale ${output.destination} (${errorLabel(cleanupError)})`;
          warnings.push(warning);
          args.logger.warn(warning);
        }
        continue;
      }
      const warning = `Could not surface ${output.destination} (${errorLabel(error)})`;
      warnings.push(warning);
      args.logger.warn(warning);
    }
  }

  if (args.pdfVerification !== undefined) {
    await surfaceProvenancedPdf({
      deliverablesDir: args.deliverablesDir,
      customerDir: args.customerDir,
      canonicalReportSha256: args.pdfVerification.canonicalReportSha256,
      provenance: args.pdfVerification.provenance,
      logger: args.logger,
      copyOutput,
      surfaced,
      removedStale,
      warnings,
    });
  }

  return { surfaced, removedStale, warnings };
}
