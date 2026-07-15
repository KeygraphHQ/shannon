// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Recon Collector tools
 *
 * Exposes nine TypeBox-validated tools that feed the recon_deliverable.md
 * renderer — eight one-shot `set_*` tools, one per deliverable section, plus a
 * multi-call `add_endpoints` tool that lets the agent split a large API
 * inventory across calls (the only catalog whose realistic payload threatens
 * the per-turn output cap).
 *
 * A skipped tool renders a "not provided" placeholder in that section rather
 * than failing the activity. getCallStatus() exposes the per-run call pattern
 * for logging. Each schema's field-level descriptions carry the section
 * guidance, so pi injects it into the agent's tool catalog.
 */

import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';
import { type SinkRef, SinkRefSchema } from './pre-recon-collector.js';
import { cleanInput, stringEnum } from './schema.js';

// ============================================================================
// PER-TOOL INPUT SCHEMAS
// ============================================================================

export const ExecutiveSummaryInputSchema = Type.Object({
  text: Type.String({
    minLength: 1,
    description:
      "A brief overview of the application's purpose, core technology stack " +
      '(e.g., Next.js, Cloudflare), and the primary user-facing components that ' +
      'constitute the attack surface. Becomes Section 1 of the rendered deliverable.',
  }),
});

export const TechnologyStackInputSchema = Type.Object({
  frontend: Type.String({
    minLength: 1,
    description: 'Framework, key libraries, and authentication libraries used on the frontend.',
  }),
  backend: Type.String({
    minLength: 1,
    description: 'Language, framework, and key dependencies used on the backend.',
  }),
  infrastructure: Type.String({
    minLength: 1,
    description: 'Hosting provider, CDN, database type, and other infrastructure components.',
  }),
});

export const AuthenticationInputSchema = Type.Object({
  session_flow: Type.Object(
    {
      entry_points: Type.String({
        minLength: 1,
        description: 'Authentication entry points (e.g., /login, /register, /auth/sso).',
      }),
      mechanism: Type.String({
        minLength: 1,
        description:
          'Describe the step-by-step authentication process: credential submission, token generation, ' +
          'cookie setting, redirects, etc.',
      }),
      code_pointers: Type.String({
        minLength: 1,
        description:
          'Pointers to the primary files and functions in the codebase that manage authentication and ' +
          'session logic.',
      }),
    },
    {
      description:
        'Authentication & Session Management Flow — overall entry points, mechanism, and code pointers. ' +
        'Becomes Section 3 of the rendered deliverable.',
    },
  ),
  role_assignment: Type.Object(
    {
      role_determination: Type.String({
        minLength: 1,
        description: 'How roles are assigned post-authentication — database lookup, JWT claims, external service, etc.',
      }),
      default_role: Type.String({
        minLength: 1,
        description: 'What role new users get by default.',
      }),
      role_upgrade_path: Type.String({
        minLength: 1,
        description:
          'How users can gain higher privileges — admin approval, self-service, automatic, etc. ' +
          'If no upgrade path exists, state that.',
      }),
      code_implementation: Type.String({
        minLength: 1,
        description: 'Where role assignment logic is implemented (file paths and functions).',
      }),
    },
    {
      description: 'Role Assignment Process — how roles are determined post-authentication. Becomes Section 3.1.',
    },
  ),
  privilege_storage: Type.Object(
    {
      storage_location: Type.String({
        minLength: 1,
        description: 'Where user privileges are stored — JWT claims, session data, database, external service.',
      }),
      validation_points: Type.String({
        minLength: 1,
        description: 'Where role checks happen — middleware, decorators, inline checks.',
      }),
      cache_session_persistence: Type.String({
        minLength: 1,
        description: 'How long privileges are cached, and when they are refreshed.',
      }),
      code_pointers: Type.String({
        minLength: 1,
        description: 'Files that handle privilege validation.',
      }),
    },
    {
      description:
        'Privilege Storage & Validation — where privileges live and where they are checked. ' + 'Becomes Section 3.2.',
    },
  ),
  role_switching_impersonation: Type.Object(
    {
      applicable: Type.Boolean({
        description:
          'False only if the application has no impersonation, sudo-mode, or role-switching features ' +
          'at all. When false, the other fields in this object may be null.',
      }),
      impersonation_features: Type.Union([Type.String(), Type.Null()], {
        description:
          'Any ability for admins or higher-privilege users to impersonate other users. Pass null when ' +
          'applicable is false.',
      }),
      role_switching: Type.Union([Type.String(), Type.Null()], {
        description: 'Temporary privilege elevation mechanisms like "sudo mode". Pass null when applicable is false.',
      }),
      audit_trail: Type.Union([Type.String(), Type.Null()], {
        description:
          'Whether role switches or impersonation events are logged, and where. Pass null when applicable is false.',
      }),
      code_implementation: Type.Union([Type.String(), Type.Null()], {
        description:
          'Where these features are implemented (file paths and functions). Pass null when applicable is false.',
      }),
    },
    {
      description:
        'Role Switching & Impersonation — impersonation, sudo mode, audit trails. Becomes Section 3.3. ' +
        'Set applicable=false if no such features exist; the other fields may be null in that case.',
    },
  ),
});

