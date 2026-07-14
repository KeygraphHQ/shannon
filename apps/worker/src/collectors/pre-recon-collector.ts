// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Pre-Recon Collector tools
 *
 * Exposes seven TypeBox-validated tools, one per section of the
 * pre_recon_deliverable.md report. Every tool is one-shot (write-once;
 * duplicate calls return DuplicateError). A skipped tool renders a placeholder
 * rather than failing the activity. After the agent finishes, the host calls
 * getAll() to harvest the typed payload bag, getCallStatus() to log the
 * per-run call pattern, and runs the deterministic renderer to produce the
 * deliverable Markdown.
 *
 * Each TypeBox schema's field-level descriptions carry the section guidance, so
 * the harness injects it into the agent's tool catalog.
 */

import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';
import { cleanInput } from './schema.js';

// ============================================================================
// SHARED SCHEMA
// ============================================================================

export const SinkRefSchema = Type.Object({
  location: Type.String({
    minLength: 1,
    description:
      'File path with line number (e.g., "templates/render.js:34") or richer prose ' +
      '(e.g., "innerHTML at templates/render.js:34", "lines 45-67"). Must contain enough ' +
      'detail for a downstream agent to find the exact location.',
  }),
  sink_function: Type.String({
    minLength: 1,
    description: 'The sink function or property name (e.g., "innerHTML", "axios.get", "eval", "document.write").',
  }),
  notes: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description:
        'Optional context — render-context detail, attribute name, scope hints, or anything ' +
        'a downstream agent needs to act on this sink. Omit when the location and sink_function ' +
        'are sufficient on their own.',
    }),
  ),
});

export type SinkRef = Static<typeof SinkRefSchema>;

// ============================================================================
// PER-TOOL INPUT SCHEMAS
// ============================================================================

export const ExecutiveSummaryInputSchema = Type.Object({
  text: Type.String({
    minLength: 1,
    description:
      "Provide a 2-3 paragraph overview of the application's security posture, highlighting " +
      'the most critical attack surfaces and architectural security decisions. Becomes ' +
      'Section 1 of the rendered deliverable.',
  }),
});

export const ApplicationIntelligenceInputSchema = Type.Object({
  architecture: Type.Object(
    {
      framework_and_language: Type.String({
        minLength: 1,
        description: 'Framework and language details with their security implications.',
      }),
      architectural_pattern: Type.String({
        minLength: 1,
        description: 'Architectural pattern (monolith, microservices, hybrid) with trust boundary analysis.',
      }),
      critical_security_components: Type.String({
        minLength: 1,
        description: 'Critical security components with focus on auth, authz, and data protection.',
      }),
    },
    {
      description:
        'Architecture & Technology Stack — driven by the Architecture Scanner sub-agent. ' +
        'Becomes Section 2 of the rendered deliverable.',
    },
  ),
  data_security: Type.Object(
    {
      database_security: Type.String({
        minLength: 1,
        description: 'Analyze encryption, access controls, and query safety in database interactions.',
      }),
      data_flow_security: Type.String({
        minLength: 1,
        description: 'Identify sensitive data paths and the protection mechanisms applied along them.',
      }),
      multi_tenant_isolation: Type.String({
        minLength: 1,
        description:
          'Assess tenant separation effectiveness. If the application is single-tenant, state that ' +
          'explicitly rather than leaving the field thin.',
      }),
    },
    {
      description:
        'Data Security & Storage — driven by the Data Security Auditor sub-agent. ' +
        'Becomes Section 4 of the rendered deliverable.',
    },
  ),
  attack_surface: Type.Object(
    {
      external_entry_points: Type.String({
        minLength: 1,
        description: 'Detailed analysis of each public interface that is network-accessible.',
      }),
      internal_service_communication: Type.String({
        minLength: 1,
        description:
          'Trust relationships and security assumptions between network-reachable services. ' +
          'If the application is a single service with no internal RPC fabric, state that.',
      }),
      input_validation_patterns: Type.String({
        minLength: 1,
        description: 'How user input is handled and validated in network-accessible endpoints.',
      }),
      background_processing: Type.String({
        minLength: 1,
        description:
          'Async job security and privilege models for jobs triggered by network requests. ' +
          'If no async/background processing exists, state that.',
      }),
    },
    {
      description:
        'Attack Surface Analysis — driven by Entry Point Mapper + Architecture Scanner sub-agents. ' +
        'Only include entry points confirmed to be in-scope (network-reachable). ' +
        'Becomes Section 5 of the rendered deliverable.',
    },
  ),
  infrastructure: Type.Object(
    {
      secrets_management: Type.String({
        minLength: 1,
        description: 'How secrets are stored, rotated, and accessed.',
      }),
      configuration_security: Type.String({
        minLength: 1,
        description:
          'Environment separation and secret handling. Specifically search for infrastructure ' +
          'configuration (e.g., Nginx, Kubernetes Ingress, CDN settings) that defines security ' +
          'headers like Strict-Transport-Security (HSTS) and Cache-Control, and report what was found.',
      }),
      external_dependencies: Type.String({
        minLength: 1,
        description: 'Third-party services and their security implications.',
      }),
      monitoring_and_logging: Type.String({
        minLength: 1,
        description: 'Security event visibility — what is logged, where it goes, and who can see it.',
      }),
    },
    {
      description: 'Infrastructure & Operational Security. Becomes Section 6 of the rendered deliverable.',
    },
  ),
});

