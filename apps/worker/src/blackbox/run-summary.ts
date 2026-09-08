// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  BlackboxHypothesis,
  BlackboxIdentityRecord,
  BlackboxRunStatus,
  NormalizedExchange,
  PlannerTask,
  VerificationResult,
} from '../types/blackbox.js';
import type { RunMetadata, RunTerminationReason } from '../types/run-metadata.js';

/** Only recorded metadata is needed; exported reports omit private snapshot fields. */
export interface BlackboxRunSummaryInput {
  readonly status: Exclude<BlackboxRunStatus, 'running'>;
  readonly failure: string | null;
  readonly findingCount: number;
  readonly identities: readonly Pick<BlackboxIdentityRecord, 'name' | 'authenticated'>[];
  readonly exchanges: readonly Pick<NormalizedExchange, 'identity' | 'routeSignature'>[];
  readonly tasks: readonly Pick<PlannerTask, 'status'>[];
  readonly hypotheses: readonly Pick<BlackboxHypothesis, 'status'>[];
  readonly verifications: readonly Pick<VerificationResult, 'verdict'>[];
  readonly candidateCount: number;
  readonly rejectedTaskCount: number;
  readonly runMetadata?: RunMetadata;
}

function countLabels(values: readonly string[], labels: readonly string[]): string {
  return labels.map((label) => `${label}: ${values.filter((value) => value === label).length}`).join('; ');
}

const TERMINATION_DESCRIPTIONS: Readonly<Record<RunTerminationReason, string>> = {
  completed: 'the run reached its recorded completion condition',
  limit_reached: 'the run reached its execution limit',
  uncertain_execution: 'execution could not be confirmed',
  prerequisite_failed: 'a required prerequisite was not met',
  verification_state_missing: 'a verification outcome was not durably recorded',
  component_error: 'a workflow component failed',
  interrupted: 'the execution was interrupted',
  execution_error: 'the execution failed',
  unknown: 'the termination reason is unknown',
};

/** Metadata is recorded externally; keep it inert inside Markdown table cells. */
function metadataText(value: string | null | undefined): string {
  if (value === null || value === undefined || value.length === 0) return 'not recorded';
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127 || code === 0x2028 || code === 0x2029) return ' ';
    return '&<>\\`*_[]|'.includes(character) ? `&#${code};` : character;
  }).join('');
}

function terminationText(termination: RunMetadata['attempts'][number]['termination']): string {
  if (!termination) return 'not recorded';
  const description = Object.hasOwn(TERMINATION_DESCRIPTIONS, termination.code)
    ? TERMINATION_DESCRIPTIONS[termination.code]
    : TERMINATION_DESCRIPTIONS.unknown;
  return `${description} (source: ${metadataText(termination.source)})`;
}

function stopExplanation(input: BlackboxRunSummaryInput): string {
  const resultAttempt = input.runMetadata?.attempts.find(
    (attempt) => attempt.attemptId === input.runMetadata?.resultAttemptId,
  );
  if (resultAttempt?.termination) return `Stop explanation: ${terminationText(resultAttempt.termination)}.`;
  return input.failure?.trim()
    ? 'Stop explanation: a failure was recorded; see the report failure detail.'
    : 'Stop explanation: not recorded.';
}

function provenanceLines(metadata: RunMetadata | undefined): string[] {
  if (!metadata) return [];
  const lines = [
    '### Recorded execution provenance',
    '',
    '| Metadata | Recorded value |',
    '| --- | --- |',
    `| Run ID | ${metadataText(metadata.runId)} |`,
    `| Result attempt | ${metadataText(metadata.resultAttemptId)} |`,
    `| Latest attempt | ${metadataText(metadata.currentAttemptId)} |`,
    `| Attempt history | ${metadata.historyComplete ? 'complete' : 'incomplete; earlier history is not fully recorded'} |`,
    '',
    'Result attribution and the stop explanation use the result attempt. A later resume or report repair does not relabel earlier results. Recorded model identifiers describe configuration, not proof that a model call occurred.',
    '',
  ];
  for (const attempt of metadata.attempts) {
    const labels = [
      ...(attempt.attemptId === metadata.resultAttemptId ? ['result attempt'] : []),
      ...(attempt.attemptId === metadata.currentAttemptId ? ['latest attempt'] : []),
    ];
    lines.push(
      `Attempt: ${metadataText(attempt.attemptId)}${labels.length > 0 ? ` (${labels.join('; ')})` : ''}`,
      '',
      '| Metadata | Recorded value |',
      '| --- | --- |',
      `| Workflow ID | ${metadataText(attempt.workflowId)} |`,
      `| Resumed from attempt | ${metadataText(attempt.resumedFromAttemptId)} |`,
      `| Started at | ${metadataText(attempt.startedAt)} |`,
      `| Ended at | ${metadataText(attempt.endedAt)} |`,
      `| Worker code revision | ${metadataText(attempt.code.revision)} |`,
      `| Worker code has uncommitted changes | ${attempt.code.dirty === null ? 'not recorded' : attempt.code.dirty ? 'yes' : 'no'} |`,
      `| Worker JavaScript SHA-256 | ${metadataText(attempt.code.sha256)} |`,
      `| Configured model | ${metadataText(attempt.configuredModel)} |`,
      `| Recorded termination | ${terminationText(attempt.termination)} |`,
      '',
    );
  }
  return lines;
}