const HTTP_METHOD_VALUES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'WS'] as const;

const EndpointSchema = Type.Object({
  method: stringEnum(HTTP_METHOD_VALUES, {
    description: 'HTTP method. Use WS for WebSocket upgrade endpoints.',
  }),
  path: Type.String({
    minLength: 1,
    description: 'Endpoint path with parameter placeholders, e.g. "/api/users/{user_id}".',
  }),
  required_role: Type.String({
    minLength: 1,
    description: 'Minimum role needed (anon, user, admin, etc.).',
  }),
  object_id_parameters: Type.Array(Type.String(), {
    description: 'Parameters that identify specific objects (user_id, order_id, etc.). Empty array if none.',
  }),
  authorization_mechanism: Type.String({
    minLength: 1,
    description:
      'How access is controlled — middleware, decorator, inline check. ' +
      'E.g. "Bearer Token + ownership check", "requireAuth() + requireAdmin()", "None".',
  }),
  description: Type.String({
    minLength: 1,
    description: "Brief description of the endpoint's purpose.",
  }),
  code_pointer: Type.String({
    minLength: 1,
    description: 'File path and (where possible) line number of the handler. E.g. "auth.controller.ts:45".',
  }),
});

export const AddEndpointsInputSchema = Type.Object({
  endpoints: Type.Array(EndpointSchema, {
    description:
      'A batch of network-accessible API endpoints to append to the catalog. Include only endpoints ' +
      'reachable through the deployed application — exclude CLI tools, dev-only routes, build scripts. ' +
      'Duplicate (method, path) pairs across calls are skipped as no-ops; the response reports which ' +
      'were added vs. skipped.',
  }),
});

