// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Deterministic vuln collector → markdown renderer.
 *
 * Single entry point renderVulnDeliverable(vulnClass, data) covers all 5
 * vulnerability classes (injection, xss, auth, ssrf, authz). Per-class title,
 * §3 sub-header set, §4 column shape, and §4 section heading are selected by
 * branching on vulnClass. The .md byte-stability concern is structural only —
 * sub-headers, column ordering, sort order — narrative prose varies per run.
 *
 * Required-call enforcement is deferred for v1. Missing tools surface as
 * placeholder sections, not activity failures. Required tools (set_findings_summary,
 * set_strategic_intelligence, set_out_of_scope_findings) produce loud
 * `[Section X: not provided]` placeholders; recommended tools (set_safe_vectors,
 * set_blind_spots) produce quiet "None identified" prose.
 *
 * Section 5 is the only rendered home for confirmed findings that the
 * external-attacker scope keeps out of the exploitation queue, so an omitted
 * `set_out_of_scope_findings` call is rendered as a visible gap rather than as
 * an implicit "nothing was set aside".
 *
 * The exploitation queue (`{class}_exploitation_queue.json`) is unrelated —
 * it is written by the structured-output submit path in agent-execution.ts and
 * is not touched here.
 */

import type {
  BlindSpotsInput,
  FindingsSummaryInput,
  OutOfScopeAccessRequirement,
  OutOfScopeFindingsInput,
  SafeVectorsInput,
  StrategicIntelligenceInput,
  VulnClass,
  VulnCollectorData,
} from '../collectors/vuln-collector.js';

// ============================================================================
// PER-CLASS CONSTANTS
// ============================================================================

const TITLES: Record<VulnClass, string> = {
  injection: 'Injection Analysis Report',
  xss: 'Cross-Site Scripting (XSS) Analysis Report',
  auth: 'Authentication Analysis Report',
  ssrf: 'SSRF Analysis Report',
  authz: 'Authorization Analysis Report',
};

const SECTION_FOUR_HEADING: Record<VulnClass, string> = {
  injection: '4. Vectors Analyzed and Confirmed Secure',
  xss: '4. Vectors Analyzed and Confirmed Secure',
  auth: '4. Secure by Design: Validated Components',
  ssrf: '4. Secure by Design: Validated Components',
  authz: '4. Vectors Analyzed and Confirmed Secure',
};

const STRATEGIC_INTEL_SUBHEADERS: Record<VulnClass, ReadonlyArray<readonly [string, string]>> = {
  injection: [
    ['defensive_evasion_waf', 'Defensive Evasion (WAF Analysis)'],
    ['error_based_potential', 'Error-Based Injection Potential'],
    ['confirmed_database_technology', 'Confirmed Database Technology'],
  ],
  xss: [
    ['csp_analysis', 'Content Security Policy (CSP) Analysis'],
    ['cookie_security', 'Cookie Security'],
  ],
  auth: [
    ['authentication_method', 'Authentication Method'],
    ['session_token_details', 'Session Token Details'],
    ['password_policy', 'Password Policy'],
  ],
  ssrf: [
    ['http_client_library', 'HTTP Client Library'],
    ['request_architecture', 'Request Architecture'],
    ['internal_services', 'Internal Services'],
  ],
  authz: [
    ['session_management_architecture', 'Session Management Architecture'],
    ['role_permission_model', 'Role/Permission Model'],
    ['resource_access_patterns', 'Resource Access Patterns'],
    ['workflow_implementation', 'Workflow Implementation'],
  ],
};

// Per-class column shape for §4. The first label is the subject column name
// (varies by class — "Source" vs "Component/Flow" vs "Endpoint"); the location
// column name also varies for authz ("Guard Location"); XSS gets an extra
// "Render Context" column between defense and verdict.
interface ColumnSpec {
  readonly subject: string;
  readonly location: string;
  readonly includeRenderContext: boolean;
}

const ACCESS_REQUIREMENT_LABELS: Record<OutOfScopeAccessRequirement, string> = {
  'internal-network': 'Internal network access',
  vpn: 'VPN or mesh-network access',
  'direct-server-access': 'Direct server access',
  other: 'Other access prerequisite',
};

const SECTION_FOUR_COLUMNS: Record<VulnClass, ColumnSpec> = {
  injection: { subject: 'Source', location: 'Endpoint/File Location', includeRenderContext: false },
  xss: { subject: 'Source', location: 'Endpoint/File Location', includeRenderContext: true },
  auth: { subject: 'Component/Flow', location: 'Endpoint/File Location', includeRenderContext: false },
  ssrf: { subject: 'Component/Flow', location: 'Endpoint/File Location', includeRenderContext: false },
  authz: { subject: 'Endpoint', location: 'Guard Location', includeRenderContext: false },
};

// ============================================================================
// SHARED HELPERS
// ============================================================================

