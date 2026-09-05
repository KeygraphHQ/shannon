/** Deterministic bare-CWE routing into Shannon's six internal classes. */

import type { ReconciliationClass } from '../../../types/reconciliation.js';
import type { Confidence, CWEMapping, ShannonCategory } from './types.js';

export const CWE_TO_CATEGORY: Readonly<Record<string, CWEMapping>> = Object.freeze({
  'CWE-89': { category: 'INJECTION', name: 'SQL Injection', priority: 'P1' },
  'CWE-78': { category: 'INJECTION', name: 'OS Command Injection', priority: 'P1' },
  'CWE-95': { category: 'INJECTION', name: 'Code/Eval Injection', priority: 'P1' },
  'CWE-94': { category: 'INJECTION', name: 'Code Injection', priority: 'P1' },
  'CWE-502': { category: 'INJECTION', name: 'Deserialization', priority: 'P1' },
  'CWE-611': { category: 'INJECTION', name: 'XXE', priority: 'P1' },
  'CWE-22': { category: 'INJECTION', name: 'Path Traversal', priority: 'P1' },
  'CWE-434': { category: 'INJECTION', name: 'Unrestricted File Upload', priority: 'P1' },
  'CWE-943': { category: 'INJECTION', name: 'NoSQL Injection', priority: 'P1' },
  'CWE-93': { category: 'INJECTION', name: 'CRLF Injection', priority: 'P2' },
  'CWE-117': { category: 'INJECTION', name: 'Log Injection', priority: 'P2' },
  'CWE-470': { category: 'INJECTION', name: 'Unsafe Reflection', priority: 'P2' },
  'CWE-829': { category: 'INJECTION', name: 'Untrusted Function Inclusion', priority: 'P1' },
  'CWE-643': { category: 'INJECTION', name: 'XPath Injection', priority: 'P2' },
  'CWE-90': { category: 'INJECTION', name: 'LDAP Injection', priority: 'P2' },
  'CWE-91': { category: 'INJECTION', name: 'XML Injection', priority: 'P2' },
  'CWE-1336': { category: 'INJECTION', name: 'Template Injection', priority: 'P1' },
  'CWE-1427': { category: 'INJECTION', name: 'Prompt Injection', priority: 'P2' },
  'CWE-1321': { category: 'INJECTION', name: 'Prototype Pollution', priority: 'P1' },
  'CWE-548': { category: 'INJECTION', name: 'Directory Listing', priority: 'P3' },

  'CWE-79': { category: 'XSS', name: 'Cross-Site Scripting', priority: 'P1' },

  'CWE-287': { category: 'AUTH', name: 'Broken Authentication', priority: 'P1' },
  'CWE-798': { category: 'AUTH', name: 'Hard-coded Credentials', priority: 'P1' },
  'CWE-319': { category: 'AUTH', name: 'Cleartext Transmission', priority: 'P2' },
  'CWE-330': { category: 'AUTH', name: 'Insufficient Randomness', priority: 'P2' },
  'CWE-346': { category: 'AUTH', name: 'Origin Validation Error', priority: 'P2' },
  'CWE-295': { category: 'AUTH', name: 'Improper Certificate Validation', priority: 'P2' },
  'CWE-347': { category: 'AUTH', name: 'Improper Signature Verification', priority: 'P2' },
  'CWE-326': { category: 'AUTH', name: 'Inadequate Encryption', priority: 'P3' },
  'CWE-329': { category: 'AUTH', name: 'Predictable IV', priority: 'P3' },
  'CWE-323': { category: 'AUTH', name: 'Nonce or Key Pair Reuse', priority: 'P2' },
  'CWE-327': { category: 'AUTH', name: 'Broken Cryptographic Algorithm', priority: 'P3' },
  'CWE-328': { category: 'AUTH', name: 'Weak Hash', priority: 'P3' },
  'CWE-916': { category: 'AUTH', name: 'Weak Password Hash Effort', priority: 'P3' },
  'CWE-614': { category: 'AUTH', name: 'Cookie without Secure Flag', priority: 'P3' },
  'CWE-942': { category: 'AUTH', name: 'Permissive Cross-domain Policy', priority: 'P3' },
  'CWE-1004': { category: 'AUTH', name: 'Cookie without HttpOnly', priority: 'P3' },
  'CWE-522': { category: 'AUTH', name: 'Insufficiently Protected Credentials', priority: 'P1' },
  'CWE-306': { category: 'AUTH', name: 'Missing Authentication', priority: 'P1' },
  'CWE-208': { category: 'AUTH', name: 'Timing Side-Channel', priority: 'P2' },
  'CWE-338': { category: 'AUTH', name: 'Weak PRNG', priority: 'P2' },

  'CWE-639': { category: 'AUTHZ', name: 'IDOR', priority: 'P1' },
  'CWE-285': { category: 'AUTHZ', name: 'Broken Authorization', priority: 'P1' },
  'CWE-269': { category: 'AUTHZ', name: 'Privilege Escalation', priority: 'P1' },
  'CWE-284': { category: 'AUTHZ', name: 'Improper Access Control', priority: 'P1' },
  'CWE-653': { category: 'AUTHZ', name: 'Data Isolation Failure', priority: 'P1' },
  'CWE-732': { category: 'AUTHZ', name: 'Incorrect Permission Assignment', priority: 'P2' },
  'CWE-862': { category: 'AUTHZ', name: 'Missing Authorization', priority: 'P1' },
  'CWE-378': { category: 'AUTHZ', name: 'Permission Issue', priority: 'P2' },
  'CWE-359': { category: 'AUTHZ', name: 'PII Exposure', priority: 'P1' },
  'CWE-915': { category: 'AUTHZ', name: 'Mass Assignment', priority: 'P1' },

  'CWE-918': { category: 'SSRF', name: 'Server-Side Request Forgery', priority: 'P1' },

  'CWE-601': { category: 'MISC', name: 'Open Redirect', priority: 'P2' },
  'CWE-693': { category: 'MISC', name: 'Protection Mechanism Failure', priority: 'P3' },
  'CWE-1021': { category: 'MISC', name: 'Clickjacking', priority: 'P3' },
  'CWE-1333': { category: 'MISC', name: 'ReDoS', priority: 'P3' },
  'CWE-489': { category: 'MISC', name: 'Active Debug Code', priority: 'P3' },
  'CWE-352': { category: 'MISC', name: 'CSRF', priority: 'P1' },
  'CWE-532': { category: 'MISC', name: 'Sensitive Logging', priority: 'P3' },
  'CWE-311': { category: 'MISC', name: 'Missing Encryption at Rest', priority: 'P3' },
  'CWE-922': { category: 'MISC', name: 'Insecure Storage', priority: 'P3' },
  'CWE-1236': { category: 'MISC', name: 'CSV Formula Injection', priority: 'P2' },
});

// Routing to `miscellaneous` (rather than dropping the finding) is what lets every schema-valid
// SARIF result reach exploitation even when its CWE is not one of the ones Shannon names explicitly:
// an unrecognized bare CWE still gets its own producer identity and its own exploitation task, just
// without a specific category name and at the lowest priority.
/** Unknown, but schema-valid, bare CWEs are retained for the generalist class. */
export function unmappedMapping(ruleId: string): CWEMapping {
  return { category: 'MISC', name: ruleId, priority: 'P3' };
}

export function vulnerabilityClassToCategory(vulnerabilityClass: ReconciliationClass): ShannonCategory {
  const categories: Record<ReconciliationClass, ShannonCategory> = {
    injection: 'INJECTION',
    xss: 'XSS',
    auth: 'AUTH',
    authz: 'AUTHZ',
    ssrf: 'SSRF',
    miscellaneous: 'MISC',
  };
  return categories[vulnerabilityClass];
}

export function normalizeConfidence(confidence: string | undefined): Confidence | undefined {
  if (confidence === undefined) return undefined;
  const normalized = confidence.toLowerCase();
  if (normalized === 'med' || normalized === 'medium') return 'medium';
  if (normalized === 'high' || normalized === 'low') return normalized;
  return undefined;
}