export const InputVectorsInputSchema = Type.Object({
  url_parameters: Type.Array(Type.String({ minLength: 1 }), {
    description:
      'URL parameter input vectors — each entry should identify the parameter and (where possible) ' +
      'the file:line of the handler. E.g. "?redirect_url= @ auth.controller.ts:88".',
  }),
  post_body_fields: Type.Array(Type.String({ minLength: 1 }), {
    description:
      'POST/PUT body field input vectors (JSON or form). E.g. "username @ login.handler.ts:34", ' +
      '"profile.description @ users.controller.ts:120".',
  }),
  http_headers: Type.Array(Type.String({ minLength: 1 }), {
    description:
      'HTTP header input vectors. Include both standard headers consumed by app code (e.g., ' +
      'X-Forwarded-For) and custom application headers.',
  }),
  cookie_values: Type.Array(Type.String({ minLength: 1 }), {
    description: 'Cookie-based input vectors. E.g. "preferences_cookie @ middleware/prefs.ts:22".',
  }),
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

const EntityMetadataPairSchema = Type.Object({
  key: Type.String({
    minLength: 1,
    description: 'Metadata key (e.g., "Hosts", "Endpoints", "Engine", "Issuer").',
  }),
  value: Type.String({
    minLength: 1,
    description: 'Metadata value for this key.',
  }),
});

const EntitySchema = Type.Object({
  title: Type.String({
    minLength: 1,
    description: 'Unique short name for the entity (e.g., "ExampleWebApp", "PostgreSQL-DB", "IdentityProvider").',
  }),
  type: stringEnum(ENTITY_TYPE_VALUES, {
    description:
      'Entity type. ExternAsset = client-side asset; Service = backend service; Identity = identity ' +
      'provider; DataStore = database / cache / object store; AdminPlane = admin/control surface; ' +
      'ThirdParty = external integration.',
  }),
  zone: stringEnum(ENTITY_ZONE_VALUES, {
    description:
      'Trust zone. Internet = public; Edge = CDN/WAF/reverse-proxy tier; App = application/business logic; ' +
      'Data = persistent storage; Admin = administrative surface; BuildCI = build/CI/CD infrastructure; ' +
      'ThirdParty = external trust domain.',
  }),
  tech: Type.String({
    minLength: 1,
    description: 'Short technology/framework description (e.g., "Node/Express", "Postgres 14", "AWS S3").',
  }),
  data: Type.Array(stringEnum(DATA_LABEL_VALUES), {
    description: 'Data labels handled by this entity. Empty array if the entity handles only Public data.',
  }),
  notes: Type.String({
    description: 'Freeform context (e.g., "public-facing", "stores sensitive user data"). Empty string if none.',
  }),
  metadata: Type.Array(EntityMetadataPairSchema, {
    description:
      'Ordered key/value pairs of technical metadata for this entity. Becomes the Section 6.2 row ' +
      'rendered as "Key: Value; Key: Value; …". Example pairs for a service: Hosts, Endpoints, Auth, ' +
      'Dependencies; for a datastore: Engine, Exposure, Consumers, Credentials.',
  }),
});

const FlowSchema = Type.Object({
  from: Type.String({
    minLength: 1,
    description: 'Source entity title — must match a title from the entities array.',
  }),
  to: Type.String({
    minLength: 1,
    description: 'Destination entity title — must match a title from the entities array.',
  }),
  channel: stringEnum(FLOW_CHANNEL_VALUES, { description: 'Transport channel for this flow.' }),
  path_port: Type.String({
    minLength: 1,
    description: 'Path and/or port for this flow. E.g. ":443 /api/users/me", ":5432", "queue: orders".',
  }),
  guards: Type.Array(Type.String({ minLength: 1 }), {
    description:
      'Guard names that gate this flow. Each should match a name from the guards array. Empty array ' +
      'means no guards apply (publicly accessible).',
  }),
  touches: Type.Array(stringEnum(DATA_LABEL_VALUES), {
    description: 'Data labels this flow carries. Empty array if only Public data flows.',
  }),
});

const GuardSchema = Type.Object({
  name: Type.String({
    minLength: 1,
    description: 'Short guard identifier (e.g., "auth:user", "ownership:user", "vpc-only", "mtls").',
  }),
  category: stringEnum(GUARD_CATEGORY_VALUES, {
    description:
      'Guard category. Auth = authentication identity; Authorization = role/scope check; ' +
      'ObjectOwnership = ownership-based check; Network = network-level restriction; ' +
      'Protocol = protocol-level requirement; Env = environment-bound restriction; ' +
      'RateLimit = throttling.',
  }),
  statement: Type.String({
    minLength: 1,
    description: 'One-sentence description of what this guard enforces.',
  }),
});

export const NetworkMapInputSchema = Type.Object({
  entities: Type.Array(EntitySchema, {
    description:
      'All major components of the system. Becomes Section 6.1 (Entities) and Section 6.2 ' +
      '(Entity Metadata, split per-entity from the metadata field).',
  }),
  flows: Type.Array(FlowSchema, {
    description:
      'How entities communicate. Becomes Section 6.3. The from/to fields cross-reference entities ' +
      'by title; the guards field cross-references guards by name.',
  }),
  guards: Type.Array(GuardSchema, {
    description: 'Catalog of guards referenced by flows. Becomes Section 6.4.',
  }),
});

const RoleSchema = Type.Object({
  name: Type.String({
    minLength: 1,
    description: 'Role name (e.g., "anon", "user", "admin", "team_admin").',
  }),
  privilege_level: Type.Integer({
    minimum: 0,
    maximum: 10,
    description: 'Privilege rank from 0 (lowest, anonymous) to 10 (highest, full admin).',
  }),
  scope_domain: Type.String({
    minLength: 1,
    description: 'Scope of this role: Global, Org, Team, Project, etc.',
  }),
  code_implementation: Type.String({
    minLength: 1,
    description: 'Where this role is defined or checked (middleware, decorator, file:line, etc.).',
  }),
  default_landing_page: Type.String({
    minLength: 1,
    description: 'Default landing page or route after authentication. Use "N/A" for roles without a UI.',
  }),
  accessible_route_patterns: Type.Array(Type.String({ minLength: 1 }), {
    description: 'Route patterns this role can access. Empty array if the role has no UI access.',
  }),
  authentication_method: Type.String({
    minLength: 1,
    description: 'How this role authenticates: "None" (anon), "Session/JWT", "Session/JWT + role claim", etc.',
  }),
  middleware_guards: Type.String({
    minLength: 1,
    description: 'Middleware and guards that enforce this role (e.g., "requireAuth() + requireAdmin()").',
  }),
  permission_checks: Type.String({
    minLength: 1,
    description: 'How permission checks are expressed in code (e.g., "req.user.role === \'admin\'").',
  }),
  storage_location: Type.String({
    minLength: 1,
    description: 'Where this role is stored at runtime (JWT claims, session data, etc.).',
  }),
});

const PrivilegeLatticeSchema = Type.Object({
  ordering_diagram: Type.String({
    minLength: 1,
    description:
      'ASCII diagram showing role ordering. Use → for "can access resources of". ' + 'E.g. "anon → user → admin".',
  }),
  parallel_isolation_notes: Type.String({
    description:
      'Notes on parallel isolation between roles using ||. E.g. "team_admin || dept_admin (both > user, ' +
      'but isolated from each other)". Empty string if no parallel isolation exists.',
  }),
  role_switching_notes: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description:
        'Optional pointer to impersonation, sudo mode, or role-switching mechanisms documented in ' +
        'set_authentication.role_switching_impersonation. Null/omitted if no such mechanisms exist.',
    }),
  ),
});

