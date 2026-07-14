// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Vuln Collector tools (factory parameterized by vulnerability class).
 *
 * Exposes 4 one-shot, TypeBox-validated tools per vuln agent (injection, xss,
 * auth, ssrf, authz) that feed a deterministic renderer producing
 * {class}_analysis_deliverable.md:
 *   - set_findings_summary       — §1 executive summary + §2 dominant patterns
 *   - set_strategic_intelligence — §3, per-class schema
 *   - set_safe_vectors           — §4, shared schema across classes
 *   - set_blind_spots            — §5, shared schema across classes
 *
 * Only set_strategic_intelligence varies by class; the collector branches on
 * vulnClass to assemble the right schema. The other 3 tools are identical
 * across classes.
 *
 * Skipped tools surface as renderer placeholders, not activity failures.
 * getCallStatus() exposes the per-run call pattern for logging. Each schema's
 * field-level descriptions carry the section guidance, so the agent's tool
 * catalog surfaces it.
 */

import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type Static, type TObject, Type } from 'typebox';
import { cleanInput } from './schema.js';

// ============================================================================
// CLASS DISCRIMINATOR
// ============================================================================

export const VULN_CLASSES = ['injection', 'xss', 'auth', 'ssrf', 'authz'] as const;
export type VulnClass = (typeof VULN_CLASSES)[number];

// ============================================================================
// SHARED SCHEMAS — set_findings_summary, set_safe_vectors, set_blind_spots
// ============================================================================

const PatternSchema = Type.Object({
  name: Type.String({
    minLength: 1,
    description:
      'Concise pattern name, e.g. "Weak Session Management", "Reflected XSS in Search Parameter", ' +
      '"Insufficient URL Validation".',
  }),
  description: Type.String({
    minLength: 1,
    description: 'One- to two-sentence description of the pattern observed in the codebase.',
  }),
  implication: Type.String({
    minLength: 1,
    description: 'One- to two-sentence implication for exploitation — what does this pattern enable an attacker to do.',
  }),
  representative_finding_ids: Type.Array(Type.String({ minLength: 1 }), {
    minItems: 1,
    description:
      'IDs of findings that exhibit this pattern (e.g. ["AUTH-VULN-01", "AUTH-VULN-02"]). Must match ' +
      'IDs the agent has assigned in the structured-output exploitation queue.',
  }),
});

export const FindingsSummaryInputSchema = Type.Object({
  key_outcome: Type.String({
    minLength: 1,
    description:
      'One to two sentences capturing the headline result of your analysis — what was found and its ' +
      'severity profile (e.g. "Several high-confidence SQL injection vulnerabilities were identified; ' +
      'all findings have been passed to the exploitation phase"). Becomes Section 1 of the rendered ' +
      'deliverable.',
  }),
  patterns: Type.Array(PatternSchema, {
    description:
      'Complete list of dominant patterns observed across findings. Pass all patterns in one call. ' +
      'Empty array is acceptable if no recurring patterns were observed — the deliverable will render ' +
      '"No dominant patterns identified" for Section 2 in that case.',
  }),
});

export const SafeVectorInputSchema = Type.Object({
  subject: Type.String({
    minLength: 1,
    description:
      'The specific subject of analysis. For injection/xss runs, the input parameter name (e.g. ' +
      '"username", "redirect_url"). For auth/ssrf runs, the component or flow name (e.g. ' +
      '"Password Hashing", "Webhook Configuration"). For authz runs, the endpoint (e.g. ' +
      '"POST /api/auth/logout"). The renderer maps this to the class-appropriate column header.',
  }),
  location: Type.String({
    minLength: 1,
    description:
      'File path with line number (e.g. "controllers/authController.js:45") or endpoint URL (e.g. ' +
      '"/profile"). For authz runs, this is the guard location specifically (e.g. ' +
      '"middleware/auth.js:45"). The renderer maps this to the class-appropriate column header.',
  }),
  defense_mechanism: Type.String({
    minLength: 1,
    description:
      'The robust defense observed (e.g. "Prepared Statement (Parameter Binding)", "HTML Entity ' +
      'Encoding", "Strict URL Whitelist Validation", "bcrypt.compare for constant-time check").',
  }),
  render_context: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description:
        'XSS-only: the DOM render context for the validated vector — one of HTML_BODY, HTML_ATTRIBUTE, ' +
        'JAVASCRIPT_STRING, URL_PARAM, CSS_VALUE. Omit (or pass null) for non-XSS classes; the renderer ' +
        'only emits this column for the XSS deliverable.',
    }),
  ),
});

