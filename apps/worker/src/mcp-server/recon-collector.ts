// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Recon Collector MCP Server
 *
 * Exposes nine Zod-validated MCP tools that feed the recon_deliverable.md
 * renderer — eight one-shot `set_*` tools, one per deliverable section, plus a
 * multi-call `add_endpoints` tool that lets the agent split a large API
 * inventory across calls (the only catalog whose realistic payload threatens
 * the per-turn output cap).
 *
 * A skipped tool renders a "not provided" placeholder in that section rather
 * than failing the activity. getCallStatus() exposes the per-run call pattern
 * for logging. Each Zod schema's field-level descriptions carry the section
 * guidance, so the SDK injects it into the agent's tool catalog.
 */

import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { type SinkRef, SinkRefSchema } from './pre-recon-collector.js';

// ============================================================================
// PER-TOOL INPUT SCHEMAS
// ============================================================================

export const ExecutiveSummaryInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe(
      "A brief overview of the application's purpose, core technology stack " +
        '(e.g., Next.js, Cloudflare), and the primary user-facing components that ' +
        'constitute the attack surface. Becomes Section 1 of the rendered deliverable.',
    ),
});

export const TechnologyStackInputSchema = z.object({
  frontend: z.string().min(1).describe('Framework, key libraries, and authentication libraries used on the frontend.'),
  backend: z.string().min(1).describe('Language, framework, and key dependencies used on the backend.'),
  infrastructure: z
    .string()
    .min(1)
    .describe('Hosting provider, CDN, database type, and other infrastructure components.'),
});

const SessionFlowSchema = z.object({
  entry_points: z.string().min(1).describe('Authentication entry points (e.g., /login, /register, /auth/sso).'),
  mechanism: z
    .string()
    .min(1)
    .describe(
      'Describe the step-by-step authentication process: credential submission, token generation, ' +
        'cookie setting, redirects, etc.',
    ),
  code_pointers: z
    .string()
    .min(1)
    .describe(
      'Pointers to the primary files and functions in the codebase that manage authentication and ' + 'session logic.',
    ),
});

const RoleAssignmentSchema = z.object({
  role_determination: z
    .string()
    .min(1)
    .describe('How roles are assigned post-authentication — database lookup, JWT claims, external service, etc.'),
  default_role: z.string().min(1).describe('What role new users get by default.'),
  role_upgrade_path: z
    .string()
    .min(1)
    .describe(
      'How users can gain higher privileges — admin approval, self-service, automatic, etc. ' +
        'If no upgrade path exists, state that.',
    ),
  code_implementation: z
    .string()
    .min(1)
    .describe('Where role assignment logic is implemented (file paths and functions).'),
});

const PrivilegeStorageSchema = z.object({
  storage_location: z
    .string()
    .min(1)
    .describe('Where user privileges are stored — JWT claims, session data, database, external service.'),
  validation_points: z.string().min(1).describe('Where role checks happen — middleware, decorators, inline checks.'),
  cache_session_persistence: z.string().min(1).describe('How long privileges are cached, and when they are refreshed.'),
  code_pointers: z.string().min(1).describe('Files that handle privilege validation.'),
});

const RoleSwitchingImpersonationSchema = z.object({
  applicable: z
    .boolean()
    .describe(
      'False only if the application has no impersonation, sudo-mode, or role-switching features ' +
        'at all. When false, the other fields in this object may be null.',
    ),
  impersonation_features: z
    .string()
    .nullable()
    .describe(
      'Any ability for admins or higher-privilege users to impersonate other users. Pass null when ' +
        'applicable is false.',
    ),
  role_switching: z
    .string()
    .nullable()
    .describe('Temporary privilege elevation mechanisms like "sudo mode". Pass null when applicable is false.'),
  audit_trail: z
    .string()
    .nullable()
    .describe(
      'Whether role switches or impersonation events are logged, and where. Pass null when applicable is false.',
    ),
  code_implementation: z
    .string()
    .nullable()
    .describe('Where these features are implemented (file paths and functions). Pass null when applicable is false.'),
});