export const RoleArchitectureInputSchema = Type.Object({
  roles: Type.Array(RoleSchema, {
    description:
      'All distinct privilege levels found in the application. Becomes Sections 7.1 (Discovered Roles), ' +
      '7.3 (Role Entry Points), and 7.4 (Role-to-Code Mapping), split by the renderer per-role.',
  }),
  privilege_lattice: Type.Object(PrivilegeLatticeSchema.properties, {
    description: 'The role hierarchy showing dominance and parallel isolation. Becomes Section 7.2.',
  }),
});

const PRIORITY_VALUES = ['High', 'Medium', 'Low'] as const;

const HorizontalCandidateSchema = Type.Object({
  priority: stringEnum(PRIORITY_VALUES, {
    description: 'Priority: High, Medium, or Low, based on data sensitivity (title-case literals).',
  }),
  endpoint_pattern: Type.String({
    minLength: 1,
    description: 'Endpoint pattern with the object identifier. E.g. "/api/orders/{order_id}".',
  }),
  object_id_parameter: Type.String({
    minLength: 1,
    description: 'The parameter name that identifies the target object (e.g., "order_id", "user_id").',
  }),
  data_type: Type.String({
    minLength: 1,
    description: 'Type of data exposed: user_data, financial, admin_config, user_files, etc.',
  }),
  sensitivity: Type.String({
    minLength: 1,
    description: 'One-line description of what is at risk (e.g., "User can access other users\' orders").',
  }),
});

const VerticalCandidateSchema = Type.Object({
  target_role: Type.String({
    minLength: 1,
    description: 'Role required to access this endpoint (the role being escalated to).',
  }),
  endpoint_pattern: Type.String({
    minLength: 1,
    description: 'Endpoint pattern that requires elevated privileges. E.g. "/admin/*", "/api/admin/users".',
  }),
  functionality: Type.String({
    minLength: 1,
    description: 'What the endpoint does (e.g., "Administrative functions", "User management").',
  }),
  risk_level: stringEnum(PRIORITY_VALUES, {
    description: 'Risk level: High, Medium, or Low (title-case literals).',
  }),
});

