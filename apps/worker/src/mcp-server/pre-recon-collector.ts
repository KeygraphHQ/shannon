// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Pre-Recon Collector MCP Server
 *
 * Exposes seven Zod-validated MCP tools, one per section of the
 * pre_recon_deliverable.md report. Every tool is one-shot (write-once;
 * duplicate calls return DuplicateError). A skipped tool renders a placeholder
 * rather than failing the activity. After the agent finishes, the host calls
 * getAll() to harvest the typed payload bag, getCallStatus() to log the
 * per-run call pattern, and runs the deterministic renderer to produce the
 * deliverable Markdown.
 *
 * Each Zod schema's field-level descriptions carry the section guidance, so
 * the SDK injects it into the agent's tool catalog.
 */

import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// ============================================================================
// SHARED SCHEMA
// ============================================================================

export const SinkRefSchema = z.object({
  location: z
    .string()
    .min(1)
    .describe(
      'File path with line number (e.g., "templates/render.js:34") or richer prose ' +
        '(e.g., "innerHTML at templates/render.js:34", "lines 45-67"). Must contain enough ' +
        'detail for a downstream agent to find the exact location.',
    ),
  sink_function: z
    .string()
    .min(1)
    .describe('The sink function or property name (e.g., "innerHTML", "axios.get", "eval", "document.write").'),
  notes: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Optional context — render-context detail, attribute name, scope hints, or anything ' +
        'a downstream agent needs to act on this sink. Omit when the location and sink_function ' +
        'are sufficient on their own.',
    ),
});

export type SinkRef = z.infer<typeof SinkRefSchema>;

// ============================================================================
// PER-TOOL INPUT SCHEMAS
// ============================================================================

export const ExecutiveSummaryInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe(
      "Provide a 2-3 paragraph overview of the application's security posture, highlighting " +
        'the most critical attack surfaces and architectural security decisions. Becomes ' +
        'Section 1 of the rendered deliverable.',
    ),
});

const ArchitectureSchema = z.object({
  framework_and_language: z
    .string()
    .min(1)
    .describe('Framework and language details with their security implications.'),
  architectural_pattern: z
    .string()
    .min(1)
    .describe('Architectural pattern (monolith, microservices, hybrid) with trust boundary analysis.'),
  critical_security_components: z
    .string()
    .min(1)
    .describe('Critical security components with focus on auth, authz, and data protection.'),
});

const DataSecuritySchema = z.object({
  database_security: z
    .string()
    .min(1)
    .describe('Analyze encryption, access controls, and query safety in database interactions.'),
  data_flow_security: z
    .string()
    .min(1)
    .describe('Identify sensitive data paths and the protection mechanisms applied along them.'),
  multi_tenant_isolation: z
    .string()
    .min(1)
    .describe(
      'Assess tenant separation effectiveness. If the application is single-tenant, state that ' +
        'explicitly rather than leaving the field thin.',
    ),
});

const AttackSurfaceSchema = z.object({
  external_entry_points: z
    .string()
    .min(1)
    .describe('Detailed analysis of each public interface that is network-accessible.'),
  internal_service_communication: z
    .string()
    .min(1)
    .describe(
      'Trust relationships and security assumptions between network-reachable services. ' +
        'If the application is a single service with no internal RPC fabric, state that.',
    ),
  input_validation_patterns: z
    .string()
    .min(1)
    .describe('How user input is handled and validated in network-accessible endpoints.'),
  background_processing: z
    .string()
    .min(1)
    .describe(
      'Async job security and privilege models for jobs triggered by network requests. ' +
        'If no async/background processing exists, state that.',
    ),
});