export const SafeVectorsInputSchema = Type.Object({
  vectors: Type.Array(SafeVectorInputSchema, {
    description:
      'All input vectors / components / endpoints that were analyzed and confirmed to have robust, ' +
      'context-appropriate defenses. Empty array is acceptable but unusual — the deliverable will ' +
      'render "No vectors confirmed secure during analysis" for Section 4 in that case. Becomes ' +
      'Section 4 of the rendered deliverable. The renderer sorts by (subject, location) before ' +
      'rendering, so emission order does not affect output.',
  }),
});

export const BlindSpotItemSchema = Type.Object({
  heading: Type.String({
    minLength: 1,
    description:
      'Short heading for the blind spot (e.g. "Untraced Asynchronous Flows", ' +
      '"Limited Visibility into Stored Procedures", "Minified JavaScript Bundle").',
  }),
  description: Type.String({
    minLength: 1,
    description:
      'One to three sentences describing the analysis gap — what could not be traced, why, and what ' +
      'the residual risk is.',
  }),
});

export const BlindSpotsInputSchema = Type.Object({
  items: Type.Array(BlindSpotItemSchema, {
    description:
      'Analysis constraints, untraced code paths, or other coverage gaps that should be noted. ' +
      'Empty array is acceptable on high-coverage runs — the deliverable will render "No analysis ' +
      'constraints or blind spots identified" for Section 5 in that case. Becomes Section 5 of the ' +
      'rendered deliverable.',
  }),
});

// ============================================================================
// PER-CLASS set_strategic_intelligence SCHEMAS (flat — no nesting)
// ============================================================================

const InjectionStrategicIntelSchema = Type.Object({
  defensive_evasion_waf: Type.String({
    minLength: 1,
    description:
      'WAF behavior observed during analysis: active rules, common payloads blocked, identified ' +
      'bypasses (e.g. "WAF blocks UNION SELECT but not time-based blind injection"). Write ' +
      '"Not applicable — no WAF observed" if none was detected.',
  }),
  error_based_potential: Type.String({
    minLength: 1,
    description:
      'Whether endpoints leak verbose database errors that enable error-based injection (e.g. ' +
      '"/api/products returns verbose PostgreSQL error messages, prime target for error-based ' +
      'exploitation"). Write "Not applicable" if no injection findings exist.',
  }),
  confirmed_database_technology: Type.String({
    minLength: 1,
    description:
      'Database engine(s) confirmed via error syntax or function calls (e.g. "PostgreSQL, confirmed ' +
      'via pg_sleep() and verbose error syntax"). Drives payload selection downstream. Write ' +
      '"Not applicable" if no DB sinks in scope.',
  }),
});

const XssStrategicIntelSchema = Type.Object({
  csp_analysis: Type.String({
    minLength: 1,
    description:
      'Content Security Policy observed and its bypassability: current policy text, critical bypasses ' +
      "(e.g. \"script-src 'self' https://trusted-cdn.com — the trusted CDN hosts vulnerable AngularJS, " +
      'enabling client-side template injection bypass"). Write "Not applicable — no CSP header served" ' +
      'if none.',
  }),
  cookie_security: Type.String({
    minLength: 1,
    description:
      'Session cookie security observations: HttpOnly, Secure, SameSite flags, and storage mechanism ' +
      '(e.g. "Primary session cookie `sessionid` is missing HttpOnly; tokens are also stored in ' +
      'localStorage, both accessible to JavaScript"). Drives exfiltration strategy.',
  }),
});

