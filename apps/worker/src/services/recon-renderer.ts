// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Deterministic recon collector → markdown renderer.
 *
 * Converts the typed payload bag harvested from the recon-collector tool
 * into the Markdown layout that recon_deliverable.md previously had when the
 * agent emitted it directly via chunked Write/Edit. No LLM in the loop;
 * section ordering, headings, sort, and the Section 0 boilerplate are owned
 * here.
 *
 * Required-call enforcement is deferred. Any tool the agent skips becomes a
 * `[Section X: not provided]` placeholder rather than an activity failure.
 * Every section renderer accepts its input as optional.
 */

import type {
  AuthenticationInput,
  AuthzCandidatesInput,
  ContextCandidate,
  Endpoint,
  Entity,
  ExecutiveSummaryInput,
  Flow,
  Guard,
  HorizontalCandidate,
  InjectionSourcesInput,
  InputVectorsInput,
  NetworkMapInput,
  Priority,
  ReconData,
  Role,
  RoleArchitectureInput,
  SinkRef,
  TechnologyStackInput,
  VerticalCandidate,
} from '../collectors/recon-collector.js';

type RoleSwitchingImpersonation = AuthenticationInput['role_switching_impersonation'];
type EntityZone = Entity['zone'];

// ============================================================================
// STATIC PROSE
// ============================================================================

const HOW_TO_READ_THIS = `## 0) HOW TO READ THIS
This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint - focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls - understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping - use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.`;

// ============================================================================
// SORT ORDER CONSTANTS
// ============================================================================

// Zones are sorted by exposure (Internet → Edge → ... → ThirdParty), not alphabetically,
// per the design doc's "clusters by zone" requirement. A reader scanning the entities
// table sees external surface first, internal trust core last.
const ZONE_ORDER: Record<EntityZone, number> = {
  Internet: 0,
  Edge: 1,
  App: 2,
  Data: 3,
  Admin: 4,
  BuildCI: 5,
  ThirdParty: 6,
};

const PRIORITY_ORDER: Record<Priority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

// ============================================================================
// SHARED HELPERS
// ============================================================================

function placeholder(sectionLabel: string, toolName: string): string {
  return `_[${sectionLabel}: not provided — \`${toolName}\` was not called]_`;
}

function bulletField(label: string, value: string): string {
  return `- **${label}:** ${value}`;
}

function bulletList(label: string, items: readonly string[]): string {
  if (items.length === 0) {
    return `- **${label}:** *(none identified)*`;
  }
  return `- **${label}:**\n${items.map((entry) => `  - ${entry}`).join('\n')}`;
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const headerRow = `| ${headers.map(escapePipe).join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(escapePipe).join(' | ')} |`).join('\n');
  return [headerRow, separator, body].filter((line) => line.length > 0).join('\n');
}

function renderSinkList(sinks: readonly SinkRef[]): string {
  if (sinks.length === 0) {
    return '*(scanned, no sources of this kind found)*';
  }
  return sinks
    .map((sink) => {
      const head = `- **${sink.sink_function}** at \`${sink.location}\``;
      if (sink.notes && sink.notes.trim() !== '') {
        return `${head} — ${sink.notes.trim()}`;
      }
      return head;
    })
    .join('\n');
}

// ============================================================================
// SECTION RENDERERS
// ============================================================================

function renderHowToReadThis(): string {
  return HOW_TO_READ_THIS;
}

function renderExecutiveSummary(data: ExecutiveSummaryInput | undefined): string {
  if (!data) {
    return ['## 1. Executive Summary', '', placeholder('Section 1', 'set_executive_summary')].join('\n');
  }
  return ['## 1. Executive Summary', '', data.text].join('\n');
}

function renderTechnologyStack(data: TechnologyStackInput | undefined): string {
  if (!data) {
    return ['## 2. Technology & Service Map', '', placeholder('Section 2', 'set_technology_stack')].join('\n');
  }
  return [
    '## 2. Technology & Service Map',
    '',
    bulletField('Frontend', data.frontend),
    bulletField('Backend', data.backend),
    bulletField('Infrastructure', data.infrastructure),
  ].join('\n');
}

function renderRoleSwitching(rs: RoleSwitchingImpersonation): string {
  if (!rs.applicable) {
    return [
      '### 3.3 Role Switching & Impersonation',
      '',
      '*(Not applicable — no impersonation, sudo mode, or role-switching features were identified.)*',
    ].join('\n');
  }
  return [
    '### 3.3 Role Switching & Impersonation',
    '',
    bulletField('Impersonation Features', rs.impersonation_features ?? '*(not specified)*'),
    bulletField('Role Switching', rs.role_switching ?? '*(not specified)*'),
    bulletField('Audit Trail', rs.audit_trail ?? '*(not specified)*'),
    bulletField('Code Implementation', rs.code_implementation ?? '*(not specified)*'),
  ].join('\n');
}

