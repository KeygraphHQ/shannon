// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Vuln Collector MCP Server (factory parameterized by vulnerability class).
 *
 * Exposes 4 one-shot, Zod-validated MCP tools per vuln agent (injection, xss,
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
 * getCallStatus() exposes the per-run call pattern for logging. Each Zod
 * schema's field-level descriptions carry the section guidance, so the SDK
 * injects it into the agent's tool catalog.
 */

import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { type ZodRawShape, z } from 'zod';

// ============================================================================
// CLASS DISCRIMINATOR
// ============================================================================

export const VULN_CLASSES = ['injection', 'xss', 'auth', 'ssrf', 'authz'] as const;
export type VulnClass = (typeof VULN_CLASSES)[number];

// Classes whose deliverables carry a Section 5 (blind spots). The auth and ssrf
// analyses have no blind-spots section, so the set_blind_spots tool is withheld
// from those agents and the renderer omits the section. Single source of truth
// for both the tool registration and the rendering gate.
export const BLIND_SPOTS_CLASSES: ReadonlySet<VulnClass> = new Set<VulnClass>(['injection', 'xss', 'authz']);

// ============================================================================
// SHARED SCHEMAS — set_findings_summary, set_safe_vectors, set_blind_spots
// ============================================================================

const PatternSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe(
      'Concise pattern name, e.g. "Weak Session Management", "Reflected XSS in Search Parameter", ' +
        '"Insufficient URL Validation".',
    ),
  description: z.string().min(1).describe('One- to two-sentence description of the pattern observed in the codebase.'),
  implication: z
    .string()
    .min(1)
    .describe('One- to two-sentence implication for exploitation — what does this pattern enable an attacker to do.'),
  representative_finding_ids: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      'IDs of findings that exhibit this pattern (e.g. ["AUTH-VULN-01", "AUTH-VULN-02"]). Must match ' +
        'IDs the agent has assigned in the structured-output exploitation queue.',
    ),
});

export const FindingsSummaryInputSchema = z.object({
  key_outcome: z
    .string()
    .min(1)
    .describe(
      'One to two sentences capturing the headline result of your analysis — what was found and its ' +
        'severity profile (e.g. "Several high-confidence SQL injection vulnerabilities were identified; ' +
        'all findings have been passed to the exploitation phase"). Becomes Section 1 of the rendered ' +
        'deliverable.',
    ),
  patterns: z
    .array(PatternSchema)
    .describe(
      'Complete list of dominant patterns observed across findings. Pass all patterns in one call. ' +
        'Empty array is acceptable if no recurring patterns were observed — the deliverable will render ' +
        '"No dominant patterns identified" for Section 2 in that case.',
    ),
});

export const SafeVectorInputSchema = z.object({
  subject: z
    .string()
    .min(1)
    .describe(
      'The specific subject of analysis. For injection/xss runs, the input parameter name (e.g. ' +
        '"username", "redirect_url"). For auth/ssrf runs, the component or flow name (e.g. ' +
        '"Password Hashing", "Webhook Configuration"). For authz runs, the endpoint (e.g. ' +
        '"POST /api/auth/logout"). The renderer maps this to the class-appropriate column header.',
    ),
  location: z
    .string()
    .min(1)
    .describe(
      'File path with line number (e.g. "controllers/authController.js:45") or endpoint URL (e.g. ' +
        '"/profile"). For authz runs, this is the guard location specifically (e.g. ' +
        '"middleware/auth.js:45"). The renderer maps this to the class-appropriate column header.',
    ),
  defense_mechanism: z
    .string()
    .min(1)
    .describe(
      'The robust defense observed (e.g. "Prepared Statement (Parameter Binding)", "HTML Entity ' +
        'Encoding", "Strict URL Whitelist Validation", "bcrypt.compare for constant-time check").',
    ),
  render_context: z
    .string()
    .nullable()
    .optional()
    .describe(
      'XSS-only: the DOM render context for the validated vector — one of HTML_BODY, HTML_ATTRIBUTE, ' +
        'JAVASCRIPT_STRING, URL_PARAM, CSS_VALUE. Omit (or pass null) for non-XSS classes; the renderer ' +
        'only emits this column for the XSS deliverable.',
    ),
});

