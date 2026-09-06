// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Deterministic report.json to SARIF 2.1.0 renderer, for `exploit=true` runs only. */

import type { AddFindingInput, CodeLocation } from '../collectors/finding-collector.js';
import { findingStatus, type ReportData, type ReportedStatus } from './report-renderer.js';

export interface SarifOptions {
  readonly workspaceName: string;
}

interface SarifRule {
  readonly id: string;
  readonly name: string;
  readonly shortDescription: { text: string };
  readonly fullDescription: { text: string };
  readonly help: { text: string };
  readonly properties: { tags: string[] };
}

const TOOL_NAME = 'Shannon';
const TOOL_URI = 'https://github.com/KeygraphHQ/shannon';

/** Taxonomy identity. A reference resolves the component by name, so this must not be reworded. */
const OWASP_TAXONOMY_NAME = 'OWASP Top Ten 2025';

/**
 * One rule per vulnerability class, keyed by `finding.category`.
 *
 * Rule IDs are the unit of alert grouping: renaming one detaches every alert filed under it.
 * `fullDescription` and `help` describe the class, never the instance, and GitHub requires the
 * `text` of both.
 */
const RULES: Record<string, SarifRule> = {
  Injection: {
    id: 'shannon/injection',
    name: 'Injection',
    shortDescription: { text: 'Injection' },
    fullDescription: {
      text: 'Untrusted input reaches an interpreter sink (SQL, OS command, template, file path or deserializer) at a position where it can alter the structure of the statement rather than only supply data.',
    },
    help: {
      text: 'Separate code from data at the sink: bind SQL parameters, pass command arguments as an array, and allowlist file paths. Escaping is a weaker control than parameterisation and breaks whenever the sink context changes.',
    },
    properties: { tags: ['security', 'shannon'] },
  },
  XSS: {
    id: 'shannon/xss',
    name: 'Cross-Site Scripting',
    shortDescription: { text: 'Cross-Site Scripting' },
    fullDescription: {
      text: 'Untrusted input reaches a browser rendering context without the encoding that context requires.',
    },
    help: {
      text: 'Encode at the point of output for the specific context (HTML body, attribute, URL, script or style); no single encoder is correct for all of them. Prefer APIs that treat input as text, such as textContent over innerHTML.',
    },
    properties: { tags: ['security', 'shannon'] },
  },
  Authentication: {
    id: 'shannon/auth',
    name: 'Authentication',
    shortDescription: { text: 'Authentication' },
    fullDescription: {
      text: 'A weakness in credential verification or session lifecycle that lets an attacker assume another identity or retain access they should have lost.',
    },
    help: {
      text: 'Issue a fresh session identifier on every privilege change, set HttpOnly, Secure and SameSite on session cookies, rate-limit credential endpoints, and verify the signature and algorithm of externally issued tokens.',
    },
    properties: { tags: ['security', 'shannon'] },
  },
  Authorization: {
    id: 'shannon/authz',
    name: 'Authorization',
    shortDescription: { text: 'Authorization' },
    fullDescription: {
      text: 'An access control decision is missing, evaluated in the client, or applied at the wrong layer, letting a caller act on resources they do not own.',
    },
    help: {
      text: 'Check ownership and role on the server for every object reference, and enforce it in the data-access layer rather than per route, denying by default. An unguessable identifier is not an access control.',
    },
    properties: { tags: ['security', 'shannon'] },
  },
  SSRF: {
    id: 'shannon/ssrf',
    name: 'Server-Side Request Forgery',
    shortDescription: { text: 'Server-Side Request Forgery' },
    fullDescription: {
      text: 'A server-side request takes its destination from untrusted input, letting an attacker reach hosts the server can see but they cannot.',
    },
    help: {
      text: 'Allowlist destination hosts and schemes, resolve DNS before validating the address so rebinding cannot slip through, and block loopback, private and link-local ranges including cloud metadata. Do not follow redirects.',
    },
    properties: { tags: ['security', 'shannon'] },
  },
};

const CATEGORY_ORDER: readonly string[] = ['Injection', 'XSS', 'Authentication', 'SSRF', 'Authorization'];

/**
 * Five severities collapse into SARIF's three usable levels, so `critical` and `high` are
 * indistinguishable. `security-severity` would separate them but lives on the rule, which would
 * flatten every finding of a class to one score instead.
 */
function severityToLevel(severity: string | undefined): string {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'note';
  }
}

/**
 * What the run established about a finding, said in SARIF's own vocabulary.
 *
 * Only an exploit that ran is a `fail`. A finding an external constraint stopped short of a verdict
 * is `open`, as is one whose record states no verdict at all; one the run confirmed and deliberately
 * did not pursue is `review`, and one it ruled out is `informational`. A finding the pipeline could
 * not prove is neither filed as a failure nor left out of the log: a consumer that alerts on failures
 * sees only what an exploit demonstrated, and a consumer reading the whole log sees everything the
 * run found.
 */