function renderAuthentication(data: AuthenticationInput | undefined): string {
  if (!data) {
    return ['## 3. Authentication & Session Management Flow', '', placeholder('Section 3', 'set_authentication')].join(
      '\n',
    );
  }
  const { session_flow: sf, role_assignment: ra, privilege_storage: ps } = data;
  return [
    '## 3. Authentication & Session Management Flow',
    '',
    bulletField('Entry Points', sf.entry_points),
    bulletField('Mechanism', sf.mechanism),
    bulletField('Code Pointers', sf.code_pointers),
    '',
    '### 3.1 Role Assignment Process',
    '',
    bulletField('Role Determination', ra.role_determination),
    bulletField('Default Role', ra.default_role),
    bulletField('Role Upgrade Path', ra.role_upgrade_path),
    bulletField('Code Implementation', ra.code_implementation),
    '',
    '### 3.2 Privilege Storage & Validation',
    '',
    bulletField('Storage Location', ps.storage_location),
    bulletField('Validation Points', ps.validation_points),
    bulletField('Cache/Session Persistence', ps.cache_session_persistence),
    bulletField('Code Pointers', ps.code_pointers),
    '',
    renderRoleSwitching(data.role_switching_impersonation),
  ].join('\n');
}

function sortEndpoints(endpoints: readonly Endpoint[]): Endpoint[] {
  return [...endpoints].sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });
}

function renderEndpoints(endpoints: readonly Endpoint[] | undefined): string {
  if (!endpoints || endpoints.length === 0) {
    return ['## 4. API Endpoint Inventory', '', placeholder('Section 4', 'add_endpoints')].join('\n');
  }
  const sorted = sortEndpoints(endpoints);
  const rows = sorted.map((e) => [
    e.method,
    e.path,
    e.required_role,
    e.object_id_parameters.length > 0 ? e.object_id_parameters.join(', ') : 'None',
    e.authorization_mechanism,
    `${e.description} (${e.code_pointer})`,
  ]);
  return [
    '## 4. API Endpoint Inventory',
    '',
    renderTable(
      [
        'Method',
        'Endpoint Path',
        'Required Role',
        'Object ID Parameters',
        'Authorization Mechanism',
        'Description & Code Pointer',
      ],
      rows,
    ),
  ].join('\n');
}

function renderInputVectors(data: InputVectorsInput | undefined): string {
  if (!data) {
    return [
      '## 5. Potential Input Vectors for Vulnerability Analysis',
      '',
      placeholder('Section 5', 'set_input_vectors'),
    ].join('\n');
  }
  return [
    '## 5. Potential Input Vectors for Vulnerability Analysis',
    '',
    bulletList('URL Parameters', data.url_parameters),
    bulletList('POST Body Fields (JSON/Form)', data.post_body_fields),
    bulletList('HTTP Headers', data.http_headers),
    bulletList('Cookie Values', data.cookie_values),
  ].join('\n');
}

function sortEntities(entities: readonly Entity[]): Entity[] {
  return [...entities].sort((a, b) => {
    const zoneDiff = ZONE_ORDER[a.zone] - ZONE_ORDER[b.zone];
    if (zoneDiff !== 0) return zoneDiff;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.title.localeCompare(b.title);
  });
}

function sortFlows(flows: readonly Flow[]): Flow[] {
  return [...flows].sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    if (a.to !== b.to) return a.to.localeCompare(b.to);
    return a.path_port.localeCompare(b.path_port);
  });
}

function sortGuards(guards: readonly Guard[]): Guard[] {
  return [...guards].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
}

function renderEntitiesTable(entities: readonly Entity[]): string {
  const rows = entities.map((e) => [e.title, e.type, e.zone, e.tech, e.data.join(', '), e.notes]);
  return renderTable(['Title', 'Type', 'Zone', 'Tech', 'Data', 'Notes'], rows);
}

function renderEntityMetadataTable(entities: readonly Entity[]): string {
  const rows = entities.map((e) => {
    const metadataLine =
      e.metadata.length > 0 ? e.metadata.map(({ key, value }) => `${key}: ${value}`).join('; ') : '*(none)*';
    return [e.title, metadataLine];
  });
  return renderTable(['Title', 'Metadata'], rows);
}