export const SafeVectorsInputSchema = z.object({
  vectors: z
    .array(SafeVectorInputSchema)
    .describe(
      'All input vectors / components / endpoints that were analyzed and confirmed to have robust, ' +
        'context-appropriate defenses. Empty array is acceptable but unusual — the deliverable will ' +
        'render "No vectors confirmed secure during analysis" for Section 4 in that case. Becomes ' +
        'Section 4 of the rendered deliverable. The renderer sorts by (subject, location) before ' +
        'rendering, so emission order does not affect output.',
    ),
});

export const BlindSpotItemSchema = z.object({
  heading: z
    .string()
    .min(1)
    .describe(
      'Short heading for the blind spot (e.g. "Untraced Asynchronous Flows", ' +
        '"Limited Visibility into Stored Procedures", "Minified JavaScript Bundle").',
    ),
  description: z
    .string()
    .min(1)
    .describe(
      'One to three sentences describing the analysis gap — what could not be traced, why, and what ' +
        'the residual risk is.',
    ),
});

export const BlindSpotsInputSchema = z.object({
  items: z
    .array(BlindSpotItemSchema)
    .describe(
      'Analysis constraints, untraced code paths, or other coverage gaps that should be noted. ' +
        'Empty array is acceptable on high-coverage runs — the deliverable will render "No analysis ' +
        'constraints or blind spots identified" for Section 5 in that case. Becomes Section 5 of the ' +
        'rendered deliverable.',
    ),
});

// ============================================================================
// PER-CLASS set_strategic_intelligence SCHEMAS (flat — no nesting)
// ============================================================================

const InjectionStrategicIntelSchema = z.object({
  defensive_evasion_waf: z
    .string()
    .min(1)
    .describe(
      'WAF behavior observed during analysis: active rules, common payloads blocked, identified ' +
        'bypasses (e.g. "WAF blocks UNION SELECT but not time-based blind injection"). Write ' +
        '"Not applicable — no WAF observed" if none was detected.',
    ),
  error_based_potential: z
    .string()
    .min(1)
    .describe(
      'Whether endpoints leak verbose database errors that enable error-based injection (e.g. ' +
        '"/api/products returns verbose PostgreSQL error messages, prime target for error-based ' +
        'exploitation"). Write "Not applicable" if no injection findings exist.',
    ),
  confirmed_database_technology: z
    .string()
    .min(1)
    .describe(
      'Database engine(s) confirmed via error syntax or function calls (e.g. "PostgreSQL, confirmed ' +
        'via pg_sleep() and verbose error syntax"). Drives payload selection downstream. Write ' +
        '"Not applicable" if no DB sinks in scope.',
    ),
});

const XssStrategicIntelSchema = z.object({
  csp_analysis: z
    .string()
    .min(1)
    .describe(
      'Content Security Policy observed and its bypassability: current policy text, critical bypasses ' +
        "(e.g. \"script-src 'self' https://trusted-cdn.com — the trusted CDN hosts vulnerable AngularJS, " +
        'enabling client-side template injection bypass"). Write "Not applicable — no CSP header served" ' +
        'if none.',
    ),
  cookie_security: z
    .string()
    .min(1)
    .describe(
      'Session cookie security observations: HttpOnly, Secure, SameSite flags, and storage mechanism ' +
        '(e.g. "Primary session cookie `sessionid` is missing HttpOnly; tokens are also stored in ' +
        'localStorage, both accessible to JavaScript"). Drives exfiltration strategy.',
    ),
});

const AuthStrategicIntelSchema = z.object({
  authentication_method: z
    .string()
    .min(1)
    .describe(
      'How users authenticate: JWT, session cookie, OAuth, SAML, etc. Include any algorithm or library ' +
        'details (e.g. "JWT (RS256) with hardcoded private key in lib/insecurity.ts:23").',
    ),
  session_token_details: z
    .string()
    .min(1)
    .describe(
      'Where tokens live and how they are protected: cookie name, storage mechanism (cookie vs ' +
        'localStorage), cookie flags, expiration (e.g. "JWT stored in localStorage under key `token`; ' +
        'cookie copy lacks HttpOnly/Secure/SameSite; 6-hour TTL with no revocation").',
    ),
  password_policy: z
    .string()
    .min(1)
    .describe(
      'Observed server-side password policy and storage: complexity rules, hashing algorithm, salt, ' +
        '(e.g. "MD5 without salt via crypto.createHash; no server-side complexity policy; client-side ' +
        '5-char minimum trivially bypassed").',
    ),
});

