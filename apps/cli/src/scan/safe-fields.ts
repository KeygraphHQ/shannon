/**
 * Closed-field projection for Temporal values displayed by the CLI.
 *
 * PipelineState travels through Temporal from a worker container this process does not
 * control, so free-text fields are treated as unvetted: this module either matches a
 * value against a known closed set (safe to print as-is) or collapses it to a fixed,
 * bounded message. A value with no case here should fail closed to something generic,
 * never pass through untouched.
 */

import type { PartialReasonView, PipelineState } from './pipeline.js';

const CLASS_NAMES: Readonly<Record<string, string>> = Object.freeze({
  injection: 'Injection',
  xss: 'Cross-Site Scripting',
  auth: 'Authentication',
  authz: 'Authorization',
  ssrf: 'Server-Side Request Forgery',
  miscellaneous: 'Miscellaneous',
});

const STAGE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  architecture: 'architecture mapping',
  'threat-model': 'threat modelling',
  plan: 'review planning',
  research: 'deep code research',
  dedupe: 'duplicate merging',
  review: 'independent review',
  critic: 'viability critique',
  confirm: 'static confirmation',
  calibrate: 'risk calibration',
  export: 'findings export',
  workflow: 'orchestration',
});

const TERMINAL_STAGE_NAMES = new Set([
  'architecture',
  'threat model',
  'planning',
  'audit wave',
  'deduplication',
  'review',
  'critic',
  'confirmation',
  'calibration',
  'export',
  'orchestration',
]);

const CAPELLA_FAILURE_MESSAGES = new Set([
  'Provider authentication failed. Verify the configured credential.',
  'Agentic SAST configuration is invalid.',
  'Agentic SAST received invalid input.',
  'An agentic SAST step returned an unusable result.',
  'An agentic SAST step failed.',
  'Agentic SAST infrastructure failed before producing a usable result.',
  'Agentic SAST had not finished when the scan stopped.',
]);

// Mirrors apps/worker/src/types/errors.ts. The CLI cannot import from the worker package,
// so keep this exact closed set in sync with ProviderFailureCategory.
const PROVIDER_FAILURE_CATEGORIES = new Set([
  'rate_limit',
  'overloaded',
  'transport',
  'context_limit',
  'quota',
  'authentication',
  'configuration',
  'unknown',
]);

function isProviderFailureCategory(value: unknown): value is string {
  return typeof value === 'string' && PROVIDER_FAILURE_CATEGORIES.has(value);
}

const OPERATION_LABELS = new Set([
  'Agentic SAST',
  // Capella stage rows, signalled up from the SAST child workflow. Mirrors
  // CAPELLA_STAGE_LABELS in apps/worker/src/ai/sast/types.ts, minus the deterministic
  // export stage, which never becomes a row.
  'Architecture',
  'Threat model',
  'Plan',
  'Research',
  'Dedupe',
  'Review',
  'Critique',
  'Confirm',
  'Calibrate',
  'Reconcile injection',
  'Reconcile xss',
  'Reconcile auth',
  'Reconcile authz',
  'Reconcile ssrf',
  'Reconcile miscellaneous',
  'Prepare reconciliation',
  'Enrich observations',
  'Form exploit tasks',
  'Materialize exploit tasks',
  'Publish reconciliation',
  'Renumber injection',
  'Renumber xss',
  'Renumber auth',
  'Renumber authz',
  'Renumber ssrf',
  'Renumber miscellaneous',
  'Initialize report state',
  'Assemble report inputs',
  'Compact report findings',
  'Saving report progress',
  'Finalize report outputs',
  'Finalize report without SARIF',
  'Saving final report state',
  'Surface customer report',
]);

function safeClassName(value: string | undefined): string | undefined {
  return value === undefined ? undefined : CLASS_NAMES[value];
}

function safeStageName(value: string | undefined): string | undefined {
  return value === undefined ? undefined : STAGE_NAMES[value];
}

function reasonMessage(reason: PartialReasonView): string | undefined {
  const className = safeClassName(reason.vulnerabilityClass);
  switch (reason.code) {
    case 'agentic_sast_failed': {
      const stageName = safeStageName(reason.stage);
      return stageName === undefined
        ? 'Agentic SAST failed, so the pentest continued without its findings.'
        : `Agentic SAST failed during ${stageName}, so the pentest continued without its findings.`;
    }
    case 'agentic_sast_reduced':
      return 'Agentic SAST completed with reduced coverage.';
    case 'class_pipeline_failed':
      return className === undefined
        ? undefined
        : `${className} could not be fully assessed. The other classes completed. Re-running this workspace retries only the part that failed.`;
    case 'class_reconciliation_failed':
      return className === undefined
        ? undefined
        : `${className} findings could not be grouped into test cases, so that class was not exploited and its findings are not in the report.`;
    case 'report_renumber_failed':
      return className === undefined
        ? undefined
        : `${className} findings kept their working reference numbers, so numbering in the report may have gaps. The findings themselves are complete.`;
    case 'report_compaction_failed':
      return 'Finding reference numbers in the report may have gaps. Every finding is present; only the numbering is affected.';
    case 'report_class_omitted':
      return className === undefined
        ? undefined
        : `${className} was assessed but could not be included in the final report.`;
    case 'report_sarif_failed':
      return 'Report SARIF could not be generated. JSON and Markdown remain available.';
    default:
      return undefined;
  }
}

