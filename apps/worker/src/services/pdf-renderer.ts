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
import { existsSync } from 'node:fs';
import { copyFile, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { TYPST_BRAND } from '../branding.js';
import { adaptReportToTypst } from './report-json-adapter.js';
import type { ReportData } from './report-renderer.js';

const execFileAsync = promisify(execFile);

const DEFAULT_TESTER = 'Shannon';
const DEFAULT_BRAND = TYPST_BRAND;

const DATA_FILENAME = 'data.json';
const TEMPLATE_FILENAME = 'report.typ';
const OUTPUT_FILENAME = 'report.pdf';

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
    await copyFile(pdfInWorkDir, outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