const ContextCandidateSchema = Type.Object({
  workflow: Type.String({
    minLength: 1,
    description: 'Multi-step workflow name (e.g., "Checkout", "Onboarding", "Password Reset").',
  }),
  endpoint: Type.String({
    minLength: 1,
    description: 'Endpoint that assumes a prior workflow state. E.g. "/api/checkout/confirm".',
  }),
  expected_prior_state: Type.String({
    minLength: 1,
    description: 'What state should already exist before this endpoint is called.',
  }),
  bypass_potential: Type.String({
    minLength: 1,
    description: 'What an attacker could achieve by skipping the prior state.',
  }),
});

export const AuthzCandidatesInputSchema = Type.Object({
  horizontal: Type.Array(HorizontalCandidateSchema, {
    description:
      "Endpoints with object identifiers that could allow horizontal access to other users' " +
      'resources. Becomes Section 8.1. The renderer assigns stable AUTHZ-CAND-NN IDs.',
  }),
  vertical: Type.Array(VerticalCandidateSchema, {
    description:
      'Endpoints that require higher privileges and could be targets for vertical escalation. ' +
      'Becomes Section 8.2. Exclude endpoints intentionally shared across roles.',
  }),
  context: Type.Array(ContextCandidateSchema, {
    description: 'Multi-step workflow endpoints that assume prior steps were completed. Becomes Section 8.3.',
  }),
});

export const InjectionSourcesInputSchema = Type.Object({
  applicable: Type.Boolean({
    description:
      'False only if the application has no network-accessible code paths reaching dangerous sinks ' +
      'at all. Otherwise true, even if no sources were found in a given category — empty arrays mean ' +
      '"scanned this category, no sources found".',
  }),
  command_injection: Type.Array(SinkRefSchema, {
    description:
      'Command injection sources: data flowing from a user-controlled origin into a program variable ' +
      'that is eventually interpolated into a shell or system command string (within network-accessible ' +
      'code paths).',
  }),
  sql_injection: Type.Array(SinkRefSchema, {
    description:
      'SQL injection sources: user-controllable input that reaches a database query string (within ' +
      'network-accessible code paths).',
  }),
  lfi_rfi: Type.Array(SinkRefSchema, {
    description:
      'Local/Remote File Inclusion sources: user-controllable input passed to include/require/load ' +
      'functions that resolve to filesystem or remote paths (within network-accessible code paths).',
  }),
  path_traversal: Type.Array(SinkRefSchema, {
    description:
      'Path traversal sources: user-controllable input that influences file paths in read/write ' +
      'operations (fopen, readFile, etc.) within network-accessible code paths.',
  }),
  ssti: Type.Array(SinkRefSchema, {
    description:
      'Server-Side Template Injection sources: user-controllable input embedded in template ' +
      'expressions or template content within network-accessible code paths.',
  }),
  deserialization: Type.Array(SinkRefSchema, {
    description:
      'Insecure deserialization sources: user-controllable input passed to deserialization functions ' +
      'within network-accessible code paths.',
  }),
});

// ============================================================================
// EXPORTED TYPES
// ============================================================================

export type ExecutiveSummaryInput = Static<typeof ExecutiveSummaryInputSchema>;
export type TechnologyStackInput = Static<typeof TechnologyStackInputSchema>;
export type AuthenticationInput = Static<typeof AuthenticationInputSchema>;
export type AddEndpointsInput = Static<typeof AddEndpointsInputSchema>;
export type Endpoint = Static<typeof EndpointSchema>;
export type InputVectorsInput = Static<typeof InputVectorsInputSchema>;
export type NetworkMapInput = Static<typeof NetworkMapInputSchema>;
export type Entity = Static<typeof EntitySchema>;
export type Flow = Static<typeof FlowSchema>;
export type Guard = Static<typeof GuardSchema>;
export type RoleArchitectureInput = Static<typeof RoleArchitectureInputSchema>;
export type Role = Static<typeof RoleSchema>;
export type PrivilegeLattice = Static<typeof PrivilegeLatticeSchema>;
export type AuthzCandidatesInput = Static<typeof AuthzCandidatesInputSchema>;
export type HorizontalCandidate = Static<typeof HorizontalCandidateSchema>;
export type VerticalCandidate = Static<typeof VerticalCandidateSchema>;
export type ContextCandidate = Static<typeof ContextCandidateSchema>;
export type InjectionSourcesInput = Static<typeof InjectionSourcesInputSchema>;
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