function renderFlowsTable(flows: readonly Flow[]): string {
  const rows = flows.map((f) => [
    `${f.from} → ${f.to}`,
    f.channel,
    f.path_port,
    f.guards.length > 0 ? f.guards.join(', ') : 'None',
    f.touches.length > 0 ? f.touches.join(', ') : 'Public',
  ]);
  return renderTable(['FROM → TO', 'Channel', 'Path/Port', 'Guards', 'Touches'], rows);
}

function renderGuardsTable(guards: readonly Guard[]): string {
  const rows = guards.map((g) => [g.name, g.category, g.statement]);
  return renderTable(['Guard Name', 'Category', 'Statement'], rows);
}

function renderNetworkMap(data: NetworkMapInput | undefined): string {
  if (!data) {
    return ['## 6. Network & Interaction Map', '', placeholder('Section 6', 'set_network_map')].join('\n');
  }
  const entities = sortEntities(data.entities);
  const flows = sortFlows(data.flows);
  const guards = sortGuards(data.guards);
  return [
    '## 6. Network & Interaction Map',
    '',
    '### 6.1 Entities',
    '',
    entities.length > 0 ? renderEntitiesTable(entities) : '*(no entities recorded)*',
    '',
    '### 6.2 Entity Metadata',
    '',
    entities.length > 0 ? renderEntityMetadataTable(entities) : '*(no entities recorded)*',
    '',
    '### 6.3 Flows (Connections)',
    '',
    flows.length > 0 ? renderFlowsTable(flows) : '*(no flows recorded)*',
    '',
    '### 6.4 Guards Directory',
    '',
    guards.length > 0 ? renderGuardsTable(guards) : '*(no guards recorded)*',
  ].join('\n');
}

function sortRoles(roles: readonly Role[]): Role[] {
  return [...roles].sort((a, b) => {
    if (a.privilege_level !== b.privilege_level) return a.privilege_level - b.privilege_level;
    return a.name.localeCompare(b.name);
  });
}

function renderRoleArchitecture(data: RoleArchitectureInput | undefined): string {
  if (!data) {
    return ['## 7. Role & Privilege Architecture', '', placeholder('Section 7', 'set_role_architecture')].join('\n');
  }
  const roles = sortRoles(data.roles);
  const discoveredRows = roles.map((r) => [r.name, String(r.privilege_level), r.scope_domain, r.code_implementation]);
  const entryPointRows = roles.map((r) => [
    r.name,
    r.default_landing_page,
    r.accessible_route_patterns.length > 0 ? r.accessible_route_patterns.join(', ') : 'None',
    r.authentication_method,
  ]);
  const codeMappingRows = roles.map((r) => [r.name, r.middleware_guards, r.permission_checks, r.storage_location]);
  const lattice = data.privilege_lattice;
  const latticeBlock = [
    '```',
    `Privilege Ordering (→ means "can access resources of"):`,
    lattice.ordering_diagram,
    '',
    `Parallel Isolation (|| means "not ordered relative to each other"):`,
    lattice.parallel_isolation_notes,
    '```',
  ].join('\n');
  const sections = [
    '## 7. Role & Privilege Architecture',
    '',
    '### 7.1 Discovered Roles',
    '',
    roles.length > 0
      ? renderTable(['Role Name', 'Privilege Level', 'Scope/Domain', 'Code Implementation'], discoveredRows)
      : '*(no roles recorded)*',
    '',
    '### 7.2 Privilege Lattice',
    '',
    latticeBlock,
  ];
  if (lattice.role_switching_notes && lattice.role_switching_notes.trim() !== '') {
    sections.push('', `**Note:** ${lattice.role_switching_notes.trim()}`);
  }
  sections.push(
    '',
    '### 7.3 Role Entry Points',
    '',
    roles.length > 0
      ? renderTable(
          ['Role', 'Default Landing Page', 'Accessible Route Patterns', 'Authentication Method'],
          entryPointRows,
        )
      : '*(no roles recorded)*',
    '',
    '### 7.4 Role-to-Code Mapping',
    '',
    roles.length > 0
      ? renderTable(['Role', 'Middleware/Guards', 'Permission Checks', 'Storage Location'], codeMappingRows)
      : '*(no roles recorded)*',
  );
  return sections.join('\n');
}

function sortHorizontal(items: readonly HorizontalCandidate[]): HorizontalCandidate[] {
  return [...items].sort((a, b) => {
    const pri = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pri !== 0) return pri;
    return a.endpoint_pattern.localeCompare(b.endpoint_pattern);
  });
}