function placeholder(sectionLabel: string, toolName: string): string {
  return `_[${sectionLabel}: not provided — \`${toolName}\` was not called]_`;
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

// ============================================================================
// SECTION RENDERERS
// ============================================================================

function renderTitle(vulnClass: VulnClass): string {
  return `# ${TITLES[vulnClass]}`;
}

function renderExecutiveSummary(summary: FindingsSummaryInput | undefined): string {
  if (!summary) {
    return ['## 1. Executive Summary', '', placeholder('Section 1', 'set_findings_summary')].join('\n');
  }
  return ['## 1. Executive Summary', '', summary.key_outcome].join('\n');
}

function renderDominantPatterns(summary: FindingsSummaryInput | undefined): string {
  if (!summary) {
    return ['## 2. Dominant Vulnerability Patterns', '', placeholder('Section 2', 'set_findings_summary')].join('\n');
  }
  if (summary.patterns.length === 0) {
    return ['## 2. Dominant Vulnerability Patterns', '', '*No dominant patterns identified.*'].join('\n');
  }
  const blocks = summary.patterns.map((p, index) => {
    const ids = p.representative_finding_ids.map((id) => `\`${id}\``).join(', ');
    return [
      `### Pattern ${index + 1}: ${p.name}`,
      `- **Description:** ${p.description}`,
      `- **Implication:** ${p.implication}`,
      `- **Representative Findings:** ${ids}`,
    ].join('\n');
  });
  return ['## 2. Dominant Vulnerability Patterns', '', blocks.join('\n\n')].join('\n');
}

function renderStrategicIntelligence(vulnClass: VulnClass, intel: StrategicIntelligenceInput | undefined): string {
  if (!intel) {
    return [
      '## 3. Strategic Intelligence for Exploitation',
      '',
      placeholder('Section 3', 'set_strategic_intelligence'),
    ].join('\n');
  }
  const subheaders = STRATEGIC_INTEL_SUBHEADERS[vulnClass];
  const intelRecord = intel as unknown as Record<string, string>;
  const blocks = subheaders.map(([fieldName, header]) => {
    const value = intelRecord[fieldName] ?? '*(not provided)*';
    return [`### ${header}`, value].join('\n');
  });
  return ['## 3. Strategic Intelligence for Exploitation', '', blocks.join('\n\n')].join('\n');
}

function sortSafeVectors(vectors: SafeVectorsInput['vectors']): SafeVectorsInput['vectors'] {
  return [...vectors].sort((a, b) => {
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    return a.location.localeCompare(b.location);
  });
}

function renderSafeVectors(vulnClass: VulnClass, data: SafeVectorsInput | undefined): string {
  const heading = `## ${SECTION_FOUR_HEADING[vulnClass]}`;
  if (!data || data.vectors.length === 0) {
    return [heading, '', '*No vectors confirmed secure during analysis.*'].join('\n');
  }
  const cols = SECTION_FOUR_COLUMNS[vulnClass];
  const headers: string[] = [cols.subject, cols.location, 'Defense Mechanism'];
  if (cols.includeRenderContext) {
    headers.push('Render Context');
  }
  headers.push('Verdict');

  const sorted = sortSafeVectors(data.vectors);
  const rows = sorted.map((v) => {
    const row: string[] = [v.subject, v.location, v.defense_mechanism];
    if (cols.includeRenderContext) {
      row.push(v.render_context ?? '');
    }
    row.push('SAFE');
    return row;
  });

  return [heading, '', renderTable(headers, rows)].join('\n');
}

function sortOutOfScopeFindings(findings: OutOfScopeFindingsInput['findings']): OutOfScopeFindingsInput['findings'] {
  return [...findings].sort((a, b) => a.id.localeCompare(b.id));
}

function renderOutOfScopeFindings(data: OutOfScopeFindingsInput | undefined): string {
  const heading = '## 5. Confirmed Findings Outside Attack Scope';
  if (!data) {
    return [heading, '', placeholder('Section 5', 'set_out_of_scope_findings')].join('\n');
  }
  if (data.findings.length === 0) {
    const nothingSetAside =
      '*Every vulnerability confirmed during analysis was externally exploitable and entered the ' +
      'exploitation queue. Nothing was set aside.*';
    return [heading, '', nothingSetAside].join('\n');
  }

  const intro =
    'The vulnerabilities below were confirmed during analysis and then held back from the exploitation ' +
    'queue because reaching them requires access an external attacker does not have. They were not ' +
    'exploited and no exploitation agent will pick them up — this section is their only record.';
  const blocks = sortOutOfScopeFindings(data.findings).map((finding) =>
    [
      `### \`${finding.id}\` — ${finding.vulnerability_type}`,
      `- **Location:** ${finding.location}`,
      `- **Why confirmed:** ${finding.confirmation_evidence}`,
      `- **Access required:** ${ACCESS_REQUIREMENT_LABELS[finding.access_required]}`,
      `- **Why out of scope:** ${finding.scope_exclusion_reason}`,
    ].join('\n'),
  );

  return [heading, '', intro, '', blocks.join('\n\n')].join('\n');
}

function renderBlindSpots(data: BlindSpotsInput | undefined): string {
  const heading = '## 6. Analysis Constraints and Blind Spots';
  if (!data || data.items.length === 0) {
    return [heading, '', '*No analysis constraints or blind spots identified.*'].join('\n');
  }
  const blocks = data.items.map((item) => [`### ${item.heading}`, item.description].join('\n'));
  return [heading, '', blocks.join('\n\n')].join('\n');
}

// ============================================================================
// PUBLIC ENTRY POINT
// ============================================================================

export function renderVulnDeliverable(vulnClass: VulnClass, data: VulnCollectorData): string {
  const sections: string[] = [
    renderTitle(vulnClass),
    '',
    renderExecutiveSummary(data.findings_summary),
    '',
    renderDominantPatterns(data.findings_summary),
    '',
    renderStrategicIntelligence(vulnClass, data.strategic_intelligence),
    '',
    renderSafeVectors(vulnClass, data.safe_vectors),
    '',
    renderOutOfScopeFindings(data.out_of_scope_findings),
    '',
    renderBlindSpots(data.blind_spots),
    '',
  ];
  return `${sections.join('\n').trimEnd()}\n`;
}