export const AuthenticationInputSchema = z.object({
  session_flow: SessionFlowSchema.describe(
    'Authentication & Session Management Flow — overall entry points, mechanism, and code pointers. ' +
      'Becomes Section 3 of the rendered deliverable.',
  ),
  role_assignment: RoleAssignmentSchema.describe(
    'Role Assignment Process — how roles are determined post-authentication. ' + 'Becomes Section 3.1.',
  ),
  privilege_storage: PrivilegeStorageSchema.describe(
    'Privilege Storage & Validation — where privileges live and where they are checked. ' + 'Becomes Section 3.2.',
  ),
  role_switching_impersonation: RoleSwitchingImpersonationSchema.describe(
    'Role Switching & Impersonation — impersonation, sudo mode, audit trails. Becomes Section 3.3. ' +
      'Set applicable=false if no such features exist; the other fields may be null in that case.',
  ),
});

const HTTP_METHOD_VALUES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'WS'] as const;

const EndpointSchema = z.object({
  method: z.enum(HTTP_METHOD_VALUES).describe('HTTP method. Use WS for WebSocket upgrade endpoints.'),
  path: z.string().min(1).describe('Endpoint path with parameter placeholders, e.g. "/api/users/{user_id}".'),
  required_role: z.string().min(1).describe('Minimum role needed (anon, user, admin, etc.).'),
  object_id_parameters: z
    .array(z.string())
    .describe('Parameters that identify specific objects (user_id, order_id, etc.). Empty array if none.'),
  authorization_mechanism: z
    .string()
    .min(1)
    .describe(
      'How access is controlled — middleware, decorator, inline check. ' +
        'E.g. "Bearer Token + ownership check", "requireAuth() + requireAdmin()", "None".',
    ),
  description: z.string().min(1).describe("Brief description of the endpoint's purpose."),
  code_pointer: z
    .string()
    .min(1)
    .describe('File path and (where possible) line number of the handler. E.g. "auth.controller.ts:45".'),
});

export const AddEndpointsInputSchema = z.object({
  endpoints: z
    .array(EndpointSchema)
    .describe(
      'A batch of network-accessible API endpoints to append to the catalog. Include only endpoints ' +
        'reachable through the deployed application — exclude CLI tools, dev-only routes, build scripts. ' +
        'Duplicate (method, path) pairs across calls are skipped as no-ops; the response reports which ' +
        'were added vs. skipped.',
    ),
});

export const InputVectorsInputSchema = z.object({
  url_parameters: z
    .array(z.string().min(1))
    .describe(
      'URL parameter input vectors — each entry should identify the parameter and (where possible) ' +
        'the file:line of the handler. E.g. "?redirect_url= @ auth.controller.ts:88".',
    ),
  post_body_fields: z
    .array(z.string().min(1))
    .describe(
      'POST/PUT body field input vectors (JSON or form). E.g. "username @ login.handler.ts:34", ' +
        '"profile.description @ users.controller.ts:120".',
    ),
  http_headers: z
    .array(z.string().min(1))
    .describe(
      'HTTP header input vectors. Include both standard headers consumed by app code (e.g., ' +
        'X-Forwarded-For) and custom application headers.',
    ),
  cookie_values: z
    .array(z.string().min(1))
    .describe('Cookie-based input vectors. E.g. "preferences_cookie @ middleware/prefs.ts:22".'),
});

const ENTITY_TYPE_VALUES = ['ExternAsset', 'Service', 'Identity', 'DataStore', 'AdminPlane', 'ThirdParty'] as const;

const ENTITY_ZONE_VALUES = ['Internet', 'Edge', 'App', 'Data', 'Admin', 'BuildCI', 'ThirdParty'] as const;

const DATA_LABEL_VALUES = ['PII', 'Tokens', 'Payments', 'Secrets', 'Public'] as const;

const FLOW_CHANNEL_VALUES = ['HTTP', 'HTTPS', 'TCP', 'Message', 'File', 'Token'] as const;