const InfrastructureSchema = z.object({
  secrets_management: z.string().min(1).describe('How secrets are stored, rotated, and accessed.'),
  configuration_security: z
    .string()
    .min(1)
    .describe(
      'Environment separation and secret handling. Specifically search for infrastructure ' +
        'configuration (e.g., Nginx, Kubernetes Ingress, CDN settings) that defines security ' +
        'headers like Strict-Transport-Security (HSTS) and Cache-Control, and report what was found.',
    ),
  external_dependencies: z.string().min(1).describe('Third-party services and their security implications.'),
  monitoring_and_logging: z
    .string()
    .min(1)
    .describe('Security event visibility — what is logged, where it goes, and who can see it.'),
});

export const ApplicationIntelligenceInputSchema = z.object({
  architecture: ArchitectureSchema.describe(
    'Architecture & Technology Stack — driven by the Architecture Scanner sub-agent. ' +
      'Becomes Section 2 of the rendered deliverable.',
  ),
  data_security: DataSecuritySchema.describe(
    'Data Security & Storage — driven by the Data Security Auditor sub-agent. ' +
      'Becomes Section 4 of the rendered deliverable.',
  ),
  attack_surface: AttackSurfaceSchema.describe(
    'Attack Surface Analysis — driven by Entry Point Mapper + Architecture Scanner sub-agents. ' +
      'Only include entry points confirmed to be in-scope (network-reachable). ' +
      'Becomes Section 5 of the rendered deliverable.',
  ),
  infrastructure: InfrastructureSchema.describe(
    'Infrastructure & Operational Security. Becomes Section 6 of the rendered deliverable.',
  ),
});

export const AuthDeepDiveInputSchema = z.object({
  authentication_mechanisms: z
    .string()
    .min(1)
    .describe(
      'Authentication mechanisms and their security properties. MUST include an exhaustive list of ' +
        'all API endpoints used for authentication (e.g., login, logout, token refresh, password reset).',
    ),
  session_management: z
    .string()
    .min(1)
    .describe(
      'Session management and token security. Pinpoint the exact file and line(s) of code where ' +
        'session cookie flags (HttpOnly, Secure, SameSite) are configured.',
    ),
  authz_model: z.string().min(1).describe('Authorization model and potential bypass scenarios.'),
  multi_tenancy: z
    .string()
    .min(1)
    .describe('Multi-tenancy security implementation. If the application is single-tenant, state that explicitly.'),
  sso_oauth_oidc: z
    .string()
    .nullable()
    .describe(
      'SSO/OAuth/OIDC flows: identify the callback endpoints and locate the specific code that ' +
        'validates the state and nonce parameters. Set null only if the application has no SSO/OAuth/OIDC ' +
        'integration at all.',
    ),
});

export const CodebaseIndexingInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe(
      "A detailed, multi-sentence paragraph describing the codebase's directory structure, " +
        'organization, and significant tools or conventions used (e.g., build orchestration, code ' +
        'generation, testing frameworks). Focus on how this structure impacts discoverability of ' +
        'security-relevant components.',
    ),
});

export const CriticalFilePathsInputSchema = z.object({
  configuration: z
    .array(z.string().min(1))
    .describe('Configuration files (e.g., config/server.yaml, Dockerfile, docker-compose.yml).'),
  authentication_and_authorization: z
    .array(z.string().min(1))
    .describe(
      'Auth/authz files (e.g., auth/jwt_middleware.go, internal/user/permissions.go, ' +
        'config/initializers/session_store.rb, src/services/oauth_callback.js).',
    ),
  api_and_routing: z
    .array(z.string().min(1))
    .describe(
      'API and routing files (e.g., cmd/api/main.go, internal/handlers/user_routes.go, ' +
        'ts/graphql/schema.graphql).',
    ),
  data_models_and_db: z
    .array(z.string().min(1))
    .describe(
      'Data model and DB interaction files (e.g., db/migrations/001_initial.sql, ' +
        'internal/models/user.go, internal/repository/sql_queries.go).',
    ),
  dependency_manifests: z
    .array(z.string().min(1))
    .describe('Dependency manifests (e.g., go.mod, package.json, requirements.txt).'),
  sensitive_data_and_secrets: z
    .array(z.string().min(1))
    .describe(
      'Sensitive data and secrets handling (e.g., internal/utils/encryption.go, ' + 'internal/secrets/manager.go).',
    ),
  middleware_and_input_validation: z
    .array(z.string().min(1))
    .describe(
      'Middleware and input validation (e.g., internal/middleware/validator.go, ' +
        'internal/handlers/input_parsers.go).',
    ),
  logging_and_monitoring: z
    .array(z.string().min(1))
    .describe('Logging and monitoring (e.g., internal/logging/logger.go, config/monitoring.yaml).'),
  infrastructure_and_deployment: z
    .array(z.string().min(1))
    .describe(
      'Infrastructure and deployment (e.g., infra/pulumi/main.go, kubernetes/deploy.yaml, ' +
        'nginx.conf, gateway-ingress.yaml).',
    ),
});