const AuthStrategicIntelSchema = Type.Object({
  authentication_method: Type.String({
    minLength: 1,
    description:
      'How users authenticate: JWT, session cookie, OAuth, SAML, etc. Include any algorithm or library ' +
      'details (e.g. "JWT (RS256) with hardcoded private key in lib/insecurity.ts:23").',
  }),
  session_token_details: Type.String({
    minLength: 1,
    description:
      'Where tokens live and how they are protected: cookie name, storage mechanism (cookie vs ' +
      'localStorage), cookie flags, expiration (e.g. "JWT stored in localStorage under key `token`; ' +
      'cookie copy lacks HttpOnly/Secure/SameSite; 6-hour TTL with no revocation").',
  }),
  password_policy: Type.String({
    minLength: 1,
    description:
      'Observed server-side password policy and storage: complexity rules, hashing algorithm, salt, ' +
      '(e.g. "MD5 without salt via crypto.createHash; no server-side complexity policy; client-side ' +
      '5-char minimum trivially bypassed").',
  }),
});

const SsrfStrategicIntelSchema = Type.Object({
  http_client_library: Type.String({
    minLength: 1,
    description:
      'HTTP client library/libraries used for outbound requests (e.g. "axios 1.6", "node-fetch", ' +
      '"requests", "HttpClient (Spring)"). Include version where it informs known bypass techniques.',
  }),
  request_architecture: Type.String({
    minLength: 1,
    description:
      'How outbound requests are constructed and routed: proxy/middleware patterns, internal routing ' +
      'rules (e.g. "Webhook URLs are POSTed directly without an outbound proxy; redirects are ' +
      'followed by default with no maxRedirects limit").',
  }),
  internal_services: Type.String({
    minLength: 1,
    description:
      'Internal endpoints, services, or cloud-metadata addresses discovered during analysis that an ' +
      'SSRF could reach (e.g. "169.254.169.254 (AWS IMDS), internal admin API at admin.internal:8443, ' +
      'PostgreSQL on localhost:5432").',
  }),
});

const AuthzStrategicIntelSchema = Type.Object({
  session_management_architecture: Type.String({
    minLength: 1,
    description:
      'Session and authentication architecture relevant to authorization decisions: where user identity ' +
      'comes from, whether the user ID is trusted by downstream guards (e.g. "JWT tokens in cookies; ' +
      'user ID extracted from `req.user.id` and used directly in DB queries without ownership ' +
      're-validation").',
  }),
  role_permission_model: Type.String({
    minLength: 1,
    description:
      'Roles, capabilities, and where they live: identified roles, their privilege levels, and where ' +
      'role/permission data is stored (e.g. "Three roles: user, moderator, admin. Role embedded in ' +
      'JWT and database; checks inconsistent — many admin routes only check `req.user` presence").',
  }),
  resource_access_patterns: Type.String({
    minLength: 1,
    description:
      'How resource IDs flow through the system and ownership patterns: e.g. "Most endpoints use path ' +
      'parameters for resource IDs (/api/users/{id}); IDs are passed to DB queries without ownership ' +
      'validation". Critical for IDOR exploitation.',
  }),
  workflow_implementation: Type.String({
    minLength: 1,
    description:
      'Multi-step processes and state transitions: how workflow stages are tracked, whether prior-state ' +
      'checks are enforced (e.g. "Multi-step processes use status fields in database; status ' +
      'transitions do not verify prior state completion"). Drives context-based authz exploitation.',
  }),
});