export function safePartialReasons(reasons: readonly PartialReasonView[]): readonly PartialReasonView[] {
  return reasons.flatMap((reason) => {
    const message = reasonMessage(reason);
    if (message === undefined) return [];
    const vulnerabilityClass =
      safeClassName(reason.vulnerabilityClass) === undefined ? undefined : reason.vulnerabilityClass;
    const stage = safeStageName(reason.stage) === undefined ? undefined : reason.stage;
    return [
      {
        code: reason.code,
        message,
        ...(vulnerabilityClass !== undefined && { vulnerabilityClass }),
        ...(stage !== undefined && { stage }),
      },
    ];
  });
}

/** Upper bounds on the warning array crossing into cli.status.json, so a malformed state cannot bloat it. */
const MAX_AGENTIC_SAST_WARNINGS = 20;
const MAX_AGENTIC_SAST_WARNING_LENGTH = 2_000;

/** Sanitize the worker's usage-accounting warnings: strings only, bounded count and length. */
function safeAgenticSastWarnings(value: PipelineState['agenticSast']): readonly string[] {
  const warnings = value?.warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings
    .filter((warning): warning is string => typeof warning === 'string')
    .slice(0, MAX_AGENTIC_SAST_WARNINGS)
    .map((warning) => warning.slice(0, MAX_AGENTIC_SAST_WARNING_LENGTH));
}

export function safeAgenticSast(value: PipelineState['agenticSast']):
  | {
      readonly status: string;
      readonly failedStageLabel?: string;
      readonly error?: string;
      readonly errorCode?: string;
      readonly warnings: readonly string[];
    }
  | undefined {
  if (value === undefined || !['disabled', 'running', 'succeeded', 'failed'].includes(value.status)) return undefined;
  const failedStageLabel = TERMINAL_STAGE_NAMES.has(value.failedStageLabel ?? '') ? value.failedStageLabel : undefined;
  let error: string | undefined;
  if (value.error !== undefined && CAPELLA_FAILURE_MESSAGES.has(value.error)) {
    error = value.error;
  } else if (value.status === 'failed') {
    error = 'An agentic SAST step failed.';
  }
  const errorCode =
    value.errorCode !== undefined &&
    (/^[A-Z][A-Z0-9_]{0,63}$/u.test(value.errorCode) || isProviderFailureCategory(value.errorCode))
      ? value.errorCode
      : undefined;
  return {
    status: value.status,
    ...(failedStageLabel !== undefined && { failedStageLabel }),
    ...(error !== undefined && { error }),
    ...(errorCode !== undefined && { errorCode }),
    warnings: safeAgenticSastWarnings(value),
  };
}

export function safeOperationLabel(value: string): string {
  return OPERATION_LABELS.has(value) ? value : 'Background task';
}

export function safeOperationKey(value: string): string {
  if (
    /^(?:agentic-sast|miscellaneous-pipeline|report:(?:initialize|assemble|compact|checkpoint|finalize|finalize-degraded|terminal|surface))$/u.test(
      value,
    ) ||
    /^agentic-sast:(?:architecture|threat-model|plan|research|dedupe|review|critic|confirm|calibrate)$/u.test(value) ||
    /^(?:reconciliation|report:renumber):(?:injection|xss|auth|authz|ssrf|miscellaneous)$/u.test(value) ||
    /^reconciliation:(?:injection|xss|auth|authz|ssrf|miscellaneous):fallback$/u.test(value)
  ) {
    return value;
  }
  return 'background-task';
}

/**
 * A workspace or workflow id is printed straight into the progress display, so this
 * confines it to a plain identifier charset before that happens: no control or escape
 * characters survive to reach the terminal.
 */
export function safeCliIdentifier(value: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value) ? value : 'unknown';
}

export function safeTemporalStatus(value: string): string {
  return [
    'RUNNING',
    'UNSPECIFIED',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'CANCELED',
    'TERMINATED',
    'TIMED_OUT',
    'CONTINUED_AS_NEW',
  ].includes(value)
    ? value
    : 'UNKNOWN';
}

export function safeFailureDetail(hasFailure: true): string;
export function safeFailureDetail(hasFailure: false): undefined;
export function safeFailureDetail(hasFailure: boolean): string | undefined;
export function safeFailureDetail(hasFailure: boolean): string | undefined {
  return hasFailure ? 'This scan step could not be completed.' : undefined;
}

/** Same closed-set trade-off as safeFailureDetail, for the scan-level (not per-agent) failure. */
export function safeTerminalFailure(hasFailure: boolean): string | undefined {
  return hasFailure ? 'The scan could not be completed.' : undefined;
}