export const XssSinksInputSchema = z.object({
  applicable: z
    .boolean()
    .describe(
      'False only if the application has no web frontend at all. Otherwise true, even if no ' +
        'sinks were found in a given category — empty arrays mean "scanned this category, no sinks found".',
    ),
  html_body: z
    .array(SinkRefSchema)
    .describe(
      'HTML Body Context sinks: element.innerHTML, element.outerHTML, document.write(), ' +
        'document.writeln(), element.insertAdjacentHTML(), Range.createContextualFragment(), ' +
        'and jQuery sinks like add(), after(), append(), before(), html(), prepend(), replaceWith(), wrap().',
    ),
  html_attribute: z
    .array(SinkRefSchema)
    .describe(
      'HTML Attribute Context sinks: event handlers (onclick, onerror, onmouseover, onload, onfocus), ' +
        'URL-based attributes (href, src, formaction, action, background, data), the style attribute, ' +
        'iframe srcdoc, and general attributes (value, id, class, name, alt) when quotes are escaped.',
    ),
  javascript: z
    .array(SinkRefSchema)
    .describe(
      'JavaScript Context sinks: eval(), Function() constructor, setTimeout() / setInterval() ' +
        'with string arguments, and direct writes of user data into a <script> tag.',
    ),
  css: z
    .array(SinkRefSchema)
    .describe(
      'CSS Context sinks: element.style properties (e.g., element.style.backgroundImage) and ' +
        'direct writes of user data into a <style> tag.',
    ),
  url: z
    .array(SinkRefSchema)
    .describe(
      'URL Context sinks: location / window.location, location.href, location.replace(), ' +
        'location.assign(), window.open(), history.pushState(), history.replaceState(), ' +
        'URL.createObjectURL(), and jQuery selector $(userInput) in older versions.',
    ),
});

