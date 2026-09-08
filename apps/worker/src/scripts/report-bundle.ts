// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { BundleOperationError, checkReportBundle, exportReportBundle } from '../reporting/bundle.js';
import { buildReportCatalog } from '../reporting/report-catalog.js';
import { exportReportLibrary } from '../reporting/report-library.js';

const usage =
  'Usage: reports check <directory> [--require-integrity] | reports archive <source> <new-directory> | reports share <source> <new-directory> | reports catalog <root> | reports library <root> <new-directory>';
const args = process.argv.slice(2);
const [operation, source, destination] = args;

try {
  if (operation === '--help' && args.length === 1) {
    console.log(usage);
  } else if (
    operation === 'check' &&
    source &&
    (args.length === 2 || (args.length === 3 && destination === '--require-integrity'))
  ) {
    const check = await checkReportBundle(source);
    const required = destination === '--require-integrity';
    console.log(JSON.stringify({ operation, ...check }));
    process.exitCode = check.valid && (!required || check.integrity === 'matched') ? 0 : 1;
  } else if ((operation === 'archive' || operation === 'share') && source && destination && args.length === 3) {
    const check = await exportReportBundle(source, destination, operation === 'archive' ? 'private' : 'sanitized');
    console.log(JSON.stringify({ operation, ...check }));
  } else if (operation === 'catalog' && source && args.length === 2) {
    const catalog = await buildReportCatalog(source);
    console.log(JSON.stringify({ operation, ...catalog }));
    process.exitCode = catalog.complete ? 0 : 1;
  } else if (operation === 'library' && source && destination && args.length === 3) {
    const catalog = await exportReportLibrary(source, destination);
    console.log(
      JSON.stringify({
        operation,
        schemaVersion: 1,
        complete: true,
        totals: catalog.totals,
        files: ['catalog.json', 'index.html'],
        privacy: 'private-local-metadata',
      }),
    );
  } else {
    console.log(JSON.stringify({ schemaVersion: 1, valid: false, issues: [{ code: 'usage', message: usage }] }));
    process.exitCode = 2;
  }
} catch (error) {
  const issues =
    error instanceof BundleOperationError
      ? error.issues
      : [{ code: 'operation_failed', message: 'Report operation failed. Diagnostics omit input values.' }];
  console.log(JSON.stringify({ schemaVersion: 1, valid: false, issues }));
  process.exitCode = 1;
}
