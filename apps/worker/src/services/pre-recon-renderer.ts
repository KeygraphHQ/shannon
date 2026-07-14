// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Deterministic pre-recon collector → markdown renderer.
 *
 * Converts the typed payload bag harvested from the pre-recon-collector pi
 * tool set into the Markdown layout that pre_recon_deliverable.md previously had
 * when the agent emitted it directly via chunked Write/Edit. No LLM in the
 * loop; section ordering, headings, and template are owned here.
 *
 * Required-call enforcement is deferred for v1. Any tool the agent skips becomes
 * a `[Section X: not provided]` placeholder rather than an activity failure.
 * Every section renderer accepts the corresponding collected field as possibly
 * undefined and falls back to the placeholder helper when absent.
 */

import type {
  ApplicationIntelligenceInput,
  AuthDeepDiveInput,
  CodebaseIndexingInput,
  CriticalFilePathsInput,
  ExecutiveSummaryInput,
  PreReconData,
  SinkRef,
  SsrfSinksInput,
  XssSinksInput,
} from '../collectors/pre-recon-collector.js';

// ============================================================================
// STATIC PROSE
// ============================================================================

const SCOPE_AND_BOUNDARIES = `# Penetration Test Scope & Boundaries

**Primary Directive:** Your analysis is strictly limited to the **network-accessible attack surface** of the application. All subsequent tasks must adhere to this scope. Before reporting any finding (e.g., an entry point, a vulnerability sink), you must first verify it meets the "In-Scope" criteria.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints.
- Endpoints requiring authentication via the application's standard login mechanisms.
- Any developer utility, debug console, or script that has been mistakenly exposed through a route or is otherwise callable from other in-scope, network-reachable code.

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface and requires an execution context completely external to the application's request-response cycle. This includes tools that must be run via:
- A command-line interface (e.g., \`go run ./cmd/...\`, \`python scripts/...\`).
- A development environment's internal tooling (e.g., a "run script" button in an IDE).
- CI/CD pipeline scripts or build tools (e.g., Dagger build definitions).
- Database migration scripts, backup tools, or maintenance utilities.
- Local development servers, test harnesses, or debugging utilities.
- Static files or scripts that require manual opening in a browser (not served by the application).`;

// ============================================================================
// SHARED HELPERS
// ============================================================================

function placeholder(sectionLabel: string, toolName: string): string {
  return `_[${sectionLabel}: not provided — \`${toolName}\` was not called]_`;
}

function bulletField(label: string, value: string): string {
  return `- **${label}:** ${value}`;
}

function bulletPaths(label: string, paths: readonly string[]): string {
  if (paths.length === 0) {
    return `- **${label}:** *(none identified)*`;
  }
  const formatted = paths.map((p) => `\`${p}\``).join(', ');
  return `- **${label}:** ${formatted}`;
}

