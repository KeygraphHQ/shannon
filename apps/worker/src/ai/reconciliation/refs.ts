// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Stable producer and exploitation-task reference namespaces. */

import type { ReconciliationClass } from '../../types/reconciliation.js';

export const REF_PREFIX: Readonly<Record<ReconciliationClass, string>> = Object.freeze({
  injection: 'INJ',
  xss: 'XSS',
  auth: 'AUTH',
  authz: 'AUTHZ',
  ssrf: 'SSRF',
  miscellaneous: 'MISC',
});

export type ProducerSource = 'VULN' | 'SAST';

function positiveReferenceNumberPattern(): string {
  return '0*[1-9][0-9]*';
}

/** The source-aware producer-ID pattern admitted for one internal class. */
export function producerIdPattern(vulnClass: ReconciliationClass, source: ProducerSource): RegExp {
  if (vulnClass === 'miscellaneous' && source === 'VULN') {
    // The `miscellaneous` class has no vulnerability-analysis producer: it is seeded queue-only
    // and carries SAST producers alone. This pattern can never match, so any `MISC-VULN-*` ID
    // is rejected rather than admitted.
    return /(?!)^/;
  }
  return new RegExp(`^${REF_PREFIX[vulnClass]}-${source}-${positiveReferenceNumberPattern()}$`);
}

/** Whether an ID belongs to the class and producer source that declared it. */
export function isProducerId(id: string, vulnClass: ReconciliationClass, source: ProducerSource): boolean {
  return producerIdPattern(vulnClass, source).test(id);
}

/** The stable exploitation-task reference pattern for one internal class. */
export function taskReferencePattern(vulnClass: ReconciliationClass): RegExp {
  return new RegExp(`^${REF_PREFIX[vulnClass]}-${positiveReferenceNumberPattern()}$`);
}

/** Whether an ID is a stable task reference in the declared class namespace. */
export function isTaskReference(id: string, vulnClass: ReconciliationClass): boolean {
  return taskReferencePattern(vulnClass).test(id);
}
