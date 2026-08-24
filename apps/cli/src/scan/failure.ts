/**
 * Rendering for the worker's '|'-delimited failure string.
 *
 * `formatWorkflowError` in the worker joins error segments — phase context, error type,
 * message, and remediation hint — with '|' as a delimiter. These helpers turn that raw
 * string into readable output for the CLI's own surfaces.
 */

/** Split the failure string into trimmed, non-empty segments. */
export function parseFailureSegments(message: string): string[] {
  return message
    .split('|')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/** Multi-line block: one segment per indented line (the caller prints the header). */
export function indentFailureSegments(message: string, indent = '  '): string {
  return parseFailureSegments(message)
    .map((segment) => `${indent}${segment}`)
    .join('\n');
}

/** Single-line summary for compact contexts like the status footer. */
export function inlineFailureReason(message: string): string {
  return parseFailureSegments(message).join(' — ');
}