function sortVertical(items: readonly VerticalCandidate[]): VerticalCandidate[] {
  return [...items].sort((a, b) => {
    const pri = PRIORITY_ORDER[a.risk_level] - PRIORITY_ORDER[b.risk_level];
    if (pri !== 0) return pri;
    return a.endpoint_pattern.localeCompare(b.endpoint_pattern);
  });
}

function sortContext(items: readonly ContextCandidate[]): ContextCandidate[] {
  return [...items].sort((a, b) => a.endpoint.localeCompare(b.endpoint));
}

function renderAuthzCandidates(data: AuthzCandidatesInput | undefined): string {
  if (!data) {
    return ['## 8. Authorization Vulnerability Candidates', '', placeholder('Section 8', 'set_authz_candidates')].join(
      '\n',
    );
  }
  const horizontal = sortHorizontal(data.horizontal);
  const vertical = sortVertical(data.vertical);
  const context = sortContext(data.context);

  let idCounter = 0;
  const nextId = (): string => {
    idCounter += 1;
    return `AUTHZ-CAND-${String(idCounter).padStart(2, '0')}`;
  };

  const horizontalRows = horizontal.map((c) => [
    nextId(),
    c.priority,
    c.endpoint_pattern,
    c.object_id_parameter,
    c.data_type,
    c.sensitivity,
  ]);
  const verticalRows = vertical.map((c) => [
    nextId(),
    c.target_role,
    c.endpoint_pattern,
    c.functionality,
    c.risk_level,
  ]);
  const contextRows = context.map((c) => [
    nextId(),
    c.workflow,
    c.endpoint,
    c.expected_prior_state,
    c.bypass_potential,
  ]);

  return [
    '## 8. Authorization Vulnerability Candidates',
    '',
    '### 8.1 Horizontal Privilege Escalation Candidates',
    '',
    horizontal.length > 0
      ? renderTable(
          ['ID', 'Priority', 'Endpoint Pattern', 'Object ID Parameter', 'Data Type', 'Sensitivity'],
          horizontalRows,
        )
      : '*(no horizontal candidates identified)*',
    '',
    '### 8.2 Vertical Privilege Escalation Candidates',
    '',
    vertical.length > 0
      ? renderTable(['ID', 'Target Role', 'Endpoint Pattern', 'Functionality', 'Risk Level'], verticalRows)
      : '*(no vertical candidates identified)*',
    '',
    '### 8.3 Context-Based Authorization Candidates',
    '',
    context.length > 0
      ? renderTable(['ID', 'Workflow', 'Endpoint', 'Expected Prior State', 'Bypass Potential'], contextRows)
      : '*(no context-based candidates identified)*',
  ].join('\n');
}

function renderInjectionSources(data: InjectionSourcesInput | undefined): string {
  const heading =
    '## 9. Injection Sources (Command Injection, SQL Injection, LFI/RFI, SSTI, Path Traversal, Deserialization)';
  if (!data) {
    return [heading, '', placeholder('Section 9', 'set_injection_sources')].join('\n');
  }
  if (!data.applicable) {
    return [
      heading,
      '',
      '*(Not applicable — this application has no network-accessible code paths to dangerous sinks.)*',
    ].join('\n');
  }
  return [
    heading,
    '',
    '### Command Injection',
    renderSinkList(data.command_injection),
    '',
    '### SQL Injection',
    renderSinkList(data.sql_injection),
    '',
    '### LFI/RFI',
    renderSinkList(data.lfi_rfi),
    '',
    '### Path Traversal',
    renderSinkList(data.path_traversal),
    '',
    '### SSTI',
    renderSinkList(data.ssti),
    '',
    '### Deserialization',
    renderSinkList(data.deserialization),
  ].join('\n');
}

// ============================================================================
// PUBLIC ENTRY POINT
// ============================================================================

export function renderRecon(data: ReconData): string {
  const sections: string[] = [
    '# Reconnaissance Deliverable:',
    '',
    renderHowToReadThis(),
    '',
    renderExecutiveSummary(data.executive_summary),
    '',
    renderTechnologyStack(data.technology_stack),
    '',
    renderAuthentication(data.authentication),
    '',
    renderEndpoints(data.endpoints),
    '',
    renderInputVectors(data.input_vectors),
    '',
    renderNetworkMap(data.network_map),
    '',
    renderRoleArchitecture(data.role_architecture),
    '',
    renderAuthzCandidates(data.authz_candidates),
    '',
    renderInjectionSources(data.injection_sources),
    '',
  ];
  return `${sections.join('\n').trimEnd()}\n`;
}
