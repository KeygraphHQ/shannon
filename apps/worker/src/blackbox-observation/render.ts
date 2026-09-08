import type { ObservationDiagnostic, ObservationResult, SourceRef } from './types.js';
import type { WorkflowUncertainty } from './workflow.js';

const FILENAMES = {
  traffic: 'traffic_inventory.json',
  blackboard: 'blackbox_blackboard.json',
  findings: 'blackbox_authz_findings.json',
  raw: 'raw',
} as const;

const UNCERTAINTY_TEXT: Readonly<Record<WorkflowUncertainty, string>> = {
  'unattributed-identity': 'Identity attribution is unavailable; this bucket is separate from anonymous traffic.',
  'tied-capture-sequence': 'Some exchanges share a recorded counter; their relative order is unknown.',
  'tied-transition-sequence': 'Some transitions share a recorded counter; their relative order is unknown.',
  'unknown-capture-sequence':
    'Some records have unknown capture order; the unknown group has no chronological position.',
  'capture-sequence-gap': 'Recorded counters have internal gaps; the supplied inputs do not explain those gaps.',
  'transitions-unavailable':
    'Recorded workflow transitions are unavailable. The exchange sequence remains inspectable.',
  'no-linked-transitions': 'Transition metadata is recorded, but usable workflow linkage is unavailable.',
  'transition-reference-problem': 'Some recorded transition references or associations are missing or inconsistent.',
  'transition-sequence-mismatch': 'Some transitions and their trigger exchanges declare different local counters.',
};

/** Keep metadata inert in Markdown, including table delimiters, code delimiters and bidirectional controls. */
function inline(value: string | number | boolean | null): string {
  if (value === null) return 'unavailable';
  const escaped = Array.from(String(value), (character) => {
    const code = character.charCodeAt(0);
    return character === '`' ||
      character === '|' ||
      code <= 31 ||
      (code >= 127 && code <= 159) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
      ? `\\u${code.toString(16).padStart(4, '0')}`
      : character;
  }).join('');
  return `\` ${escaped} \``;
}

function source(reference: SourceRef): string {
  const filename =
    reference.source === 'raw' && reference.exchangeId
      ? `raw/${reference.exchangeId}.json`
      : FILENAMES[reference.source];
  return inline(`${filename}#${reference.pointer}`);
}

function sources(references: readonly SourceRef[]): string {
  return references.length === 0 ? 'unavailable' : references.map(source).join(', ');
}

function addDiagnostics(lines: string[], title: string, diagnostics: readonly ObservationDiagnostic[]): void {
  lines.push(`## ${title}`, '');
  if (diagnostics.length === 0) lines.push('None recorded by this analysis.', '');
  for (const diagnostic of diagnostics) {
    // Diagnostic prose is fixed by the analyzer. Escape it too because the renderer is a public pure function.
    lines.push(
      `- ${inline(diagnostic.code)}: ${inline(diagnostic.message)} Sources: ${sources(diagnostic.sources)}.`,
      '',
    );
  }
}

