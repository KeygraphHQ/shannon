// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { type AccessComparisonFileJob, loadAccessComparison } from './access-files.js';
import { compareAccessObservation } from './access-index.js';
import { AccessComparisonOutputError } from './access-serialize.js';

// Private fixed entrypoint: no artifact can select executable code or environment.
process.once('message', async (job: AccessComparisonFileJob) => {
  try {
    const report = await loadAccessComparison(job, compareAccessObservation);
    process.send?.({ report }, () => process.disconnect?.());
  } catch (error) {
    process.send?.({ outputLimit: error instanceof AccessComparisonOutputError }, () => process.disconnect?.());
  }
});