export const AuthDeepDiveInputSchema = Type.Object({
  authentication_mechanisms: Type.String({
    minLength: 1,
    description:
      'Authentication mechanisms and their security properties. MUST include an exhaustive list of ' +
      'all API endpoints used for authentication (e.g., login, logout, token refresh, password reset).',
  }),
  session_management: Type.String({
    minLength: 1,
    description:
      'Session management and token security. Pinpoint the exact file and line(s) of code where ' +
      'session cookie flags (HttpOnly, Secure, SameSite) are configured.',
  }),
  authz_model: Type.String({
    minLength: 1,
    description: 'Authorization model and potential bypass scenarios.',
  }),
  multi_tenancy: Type.String({
    minLength: 1,
    description: 'Multi-tenancy security implementation. If the application is single-tenant, state that explicitly.',
  }),
  sso_oauth_oidc: Type.Union([Type.String(), Type.Null()], {
    description:
      'SSO/OAuth/OIDC flows: identify the callback endpoints and locate the specific code that ' +
      'validates the state and nonce parameters. Set null only if the application has no SSO/OAuth/OIDC ' +
      'integration at all.',
  }),
});

export const CodebaseIndexingInputSchema = Type.Object({
  text: Type.String({
    minLength: 1,
    description:
      "A detailed, multi-sentence paragraph describing the codebase's directory structure, " +
      'organization, and significant tools or conventions used (e.g., build orchestration, code ' +
      'generation, testing frameworks). Focus on how this structure impacts discoverability of ' +
      'security-relevant components.',
  }),
});

export const CriticalFilePathsInputSchema = Type.Object({
  configuration: Type.Array(Type.String({ minLength: 1 }), {
    description: 'Configuration files (e.g., config/server.yaml, Dockerfile, docker-compose.yml).',
  }),
  authentication_and_authorization: Type.Array(Type.String({ minLength: 1 }), {
    description:
      'Auth/authz files (e.g., auth/jwt_middleware.go, internal/user/permissions.go, ' +
      'config/initializers/session_store.rb, src/services/oauth_callback.js).',
  }),
  api_and_routing: Type.Array(Type.String({ minLength: 1 }), {
    description:
      'API and routing files (e.g., cmd/api/main.go, internal/handlers/user_routes.go, ' +
      'ts/graphql/schema.graphql).',
  }),
  data_models_and_db: Type.Array(Type.String({ minLength: 1 }), {
    description:
      'Data model and DB interaction files (e.g., db/migrations/001_initial.sql, ' +
      'internal/models/user.go, internal/repository/sql_queries.go).',
  }),
  dependency_manifests: Type.Array(Type.String({ minLength: 1 }), {
    description: 'Dependency manifests (e.g., go.mod, package.json, requirements.txt).',
  }),
  sensitive_data_and_secrets: Type.Array(Type.String({ minLength: 1 }), {
    description:
      'Sensitive data and secrets handling (e.g., internal/utils/encryption.go, ' + 'internal/secrets/manager.go).',
  }),
  middleware_and_input_validation: Type.Array(Type.String({ minLength: 1 }), {
    description:
      'Middleware and input validation (e.g., internal/middleware/validator.go, ' +
      'internal/handlers/input_parsers.go).',
  }),
  logging_and_monitoring: Type.Array(Type.String({ minLength: 1 }), {
    description: 'Logging and monitoring (e.g., internal/logging/logger.go, config/monitoring.yaml).',
  }),
  infrastructure_and_deployment: Type.Array(Type.String({ minLength: 1 }), {
    description:
      'Infrastructure and deployment (e.g., infra/pulumi/main.go, kubernetes/deploy.yaml, ' +
      'nginx.conf, gateway-ingress.yaml).',
  }),
});