/** Render only the passive result projection. Raw messages, header values and freeform notes have no output path. */
export function renderObservationMarkdown(result: ObservationResult): string {
  const lines = [
    '# Black-box saved observations',
    '',
    `Analysis: ${inline(result.status)}. Recorded run: ${inline(result.recorded.runStatus)}.`,
    '',
    result.recorded.findings.availability === 'known'
      ? `Recorded findings: ${inline(result.recorded.findings.count)}. Sources: ${sources(result.recorded.findings.sources)}.`
      : `Recorded finding count: unavailable. Sources: ${sources(result.recorded.findings.sources)}.`,
    '',
    `The supplied records contain ${inline(result.counts.exchanges)} interpretable exchange records across ${inline(result.counts.routes)} recorded route groups. Exact duplicates collapsed: ${inline(result.counts.duplicates)}; conflicted IDs: ${inline(result.counts.conflicts)}; rejected records: ${inline(result.counts.rejectedRecords)}.`,
    '',
    'This is a view of supplied saved records. Authorization, session validity and application-wide coverage remain unassessed. A successful HTTP response or saved authentication flag does not establish identity validity or access-control correctness.',
    '',
    'An absent route/identity cell means not observed in these inputs. Local capture counters do not establish a timeline across identities. Recorded transition links establish association, not independently verified state changes or causality. Recorded blockers can accompany empty findings without explaining their cause.',
    '',
    'Route paths, state labels and identity names are private metadata. Metadata and source references are displayed as inert code; escaped Unicode sequences preserve table, line and control boundaries. This report is not a sanitized sharing format.',
    '',
    '## Input records',
    '',
    '| File | Availability | Bytes | SHA-256 |',
    '| --- | --- | ---: | --- |',
  ];
  for (const manifest of result.sources) {
    lines.push(
      `| ${inline(manifest.file)} | ${inline(manifest.availability)} | ${inline(manifest.bytes)} | ${inline(manifest.sha256)} |`,
    );
  }
  if (result.sources.length === 0)
    lines.push('| No file manifests supplied to pure analysis | unavailable | unavailable | unavailable |');
  lines.push(
    '',
    `Raw evidence requested: ${inline(result.inputs.rawRequested)}. Without associated raw evidence, normalized status zero has an unknown cause.`,
    '',
    '## Recorded identities',
    '',
    '| Identity key | Kind | Recorded name | Recorded role | Saved authenticated flag | Sources |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const identity of result.identities) {
    lines.push(
      `| ${inline(identity.key)} | ${inline(identity.kind)} | ${inline(identity.name)} | ${inline(identity.role)} | ${inline(identity.authenticated)} | ${sources(identity.sources)} |`,
    );
  }
  if (result.identities.length === 0)
    lines.push(
      '| No usable recorded identities | unavailable | unavailable | unavailable | unavailable | unavailable |',
    );
  lines.push('', '## Route and identity observations', '');
  if (result.routes.length === 0) lines.push('No usable recorded route groups are available.', '');
  for (const route of result.routes) {
    lines.push(`### ${inline(route.routeSignature)}`, '');
    for (const metadata of route.metadata) {
      lines.push(
        `Recorded route metadata: ${inline(metadata.method)} ${inline(metadata.origin)} ${inline(metadata.path)}. Sources: ${sources(metadata.sources)}.`,
        '',
      );
    }
    lines.push(
      '| Identity | Observation | Requests | Normalized response: usable / unavailable / invalid | Raw response: usable / absent / truncated / malformed / unknown | Exchanges and sources |',
      '| --- | --- | ---: | --- | --- | --- |',
    );
    for (const cell of route.cells) {
      const count = cell.counts;
      lines.push(
        `| ${inline(cell.identityKey)} | ${cell.state === 'observed' ? 'observed' : 'not observed in these inputs'} | ${inline(count.requests)} | ${inline(`${count.usableNormalizedResponses} / ${count.unavailableNormalizedResponses} / ${count.invalidNormalizedResponses}`)} | ${inline(`${count.rawUsableResponses} / ${count.rawAbsentResponses} / ${count.rawTruncatedResponses} / ${count.rawMalformedResponses} / ${count.rawUnknownResponses}`)} | ${cell.exchangeIds.map(inline).join(', ') || 'none'}; ${sources(cell.sources)} |`,
      );
    }
    lines.push('');
  }
  lines.push(
    '## Exchange response evidence',
    '',
    '| Exchange | Identity | Recorded HTTP status | Normalized metadata | Raw availability / association / response | Sources |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const exchange of result.exchanges) {
    lines.push(
      `| ${inline(exchange.exchangeId)} | ${inline(exchange.identityKey)} | ${inline(exchange.responseStatus)} | ${inline(exchange.normalizedResponse)} | ${inline(exchange.raw.availability)} / ${inline(exchange.raw.association)} / ${inline(exchange.raw.response)} | ${sources([...exchange.sources, ...exchange.raw.sources])} |`,
    );
  }
  if (result.exchanges.length === 0)
    lines.push('| none | unavailable | unavailable | unavailable | unavailable | unavailable |');
  lines.push(
    '',
    '## Recorded workflows',
    '',
    'Rows with the same known counter are tied. Sorting record IDs within a tie is only a display convention. Unknown counters have no chronological position.',
    '',
  );
  if (result.workflows.length === 0) lines.push('No usable per-identity sequences are available.', '');
  for (const workflow of result.workflows) {
    lines.push(`### ${inline(workflow.identityKey)}`, '');
    for (const uncertainty of workflow.uncertainties) lines.push(`- ${UNCERTAINTY_TEXT[uncertainty]}`, '');
    if (workflow.gaps.length > 0) {
      lines.push(
        `Recorded numbering gaps: ${workflow.gaps.map((gap) => `${inline(gap.after)} to ${inline(gap.before)}`).join(', ')}. These are not counts of missing requests.`,
        '',
      );
    }
    lines.push('| Local capture counter | Exchange IDs | Relative order | Sources |', '| --- | --- | --- | --- |');
    for (const group of workflow.sequenceGroups) {
      lines.push(
        `| ${inline(group.captureSequence)} | ${group.exchangeIds.map(inline).join(', ')} | ${group.captureSequence === null ? 'unknown' : group.tied ? 'tied; unknown within group' : 'local counter only'} | ${sources(group.sources)} |`,
      );
    }
    if (workflow.sequenceGroups.length === 0) lines.push('| unavailable | none | unknown | unavailable |');
    lines.push('');
    if (workflow.transitions.length > 0) {
      lines.push(
        '| Transition and local counter | Declared states | Trigger association | Resource association | Consistency | Sources |',
        '| --- | --- | --- | --- | --- | --- |',
      );
      for (const transition of workflow.transitions) {
        lines.push(
          `| ${inline(transition.transitionId)}; ${inline(transition.captureSequence)} | ${inline(transition.fromState)} → ${inline(transition.toState)} | ${inline(transition.trigger.exchangeId)}: ${inline(transition.trigger.state)}; ${sources(transition.trigger.sources)} | ${inline(transition.resource.resourceId)}: ${inline(transition.resource.state)}; ${sources(transition.resource.sources)} | ${inline(transition.recordState)}; ${inline(transition.sequenceRelation)} | ${sources(transition.sources)} |`,
        );
      }
      lines.push('');
    }
    lines.push(`Workflow sources: ${sources(workflow.sources)}.`, '');
  }
  lines.push(
    '## Recorded result and termination',
    '',
    `Failure field records a failure: ${inline(result.recorded.failureRecorded)}.`,
    '',
    `Termination metadata: ${inline(result.recorded.termination.state)}; code ${inline(result.recorded.termination.code)}; source ${inline(result.recorded.termination.source)}. References: ${sources(result.recorded.termination.sources)}.`,
    '',
  );
  for (const category of ['hypotheses', 'candidates', 'verifications', 'tasks', 'rejectedTasks'] as const) {
    lines.push(`### ${inline(category)}`, '');
    if (result.recorded[category].length === 0) lines.push('No usable records in this category.', '');
    else {
      lines.push('| Recorded ID | Recorded state | Sources |', '| --- | --- | --- |');
      for (const record of result.recorded[category]) {
        lines.push(`| ${inline(record.id)} | ${inline(record.state)} | ${sources(record.sources)} |`);
      }
      lines.push('');
    }
  }
  addDiagnostics(lines, 'Evidence-backed result explanations', result.reasons);
  addDiagnostics(lines, 'Analysis diagnostics', result.diagnostics);
  return `${lines.join('\n')}\n`;
}