export const SsrfSinksInputSchema = z.object({
  applicable: z
    .boolean()
    .describe(
      'False only if the application makes no outbound requests at all. Otherwise true, even if ' +
        'no sinks were found in a given category — empty arrays mean "scanned this category, no sinks found".',
    ),
  http_clients: z
    .array(SinkRefSchema)
    .describe(
      'HTTP(S) clients: curl, requests (Python), axios (Node.js), fetch (JavaScript/Node.js), ' +
        'net/http (Go), HttpClient (Java/.NET), urllib (Python), RestTemplate, WebClient, OkHttp, Apache HttpClient.',
    ),
  raw_sockets: z
    .array(SinkRefSchema)
    .describe(
      'Raw sockets and connect APIs: Socket.connect, net.Dial (Go), socket.connect (Python), ' +
        'TcpClient, UdpClient, NetworkStream, java.net.Socket, java.net.URL.openConnection().',
    ),
  url_openers: z
    .array(SinkRefSchema)
    .describe(
      'URL openers and file includes: file_get_contents (PHP), fopen, include_once, require_once, ' +
        'new URL().openStream() (Java), urllib.urlopen (Python), fs.readFile with URLs, ' +
        'import() with dynamic URLs, loadHTML / loadXML with external sources.',
    ),
  redirect_handlers: z
    .array(SinkRefSchema)
    .describe(
      'Redirect and "next URL" handlers: auto-follow redirects in HTTP clients, framework Location ' +
        'handlers (response.redirect), URL validation in redirect chains, "Continue to" / "Return URL" parameters.',
    ),
  headless_browsers: z
    .array(SinkRefSchema)
    .describe(
      'Headless browsers and render engines: Puppeteer (page.goto, page.setContent), ' +
        'Playwright (page.navigate, page.route), Selenium WebDriver navigation, html-to-pdf converters ' +
        '(wkhtmltopdf, Puppeteer PDF), and SSR with external content.',
    ),
  media_processors: z
    .array(SinkRefSchema)
    .describe(
      'Media processors: ImageMagick (convert, identify with URLs), GraphicsMagick, FFmpeg with ' +
        'network sources, wkhtmltopdf, Ghostscript with URL inputs, image optimization services with URL parameters.',
    ),
  link_preview: z
    .array(SinkRefSchema)
    .describe(
      'Link preview and unfurlers: chat application link expanders, CMS link preview generators, ' +
        'oEmbed endpoint fetchers, social media card generators, URL metadata extractors.',
    ),
  webhook_testers: z
    .array(SinkRefSchema)
    .describe(
      'Webhook testers and callback verifiers: "ping my webhook" functionality, outbound callback ' +
        'verification, health check notifications, event delivery confirmations, API endpoint validation tools.',
    ),
  sso_oidc_discovery: z
    .array(SinkRefSchema)
    .describe(
      'SSO/OIDC discovery and JWKS fetchers: OpenID Connect discovery endpoints, JWKS fetchers, ' +
        'OAuth authorization server metadata, SAML metadata fetchers, federation metadata retrievers.',
    ),
  importers: z
    .array(SinkRefSchema)
    .describe(
      'Importers and data loaders: "import from URL" functionality, CSV/JSON/XML remote loaders, ' +
        'RSS/Atom feed readers, API data synchronization, configuration file fetchers.',
    ),
  package_installers: z
    .array(SinkRefSchema)
    .describe(
      'Package/plugin/theme installers: "install from URL" features, package managers with remote ' +
        'sources, plugin/theme downloaders, update mechanisms with remote checks, dependency resolution ' +
        'with external repos.',
    ),
  monitoring_and_health: z
    .array(SinkRefSchema)
    .describe(
      'Monitoring and health check frameworks: URL pingers and uptime checkers, health check ' +
        'endpoints, monitoring probe systems, alerting webhook senders, performance testing tools.',
    ),
  cloud_metadata: z
    .array(SinkRefSchema)
    .describe(
      'Cloud metadata helpers: AWS/GCP/Azure instance metadata callers, cloud service discovery ' +
        'mechanisms, container orchestration API clients, infrastructure metadata fetchers, service mesh ' +
        'configuration retrievers.',
    ),
});

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type ExecutiveSummaryInput = z.infer<typeof ExecutiveSummaryInputSchema>;
export type ApplicationIntelligenceInput = z.infer<typeof ApplicationIntelligenceInputSchema>;
export type AuthDeepDiveInput = z.infer<typeof AuthDeepDiveInputSchema>;
export type CodebaseIndexingInput = z.infer<typeof CodebaseIndexingInputSchema>;
export type CriticalFilePathsInput = z.infer<typeof CriticalFilePathsInputSchema>;
export type XssSinksInput = z.infer<typeof XssSinksInputSchema>;
export type SsrfSinksInput = z.infer<typeof SsrfSinksInputSchema>;

