/**
 * JavaScript intelligence.
 *
 * Treats client-side JavaScript as a first-class application intelligence
 * source, not a secret scanner: endpoint strings (with HTTP methods where
 * inferable), GraphQL operations, auth/role logic, workflow functions,
 * third-party integrations, environment references, source-map hints,
 * chunk relationships, client-side state transitions, feature flags,
 * internal host references, and — still — a redaction-safe secret scan.
 *
 * Every extracted signal becomes a `RawDiscovery`/`Observation` (still
 * requiring validation, per section 6 — a string that looks like a secret
 * is never itself collected in full; only a short, truncated fingerprint is
 * kept). The higher-value categories additionally produce a
 * `ProvenanceEdge` (`worldmodel/provenance.ts`) — JS file -> extracted
 * behavior -> world-model sink — so a suspicious transformation feeds
 * hypothesis generation rather than only being logged as an observation.
 */

import type { Observation, ObservationSource, RawDiscovery } from '../types.js';
import { type NewProvenanceEdgeInput, type ProvenanceEdge, recordProvenanceEdge } from '../worldmodel/provenance.js';

const ENDPOINT_PATTERN = /["'`](\/(?:api|internal|admin|v\d+)[a-zA-Z0-9_\-/{}]*)["'`]/g;
const INTERNAL_HOST_PATTERN = /\b([a-zA-Z0-9-]+\.(?:internal|corp|staging|local))\b/g;
const FEATURE_FLAG_PATTERN = /featureFlags?\s*[:=]/i;
const DOM_XSS_SOURCE_PATTERN = /location\.(?:search|hash)|URLSearchParams/;
const DOM_XSS_SINK_PATTERN = /\.innerHTML\s*=|document\.write\(|insertAdjacentHTML\(/;

const HTTP_METHOD_CALL_PATTERN = /\.(get|post|put|delete|patch|head|options)\s*\(\s*$/i;
const HTTP_METHOD_OPTION_PATTERN = /method\s*:\s*["'`](GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)["'`]/i;

const GRAPHQL_OPERATION_PATTERN = /\b(query|mutation|subscription)\s+([A-Za-z0-9_]+)\s*[({]/;
const GRAPHQL_TAG_PATTERN = /\bgql\s*`/;

const AUTH_ROLE_LOGIC_PATTERN =
  /\brole\s*(?:===|==|!==|!=)\s*['"][^'"]+['"]|\b(?:isAdmin|hasPermission|hasRole|requiresAuth|checkAccess)\s*\(/;

const WORKFLOW_FUNCTION_PATTERN =
  /\b(?:function|const|let)\s+(checkout|approve\w*|submit\w*|transition\w*|workflow\w*|refund\w*|cancelOrder\w*|completeOrder\w*)\s*[=(]/i;

const THIRD_PARTY_DOMAIN_PATTERN =
  /\b([a-zA-Z0-9-]+\.)*(stripe\.com|googleapis\.com|google-analytics\.com|segment\.(?:io|com)|sentry\.io|amazonaws\.com|cloudfront\.net|auth0\.com|okta\.com|braintreegateway\.com|paypal\.com|twilio\.com)\b/gi;

const ENV_REFERENCE_PATTERN = /\b(?:process\.env|import\.meta\.env)\.([A-Za-z0-9_]+)/g;

const SOURCE_MAP_PATTERN = /\/\/#\s*sourceMappingURL=(\S+)/;

const DYNAMIC_IMPORT_PATTERN = /import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const WEBPACK_CHUNK_NAME_PATTERN = /webpackChunkName\s*:\s*["'`]([^"'`]+)["'`]/g;

const CLIENT_STATE_TRANSITION_PATTERN =
  /\b(?:history\.pushState\(|history\.replaceState\(|useNavigate\(\s*\)\s*\(|router\.(?:push|replace)\s*\(|navigate\s*\(\s*["'`])/;

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
  /** Data-flow edges extracted from the JS itself — see module docstring. Not every observation produces one; only transformations plausibly reaching a security-relevant sink do. */
  readonly provenanceEdges: readonly ProvenanceEdge[];
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function methodsNear(source: string, matchIndex: number): readonly string[] {
  const before = source.slice(Math.max(0, matchIndex - 40), matchIndex);
  const after = source.slice(matchIndex, matchIndex + 120);
  const methods = new Set<string>();
  const callMatch = HTTP_METHOD_CALL_PATTERN.exec(before);
  if (callMatch?.[1]) methods.add(callMatch[1].toUpperCase());
  const optionMatch = HTTP_METHOD_OPTION_PATTERN.exec(after);
  if (optionMatch?.[1]) methods.add(optionMatch[1].toUpperCase());
  return Array.from(methods);
}

function baseObservation(params: {
  readonly id: string;
  readonly engagementId: string;
  readonly obsSource: ObservationSource;
  readonly assetRef: string;
  readonly vulnClass: string;
  readonly title: string;
  readonly description: string;
  readonly severityHint: string;
  readonly confidenceHint: string;
  readonly collectedAt: string;
  readonly extraTags?: readonly string[];
}): Observation {
  return {
    id: params.id,
    engagementId: params.engagementId,
    source: params.obsSource,
    assetRef: params.assetRef,
    vulnClass: params.vulnClass,
    title: params.title,
    description: params.description,
    severityHint: params.severityHint,
    confidenceHint: params.confidenceHint,
    verified: false,
    tags: ['js-intelligence', ...(params.extraTags ?? [])],
    collectedAt: params.collectedAt,
  };
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
  const provenanceEdges: ProvenanceEdge[] = [];
  const obsSource: ObservationSource = 'js-intelligence';

  const addEdge = (input: Omit<NewProvenanceEdgeInput, 'engagementId' | 'source'>) => {
    provenanceEdges.push(recordProvenanceEdge({ ...input, engagementId, source: 'js-intelligence' }));
  };

  discoveries.push({
    source: 'js-intelligence',
    kind: 'js-artifact',
    label: sourceRef,
    attributes: { assetRef, sizeBytes: source.length },
    confidence: 1,
    discoveredAt: collectedAt,
  });

  // === Endpoints (+ inferred HTTP methods) ===
  const endpointMethods = new Map<string, Set<string>>();
  for (const match of source.matchAll(ENDPOINT_PATTERN)) {
    const path = match[1];
    if (!path || match.index === undefined) continue;
    const methods = methodsNear(source, match.index);
    const bucket = endpointMethods.get(path);
    if (bucket) {
      for (const m of methods) bucket.add(m);
    } else {
      endpointMethods.set(path, new Set(methods));
    }
  }
  for (const [path, methods] of endpointMethods) {
    discoveries.push({
      source: 'js-intelligence',
      kind: 'endpoint',
      label: path,
      attributes: { discoveredIn: sourceRef, methods: Array.from(methods) },
      confidence: 0.6,
      discoveredAt: collectedAt,
    });
    observations.push(
      baseObservation({
        id: nextId('obs-js-endpoint'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-endpoint-discovery',
        title: `Endpoint "${path}" referenced in client-side JavaScript`,
        description: `${sourceRef} references "${path}"${methods.size > 0 ? ` (method(s): ${Array.from(methods).join(', ')})` : ''}, which was not otherwise discovered — treat as an undocumented endpoint requiring active-recon confirmation before further investigation.`,
        severityHint: 'informational',
        confidenceHint: 'medium',
        collectedAt,
      }),
    );
    if (/[{](\w+)[}]|:[a-zA-Z_]+\d*\b/.test(path)) {
      addEdge({
        sourceKind: 'js-configuration',
        sourceRef,
        transformation: 'client-side route/endpoint definition with a dynamic resource segment',
        sinkKind: 'api-endpoint',
        sinkRef: path,
        observation: `route "${path}" ships a dynamic segment, implying a resource identifier is passed straight through to the API`,
        confidence: 0.5,
      });
    }
  }

  // === Internal-looking hosts ===
  const internalHosts = new Set<string>();
  for (const match of source.matchAll(INTERNAL_HOST_PATTERN)) {
    const host = match[1];
    if (host) internalHosts.add(host);
  }
  for (const host of internalHosts) {
    observations.push(
      baseObservation({
        id: nextId('obs-js-internal-host'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-internal-reference',
        title: `Internal-looking host "${host}" referenced in client-side JavaScript`,
        description: `${sourceRef} references "${host}", which looks like an internal/non-public host. Not evidence of a vulnerability by itself.`,
        severityHint: 'informational',
        confidenceHint: 'low',
        collectedAt,
      }),
    );
  }

  // === DOM XSS candidate ===
  if (DOM_XSS_SOURCE_PATTERN.test(source) && DOM_XSS_SINK_PATTERN.test(source)) {
    observations.push(
      baseObservation({
        id: nextId('obs-js-dom-xss'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'xss',
        title: `Possible DOM XSS sink fed by an untrusted source in ${sourceRef}`,
        description: `${sourceRef} both reads an attacker-controllable source (location.search/hash or URLSearchParams) and writes to a DOM sink (innerHTML/document.write/insertAdjacentHTML). Static signal only — requires dynamic confirmation.`,
        severityHint: 'medium',
        confidenceHint: 'medium',
        collectedAt,
      }),
    );
    addEdge({
      sourceKind: 'url-parameter',
      sourceRef,
      transformation: 'read from location.search/hash (or URLSearchParams) with no visible sanitization',
      sinkKind: 'dom-sink',
      // The sink is described by the *asset* it renders into (a real,
      // testable URL) rather than the JS filename it was found in — the
      // filename is provenance for *where this was discovered*, not
      // something any downstream experiment (Shannon or otherwise) could
      // ever target.
      sinkRef: assetRef,
      observation: `an attacker-controllable source and a DOM sink co-occur in ${sourceRef}`,
      confidence: 0.5,
    });
  }

  // === Feature flags ===
  if (FEATURE_FLAG_PATTERN.test(source)) {
    observations.push(
      baseObservation({
        id: nextId('obs-js-feature-flags'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-feature-flags',
        title: `Feature-flag configuration referenced in ${sourceRef}`,
        description:
          'Client-side feature-flag logic may gate server-side authorization decisions on the client; worth checking for client-enforced-only access control.',
        severityHint: 'low',
        confidenceHint: 'low',
        collectedAt,
      }),
    );
    addEdge({
      sourceKind: 'js-configuration',
      sourceRef,
      transformation: 'a feature flag read client-side may gate a code path that should be server-enforced',
      sinkKind: 'authorization-decision',
      sinkRef: assetRef,
      observation: 'feature-flag configuration object found in client-side JavaScript',
      confidence: 0.4,
    });
  }

  // === GraphQL operations ===
  const graphqlMatch = GRAPHQL_OPERATION_PATTERN.exec(source);
  if (graphqlMatch || GRAPHQL_TAG_PATTERN.test(source)) {
    observations.push(
      baseObservation({
        id: nextId('obs-js-graphql'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-graphql-operation',
        title: graphqlMatch
          ? `GraphQL ${graphqlMatch[1]} "${graphqlMatch[2]}" referenced in ${sourceRef}`
          : `GraphQL operation referenced in ${sourceRef}`,
        description:
          'A GraphQL query/mutation/subscription is defined client-side — worth checking for field-level authorization, introspection exposure, and query-cost/depth limits server-side.',
        severityHint: 'informational',
        confidenceHint: 'medium',
        collectedAt,
      }),
    );
  }

  // === Auth/role logic ===
  if (AUTH_ROLE_LOGIC_PATTERN.test(source)) {
    observations.push(
      baseObservation({
        id: nextId('obs-js-auth-logic'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-auth-logic',
        title: `Client-side authorization logic referenced in ${sourceRef}`,
        description:
          'Role/permission checks were found in client-side code (e.g. role comparisons, isAdmin/hasPermission calls). These must be re-enforced server-side; the client-side check alone is never sufficient.',
        severityHint: 'medium',
        confidenceHint: 'low',
        collectedAt,
      }),
    );
    addEdge({
      sourceKind: 'role',
      sourceRef,
      transformation: 'a role/permission check performed in client-side JavaScript',
      sinkKind: 'authorization-decision',
      sinkRef: assetRef,
      observation: 'client-side authorization logic found; server-side enforcement not yet confirmed',
      confidence: 0.45,
    });
  }

  // === Workflow functions ===
  const workflowMatch = WORKFLOW_FUNCTION_PATTERN.exec(source);
  if (workflowMatch?.[1]) {
    observations.push(
      baseObservation({
        id: nextId('obs-js-workflow-function'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-workflow-function',
        title: `Workflow function "${workflowMatch[1]}" referenced in ${sourceRef}`,
        description: `A function named "${workflowMatch[1]}" suggests a business-workflow step (checkout/approval/submission/transition). Worth mapping into the application state graph to check for reachability from the wrong state.`,
        severityHint: 'informational',
        confidenceHint: 'low',
        collectedAt,
      }),
    );
  }

  // === Third-party integrations ===
  const thirdPartyDomains = new Set<string>();
  for (const match of source.matchAll(THIRD_PARTY_DOMAIN_PATTERN)) {
    if (match[0]) thirdPartyDomains.add(match[0].toLowerCase());
  }
  for (const domain of thirdPartyDomains) {
    observations.push(
      baseObservation({
        id: nextId('obs-js-third-party'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-third-party-integration',
        title: `Third-party integration "${domain}" referenced in ${sourceRef}`,
        description: `${sourceRef} integrates with "${domain}". Not a vulnerability by itself — informs blast-radius/supply-chain reasoning, and whether a client-side secret for this integration is scoped safely.`,
        severityHint: 'informational',
        confidenceHint: 'medium',
        collectedAt,
      }),
    );
  }

  // === Environment/config references ===
  const envVars = new Set<string>();
  for (const match of source.matchAll(ENV_REFERENCE_PATTERN)) {
    if (match[1]) envVars.add(match[1]);
  }
  for (const envVar of envVars) {
    observations.push(
      baseObservation({
        id: nextId('obs-js-env-reference'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-env-reference',
        title: `Environment reference "${envVar}" bundled into client-side JavaScript`,
        description: `"${envVar}" is read from environment/build configuration and shipped to the client. Confirm it is meant to be public — a build-time variable name alone is not proof of exposure.`,
        severityHint: 'low',
        confidenceHint: 'low',
        collectedAt,
      }),
    );
  }

  // === Source map reference ===
  const sourceMapMatch = SOURCE_MAP_PATTERN.exec(source);
  if (sourceMapMatch?.[1]) {
    observations.push(
      baseObservation({
        id: nextId('obs-js-sourcemap'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-sourcemap-reference',
        title: `Source map reference found in ${sourceRef}`,
        description: `${sourceRef} references a source map ("${sourceMapMatch[1]}") — if it is fetchable, the original (unminified) source may be recoverable for deeper analysis.`,
        severityHint: 'informational',
        confidenceHint: 'high',
        collectedAt,
      }),
    );
  }

  // === Chunk relationships (dynamic import / webpack chunk names) ===
  const referencedChunks = new Set<string>();
  for (const match of source.matchAll(DYNAMIC_IMPORT_PATTERN)) {
    if (match[1]) referencedChunks.add(match[1]);
  }
  for (const match of source.matchAll(WEBPACK_CHUNK_NAME_PATTERN)) {
    if (match[1]) referencedChunks.add(match[1]);
  }
  for (const chunk of referencedChunks) {
    discoveries.push({
      source: 'js-intelligence',
      kind: 'js-artifact',
      label: chunk,
      attributes: { referencedFrom: sourceRef, relationship: 'chunk' },
      confidence: 0.5,
      discoveredAt: collectedAt,
    });
    observations.push(
      baseObservation({
        id: nextId('obs-js-chunk-reference'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-chunk-reference',
        title: `Code-split chunk "${chunk}" referenced from ${sourceRef}`,
        description: `${sourceRef} dynamically loads/references "${chunk}" — worth collecting and analyzing as its own JS artifact; it may ship endpoints or logic not present in the main bundle.`,
        severityHint: 'informational',
        confidenceHint: 'medium',
        collectedAt,
      }),
    );
  }

  // === Client-side state transitions ===
  if (CLIENT_STATE_TRANSITION_PATTERN.test(source)) {
    observations.push(
      baseObservation({
        id: nextId('obs-js-client-state-transition'),
        engagementId,
        obsSource,
        assetRef,
        vulnClass: 'js-intel-client-state-transition',
        title: `Client-side navigation/state transition referenced in ${sourceRef}`,
        description:
          'Client-side routing (history/router navigation) was found — worth checking whether the destination route re-validates authorization server-side rather than only rendering conditionally on the client.',
        severityHint: 'low',
        confidenceHint: 'low',
        collectedAt,
      }),
    );
  }

  // === Secrets (redacted) ===
  for (const { name, pattern } of SECRET_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const value = match[0];
      observations.push(
        baseObservation({
          id: nextId('obs-js-secret'),
          engagementId,
          obsSource,
          assetRef,
          vulnClass: 'js-intel-secret-exposure',
          title: `Possible ${name} exposed in ${sourceRef}`,
          description: `A string matching the "${name}" pattern was found (${fingerprint(value)}). Requires human validation — do not use the credential, and do not log or report it in full.`,
          severityHint: 'high',
          confidenceHint: 'low',
          collectedAt,
          extraTags: ['requires-manual-review'],
        }),
      );
    }
  }

  return { observations, discoveries, provenanceEdges };
}
