// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Internal class vocabulary for reconciliation and exploitation.
 *
 * Public configuration continues to use the five-class `VulnClass`. The
 * analysis-less `miscellaneous` class exists only after an effective SAST
 * reference enters the internal pipeline.
 */

import type { VulnClass } from './config.js';

export type ReconciliationClass = VulnClass | 'miscellaneous';

/** Fixed processing and report-input order for all internal classes. */
export const ALL_RECONCILIATION_CLASSES = [
  'injection',
  'xss',
  'auth',
  'authz',
  'ssrf',
  'miscellaneous',
] as const satisfies readonly ReconciliationClass[];