const GUARD_CATEGORY_VALUES = [
  'Auth',
  'Network',
  'Protocol',
  'Env',
  'RateLimit',
  'Authorization',
  'ObjectOwnership',
] as const;

const EntityMetadataPairSchema = z.object({
  key: z.string().min(1).describe('Metadata key (e.g., "Hosts", "Endpoints", "Engine", "Issuer").'),
  value: z.string().min(1).describe('Metadata value for this key.'),
});

const EntitySchema = z.object({
  title: z
    .string()
    .min(1)
    .describe('Unique short name for the entity (e.g., "ExampleWebApp", "PostgreSQL-DB", "IdentityProvider").'),
  type: z
    .enum(ENTITY_TYPE_VALUES)
    .describe(
      'Entity type. ExternAsset = client-side asset; Service = backend service; Identity = identity ' +
        'provider; DataStore = database / cache / object store; AdminPlane = admin/control surface; ' +
        'ThirdParty = external integration.',
    ),
  zone: z
    .enum(ENTITY_ZONE_VALUES)
    .describe(
      'Trust zone. Internet = public; Edge = CDN/WAF/reverse-proxy tier; App = application/business logic; ' +
        'Data = persistent storage; Admin = administrative surface; BuildCI = build/CI/CD infrastructure; ' +
        'ThirdParty = external trust domain.',
    ),
  tech: z
    .string()
    .min(1)
    .describe('Short technology/framework description (e.g., "Node/Express", "Postgres 14", "AWS S3").'),
  data: z
    .array(z.enum(DATA_LABEL_VALUES))
    .describe('Data labels handled by this entity. Empty array if the entity handles only Public data.'),
  notes: z
    .string()
    .describe('Freeform context (e.g., "public-facing", "stores sensitive user data"). Empty string if none.'),
  metadata: z
    .array(EntityMetadataPairSchema)
    .describe(
      'Ordered key/value pairs of technical metadata for this entity. Becomes the Section 6.2 row ' +
        'rendered as "Key: Value; Key: Value; …". Example pairs for a service: Hosts, Endpoints, Auth, ' +
        'Dependencies; for a datastore: Engine, Exposure, Consumers, Credentials.',
    ),
});

const FlowSchema = z.object({
  from: z.string().min(1).describe('Source entity title — must match a title from the entities array.'),
  to: z.string().min(1).describe('Destination entity title — must match a title from the entities array.'),
  channel: z.enum(FLOW_CHANNEL_VALUES).describe('Transport channel for this flow.'),
  path_port: z
    .string()
    .min(1)
    .describe('Path and/or port for this flow. E.g. ":443 /api/users/me", ":5432", "queue: orders".'),
  guards: z
    .array(z.string().min(1))
    .describe(
      'Guard names that gate this flow. Each should match a name from the guards array. Empty array ' +
        'means no guards apply (publicly accessible).',
    ),
  touches: z
    .array(z.enum(DATA_LABEL_VALUES))
    .describe('Data labels this flow carries. Empty array if only Public data flows.'),
});

const GuardSchema = z.object({
  name: z.string().min(1).describe('Short guard identifier (e.g., "auth:user", "ownership:user", "vpc-only", "mtls").'),
  category: z
    .enum(GUARD_CATEGORY_VALUES)
    .describe(
      'Guard category. Auth = authentication identity; Authorization = role/scope check; ' +
        'ObjectOwnership = ownership-based check; Network = network-level restriction; ' +
        'Protocol = protocol-level requirement; Env = environment-bound restriction; ' +
        'RateLimit = throttling.',
    ),
  statement: z.string().min(1).describe('One-sentence description of what this guard enforces.'),
});