const SsrfStrategicIntelSchema = z.object({
  http_client_library: z
    .string()
    .min(1)
    .describe(
      'HTTP client library/libraries used for outbound requests (e.g. "axios 1.6", "node-fetch", ' +
        '"requests", "HttpClient (Spring)"). Include version where it informs known bypass techniques.',
    ),
  request_architecture: z
    .string()
    .min(1)
    .describe(
      'How outbound requests are constructed and routed: proxy/middleware patterns, internal routing ' +
        'rules (e.g. "Webhook URLs are POSTed directly without an outbound proxy; redirects are ' +
        'followed by default with no maxRedirects limit").',
    ),
  internal_services: z
    .string()
    .min(1)
    .describe(
      'Internal endpoints, services, or cloud-metadata addresses discovered during analysis that an ' +
        'SSRF could reach (e.g. "169.254.169.254 (AWS IMDS), internal admin API at admin.internal:8443, ' +
        'PostgreSQL on localhost:5432").',
    ),
});

const AuthzStrategicIntelSchema = z.object({
  session_management_architecture: z
    .string()
    .min(1)
    .describe(
      'Session and authentication architecture relevant to authorization decisions: where user identity ' +
        'comes from, whether the user ID is trusted by downstream guards (e.g. "JWT tokens in cookies; ' +
        'user ID extracted from `req.user.id` and used directly in DB queries without ownership ' +
        're-validation").',
    ),
  role_permission_model: z
    .string()
    .min(1)
    .describe(
      'Roles, capabilities, and where they live: identified roles, their privilege levels, and where ' +
        'role/permission data is stored (e.g. "Three roles: user, moderator, admin. Role embedded in ' +
        'JWT and database; checks inconsistent — many admin routes only check `req.user` presence").',
    ),
  resource_access_patterns: z
    .string()
    .min(1)
    .describe(
      'How resource IDs flow through the system and ownership patterns: e.g. "Most endpoints use path ' +
        'parameters for resource IDs (/api/users/{id}); IDs are passed to DB queries without ownership ' +
        'validation". Critical for IDOR exploitation.',
    ),
  workflow_implementation: z
    .string()
    .min(1)
    .describe(
      'Multi-step processes and state transitions: how workflow stages are tracked, whether prior-state ' +
        'checks are enforced (e.g. "Multi-step processes use status fields in database; status ' +
        'transitions do not verify prior state completion"). Drives context-based authz exploitation.',
    ),
});

const STRATEGIC_INTEL_SCHEMAS: Record<VulnClass, z.ZodObject<ZodRawShape>> = {
  injection: InjectionStrategicIntelSchema,
  xss: XssStrategicIntelSchema,
  auth: AuthStrategicIntelSchema,
  ssrf: SsrfStrategicIntelSchema,
  authz: AuthzStrategicIntelSchema,
};

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type Pattern = z.infer<typeof PatternSchema>;
export type FindingsSummaryInput = z.infer<typeof FindingsSummaryInputSchema>;
export type SafeVectorInput = z.infer<typeof SafeVectorInputSchema>;
export type SafeVectorsInput = z.infer<typeof SafeVectorsInputSchema>;
export type BlindSpotItem = z.infer<typeof BlindSpotItemSchema>;
export type BlindSpotsInput = z.infer<typeof BlindSpotsInputSchema>;

export type InjectionStrategicIntel = z.infer<typeof InjectionStrategicIntelSchema>;
export type XssStrategicIntel = z.infer<typeof XssStrategicIntelSchema>;
export type AuthStrategicIntel = z.infer<typeof AuthStrategicIntelSchema>;
export type SsrfStrategicIntel = z.infer<typeof SsrfStrategicIntelSchema>;
export type AuthzStrategicIntel = z.infer<typeof AuthzStrategicIntelSchema>;

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

interface ToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

function createToolResult(response: { status: string; [key: string]: unknown }): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    isError: response.status === 'error',
  };
}

function successResult(data: Record<string, unknown>): ToolResult {
  return createToolResult({ status: 'success', ...data });
}

function errorResult(message: string, errorType = 'ValidationError', retryable = true): ToolResult {
  return createToolResult({ status: 'error', message, errorType, retryable });
}

