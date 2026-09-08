// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { loadAccessValidationBundle } from '../blackbox-observation/access-validation-files.js';

const args = process.argv.slice(2);
if (args.length !== 1 || !args[0]) {
  process.stderr.write('Usage: validate-blackbox-bundle <directory>\n');
  process.exitCode = 2;
} else {
  try {
    const resolved = await loadAccessValidationBundle(args[0]);
    process.stdout.write(`${JSON.stringify(resolved)}\n`);
  } catch {
    process.stderr.write('Black-box access validation bundle is invalid.\n');
    process.exitCode = 1;
  }
}