/** Describe saved observations without treating activity or completion as security coverage. */
export function renderBlackboxRunSummary(input: BlackboxRunSummaryInput): string {
  const routes = new Set(input.exchanges.map((exchange) => exchange.routeSignature));
  const identities = new Set(input.exchanges.map((exchange) => exchange.identity));
  const routeIdentities = new Set(
    input.exchanges.map((exchange) => JSON.stringify([exchange.routeSignature, exchange.identity])),
  );
  const authenticated = input.identities.filter((identity) => identity.authenticated).length;
  const namedIdentities = [...identities].filter((identity) => identity !== 'anonymous').length;
  const hypothesisStates = input.hypotheses.map((hypothesis) => hypothesis.status);
  const unresolved = hypothesisStates.filter((status) =>
    ['open', 'queued', 'tested', 'blocked'].includes(status),
  ).length;
  const taskCounts = countLabels(
    input.tasks.map((task) => task.status),
    ['completed', 'failed', 'pending', 'running', 'rejected'],
  );
  const hypothesisCounts = countLabels(hypothesisStates, [
    'open',
    'queued',
    'tested',
    'blocked',
    'verified',
    'disproved',
    'no_demonstrated_impact',
  ]);
  const verificationCounts = countLabels(
    input.verifications.map((verification) => verification.verdict),
    ['verified', 'disproved', 'blocked'],
  );

  return [
    '## Run summary',
    '',
    '| Recorded measure | Value |',
    '| --- | --- |',
    `| Run status | ${input.status} |`,
    `| Reportable findings | ${input.findingCount} |`,
    `| Saved traffic records | ${input.exchanges.length} |`,
    `| Observed route groups | ${routes.size} |`,
    `| Observed route/identity pairs | ${routeIdentities.size} |`,
    `| Configured identities marked authenticated | ${authenticated} of ${input.identities.length} |`,
    `| Identities with observed traffic | ${namedIdentities} named; anonymous: ${identities.has('anonymous') ? 'yes' : 'no'} |`,
    `| Tasks | ${taskCounts} |`,
    `| Unresolved hypotheses | ${unresolved} |`,
    `| Hypothesis states | ${hypothesisCounts} |`,
    `| Candidate records | ${input.candidateCount} |`,
    `| Verifier records | ${verificationCounts} |`,
    `| Rejected proposal records | ${input.rejectedTaskCount} |`,
    '',
    stopExplanation(input),
    '',
    ...provenanceLines(input.runMetadata),
    'Traffic counts describe saved, normalized observations. Route groups represent request shapes; neither route groups nor route/identity pairs count completed authorization checks. Total application coverage is unknown.',
    '',
    'Authentication flags describe recorded state; this report does not recheck session validity. Hypotheses marked tested or closed without demonstrated impact are not successful security checks. Task, hypothesis, candidate, and verifier counts overlap and must not be added together.',
    '',
    'Reportable findings are counted from the exported findings list. Verifier verdicts are reported separately and are not promoted to findings by this summary. Run completion does not establish that the application is secure.',
    '',
    'Sources: [traffic inventory](traffic_inventory.json), [recorded work and outcomes](blackbox_blackboard.json), [exported findings](blackbox_authz_findings.json).',
  ].join('\n');
}
