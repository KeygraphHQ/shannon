// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * The CLI ships as a standalone bundle, so it cannot import from the worker package. The
 * OrcaRouter catalogue, origins, and credential seam are therefore duplicated across the
 * two apps and each pair must stay byte-identical below its header.
 *
 * This is the same hazard the repository already documents for `model-spec.ts`, where a
 * provider list drifting between the copies fails no build and simply makes one side
 * disagree with the runtime. Comparing the files outright is what makes the drift loud.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WORKER_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.resolve(WORKER_DIR, '../../../../cli/src/orcarouter');

/** Files duplicated verbatim across the two packages. */
const MIRRORED_FILES = ['catalog.ts', 'endpoints.ts', 'credentials.ts'] as const;

/**
 * Each file's module docblock names the copy it mirrors, so that paragraph is expected to
 * differ. Everything after the docblock — every declaration, import, and default — must be
 * identical, which is what this slices out.
 */
function bodyWithoutHeader(source: string): string {
  const docblockEnd = source.indexOf('*/');
  if (docblockEnd === -1) return source;
  return source.slice(source.indexOf('\n', docblockEnd));
}

describe('mirrored OrcaRouter modules', () => {
  for (const file of MIRRORED_FILES) {
    it(`${file} is identical in the worker and the CLI`, () => {
      const workerSource = readFileSync(path.join(WORKER_DIR, file), 'utf8');
      const cliSource = readFileSync(path.join(CLI_DIR, file), 'utf8');

      expect(bodyWithoutHeader(cliSource)).toBe(bodyWithoutHeader(workerSource));
    });
  }

  it('keeps the mirrored header pointing at the other copy', () => {
    for (const file of MIRRORED_FILES) {
      const cliSource = readFileSync(path.join(CLI_DIR, file), 'utf8');
      expect(cliSource).toContain(`apps/worker/src/ai/orcarouter/${file}`);
    }
  });
});