export const NetworkMapInputSchema = z.object({
  entities: z
    .array(EntitySchema)
    .describe(
      'All major components of the system. Becomes Section 6.1 (Entities) and Section 6.2 ' +
        '(Entity Metadata, split per-entity from the metadata field).',
    ),
  flows: z
    .array(FlowSchema)
    .describe(
      'How entities communicate. Becomes Section 6.3. The from/to fields cross-reference entities ' +
        'by title; the guards field cross-references guards by name.',
    ),
  guards: z.array(GuardSchema).describe('Catalog of guards referenced by flows. Becomes Section 6.4.'),
});

const RoleSchema = z.object({
  name: z.string().min(1).describe('Role name (e.g., "anon", "user", "admin", "team_admin").'),
  privilege_level: z
    .number()
    .int()
    .min(0)
    .max(10)
    .describe('Privilege rank from 0 (lowest, anonymous) to 10 (highest, full admin).'),
  scope_domain: z.string().min(1).describe('Scope of this role: Global, Org, Team, Project, etc.'),
  code_implementation: z
    .string()
    .min(1)
    .describe('Where this role is defined or checked (middleware, decorator, file:line, etc.).'),
  default_landing_page: z
    .string()
    .min(1)
    .describe('Default landing page or route after authentication. Use "N/A" for roles without a UI.'),
  accessible_route_patterns: z
    .array(z.string().min(1))
    .describe('Route patterns this role can access. Empty array if the role has no UI access.'),
  authentication_method: z
    .string()
    .min(1)
    .describe('How this role authenticates: "None" (anon), "Session/JWT", "Session/JWT + role claim", etc.'),
  middleware_guards: z
    .string()
    .min(1)
    .describe('Middleware and guards that enforce this role (e.g., "requireAuth() + requireAdmin()").'),
  permission_checks: z
    .string()
    .min(1)
    .describe('How permission checks are expressed in code (e.g., "req.user.role === \'admin\'").'),
  storage_location: z
    .string()
    .min(1)
    .describe('Where this role is stored at runtime (JWT claims, session data, etc.).'),
});

const PrivilegeLatticeSchema = z.object({
  ordering_diagram: z
    .string()
    .min(1)
    .describe(
      'ASCII diagram showing role ordering. Use → for "can access resources of". ' + 'E.g. "anon → user → admin".',
    ),
  parallel_isolation_notes: z
    .string()
    .describe(
      'Notes on parallel isolation between roles using ||. E.g. "team_admin || dept_admin (both > user, ' +
        'but isolated from each other)". Empty string if no parallel isolation exists.',
    ),
  role_switching_notes: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Optional pointer to impersonation, sudo mode, or role-switching mechanisms documented in ' +
        'set_authentication.role_switching_impersonation. Null/omitted if no such mechanisms exist.',
    ),
});

export const RoleArchitectureInputSchema = z.object({
  roles: z
    .array(RoleSchema)
    .describe(
      'All distinct privilege levels found in the application. Becomes Sections 7.1 (Discovered Roles), ' +
        '7.3 (Role Entry Points), and 7.4 (Role-to-Code Mapping), split by the renderer per-role.',
    ),
  privilege_lattice: PrivilegeLatticeSchema.describe(
    'The role hierarchy showing dominance and parallel isolation. Becomes Section 7.2.',
  ),
});

const PRIORITY_VALUES = ['High', 'Medium', 'Low'] as const;

const HorizontalCandidateSchema = z.object({
  priority: z
    .enum(PRIORITY_VALUES)
    .describe('Priority: High, Medium, or Low, based on data sensitivity (title-case literals).'),
  endpoint_pattern: z
    .string()
    .min(1)
    .describe('Endpoint pattern with the object identifier. E.g. "/api/orders/{order_id}".'),
  object_id_parameter: z
    .string()
    .min(1)
    .describe('The parameter name that identifies the target object (e.g., "order_id", "user_id").'),
  data_type: z.string().min(1).describe('Type of data exposed: user_data, financial, admin_config, user_files, etc.'),
  sensitivity: z
    .string()
    .min(1)
    .describe('One-line description of what is at risk (e.g., "User can access other users\' orders").'),
});