const STATUS_KINDS: Record<ReportedStatus, string> = {
  exploited: 'fail',
  blocked_by_constraints: 'open',
  out_of_scope: 'review',
  false_positive: 'informational',
  unstated: 'open',
};

function toPhysicalLocation(location: CodeLocation) {
  const region: Record<string, number> = {};
  if (location.start_line) region.startLine = location.start_line;
  if (location.end_line) region.endLine = location.end_line;

  return {
    physicalLocation: {
      artifactLocation: { uri: location.file },
      ...(Object.keys(region).length > 0 && { region }),
    },
    ...(location.symbol && { logicalLocations: [{ name: location.symbol, kind: 'function' }] }),
    message: { text: location.role },
  };
}

/**
 * Fall back to the HTTP entry point when a finding names no file: a result with no location is
 * silently discarded downstream. No `uriBaseId`, since the path does not resolve in the repo.
 */
function syntheticLocationFromHttp(finding: AddFindingInput) {
  if (!finding.http_location) return undefined;
  let uri = finding.http_location.url;
  try {
    const parsed = new URL(finding.http_location.url);
    uri = `${parsed.pathname}${parsed.hash}`;
  } catch {}
  return {
    physicalLocation: { artifactLocation: { uri } },
    message: { text: `${finding.http_location.method} ${finding.http_location.url}` },
  };
}

/** A repository path or an endpoint inside free text, with the line number when the text names one. */
const LOCATION_IN_TEXT = /(\/?(?:[\w.-]+\/)+[\w.-]+|[\w-]+\.[A-Za-z0-9]{2,4})(?::(\d+))?/;

/**
 * Last resort: the location the finding states in prose. A confirmed finding that was never queued
 * for exploitation carries no structured code location and no HTTP entry point, and a result with no
 * location is silently discarded downstream, so the path- or endpoint-shaped token is lifted out of
 * the text to serve as the URI. No `uriBaseId`, since it need not resolve in the repo.
 */
function syntheticLocationFromText(vulnerableLocation: string) {
  const text = vulnerableLocation.trim();
  const match = LOCATION_IN_TEXT.exec(text);
  const startLine = Number.parseInt(match?.[2] ?? '', 10);

  return {
    physicalLocation: {
      // Text holding no path at all is percent-encoded whole: a sentence is not a URI, and the
      // finding is worth more in the log with an unresolvable location than absent from it.
      artifactLocation: { uri: match?.[1] ?? encodeURI(text) },
      // SARIF regions are 1-based, so an unparsed or zero line number carries no region at all.
      ...(startLine > 0 && { region: { startLine } }),
    },
    message: { text },
  };
}

/**
 * How a finding is introduced to whoever reads the message. `kind` says the same thing to a machine,
 * but a person reading an alert body sees only the prose, and it must not read as a proven exploit.
 */
const STATUS_NOTICES: Record<ReportedStatus, string> = {
  exploited: '',
  blocked_by_constraints:
    'Not exploited — external constraints blocked validation. Impact is assessed, not demonstrated.',
  out_of_scope:
    'Not exploited — confirmed, then held outside the agreed attack scope. Impact is assessed, not demonstrated.',
  false_positive: 'Ruled out — examined and determined not to be a vulnerability.',
  unstated: 'Not confirmed — the record states no exploitation verdict. Impact is assessed, not demonstrated.',
};

function buildMessageMarkdown(finding: AddFindingInput, status: ReportedStatus): string {
  const parts = [`**${finding.title}**`];
  const notice = STATUS_NOTICES[status];
  if (notice) parts.push('', `_${notice}_`);

  parts.push('', finding.overview, '', '**Impact**', '', finding.impact);
  parts.push('', '**Remediation**', '', finding.remediation);
  // Exploitation steps and proof of impact are deliberately absent: SARIF has no structural home
  // for them, and flattening them into prose would imply this file carries the evidence.
  const pointer = status === 'exploited' ? 'Full exploitation evidence' : 'Full detail';
  parts.push('', `${pointer}: \`Security-Assessment-Report.pdf\``);
  return parts.join('\n');
}

/**
 * `owasp_category` is one label, `A05:2025 <separator> Injection`; SARIF wants the id and the name
 * as separate fields. The enum in ../collectors/finding-collector.ts fixes the shape, so the
 * separator is dropped by position rather than matched.
 */
function splitOwaspCategory(label: string): { id: string; name: string } {
  const [id, , ...nameParts] = label.split(' ');
  return { id: id ?? label, name: nameParts.join(' ') };
}

interface RenderedResult {
  readonly result: Record<string, unknown>;
  readonly category: string;
  readonly owaspId: string;
}