// ============================================================================
// SERVER FACTORY
// ============================================================================

export interface VulnCollectorServer {
  server: McpSdkServerConfigWithInstance;
  getAll(): VulnCollectorData;
  getCallStatus(): VulnCallStatus;
}

export function createVulnCollector(vulnClass: VulnClass): VulnCollectorServer {
  const state: {
    findings_summary?: FindingsSummaryInput;
    strategic_intelligence?: StrategicIntelligenceInput;
    safe_vectors?: SafeVectorsInput;
    blind_spots?: BlindSpotsInput;
  } = {};

  function alreadyCalled(toolName: VulnToolName): ToolResult {
    return errorResult(
      `${toolName} has already been called. Each tool may only be called once per run.`,
      'DuplicateError',
      false,
    );
  }

  const setFindingsSummary = tool(
    'set_findings_summary',
    'Record the executive summary headline and the dominant vulnerability patterns observed across ' +
      'your findings. Call exactly once before terminating. Becomes Section 1 (key outcome) and ' +
      'Section 2 (patterns) of the rendered deliverable — this is the load-bearing emission for the ' +
      'narrative .md and is required. Duplicate calls return "already called" and are no-ops. Empty ' +
      'patterns array is acceptable (renders as "No dominant patterns identified") but key_outcome ' +
      'is always required.',
    FindingsSummaryInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.findings_summary) return alreadyCalled('set_findings_summary');
      state.findings_summary = input;
      return successResult({ set: 'set_findings_summary' });
    },
  );

  const intelSchema = STRATEGIC_INTEL_SCHEMAS[vulnClass];
  const setStrategicIntelligence = tool(
    'set_strategic_intelligence',
    `Record the environmental and defensive intelligence relevant to exploiting the ${vulnClass} ` +
      'findings. Call exactly once before terminating. Becomes Section 3 of the rendered deliverable ' +
      `and is the section the downstream exploit-${vulnClass} agent reads for strategic context. ` +
      'Required. Duplicate calls return "already called" and are no-ops. Write "Not applicable" as ' +
      'the field value when a sub-field does not apply to this run (rather than omitting).',
    intelSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.strategic_intelligence) return alreadyCalled('set_strategic_intelligence');
      state.strategic_intelligence = input as unknown as StrategicIntelligenceInput;
      return successResult({ set: 'set_strategic_intelligence' });
    },
  );

  const setSafeVectors = tool(
    'set_safe_vectors',
    'Record the input vectors, components, or endpoints that were analyzed and confirmed to have ' +
      'robust, context-appropriate defenses. Call exactly once before terminating. Becomes Section 4 ' +
      'of the rendered deliverable. Recommended (empty array is acceptable on runs where no vectors ' +
      'were validated as safe, but explicit emission is preferred). The renderer sorts by ' +
      '(subject, location) before rendering, so emission order does not affect output. Duplicate ' +
      'calls return "already called" and are no-ops.',
    SafeVectorsInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.safe_vectors) return alreadyCalled('set_safe_vectors');
      state.safe_vectors = input;
      return successResult({ set: 'set_safe_vectors', count: input.vectors.length });
    },
  );

  const setBlindSpots = tool(
    'set_blind_spots',
    'Record analysis constraints, untraced code paths, or other coverage gaps. Call exactly once ' +
      'before terminating. Becomes Section 5 of the rendered deliverable. Recommended (empty array ' +
      'is acceptable on high-coverage runs, but explicit emission is preferred — readers expect ' +
      'either documented gaps or an explicit "no gaps" signal). Duplicate calls return "already ' +
      'called" and are no-ops.',
    BlindSpotsInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.blind_spots) return alreadyCalled('set_blind_spots');
      state.blind_spots = input;
      return successResult({ set: 'set_blind_spots', count: input.items.length });
    },
  );

  // set_blind_spots is withheld from classes without a Section 5 (auth, ssrf).
  const tools = [
    setFindingsSummary,
    setStrategicIntelligence,
    setSafeVectors,
    ...(BLIND_SPOTS_CLASSES.has(vulnClass) ? [setBlindSpots] : []),
  ];

  const server: McpSdkServerConfigWithInstance = createSdkMcpServer({
    name: 'vuln-collector',
    version: '1.0.0',
    tools,
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
    server,
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