const VerticalCandidateSchema = z.object({
  target_role: z.string().min(1).describe('Role required to access this endpoint (the role being escalated to).'),
  endpoint_pattern: z
    .string()
    .min(1)
    .describe('Endpoint pattern that requires elevated privileges. E.g. "/admin/*", "/api/admin/users".'),
  functionality: z
    .string()
    .min(1)
    .describe('What the endpoint does (e.g., "Administrative functions", "User management").'),
  risk_level: z.enum(PRIORITY_VALUES).describe('Risk level: High, Medium, or Low (title-case literals).'),
});

const ContextCandidateSchema = z.object({
  workflow: z.string().min(1).describe('Multi-step workflow name (e.g., "Checkout", "Onboarding", "Password Reset").'),
  endpoint: z.string().min(1).describe('Endpoint that assumes a prior workflow state. E.g. "/api/checkout/confirm".'),
  expected_prior_state: z.string().min(1).describe('What state should already exist before this endpoint is called.'),
  bypass_potential: z.string().min(1).describe('What an attacker could achieve by skipping the prior state.'),
});

export const AuthzCandidatesInputSchema = z.object({
  horizontal: z
    .array(HorizontalCandidateSchema)
    .describe(
      "Endpoints with object identifiers that could allow horizontal access to other users' " +
        'resources. Becomes Section 8.1. The renderer assigns stable AUTHZ-CAND-NN IDs.',
    ),
  vertical: z
    .array(VerticalCandidateSchema)
    .describe(
      'Endpoints that require higher privileges and could be targets for vertical escalation. ' +
        'Becomes Section 8.2. Exclude endpoints intentionally shared across roles.',
    ),
  context: z
    .array(ContextCandidateSchema)
    .describe('Multi-step workflow endpoints that assume prior steps were completed. Becomes Section 8.3.'),
});

export const InjectionSourcesInputSchema = z.object({
  applicable: z
    .boolean()
    .describe(
      'False only if the application has no network-accessible code paths reaching dangerous sinks ' +
        'at all. Otherwise true, even if no sources were found in a given category — empty arrays mean ' +
        '"scanned this category, no sources found".',
    ),
  command_injection: z
    .array(SinkRefSchema)
    .describe(
      'Command injection sources: data flowing from a user-controlled origin into a program variable ' +
        'that is eventually interpolated into a shell or system command string (within network-accessible ' +
        'code paths).',
    ),
  sql_injection: z
    .array(SinkRefSchema)
    .describe(
      'SQL injection sources: user-controllable input that reaches a database query string (within ' +
        'network-accessible code paths).',
    ),
  lfi_rfi: z
    .array(SinkRefSchema)
    .describe(
      'Local/Remote File Inclusion sources: user-controllable input passed to include/require/load ' +
        'functions that resolve to filesystem or remote paths (within network-accessible code paths).',
    ),
  path_traversal: z
    .array(SinkRefSchema)
    .describe(
      'Path traversal sources: user-controllable input that influences file paths in read/write ' +
        'operations (fopen, readFile, etc.) within network-accessible code paths.',
    ),
  ssti: z
    .array(SinkRefSchema)
    .describe(
      'Server-Side Template Injection sources: user-controllable input embedded in template ' +
        'expressions or template content within network-accessible code paths.',
    ),
  deserialization: z
    .array(SinkRefSchema)
    .describe(
      'Insecure deserialization sources: user-controllable input passed to deserialization functions ' +
        'within network-accessible code paths.',
    ),
});

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type ExecutiveSummaryInput = z.infer<typeof ExecutiveSummaryInputSchema>;
export type TechnologyStackInput = z.infer<typeof TechnologyStackInputSchema>;
export type AuthenticationInput = z.infer<typeof AuthenticationInputSchema>;
export type AddEndpointsInput = z.infer<typeof AddEndpointsInputSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type InputVectorsInput = z.infer<typeof InputVectorsInputSchema>;
export type NetworkMapInput = z.infer<typeof NetworkMapInputSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Flow = z.infer<typeof FlowSchema>;
export type Guard = z.infer<typeof GuardSchema>;
export type RoleArchitectureInput = z.infer<typeof RoleArchitectureInputSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type PrivilegeLattice = z.infer<typeof PrivilegeLatticeSchema>;
export type AuthzCandidatesInput = z.infer<typeof AuthzCandidatesInputSchema>;
export type HorizontalCandidate = z.infer<typeof HorizontalCandidateSchema>;
export type VerticalCandidate = z.infer<typeof VerticalCandidateSchema>;
export type ContextCandidate = z.infer<typeof ContextCandidateSchema>;
export type InjectionSourcesInput = z.infer<typeof InjectionSourcesInputSchema>;
export type Priority = (typeof PRIORITY_VALUES)[number];