export const XssSinksInputSchema = Type.Object({
  applicable: Type.Boolean({
    description:
      'False only if the application has no web frontend at all. Otherwise true, even if no ' +
      'sinks were found in a given category — empty arrays mean "scanned this category, no sinks found".',
  }),
  html_body: Type.Array(SinkRefSchema, {
    description:
      'HTML Body Context sinks: element.innerHTML, element.outerHTML, document.write(), ' +
      'document.writeln(), element.insertAdjacentHTML(), Range.createContextualFragment(), ' +
      'and jQuery sinks like add(), after(), append(), before(), html(), prepend(), replaceWith(), wrap().',
  }),
  html_attribute: Type.Array(SinkRefSchema, {
    description:
      'HTML Attribute Context sinks: event handlers (onclick, onerror, onmouseover, onload, onfocus), ' +
      'URL-based attributes (href, src, formaction, action, background, data), the style attribute, ' +
      'iframe srcdoc, and general attributes (value, id, class, name, alt) when quotes are escaped.',
  }),
  javascript: Type.Array(SinkRefSchema, {
    description:
      'JavaScript Context sinks: eval(), Function() constructor, setTimeout() / setInterval() ' +
      'with string arguments, and direct writes of user data into a <script> tag.',
  }),
  css: Type.Array(SinkRefSchema, {
    description:
      'CSS Context sinks: element.style properties (e.g., element.style.backgroundImage) and ' +
      'direct writes of user data into a <style> tag.',
  }),
  url: Type.Array(SinkRefSchema, {
    description:
      'URL Context sinks: location / window.location, location.href, location.replace(), ' +
      'location.assign(), window.open(), history.pushState(), history.replaceState(), ' +
      'URL.createObjectURL(), and jQuery selector $(userInput) in older versions.',
  }),
});

