// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { loadObservation, type ObservationFileJob, ObservationOutputError } from './files.js';

// Private fixed entrypoint: no artifact can select executable code or environment.
process.once('message', async (job: ObservationFileJob) => {
  try {
    const report = await loadObservation(job);
    process.send?.({ report }, () => process.disconnect?.());
  } catch (error) {
    process.send?.({ outputLimit: error instanceof ObservationOutputError }, () => process.disconnect?.());
  }
});
