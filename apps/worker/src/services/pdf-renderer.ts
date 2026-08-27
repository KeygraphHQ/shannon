// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Typst PDF renderer.
 *
 * Adapts the structured report.json into the Typst-shaped schema and compiles
 * it to a PDF with the bundled report.typ template. Compilation runs in an
 * isolated temp dir: the template is copied in and the adapted JSON is written
 * beside it so `--root` can scope every file read to that dir, matching how the
 * template resolves `--input data=/data.json`.
 *
 * The `typst` binary is installed in the worker image and resolved from PATH.
 */

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { adaptReportToTypst } from './report-json-adapter.js';
import type { ReportData } from './report-renderer.js';

const execFileAsync = promisify(execFile);

const DEFAULT_TESTER = 'Shannon';
const DEFAULT_BRAND = 'Shannon | AI Pentester by Keygraph';

const DATA_FILENAME = 'data.json';
const TEMPLATE_FILENAME = 'report.typ';
const OUTPUT_FILENAME = 'report.pdf';

export const PDF_RENDERER_VERSION = '1';

export interface PdfProvenance {
  readonly pdf_sha256: string;
  readonly canonical_report_sha256: string;
  readonly renderer_version: string;
  readonly template_version: string;
}

export interface RenderReportPdfOptions {
  /** Structured report data (report.json contents), pre-assembly. */
  readonly reportData: ReportData;
  /** Absolute path to the bundled report.typ template. */
  readonly templatePath: string;
  /** Absolute path where the compiled PDF should be written. */
  readonly outputPath: string;
  /** Name shown on the cover/footer. Defaults to "Shannon". */
  readonly tester?: string;
  /** Wordmark shown on the cover. Defaults to "Shannon | AI Pentester by Keygraph". */
  readonly brand?: string;
}

function sha256(contents: Uint8Array): string {
  return createHash('sha256').update(contents).digest('hex');
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

/** Validate the closed durable provenance shape used for PDF reuse. */
export function isPdfProvenance(value: unknown): value is PdfProvenance {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 4 &&
    isSha256(candidate.pdf_sha256) &&
    isSha256(candidate.canonical_report_sha256) &&
    typeof candidate.renderer_version === 'string' &&
    candidate.renderer_version.length > 0 &&
    typeof candidate.template_version === 'string' &&
    candidate.template_version.length > 0
  );
}

/** Build provenance only after the renderer has atomically published verified PDF bytes. */
export async function readPdfProvenance(args: {
  readonly pdfPath: string;
  readonly canonicalReportSha256: string;
  readonly templatePath: string;
}): Promise<PdfProvenance> {
  const [pdfBytes, templateBytes] = await Promise.all([readFile(args.pdfPath), readFile(args.templatePath)]);
  return {
    pdf_sha256: sha256(pdfBytes),
    canonical_report_sha256: args.canonicalReportSha256,
    renderer_version: PDF_RENDERER_VERSION,
    template_version: sha256(templateBytes),
  };
}

/** Recompute the PDF digest before trusting persisted provenance for the current report. */
export async function pdfMatchesProvenance(args: {
  readonly pdfPath: string;
  readonly canonicalReportSha256: string;
  readonly provenance: PdfProvenance;
}): Promise<boolean> {
  if (!isPdfProvenance(args.provenance) || args.provenance.canonical_report_sha256 !== args.canonicalReportSha256) {
    return false;
  }
  try {
    return sha256(await readFile(args.pdfPath)) === args.provenance.pdf_sha256;
  } catch {
    return false;
  }
}

/**
 * Full currency check: the PDF is current only when its bytes, canonical report digest,
 * renderer version, and template version all match the provenance record. A record from an
 * older renderer or template is stale even when it is internally consistent.
 */
export async function pdfProvenanceIsCurrent(args: {
  readonly pdfPath: string;
  readonly canonicalReportSha256: string;
  readonly provenance: PdfProvenance;
  readonly templatePath: string;
}): Promise<boolean> {
  if (args.provenance.renderer_version !== PDF_RENDERER_VERSION) return false;
  let templateSha256: string;
  try {
    templateSha256 = sha256(await readFile(args.templatePath));
  } catch {
    return false;
  }
  if (args.provenance.template_version !== templateSha256) return false;
  return pdfMatchesProvenance({
    pdfPath: args.pdfPath,
    canonicalReportSha256: args.canonicalReportSha256,
    provenance: args.provenance,
  });
}

/**
 * Compile the report to a PDF at `outputPath`.
 *
 * Throws if adaptation or `typst compile` fails; callers treat the PDF as a
 * secondary artifact and should not let a failure here fail the run.
 */
export async function renderReportPdf(options: RenderReportPdfOptions): Promise<void> {
  const { reportData, templatePath, outputPath } = options;
  const tester = options.tester ?? DEFAULT_TESTER;
  const brand = options.brand ?? DEFAULT_BRAND;

  const typstData = adaptReportToTypst(reportData);

  const workDir = await mkdtemp(path.join(tmpdir(), 'shannon-typst-'));
  try {
    const templateInWorkDir = path.join(workDir, TEMPLATE_FILENAME);
    const dataInWorkDir = path.join(workDir, DATA_FILENAME);
    const pdfInWorkDir = path.join(workDir, OUTPUT_FILENAME);

    await copyFile(templatePath, templateInWorkDir);

    // Ship the template's assets (e.g. the cover logo) so `--root`-scoped image reads resolve.
    const assetsDir = path.join(path.dirname(templatePath), 'assets');
    if (existsSync(assetsDir)) {
      await cp(assetsDir, path.join(workDir, 'assets'), { recursive: true });
    }

    await writeFile(dataInWorkDir, JSON.stringify(typstData), 'utf-8');

    await execFileAsync('typst', [
      'compile',
      '--root',
      workDir,
      '--input',
      `data=/${DATA_FILENAME}`,
      '--input',
      `tester=${tester}`,
      '--input',
      `brand=${brand}`,
      templateInWorkDir,
      pdfInWorkDir,
    ]);

    await mkdir(path.dirname(outputPath), { recursive: true });
    // Publish the compiled PDF by atomic rename, so a reader never observes a half-written file
    // at outputPath and provenance can be recorded only after the complete bytes are in place.
    const outputAttemptPath = `${outputPath}.tmp-${randomUUID()}`;
    try {
      await copyFile(pdfInWorkDir, outputAttemptPath);
      await rename(outputAttemptPath, outputPath);
    } catch (error) {
      await unlink(outputAttemptPath).catch(() => undefined);
      throw error;
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