export const STRATEGIC_INTEL_SCHEMAS: Record<VulnClass, TObject> = {
  injection: InjectionStrategicIntelSchema,
  xss: XssStrategicIntelSchema,
  auth: AuthStrategicIntelSchema,
  ssrf: SsrfStrategicIntelSchema,
  authz: AuthzStrategicIntelSchema,
};

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type Pattern = Static<typeof PatternSchema>;
export type FindingsSummaryInput = Static<typeof FindingsSummaryInputSchema>;
export type SafeVectorInput = Static<typeof SafeVectorInputSchema>;
export type SafeVectorsInput = Static<typeof SafeVectorsInputSchema>;
export type BlindSpotItem = Static<typeof BlindSpotItemSchema>;
export type BlindSpotsInput = Static<typeof BlindSpotsInputSchema>;

export type InjectionStrategicIntel = Static<typeof InjectionStrategicIntelSchema>;
export type XssStrategicIntel = Static<typeof XssStrategicIntelSchema>;
export type AuthStrategicIntel = Static<typeof AuthStrategicIntelSchema>;
export type SsrfStrategicIntel = Static<typeof SsrfStrategicIntelSchema>;
export type AuthzStrategicIntel = Static<typeof AuthzStrategicIntelSchema>;

// Discriminated by the agent class context — the renderer reads only the
// sub-fields that apply to the active class.
export type StrategicIntelligenceInput =
  | InjectionStrategicIntel
  | XssStrategicIntel
  | AuthStrategicIntel
  | SsrfStrategicIntel
  | AuthzStrategicIntel;

export interface VulnCollectorData {
  readonly findings_summary?: FindingsSummaryInput;
  readonly strategic_intelligence?: StrategicIntelligenceInput;
  readonly safe_vectors?: SafeVectorsInput;
  readonly blind_spots?: BlindSpotsInput;
}

export const VULN_TOOLS = [
  'set_findings_summary',
  'set_strategic_intelligence',
  'set_safe_vectors',
  'set_blind_spots',
] as const;

export type VulnToolName = (typeof VULN_TOOLS)[number];

export type VulnToolStatus = 'called' | 'skipped';

export type VulnCallStatus = Readonly<Record<VulnToolName, VulnToolStatus>>;

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function toolResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: undefined,
  };
}

function successResult(data: Record<string, unknown>) {
  return toolResult({ status: 'success', ...data });
}

function errorResult(message: string, errorType = 'ValidationError', retryable = true) {
  return toolResult({ status: 'error', message, errorType, retryable });
}

// ============================================================================
// COLLECTOR FACTORY
// ============================================================================

interface VulnState {
  findings_summary?: FindingsSummaryInput;
  strategic_intelligence?: StrategicIntelligenceInput;
  safe_vectors?: SafeVectorsInput;
  blind_spots?: BlindSpotsInput;
}

export interface VulnCollector {
  tools: ToolDefinition[];
  getAll(): VulnCollectorData;
  getCallStatus(): VulnCallStatus;
}