export interface PreReconData {
  readonly executive_summary?: ExecutiveSummaryInput;
  readonly application_intelligence?: ApplicationIntelligenceInput;
  readonly auth_deep_dive?: AuthDeepDiveInput;
  readonly codebase_indexing?: CodebaseIndexingInput;
  readonly critical_file_paths?: CriticalFilePathsInput;
  readonly xss_sinks?: XssSinksInput;
  readonly ssrf_sinks?: SsrfSinksInput;
}

export const PRE_RECON_ONE_SHOT_TOOLS = [
  'set_executive_summary',
  'set_application_intelligence',
  'set_auth_deep_dive',
  'set_codebase_indexing',
  'set_critical_file_paths',
  'set_xss_sinks',
  'set_ssrf_sinks',
] as const;

export type PreReconToolName = (typeof PRE_RECON_ONE_SHOT_TOOLS)[number];

export type PreReconToolStatus = 'called' | 'skipped';

export type PreReconCallStatus = Readonly<Record<PreReconToolName, PreReconToolStatus>>;

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

export interface PreReconCollectorServer {
  server: McpSdkServerConfigWithInstance;
  getAll(): PreReconData;
  getCallStatus(): PreReconCallStatus;
}

export function createPreReconCollectorServer(): PreReconCollectorServer {
  const state: {
    executive_summary?: ExecutiveSummaryInput;
    application_intelligence?: ApplicationIntelligenceInput;
    auth_deep_dive?: AuthDeepDiveInput;
    codebase_indexing?: CodebaseIndexingInput;
    critical_file_paths?: CriticalFilePathsInput;
    xss_sinks?: XssSinksInput;
    ssrf_sinks?: SsrfSinksInput;
  } = {};

  function alreadyCalled(toolName: PreReconToolName): ToolResult {
    return errorResult(
      `${toolName} has already been called. Each set_* tool may only be called once per run.`,
      'DuplicateError',
      false,
    );
  }

  const setExecutiveSummary = tool(
    'set_executive_summary',
    "Record the application's overall security posture as a short executive summary. " +
      'Call exactly once before terminating. Becomes Section 1 of the rendered deliverable. ' +
      'Duplicate calls are rejected.',
    ExecutiveSummaryInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.executive_summary) return alreadyCalled('set_executive_summary');
      state.executive_summary = input;
      return successResult({ set: 'set_executive_summary' });
    },
  );

  const setApplicationIntelligence = tool(
    'set_application_intelligence',
    'Record the composite application intelligence — architecture, data security, attack surface, ' +
      'and infrastructure — in a single call. Call exactly once before terminating. ' +
      'Becomes Sections 2, 4, 5, and 6 of the rendered deliverable. Duplicate calls are rejected.',
    ApplicationIntelligenceInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.application_intelligence) return alreadyCalled('set_application_intelligence');
      state.application_intelligence = input;
      return successResult({ set: 'set_application_intelligence' });
    },
  );

  const setAuthDeepDive = tool(
    'set_auth_deep_dive',
    'Record the authentication & authorization deep dive. Call exactly once before terminating. ' +
      'Becomes Section 3 of the rendered deliverable. Duplicate calls are rejected.',
    AuthDeepDiveInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.auth_deep_dive) return alreadyCalled('set_auth_deep_dive');
      state.auth_deep_dive = input;
      return successResult({ set: 'set_auth_deep_dive' });
    },
  );

  const setCodebaseIndexing = tool(
    'set_codebase_indexing',
    'Record the overall codebase indexing narrative. Call exactly once before terminating. ' +
      'Becomes Section 7 of the rendered deliverable. Duplicate calls are rejected.',
    CodebaseIndexingInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.codebase_indexing) return alreadyCalled('set_codebase_indexing');
      state.codebase_indexing = input;
      return successResult({ set: 'set_codebase_indexing' });
    },
  );

  const setCriticalFilePaths = tool(
    'set_critical_file_paths',
    'Record the catalog of critical file paths grouped by security relevance. Call exactly once ' +
      'before terminating. Becomes Section 8 of the rendered deliverable. The next agent uses this ' +
      'as a starting point for manual review. Duplicate calls are rejected.',
    CriticalFilePathsInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.critical_file_paths) return alreadyCalled('set_critical_file_paths');
      state.critical_file_paths = input;
      return successResult({ set: 'set_critical_file_paths' });
    },
  );

  const setXssSinks = tool(
    'set_xss_sinks',
    'Record discovered XSS sinks grouped by render context. Call exactly once before terminating. ' +
      'If the application has no web frontend at all, set applicable=false; otherwise populate each ' +
      'render-context array (empty arrays mean "scanned, no sinks of this kind"). This list drives ' +
      "the vuln-xss agent's testing todos downstream. Becomes Section 9 of the rendered deliverable. " +
      'Duplicate calls are rejected.',
    XssSinksInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.xss_sinks) return alreadyCalled('set_xss_sinks');
      state.xss_sinks = input;
      return successResult({ set: 'set_xss_sinks' });
    },
  );

  const setSsrfSinks = tool(
    'set_ssrf_sinks',
    'Record discovered SSRF sinks grouped by sink category. Call exactly once before terminating. ' +
      'If the application makes no outbound requests at all, set applicable=false; otherwise populate ' +
      'each category array (empty arrays mean "scanned, no sinks of this kind"). This list drives ' +
      "the vuln-ssrf agent's testing todos downstream. Becomes Section 10 of the rendered deliverable. " +
      'Duplicate calls are rejected.',
    SsrfSinksInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.ssrf_sinks) return alreadyCalled('set_ssrf_sinks');
      state.ssrf_sinks = input;
      return successResult({ set: 'set_ssrf_sinks' });
    },
  );

  const server: McpSdkServerConfigWithInstance = createSdkMcpServer({
    name: 'pre-recon-collector',
    version: '1.0.0',
    tools: [
      setExecutiveSummary,
      setApplicationIntelligence,
      setAuthDeepDive,
      setCodebaseIndexing,
      setCriticalFilePaths,
      setXssSinks,
      setSsrfSinks,
    ],
  });

  function statusOf<K extends PreReconToolName>(key: K): PreReconToolStatus {
    const flagMap: Record<PreReconToolName, unknown> = {
      set_executive_summary: state.executive_summary,
      set_application_intelligence: state.application_intelligence,
      set_auth_deep_dive: state.auth_deep_dive,
      set_codebase_indexing: state.codebase_indexing,
      set_critical_file_paths: state.critical_file_paths,
      set_xss_sinks: state.xss_sinks,
      set_ssrf_sinks: state.ssrf_sinks,
    };
    return flagMap[key] ? 'called' : 'skipped';
  }

  return {
    server,
    getAll: (): PreReconData => ({
      ...(state.executive_summary && { executive_summary: state.executive_summary }),
      ...(state.application_intelligence && { application_intelligence: state.application_intelligence }),
      ...(state.auth_deep_dive && { auth_deep_dive: state.auth_deep_dive }),
      ...(state.codebase_indexing && { codebase_indexing: state.codebase_indexing }),
      ...(state.critical_file_paths && { critical_file_paths: state.critical_file_paths }),
      ...(state.xss_sinks && { xss_sinks: state.xss_sinks }),
      ...(state.ssrf_sinks && { ssrf_sinks: state.ssrf_sinks }),
    }),
    getCallStatus: (): PreReconCallStatus => ({
      set_executive_summary: statusOf('set_executive_summary'),
      set_application_intelligence: statusOf('set_application_intelligence'),
      set_auth_deep_dive: statusOf('set_auth_deep_dive'),
      set_codebase_indexing: statusOf('set_codebase_indexing'),
      set_critical_file_paths: statusOf('set_critical_file_paths'),
      set_xss_sinks: statusOf('set_xss_sinks'),
      set_ssrf_sinks: statusOf('set_ssrf_sinks'),
    }),
  };
}