export const SsrfSinksInputSchema = Type.Object({
  applicable: Type.Boolean({
    description:
      'False only if the application makes no outbound requests at all. Otherwise true, even if ' +
      'no sinks were found in a given category — empty arrays mean "scanned this category, no sinks found".',
  }),
  http_clients: Type.Array(SinkRefSchema, {
    description:
      'HTTP(S) clients: curl, requests (Python), axios (Node.js), fetch (JavaScript/Node.js), ' +
      'net/http (Go), HttpClient (Java/.NET), urllib (Python), RestTemplate, WebClient, OkHttp, Apache HttpClient.',
  }),
  raw_sockets: Type.Array(SinkRefSchema, {
    description:
      'Raw sockets and connect APIs: Socket.connect, net.Dial (Go), socket.connect (Python), ' +
      'TcpClient, UdpClient, NetworkStream, java.net.Socket, java.net.URL.openConnection().',
  }),
  url_openers: Type.Array(SinkRefSchema, {
    description:
      'URL openers and file includes: file_get_contents (PHP), fopen, include_once, require_once, ' +
      'new URL().openStream() (Java), urllib.urlopen (Python), fs.readFile with URLs, ' +
      'import() with dynamic URLs, loadHTML / loadXML with external sources.',
  }),
  redirect_handlers: Type.Array(SinkRefSchema, {
    description:
      'Redirect and "next URL" handlers: auto-follow redirects in HTTP clients, framework Location ' +
      'handlers (response.redirect), URL validation in redirect chains, "Continue to" / "Return URL" parameters.',
  }),
  headless_browsers: Type.Array(SinkRefSchema, {
    description:
      'Headless browsers and render engines: Puppeteer (page.goto, page.setContent), ' +
      'Playwright (page.navigate, page.route), Selenium WebDriver navigation, html-to-pdf converters ' +
      '(wkhtmltopdf, Puppeteer PDF), and SSR with external content.',
  }),
  media_processors: Type.Array(SinkRefSchema, {
    description:
      'Media processors: ImageMagick (convert, identify with URLs), GraphicsMagick, FFmpeg with ' +
      'network sources, wkhtmltopdf, Ghostscript with URL inputs, image optimization services with URL parameters.',
  }),
  link_preview: Type.Array(SinkRefSchema, {
    description:
      'Link preview and unfurlers: chat application link expanders, CMS link preview generators, ' +
      'oEmbed endpoint fetchers, social media card generators, URL metadata extractors.',
  }),
  webhook_testers: Type.Array(SinkRefSchema, {
    description:
      'Webhook testers and callback verifiers: "ping my webhook" functionality, outbound callback ' +
      'verification, health check notifications, event delivery confirmations, API endpoint validation tools.',
  }),
  sso_oidc_discovery: Type.Array(SinkRefSchema, {
    description:
      'SSO/OIDC discovery and JWKS fetchers: OpenID Connect discovery endpoints, JWKS fetchers, ' +
      'OAuth authorization server metadata, SAML metadata fetchers, federation metadata retrievers.',
  }),
  importers: Type.Array(SinkRefSchema, {
    description:
      'Importers and data loaders: "import from URL" functionality, CSV/JSON/XML remote loaders, ' +
      'RSS/Atom feed readers, API data synchronization, configuration file fetchers.',
  }),
  package_installers: Type.Array(SinkRefSchema, {
    description:
      'Package/plugin/theme installers: "install from URL" features, package managers with remote ' +
      'sources, plugin/theme downloaders, update mechanisms with remote checks, dependency resolution ' +
      'with external repos.',
  }),
  monitoring_and_health: Type.Array(SinkRefSchema, {
    description:
      'Monitoring and health check frameworks: URL pingers and uptime checkers, health check ' +
      'endpoints, monitoring probe systems, alerting webhook senders, performance testing tools.',
  }),
  cloud_metadata: Type.Array(SinkRefSchema, {
    description:
      'Cloud metadata helpers: AWS/GCP/Azure instance metadata callers, cloud service discovery ' +
      'mechanisms, container orchestration API clients, infrastructure metadata fetchers, service mesh ' +
      'configuration retrievers.',
  }),
});

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type ExecutiveSummaryInput = Static<typeof ExecutiveSummaryInputSchema>;
export type ApplicationIntelligenceInput = Static<typeof ApplicationIntelligenceInputSchema>;
export type AuthDeepDiveInput = Static<typeof AuthDeepDiveInputSchema>;
export type CodebaseIndexingInput = Static<typeof CodebaseIndexingInputSchema>;
export type CriticalFilePathsInput = Static<typeof CriticalFilePathsInputSchema>;
export type XssSinksInput = Static<typeof XssSinksInputSchema>;
export type SsrfSinksInput = Static<typeof SsrfSinksInputSchema>;

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

interface PreReconState {
  executive_summary?: ExecutiveSummaryInput;
  application_intelligence?: ApplicationIntelligenceInput;
  auth_deep_dive?: AuthDeepDiveInput;
  codebase_indexing?: CodebaseIndexingInput;
  critical_file_paths?: CriticalFilePathsInput;
  xss_sinks?: XssSinksInput;
  ssrf_sinks?: SsrfSinksInput;
}

export interface PreReconCollector {
  tools: ToolDefinition[];
  getAll(): PreReconData;
  getCallStatus(): PreReconCallStatus;
}