function renderSinkList(sinks: readonly SinkRef[]): string {
  if (sinks.length === 0) {
    return '*(scanned, no sinks of this kind found)*';
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

function renderExecutiveSummarySection(data: ExecutiveSummaryInput | undefined): string {
  if (!data) {
    return ['## 1. Executive Summary', '', placeholder('Section 1', 'set_executive_summary')].join('\n');
  }
  return ['## 1. Executive Summary', '', data.text].join('\n');
}

function renderArchitectureSection(intel: ApplicationIntelligenceInput | undefined): string {
  if (!intel) {
    return ['## 2. Architecture & Technology Stack', '', placeholder('Section 2', 'set_application_intelligence')].join(
      '\n',
    );
  }
  const { architecture: a } = intel;
  return [
    '## 2. Architecture & Technology Stack',
    '',
    bulletField('Framework & Language', a.framework_and_language),
    bulletField('Architectural Pattern', a.architectural_pattern),
    bulletField('Critical Security Components', a.critical_security_components),
  ].join('\n');
}

function renderAuthSection(auth: AuthDeepDiveInput | undefined): string {
  if (!auth) {
    return ['## 3. Authentication & Authorization Deep Dive', '', placeholder('Section 3', 'set_auth_deep_dive')].join(
      '\n',
    );
  }
  const ssoLine = auth.sso_oauth_oidc
    ? bulletField('SSO/OAuth/OIDC Flows', auth.sso_oauth_oidc)
    : bulletField('SSO/OAuth/OIDC Flows', 'Not applicable — no SSO/OAuth/OIDC integration detected.');
  return [
    '## 3. Authentication & Authorization Deep Dive',
    '',
    bulletField('Authentication Mechanisms', auth.authentication_mechanisms),
    bulletField('Session Management', auth.session_management),
    bulletField('Authorization Model', auth.authz_model),
    bulletField('Multi-tenancy', auth.multi_tenancy),
    ssoLine,
  ].join('\n');
}

function renderDataSecuritySection(intel: ApplicationIntelligenceInput | undefined): string {
  if (!intel) {
    return ['## 4. Data Security & Storage', '', placeholder('Section 4', 'set_application_intelligence')].join('\n');
  }
  const { data_security: d } = intel;
  return [
    '## 4. Data Security & Storage',
    '',
    bulletField('Database Security', d.database_security),
    bulletField('Data Flow Security', d.data_flow_security),
    bulletField('Multi-tenant Data Isolation', d.multi_tenant_isolation),
  ].join('\n');
}

function renderAttackSurfaceSection(intel: ApplicationIntelligenceInput | undefined): string {
  if (!intel) {
    return ['## 5. Attack Surface Analysis', '', placeholder('Section 5', 'set_application_intelligence')].join('\n');
  }
  const { attack_surface: s } = intel;
  return [
    '## 5. Attack Surface Analysis',
    '',
    bulletField('External Entry Points', s.external_entry_points),
    bulletField('Internal Service Communication', s.internal_service_communication),
    bulletField('Input Validation Patterns', s.input_validation_patterns),
    bulletField('Background Processing', s.background_processing),
  ].join('\n');
}

function renderInfrastructureSection(intel: ApplicationIntelligenceInput | undefined): string {
  if (!intel) {
    return [
      '## 6. Infrastructure & Operational Security',
      '',
      placeholder('Section 6', 'set_application_intelligence'),
    ].join('\n');
  }
  const { infrastructure: i } = intel;
  return [
    '## 6. Infrastructure & Operational Security',
    '',
    bulletField('Secrets Management', i.secrets_management),
    bulletField('Configuration Security', i.configuration_security),
    bulletField('External Dependencies', i.external_dependencies),
    bulletField('Monitoring & Logging', i.monitoring_and_logging),
  ].join('\n');
}

function renderCodebaseIndexingSection(data: CodebaseIndexingInput | undefined): string {
  if (!data) {
    return ['## 7. Overall Codebase Indexing', '', placeholder('Section 7', 'set_codebase_indexing')].join('\n');
  }
  return ['## 7. Overall Codebase Indexing', '', data.text].join('\n');
}

function renderCriticalFilePathsSection(paths: CriticalFilePathsInput | undefined): string {
  if (!paths) {
    return ['## 8. Critical File Paths', '', placeholder('Section 8', 'set_critical_file_paths')].join('\n');
  }
  return [
    '## 8. Critical File Paths',
    '',
    bulletPaths('Configuration', paths.configuration),
    bulletPaths('Authentication & Authorization', paths.authentication_and_authorization),
    bulletPaths('API & Routing', paths.api_and_routing),
    bulletPaths('Data Models & DB Interaction', paths.data_models_and_db),
    bulletPaths('Dependency Manifests', paths.dependency_manifests),
    bulletPaths('Sensitive Data & Secrets Handling', paths.sensitive_data_and_secrets),
    bulletPaths('Middleware & Input Validation', paths.middleware_and_input_validation),
    bulletPaths('Logging & Monitoring', paths.logging_and_monitoring),
    bulletPaths('Infrastructure & Deployment', paths.infrastructure_and_deployment),
  ].join('\n');
}

function renderXssSection(xss: XssSinksInput | undefined): string {
  if (!xss) {
    return ['## 9. XSS Sinks and Render Contexts', '', placeholder('Section 9', 'set_xss_sinks')].join('\n');
  }
  if (!xss.applicable) {
    return [
      '## 9. XSS Sinks and Render Contexts',
      '',
      '*(N/A — the application has no web frontend; XSS sink analysis does not apply.)*',
    ].join('\n');
  }
  return [
    '## 9. XSS Sinks and Render Contexts',
    '',
    '### HTML Body Context',
    renderSinkList(xss.html_body),
    '',
    '### HTML Attribute Context',
    renderSinkList(xss.html_attribute),
    '',
    '### JavaScript Context',
    renderSinkList(xss.javascript),
    '',
    '### CSS Context',
    renderSinkList(xss.css),
    '',
    '### URL Context',
    renderSinkList(xss.url),
  ].join('\n');
}

function renderSsrfSection(ssrf: SsrfSinksInput | undefined): string {
  if (!ssrf) {
    return ['## 10. SSRF Sinks', '', placeholder('Section 10', 'set_ssrf_sinks')].join('\n');
  }
  if (!ssrf.applicable) {
    return [
      '## 10. SSRF Sinks',
      '',
      '*(N/A — the application makes no outbound requests; SSRF sink analysis does not apply.)*',
    ].join('\n');
  }
  return [
    '## 10. SSRF Sinks',
    '',
    '### HTTP(S) Clients',
    renderSinkList(ssrf.http_clients),
    '',
    '### Raw Sockets & Connect APIs',
    renderSinkList(ssrf.raw_sockets),
    '',
    '### URL Openers & File Includes',
    renderSinkList(ssrf.url_openers),
    '',
    '### Redirect & "Next URL" Handlers',
    renderSinkList(ssrf.redirect_handlers),
    '',
    '### Headless Browsers & Render Engines',
    renderSinkList(ssrf.headless_browsers),
    '',
    '### Media Processors',
    renderSinkList(ssrf.media_processors),
    '',
    '### Link Preview & Unfurlers',
    renderSinkList(ssrf.link_preview),
    '',
    '### Webhook Testers & Callback Verifiers',
    renderSinkList(ssrf.webhook_testers),
    '',
    '### SSO/OIDC Discovery & JWKS Fetchers',
    renderSinkList(ssrf.sso_oidc_discovery),
    '',
    '### Importers & Data Loaders',
    renderSinkList(ssrf.importers),
    '',
    '### Package/Plugin/Theme Installers',
    renderSinkList(ssrf.package_installers),
    '',
    '### Monitoring & Health Check Frameworks',
    renderSinkList(ssrf.monitoring_and_health),
    '',
    '### Cloud Metadata Helpers',
    renderSinkList(ssrf.cloud_metadata),
  ].join('\n');
}

// ============================================================================
// PUBLIC ENTRY POINT
// ============================================================================

export function renderPreRecon(data: PreReconData): string {
  const sections: string[] = [
    SCOPE_AND_BOUNDARIES,
    '---',
    '',
    renderExecutiveSummarySection(data.executive_summary),
    '',
    renderArchitectureSection(data.application_intelligence),
    '',
    renderAuthSection(data.auth_deep_dive),
    '',
    renderDataSecuritySection(data.application_intelligence),
    '',
    renderAttackSurfaceSection(data.application_intelligence),
    '',
    renderInfrastructureSection(data.application_intelligence),
    '',
    renderCodebaseIndexingSection(data.codebase_indexing),
    '',
    renderCriticalFilePathsSection(data.critical_file_paths),
    '',
    renderXssSection(data.xss_sinks),
    '',
    renderSsrfSection(data.ssrf_sinks),
    '',
  ];
  return `${sections.join('\n').trimEnd()}\n`;
}