function renderResult(finding: AddFindingInput, ruleId: string): RenderedResult {
  const codeLocations = finding.code_locations ?? [];
  const sinks = codeLocations.filter((l) => l.role === 'sink');
  const related = codeLocations.filter((l) => l.role !== 'sink');
  const primary = sinks[0] ?? codeLocations[0];

  const structured = primary ? toPhysicalLocation(primary) : undefined;
  const location =
    structured ?? syntheticLocationFromHttp(finding) ?? syntheticLocationFromText(finding.vulnerable_location);

  const status = findingStatus(finding);
  const kind = STATUS_KINDS[status];
  // SARIF grades only a failure: on every other kind the spec fixes `level` at `none`. Severity is
  // an assessment rather than a measurement for anything but a confirmed exploit anyway, so it is
  // recorded as a property of the finding instead of as the weight of an alert.
  const level = kind === 'fail' ? severityToLevel(finding.severity) : 'none';

  const properties: Record<string, unknown> = {
    findingId: finding.finding_id,
    status,
    severity: finding.severity,
    // The location the finding itself states, which the structural fields carry only in part.
    vulnerableLocation: finding.vulnerable_location,
  };
  // The rating a finding no exploit confirmed came with, and the only one it has.
  if (finding.confidence) properties.confidence = finding.confidence;
  if (finding.http_location?.parameter) properties.parameter = finding.http_location.parameter;
  if (finding.auth_state) properties.authState = finding.auth_state;
  if (finding.prerequisites) properties.prerequisites = finding.prerequisites;

  const owaspId = splitOwaspCategory(finding.owasp_category).id;

  return {
    category: finding.category,
    owaspId,
    result: {
      ruleId,
      kind,
      level,
      message: {
        text: `${finding.title}. ${finding.overview}`,
        markdown: buildMessageMarkdown(finding, status),
      },
      locations: [location],
      ...(related.length > 0 && {
        relatedLocations: related.map((l, i) => ({ id: i + 1, ...toPhysicalLocation(l) })),
      }),
      ...(finding.http_location && {
        // No `parameters`: SARIF wants a name-to-value map and the deliverable names only the
        // parameter, so any value here would be invented. It travels in `properties` instead.
        webRequest: { method: finding.http_location.method, target: finding.http_location.url },
      }),
      taxa: [
        {
          id: owaspId,
          toolComponent: { name: OWASP_TAXONOMY_NAME },
        },
      ],
      properties,
    },
  };
}

/**
 * Render a SARIF 2.1.0 log from the structured report.
 *
 * Every finding in a known class becomes a result; `kind` says what the run established about it,
 * so nothing the report carries is missing here and nothing unproven arrives as a failure.
 */
export function renderSarif(data: ReportData, options: SarifOptions): string {
  const { report_meta, findings, not_assessed = [], unassessed_queue_entries = [] } = data;

  const rendered: RenderedResult[] = [];

  for (const finding of findings) {
    const rule = RULES[finding.category];
    if (!rule) continue;
    rendered.push(renderResult(finding, rule.id));
  }

  // Only classes that produced a result are declared, and `ruleIndex` is the position in this list.
  const usedRules = CATEGORY_ORDER.flatMap((category) => {
    const rule = RULES[category];
    if (!rule || !rendered.some((r) => r.category === category)) return [];
    return [{ category, rule }];
  });
  const rules = usedRules.map((u) => u.rule);

  const results: Record<string, unknown>[] = usedRules.flatMap(({ category }, ruleIndex) =>
    rendered.filter((r) => r.category === category).map((r) => ({ ...r.result, ruleIndex })),
  );

  const owaspCategories = [...new Set(findings.map((f) => f.owasp_category))]
    .map(splitOwaspCategory)
    .filter((c) => rendered.some((r) => r.owaspId === c.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  const log = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            informationUri: TOOL_URI,
            rules,
          },
        },
        // Scoped to the exploit pipeline: an analysis run of the same target has a different
        // finding population, which would read as alerts resolved.
        automationDetails: { id: `shannon/exploit/${options.workspaceName}` },
        invocations: [
          {
            // A failed class produced no results, and a queue entry left without a verdict was
            // never examined; reporting success for either would read as resolved alerts.
            executionSuccessful: not_assessed.length === 0 && unassessed_queue_entries.length === 0,
          },
        ],
        ...(owaspCategories.length > 0 && {
          taxonomies: [
            {
              name: OWASP_TAXONOMY_NAME,
              organization: 'OWASP',
              informationUri: 'https://owasp.org/Top10/',
              shortDescription: { text: 'OWASP Top Ten 2025 categories.' },
              taxa: owaspCategories.map((c) => ({ id: c.id, name: c.name })),
            },
          ],
        }),
        results,
        properties: { target: report_meta.target, assessmentDate: report_meta.assessment_date },
      },
    ],
  };

  return `${JSON.stringify(log, null, 2)}\n`;
}