export function createPreReconCollector(): PreReconCollector {
  const state: PreReconState = {};

  function alreadyCalled(toolName: PreReconToolName) {
    return errorResult(
      `${toolName} has already been called. Each set_* tool may only be called once per run.`,
      'DuplicateError',
      false,
    );
  }

  const setExecutiveSummary = defineTool({
    name: 'set_executive_summary',
    label: 'Set Executive Summary',
    description:
      "Record the application's overall security posture as a short executive summary. " +
      'Call exactly once before terminating. Becomes Section 1 of the rendered deliverable. ' +
      'Duplicate calls are rejected.',
    parameters: ExecutiveSummaryInputSchema,
    async execute(_toolCallId, input) {
      if (state.executive_summary) return alreadyCalled('set_executive_summary');
      state.executive_summary = cleanInput(ExecutiveSummaryInputSchema, input);
      return successResult({ set: 'set_executive_summary' });
    },
  });

  const setApplicationIntelligence = defineTool({
    name: 'set_application_intelligence',
    label: 'Set Application Intelligence',
    description:
      'Record the composite application intelligence — architecture, data security, attack surface, ' +
      'and infrastructure — in a single call. Call exactly once before terminating. ' +
      'Becomes Sections 2, 4, 5, and 6 of the rendered deliverable. Duplicate calls are rejected.',
    parameters: ApplicationIntelligenceInputSchema,
    async execute(_toolCallId, input) {
      if (state.application_intelligence) return alreadyCalled('set_application_intelligence');
      state.application_intelligence = cleanInput(ApplicationIntelligenceInputSchema, input);
      return successResult({ set: 'set_application_intelligence' });
    },
  });

  const setAuthDeepDive = defineTool({
    name: 'set_auth_deep_dive',
    label: 'Set Auth Deep Dive',
    description:
      'Record the authentication & authorization deep dive. Call exactly once before terminating. ' +
      'Becomes Section 3 of the rendered deliverable. Duplicate calls are rejected.',
    parameters: AuthDeepDiveInputSchema,
    async execute(_toolCallId, input) {
      if (state.auth_deep_dive) return alreadyCalled('set_auth_deep_dive');
      state.auth_deep_dive = cleanInput(AuthDeepDiveInputSchema, input);
      return successResult({ set: 'set_auth_deep_dive' });
    },
  });

  const setCodebaseIndexing = defineTool({
    name: 'set_codebase_indexing',
    label: 'Set Codebase Indexing',
    description:
      'Record the overall codebase indexing narrative. Call exactly once before terminating. ' +
      'Becomes Section 7 of the rendered deliverable. Duplicate calls are rejected.',
    parameters: CodebaseIndexingInputSchema,
    async execute(_toolCallId, input) {
      if (state.codebase_indexing) return alreadyCalled('set_codebase_indexing');
      state.codebase_indexing = cleanInput(CodebaseIndexingInputSchema, input);
      return successResult({ set: 'set_codebase_indexing' });
    },
  });

  const setCriticalFilePaths = defineTool({
    name: 'set_critical_file_paths',
    label: 'Set Critical File Paths',
    description:
      'Record the catalog of critical file paths grouped by security relevance. Call exactly once ' +
      'before terminating. Becomes Section 8 of the rendered deliverable. The next agent uses this ' +
      'as a starting point for manual review. Duplicate calls are rejected.',
    parameters: CriticalFilePathsInputSchema,
    async execute(_toolCallId, input) {
      if (state.critical_file_paths) return alreadyCalled('set_critical_file_paths');
      state.critical_file_paths = cleanInput(CriticalFilePathsInputSchema, input);
      return successResult({ set: 'set_critical_file_paths' });
    },
  });

  const setXssSinks = defineTool({
    name: 'set_xss_sinks',
    label: 'Set Xss Sinks',
    description:
      'Record discovered XSS sinks grouped by render context. Call exactly once before terminating. ' +
      'If the application has no web frontend at all, set applicable=false; otherwise populate each ' +
      'render-context array (empty arrays mean "scanned, no sinks of this kind"). This list drives ' +
      "the vuln-xss agent's testing todos downstream. Becomes Section 9 of the rendered deliverable. " +
      'Duplicate calls are rejected.',
    parameters: XssSinksInputSchema,
    async execute(_toolCallId, input) {
      if (state.xss_sinks) return alreadyCalled('set_xss_sinks');
      state.xss_sinks = cleanInput(XssSinksInputSchema, input);
      return successResult({ set: 'set_xss_sinks' });
    },
  });

  const setSsrfSinks = defineTool({
    name: 'set_ssrf_sinks',
    label: 'Set Ssrf Sinks',
    description:
      'Record discovered SSRF sinks grouped by sink category. Call exactly once before terminating. ' +
      'If the application makes no outbound requests at all, set applicable=false; otherwise populate ' +
      'each category array (empty arrays mean "scanned, no sinks of this kind"). This list drives ' +
      "the vuln-ssrf agent's testing todos downstream. Becomes Section 10 of the rendered deliverable. " +
      'Duplicate calls are rejected.',
    parameters: SsrfSinksInputSchema,
    async execute(_toolCallId, input) {
      if (state.ssrf_sinks) return alreadyCalled('set_ssrf_sinks');
      state.ssrf_sinks = cleanInput(SsrfSinksInputSchema, input);
      return successResult({ set: 'set_ssrf_sinks' });
    },
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
    tools: [
      setExecutiveSummary,
      setApplicationIntelligence,
      setAuthDeepDive,
      setCodebaseIndexing,
      setCriticalFilePaths,
      setXssSinks,
      setSsrfSinks,
    ],
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