function endpointKey(method: string, path: string): string {
  return `${method} ${path}`;
}

// ============================================================================
// COLLECTOR FACTORY
// ============================================================================

interface ReconState {
  executive_summary?: ExecutiveSummaryInput;
  technology_stack?: TechnologyStackInput;
  authentication?: AuthenticationInput;
  input_vectors?: InputVectorsInput;
  network_map?: NetworkMapInput;
  role_architecture?: RoleArchitectureInput;
  authz_candidates?: AuthzCandidatesInput;
  injection_sources?: InjectionSourcesInput;
}

export interface ReconCollector {
  tools: ToolDefinition[];
  getAll(): ReconData;
  getCallStatus(): ReconCallStatus;
}

export function createReconCollector(): ReconCollector {
  const state: ReconState = {};

  const endpoints: Endpoint[] = [];
  const seenEndpointKeys = new Set<string>();
  let addEndpointsCalls = 0;

  function alreadyCalled(toolName: ReconOneShotToolName) {
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
      "Record the application's executive summary: purpose, core technology stack, and primary " +
      'user-facing components. Call exactly once before terminating. Becomes Section 1 of the rendered ' +
      'deliverable. Duplicate calls are rejected.',
    parameters: ExecutiveSummaryInputSchema,
    async execute(_toolCallId, input) {
      if (state.executive_summary) return alreadyCalled('set_executive_summary');
      state.executive_summary = cleanInput(ExecutiveSummaryInputSchema, input);
      return successResult({ set: 'set_executive_summary' });
    },
  });

  const setTechnologyStack = defineTool({
    name: 'set_technology_stack',
    label: 'Set Technology Stack',
    description:
      'Record the technology and service map: frontend, backend, and infrastructure. Call exactly once ' +
      'before terminating. Becomes Section 2 of the rendered deliverable. Duplicate calls are rejected.',
    parameters: TechnologyStackInputSchema,
    async execute(_toolCallId, input) {
      if (state.technology_stack) return alreadyCalled('set_technology_stack');
      state.technology_stack = cleanInput(TechnologyStackInputSchema, input);
      return successResult({ set: 'set_technology_stack' });
    },
  });

  const setAuthentication = defineTool({
    name: 'set_authentication',
    label: 'Set Authentication',
    description:
      'Record the authentication and session management architecture: session flow, role assignment, ' +
      'privilege storage, and role switching/impersonation. Call exactly once before terminating. ' +
      'Becomes Sections 3, 3.1, 3.2, and 3.3 of the rendered deliverable. Set ' +
      'role_switching_impersonation.applicable=false (with the other fields null) if no such features ' +
      'exist. Duplicate calls are rejected.',
    parameters: AuthenticationInputSchema,
    async execute(_toolCallId, input) {
      if (state.authentication) return alreadyCalled('set_authentication');
      state.authentication = cleanInput(AuthenticationInputSchema, input);
      return successResult({ set: 'set_authentication' });
    },
  });

  const addEndpoints = defineTool({
    name: 'add_endpoints',
    label: 'Add Endpoints',
    description:
      'Append a batch of network-accessible API endpoints to the catalog. May be called multiple times — ' +
      'each call appends. Use a single call for small inventories, or split across 2-3 calls for large ' +
      'inventories (50+ endpoints) to keep individual payloads comfortable. Duplicate (method, path) ' +
      'pairs across calls are skipped as no-ops; the response reports added vs. skipped. Becomes ' +
      'Section 4 of the rendered deliverable and drives vuln-authz / vuln-injection todos downstream. ' +
      'The renderer sorts by (path, method) before rendering, so emission order does not affect output.',
    parameters: AddEndpointsInputSchema,
    async execute(_toolCallId, input) {
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
        endpoints.push(cleanInput(EndpointSchema, ep));
        added.push(key);
      }
      return successResult({
        set: 'add_endpoints',
        added: added.length,
        duplicates_skipped: skipped,
        total_accumulated: endpoints.length,
      });
    },
  });

  const setInputVectors = defineTool({
    name: 'set_input_vectors',
    label: 'Set Input Vectors',
    description:
      'Record potential input vectors grouped by source: URL parameters, POST body fields, HTTP headers, ' +
      'and cookie values. Call exactly once before terminating. Becomes Section 5 of the rendered ' +
      'deliverable. Drives downstream vulnerability analysis. Duplicate calls are rejected.',
    parameters: InputVectorsInputSchema,
    async execute(_toolCallId, input) {
      if (state.input_vectors) return alreadyCalled('set_input_vectors');
      state.input_vectors = cleanInput(InputVectorsInputSchema, input);
      return successResult({ set: 'set_input_vectors' });
    },
  });

  const setNetworkMap = defineTool({
    name: 'set_network_map',
    label: 'Set Network Map',
    description:
      'Record the network and interaction map: entities, flows, and guards. Call exactly once before ' +
      'terminating. Becomes Sections 6.1 (Entities), 6.2 (Entity Metadata), 6.3 (Flows), and 6.4 ' +
      '(Guards Directory) of the rendered deliverable. The renderer splits the entities array into ' +
      'the 6.1 and 6.2 tables and sorts each array deterministically. Duplicate calls are rejected.',
    parameters: NetworkMapInputSchema,
    async execute(_toolCallId, input) {
      if (state.network_map) return alreadyCalled('set_network_map');
      state.network_map = cleanInput(NetworkMapInputSchema, input);
      return successResult({ set: 'set_network_map' });
    },
  });

  const setRoleArchitecture = defineTool({
    name: 'set_role_architecture',
    label: 'Set Role Architecture',
    description:
      'Record the role and privilege architecture: discovered roles and the privilege lattice. Call ' +
      'exactly once before terminating. Becomes Sections 7.1 (Discovered Roles), 7.2 (Privilege Lattice), ' +
      '7.3 (Role Entry Points), and 7.4 (Role-to-Code Mapping) of the rendered deliverable. The renderer ' +
      'splits the roles array into the per-section tables. Duplicate calls are rejected.',
    parameters: RoleArchitectureInputSchema,
    async execute(_toolCallId, input) {
      if (state.role_architecture) return alreadyCalled('set_role_architecture');
      state.role_architecture = cleanInput(RoleArchitectureInputSchema, input);
      return successResult({ set: 'set_role_architecture' });
    },
  });

  const setAuthzCandidates = defineTool({
    name: 'set_authz_candidates',
    label: 'Set Authz Candidates',
    description:
      'Record authorization vulnerability candidates: horizontal escalation, vertical escalation, and ' +
      'context-based candidates. Call exactly once before terminating. Becomes Sections 8.1, 8.2, and ' +
      '8.3 of the rendered deliverable. The renderer assigns stable AUTHZ-CAND-NN IDs across the three ' +
      'sub-arrays in horizontal → vertical → context order, which vuln-authz reads as its todo list. ' +
      'Duplicate calls are rejected.',
    parameters: AuthzCandidatesInputSchema,
    async execute(_toolCallId, input) {
      if (state.authz_candidates) return alreadyCalled('set_authz_candidates');
      state.authz_candidates = cleanInput(AuthzCandidatesInputSchema, input);
      return successResult({ set: 'set_authz_candidates' });
    },
  });

  const setInjectionSources = defineTool({
    name: 'set_injection_sources',
    label: 'Set Injection Sources',
    description:
      'Record discovered injection sources grouped by vulnerability class. Call exactly once before ' +
      'terminating. If the application has no network-accessible code paths to dangerous sinks, set ' +
      'applicable=false; otherwise populate each category array (empty arrays mean "scanned, no sources ' +
      'of this kind"). Becomes Section 9 of the rendered deliverable. Drives the vuln-injection agent\'s ' +
      'todos downstream. Duplicate calls are rejected.',
    parameters: InjectionSourcesInputSchema,
    async execute(_toolCallId, input) {
      if (state.injection_sources) return alreadyCalled('set_injection_sources');
      state.injection_sources = cleanInput(InjectionSourcesInputSchema, input);
      return successResult({ set: 'set_injection_sources' });
    },
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
