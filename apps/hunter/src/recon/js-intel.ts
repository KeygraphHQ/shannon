/**
 * JavaScript intelligence.
 *
 * Treats client-side JavaScript as a first-class recon source: endpoint
 * strings, API base URLs, and internal host references become new
 * `RawDiscovery`/`Observation` candidates (still requiring validation, per
 * section 6 — a string that looks like a secret is never itself collected
 * in full; only a short, truncated fingerprint is kept, and it is surfaced
 * as an observation that requires human/validated review, never logged or
 * reported verbatim).
 */

import type { Observation, ObservationSource, RawDiscovery } from '../types.js';

const ENDPOINT_PATTERN = /["'`](\/(?:api|internal|admin|v\d+)[a-zA-Z0-9_\-/{}]*)["'`]/g;
const INTERNAL_HOST_PATTERN = /\b([a-zA-Z0-9-]+\.(?:internal|corp|staging|local))\b/g;
const FEATURE_FLAG_PATTERN = /featureFlags?\s*[:=]/i;
const DOM_XSS_SOURCE_PATTERN = /location\.(?:search|hash)|URLSearchParams/;
const DOM_XSS_SINK_PATTERN = /\.innerHTML\s*=|document\.write\(|insertAdjacentHTML\(/;

const SECRET_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'jwt-like-token', pattern: /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g },
  {
    name: 'generic-api-key-assignment',
    pattern: /(?:api[_-]?key|secret|token)\s*[:=]\s*["']([A-Za-z0-9\-_.]{16,})["']/gi,
  },
];

function fingerprint(value: string): string {
  return `${value.slice(0, 4)}…(${value.length} chars, redacted)`;
}

export interface JsIntelResult {
  readonly observations: readonly Observation[];
  readonly discoveries: readonly RawDiscovery[];
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Analyzes one JS artifact's source text. `sourceRef` identifies where it
 * came from (a bundle URL, or a source-map-resolved file path) for
 * provenance; `assetRef` is the application/asset this artifact belongs to.
 */
export function analyzeJavaScript(
  source: string,
  sourceRef: string,
  assetRef: string,
  engagementId: string,
): JsIntelResult {
  const collectedAt = new Date().toISOString();
  const observations: Observation[] = [];
  const discoveries: RawDiscovery[] = [];
  const obsSource: ObservationSource = 'js-intelligence';

  discoveries.push({
    source: 'js-intelligence',
    kind: 'js-artifact',
    label: sourceRef,
    attributes: { assetRef, sizeBytes: source.length },
    confidence: 1,
    discoveredAt: collectedAt,
  });

  const endpoints = new Set<string>();
  for (const match of source.matchAll(ENDPOINT_PATTERN)) {
    const path = match[1];
    if (path) endpoints.add(path);
  }
  for (const path of endpoints) {
    discoveries.push({
      source: 'js-intelligence',
      kind: 'endpoint',
      label: path,
      attributes: { discoveredIn: sourceRef },
      confidence: 0.6,
      discoveredAt: collectedAt,
    });
    observations.push({
      id: nextId('obs-js-endpoint'),
      engagementId,
      source: obsSource,
      assetRef,
      vulnClass: 'js-intel-endpoint-discovery',
      title: `Endpoint "${path}" referenced in client-side JavaScript`,
      description: `${sourceRef} references "${path}", which was not otherwise discovered — treat as an undocumented endpoint requiring active-recon confirmation before further investigation.`,
      severityHint: 'informational',
      confidenceHint: 'medium',
      verified: false,
      tags: ['js-intelligence'],
      collectedAt,
    });
  }

  const internalHosts = new Set<string>();
  for (const match of source.matchAll(INTERNAL_HOST_PATTERN)) {
    const host = match[1];
    if (host) internalHosts.add(host);
  }
  for (const host of internalHosts) {
    observations.push({
      id: nextId('obs-js-internal-host'),
      engagementId,
      source: obsSource,
      assetRef,
      vulnClass: 'js-intel-internal-reference',
      title: `Internal-looking host "${host}" referenced in client-side JavaScript`,
      description: `${sourceRef} references "${host}", which looks like an internal/non-public host. Not evidence of a vulnerability by itself.`,
      severityHint: 'informational',
      confidenceHint: 'low',
      verified: false,
      tags: ['js-intelligence'],
      collectedAt,
    });
  }

  if (DOM_XSS_SOURCE_PATTERN.test(source) && DOM_XSS_SINK_PATTERN.test(source)) {
    observations.push({
      id: nextId('obs-js-dom-xss'),
      engagementId,
      source: obsSource,
      assetRef,
      vulnClass: 'xss',
      title: `Possible DOM XSS sink fed by an untrusted source in ${sourceRef}`,
      description: `${sourceRef} both reads an attacker-controllable source (location.search/hash or URLSearchParams) and writes to a DOM sink (innerHTML/document.write/insertAdjacentHTML). Static signal only — requires dynamic confirmation.`,
      severityHint: 'medium',
      confidenceHint: 'medium',
      verified: false,
      tags: ['js-intelligence'],
      collectedAt,
    });
  }

  if (FEATURE_FLAG_PATTERN.test(source)) {
    observations.push({
      id: nextId('obs-js-feature-flags'),
      engagementId,
      source: obsSource,
      assetRef,
      vulnClass: 'js-intel-feature-flags',
      title: `Feature-flag configuration referenced in ${sourceRef}`,
      description:
        'Client-side feature-flag logic may gate server-side authorization decisions on the client; worth checking for client-enforced-only access control.',
      severityHint: 'low',
      confidenceHint: 'low',
      verified: false,
      tags: ['js-intelligence'],
      collectedAt,
    });
  }

  for (const { name, pattern } of SECRET_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const value = match[0];
      observations.push({
        id: nextId('obs-js-secret'),
        engagementId,
        source: obsSource,
        assetRef,
        vulnClass: 'js-intel-secret-exposure',
        title: `Possible ${name} exposed in ${sourceRef}`,
        description: `A string matching the "${name}" pattern was found (${fingerprint(value)}). Requires human validation — do not use the credential, and do not log or report it in full.`,
        severityHint: 'high',
        confidenceHint: 'low',
        verified: false,
        tags: ['js-intelligence', 'requires-manual-review'],
        collectedAt,
      });
    }
  }

  return { observations, discoveries };
}