export interface ReconData {
  readonly executive_summary?: ExecutiveSummaryInput;
  readonly technology_stack?: TechnologyStackInput;
  readonly authentication?: AuthenticationInput;
  readonly endpoints?: readonly Endpoint[];
  readonly input_vectors?: InputVectorsInput;
  readonly network_map?: NetworkMapInput;
  readonly role_architecture?: RoleArchitectureInput;
  readonly authz_candidates?: AuthzCandidatesInput;
  readonly injection_sources?: InjectionSourcesInput;
}

export const RECON_ONE_SHOT_TOOLS = [
  'set_executive_summary',
  'set_technology_stack',
  'set_authentication',
  'set_input_vectors',
  'set_network_map',
  'set_role_architecture',
  'set_authz_candidates',
  'set_injection_sources',
] as const;

export type ReconOneShotToolName = (typeof RECON_ONE_SHOT_TOOLS)[number];

export type ReconToolStatus = 'called' | 'skipped';

export interface ReconCallStatus {
  readonly set_executive_summary: ReconToolStatus;
  readonly set_technology_stack: ReconToolStatus;
  readonly set_authentication: ReconToolStatus;
  readonly add_endpoints: { readonly calls: number; readonly endpoints_seen: number };
  readonly set_input_vectors: ReconToolStatus;
  readonly set_network_map: ReconToolStatus;
  readonly set_role_architecture: ReconToolStatus;
  readonly set_authz_candidates: ReconToolStatus;
  readonly set_injection_sources: ReconToolStatus;
}

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

function endpointKey(method: string, path: string): string {
  return `${method} ${path}`;
}

// ============================================================================
// SERVER FACTORY
// ============================================================================

export interface ReconCollectorServer {
  server: McpSdkServerConfigWithInstance;
  getAll(): ReconData;
  getCallStatus(): ReconCallStatus;
}