export function createVulnCollector(vulnClass: VulnClass): VulnCollector {
  const state: VulnState = {};

  function alreadyCalled(toolName: VulnToolName) {
    return errorResult(
      `${toolName} has already been called. Each tool may only be called once per run.`,
      'DuplicateError',
      false,
    );
  }

  const setFindingsSummary = defineTool({
    name: 'set_findings_summary',
    label: 'Set Findings Summary',
    description:
      'Record the executive summary headline and the dominant vulnerability patterns observed across ' +
      'your findings. Call exactly once before terminating. Becomes Section 1 (key outcome) and ' +
      'Section 2 (patterns) of the rendered deliverable — this is the load-bearing emission for the ' +
      'narrative .md and is required. Duplicate calls return "already called" and are no-ops. Empty ' +
      'patterns array is acceptable (renders as "No dominant patterns identified") but key_outcome ' +
      'is always required.',
    parameters: FindingsSummaryInputSchema,
    async execute(_toolCallId, input) {
      if (state.findings_summary) return alreadyCalled('set_findings_summary');
      state.findings_summary = cleanInput(FindingsSummaryInputSchema, input);
      return successResult({ set: 'set_findings_summary' });
    },
  });

  const intelSchema = STRATEGIC_INTEL_SCHEMAS[vulnClass];
  const setStrategicIntelligence = defineTool({
    name: 'set_strategic_intelligence',
    label: 'Set Strategic Intelligence',
    description:
      `Record the environmental and defensive intelligence relevant to exploiting the ${vulnClass} ` +
      'findings. Call exactly once before terminating. Becomes Section 3 of the rendered deliverable ' +
      `and is the section the downstream exploit-${vulnClass} agent reads for strategic context. ` +
      'Required. Duplicate calls return "already called" and are no-ops. Write "Not applicable" as ' +
      'the field value when a sub-field does not apply to this run (rather than omitting).',
    parameters: intelSchema,
    async execute(_toolCallId, input) {
      if (state.strategic_intelligence) return alreadyCalled('set_strategic_intelligence');
      state.strategic_intelligence = cleanInput(intelSchema, input) as unknown as StrategicIntelligenceInput;
      return successResult({ set: 'set_strategic_intelligence' });
    },
  });

  const setSafeVectors = defineTool({
    name: 'set_safe_vectors',
    label: 'Set Safe Vectors',
    description:
      'Record the input vectors, components, or endpoints that were analyzed and confirmed to have ' +
      'robust, context-appropriate defenses. Call exactly once before terminating. Becomes Section 4 ' +
      'of the rendered deliverable. Recommended (empty array is acceptable on runs where no vectors ' +
      'were validated as safe, but explicit emission is preferred). The renderer sorts by ' +
      '(subject, location) before rendering, so emission order does not affect output. Duplicate ' +
      'calls return "already called" and are no-ops.',
    parameters: SafeVectorsInputSchema,
    async execute(_toolCallId, input) {
      if (state.safe_vectors) return alreadyCalled('set_safe_vectors');
      state.safe_vectors = cleanInput(SafeVectorsInputSchema, input);
      return successResult({ set: 'set_safe_vectors', count: input.vectors.length });
    },
  });

  const setBlindSpots = defineTool({
    name: 'set_blind_spots',
    label: 'Set Blind Spots',
    description:
      'Record analysis constraints, untraced code paths, or other coverage gaps. Call exactly once ' +
      'before terminating. Becomes Section 5 of the rendered deliverable. Recommended (empty array ' +
      'is acceptable on high-coverage runs, but explicit emission is preferred — readers expect ' +
      'either documented gaps or an explicit "no gaps" signal). Duplicate calls return "already ' +
      'called" and are no-ops.',
    parameters: BlindSpotsInputSchema,
    async execute(_toolCallId, input) {
      if (state.blind_spots) return alreadyCalled('set_blind_spots');
      state.blind_spots = cleanInput(BlindSpotsInputSchema, input);
      return successResult({ set: 'set_blind_spots', count: input.items.length });
    },
  });

  function statusOf<K extends VulnToolName>(key: K): VulnToolStatus {
    const flagMap: Record<VulnToolName, unknown> = {
      set_findings_summary: state.findings_summary,
      set_strategic_intelligence: state.strategic_intelligence,
      set_safe_vectors: state.safe_vectors,
      set_blind_spots: state.blind_spots,
    };
    return flagMap[key] ? 'called' : 'skipped';
  }

  return {
    tools: [setFindingsSummary, setStrategicIntelligence, setSafeVectors, setBlindSpots],
    getAll: (): VulnCollectorData => ({
      ...(state.findings_summary && { findings_summary: state.findings_summary }),
      ...(state.strategic_intelligence && { strategic_intelligence: state.strategic_intelligence }),
      ...(state.safe_vectors && { safe_vectors: state.safe_vectors }),
      ...(state.blind_spots && { blind_spots: state.blind_spots }),
    }),
    getCallStatus: (): VulnCallStatus => ({
      set_findings_summary: statusOf('set_findings_summary'),
      set_strategic_intelligence: statusOf('set_strategic_intelligence'),
      set_safe_vectors: statusOf('set_safe_vectors'),
      set_blind_spots: statusOf('set_blind_spots'),
    }),
  };
}