export function createReconCollectorServer(): ReconCollectorServer {
  const state: {
    executive_summary?: ExecutiveSummaryInput;
    technology_stack?: TechnologyStackInput;
    authentication?: AuthenticationInput;
    input_vectors?: InputVectorsInput;
    network_map?: NetworkMapInput;
    role_architecture?: RoleArchitectureInput;
    authz_candidates?: AuthzCandidatesInput;
    injection_sources?: InjectionSourcesInput;
  } = {};

  const endpoints: Endpoint[] = [];
  const seenEndpointKeys = new Set<string>();
  let addEndpointsCalls = 0;

  function alreadyCalled(toolName: ReconOneShotToolName): ToolResult {
    return errorResult(
      `${toolName} has already been called. Each set_* tool may only be called once per run.`,
      'DuplicateError',
      false,
    );
  }

  const setExecutiveSummary = tool(
    'set_executive_summary',
    "Record the application's executive summary: purpose, core technology stack, and primary " +
      'user-facing components. Call exactly once before terminating. Becomes Section 1 of the rendered ' +
      'deliverable. Duplicate calls are rejected.',
    ExecutiveSummaryInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.executive_summary) return alreadyCalled('set_executive_summary');
      state.executive_summary = input;
      return successResult({ set: 'set_executive_summary' });
    },
  );

  const setTechnologyStack = tool(
    'set_technology_stack',
    'Record the technology and service map: frontend, backend, and infrastructure. Call exactly once ' +
      'before terminating. Becomes Section 2 of the rendered deliverable. Duplicate calls are rejected.',
    TechnologyStackInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.technology_stack) return alreadyCalled('set_technology_stack');
      state.technology_stack = input;
      return successResult({ set: 'set_technology_stack' });
    },
  );

  const setAuthentication = tool(
    'set_authentication',
    'Record the authentication and session management architecture: session flow, role assignment, ' +
      'privilege storage, and role switching/impersonation. Call exactly once before terminating. ' +
      'Becomes Sections 3, 3.1, 3.2, and 3.3 of the rendered deliverable. Set ' +
      'role_switching_impersonation.applicable=false (with the other fields null) if no such features ' +
      'exist. Duplicate calls are rejected.',
    AuthenticationInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.authentication) return alreadyCalled('set_authentication');
      state.authentication = input;
      return successResult({ set: 'set_authentication' });
    },
  );

  const addEndpoints = tool(
    'add_endpoints',
    'Append a batch of network-accessible API endpoints to the catalog. May be called multiple times — ' +
      'each call appends. Use a single call for small inventories, or split across 2-3 calls for large ' +
      'inventories (50+ endpoints) to keep individual payloads comfortable. Duplicate (method, path) ' +
      'pairs across calls are skipped as no-ops; the response reports added vs. skipped. Becomes ' +
      'Section 4 of the rendered deliverable and drives vuln-authz / vuln-injection todos downstream. ' +
      'The renderer sorts by (path, method) before rendering, so emission order does not affect output.',
    AddEndpointsInputSchema.shape,
    async (input): Promise<ToolResult> => {
      addEndpointsCalls += 1;
      const added: string[] = [];
      const skipped: string[] = [];
      for (const ep of input.endpoints) {
        const key = endpointKey(ep.method, ep.path);
        if (seenEndpointKeys.has(key)) {
          skipped.push(key);
          continue;
        }
        seenEndpointKeys.add(key);
        endpoints.push(ep);
        added.push(key);
      }
      return successResult({
        set: 'add_endpoints',
        added: added.length,
        duplicates_skipped: skipped,
        total_accumulated: endpoints.length,
      });
    },
  );

  const setInputVectors = tool(
    'set_input_vectors',
    'Record potential input vectors grouped by source: URL parameters, POST body fields, HTTP headers, ' +
      'and cookie values. Call exactly once before terminating. Becomes Section 5 of the rendered ' +
      'deliverable. Drives downstream vulnerability analysis. Duplicate calls are rejected.',
    InputVectorsInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.input_vectors) return alreadyCalled('set_input_vectors');
      state.input_vectors = input;
      return successResult({ set: 'set_input_vectors' });
    },
  );

  const setNetworkMap = tool(
    'set_network_map',
    'Record the network and interaction map: entities, flows, and guards. Call exactly once before ' +
      'terminating. Becomes Sections 6.1 (Entities), 6.2 (Entity Metadata), 6.3 (Flows), and 6.4 ' +
      '(Guards Directory) of the rendered deliverable. The renderer splits the entities array into ' +
      'the 6.1 and 6.2 tables and sorts each array deterministically. Duplicate calls are rejected.',
    NetworkMapInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.network_map) return alreadyCalled('set_network_map');
      state.network_map = input;
      return successResult({ set: 'set_network_map' });
    },
  );

  const setRoleArchitecture = tool(
    'set_role_architecture',
    'Record the role and privilege architecture: discovered roles and the privilege lattice. Call ' +
      'exactly once before terminating. Becomes Sections 7.1 (Discovered Roles), 7.2 (Privilege Lattice), ' +
      '7.3 (Role Entry Points), and 7.4 (Role-to-Code Mapping) of the rendered deliverable. The renderer ' +
      'splits the roles array into the per-section tables. Duplicate calls are rejected.',
    RoleArchitectureInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.role_architecture) return alreadyCalled('set_role_architecture');
      state.role_architecture = input;
      return successResult({ set: 'set_role_architecture' });
    },
  );

  const setAuthzCandidates = tool(
    'set_authz_candidates',
    'Record authorization vulnerability candidates: horizontal escalation, vertical escalation, and ' +
      'context-based candidates. Call exactly once before terminating. Becomes Sections 8.1, 8.2, and ' +
      '8.3 of the rendered deliverable. The renderer assigns stable AUTHZ-CAND-NN IDs across the three ' +
      'sub-arrays in horizontal → vertical → context order, which vuln-authz reads as its todo list. ' +
      'Duplicate calls are rejected.',
    AuthzCandidatesInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.authz_candidates) return alreadyCalled('set_authz_candidates');
      state.authz_candidates = input;
      return successResult({ set: 'set_authz_candidates' });
    },
  );

  const setInjectionSources = tool(
    'set_injection_sources',
    'Record discovered injection sources grouped by vulnerability class. Call exactly once before ' +
      'terminating. If the application has no network-accessible code paths to dangerous sinks, set ' +
      'applicable=false; otherwise populate each category array (empty arrays mean "scanned, no sources ' +
      'of this kind"). Becomes Section 9 of the rendered deliverable. Drives the vuln-injection agent\'s ' +
      'todos downstream. Duplicate calls are rejected.',
    InjectionSourcesInputSchema.shape,
    async (input): Promise<ToolResult> => {
      if (state.injection_sources) return alreadyCalled('set_injection_sources');
      state.injection_sources = input;
      return successResult({ set: 'set_injection_sources' });
    },
  );

  const server: McpSdkServerConfigWithInstance = createSdkMcpServer({
    name: 'recon-collector',
    version: '1.0.0',
    tools: [
      setExecutiveSummary,
      setTechnologyStack,
      setAuthentication,
      addEndpoints,
      setInputVectors,
      setNetworkMap,
      setRoleArchitecture,
      setAuthzCandidates,
      setInjectionSources,
    ],
  });

  function statusOf<K extends ReconOneShotToolName>(key: K): ReconToolStatus {
    const flagMap: Record<ReconOneShotToolName, unknown> = {
      set_executive_summary: state.executive_summary,
      set_technology_stack: state.technology_stack,
      set_authentication: state.authentication,
      set_input_vectors: state.input_vectors,
      set_network_map: state.network_map,
      set_role_architecture: state.role_architecture,
      set_authz_candidates: state.authz_candidates,
      set_injection_sources: state.injection_sources,
    };
    return flagMap[key] ? 'called' : 'skipped';
  }

  return {
    server,
    getAll: (): ReconData => ({
      ...(state.executive_summary && { executive_summary: state.executive_summary }),
      ...(state.technology_stack && { technology_stack: state.technology_stack }),
      ...(state.authentication && { authentication: state.authentication }),
      ...(endpoints.length > 0 && { endpoints }),
      ...(state.input_vectors && { input_vectors: state.input_vectors }),
      ...(state.network_map && { network_map: state.network_map }),
      ...(state.role_architecture && { role_architecture: state.role_architecture }),
      ...(state.authz_candidates && { authz_candidates: state.authz_candidates }),
      ...(state.injection_sources && { injection_sources: state.injection_sources }),
    }),
    getCallStatus: (): ReconCallStatus => ({
      set_executive_summary: statusOf('set_executive_summary'),
      set_technology_stack: statusOf('set_technology_stack'),
      set_authentication: statusOf('set_authentication'),
      add_endpoints: { calls: addEndpointsCalls, endpoints_seen: endpoints.length },
      set_input_vectors: statusOf('set_input_vectors'),
      set_network_map: statusOf('set_network_map'),
      set_role_architecture: statusOf('set_role_architecture'),
      set_authz_candidates: statusOf('set_authz_candidates'),
      set_injection_sources: statusOf('set_injection_sources'),
    }),
  };
}

// Re-exported here so the renderer can import the shared sink type without
// depending on pre-recon's collector by name.
export type { SinkRef };
