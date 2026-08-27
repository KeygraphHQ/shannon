// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Captured submit tool with closed-schema and cross-group validation before capture. */

import { defineTool } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import type { CapturedSubmitTool } from '../submit-tool.js';

export type SubmitValidator = (parameters: unknown) => readonly string[];

export interface ValidatingSubmitTool extends CapturedSubmitTool {
  readonly getAcceptedCount: () => number;
  readonly sawRejectedSubmission: () => boolean;
}

function rejection(problems: readonly string[]): {
  content: Array<{ type: 'text'; text: string }>;
  details: undefined;
} {
  const detail = problems.map((problem) => `- ${problem}`).join('\n');
  const message = `Your answer was not accepted. Fix the following and call submit_result again:\n${detail}`;
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ status: 'error', errorType: 'ValidationError', retryable: true, message }),
      },
    ],
    details: undefined,
  };
}

const VALIDATING_DIRECTIVE =
  '\n\nDeliver your structured answer by calling submit_result. If it reports problems, correct them and call it ' +
  'again. Once it accepts your answer, stop. Do not output JSON as text.';

/** Build one executor-owned submit tool that captures only an accepted, schema-closed payload. */
export function createValidatingSubmitTool(
  schema: Record<string, unknown>,
  validate: SubmitValidator,
): ValidatingSubmitTool {
  const parametersSchema = Type.Unsafe(schema);
  let captured: unknown;
  let acceptedCount = 0;
  let rejected = false;

  return {
    tool: defineTool({
      name: 'submit_result',
      label: 'Submit task groups',
      description: 'Submit task groups. Correct a rejected submission, then stop after the first accepted call.',
      promptSnippet: 'submit_result: submit task groups; correct and resubmit only when rejected',
      promptGuidelines: [
        'Call submit_result to deliver task groups.',
        'If it reports validation problems, correct them and call it again.',
        'Stop after the first accepted submission. Do not output JSON as text.',
      ],
      parameters: parametersSchema,
      async execute(_toolCallId, parameters) {
        if (!Value.Check(parametersSchema, parameters)) {
          rejected = true;
          return rejection(['The submission does not match the closed task-formation schema.']);
        }

        const problems = validate(parameters);
        if (problems.length > 0) {
          rejected = true;
          return rejection(problems);
        }

        // Only the first accepted submission is captured. A second accepted call is refused and
        // terminates the session, so the stage always materializes from a single settled answer
        // rather than silently taking the last of several.
        acceptedCount += 1;
        if (acceptedCount > 1) {
          rejected = true;
          return {
            ...rejection(['Only one accepted submission is allowed.']),
            terminate: true,
          };
        }
        captured = parameters;
        return {
          content: [{ type: 'text' as const, text: 'Task groups accepted.' }],
          details: undefined,
          terminate: true,
        };
      },
    }),
    getCaptured: () => captured,
    getAcceptedCount: () => acceptedCount,
    sawRejectedSubmission: () => rejected,
    directive: VALIDATING_DIRECTIVE,
  };
}

export const PROBLEM_LABEL_PREVIEW = 6;

export function previewLabels(labels: readonly string[], maximum: number = PROBLEM_LABEL_PREVIEW): string {
  const shown = labels.slice(0, maximum).join(', ');
  const remaining = labels.length - maximum;
  return remaining > 0 ? `${shown} (+${remaining} more)` : shown;
}

export function describeUnknownLabels(unknown: readonly string[], kind: string): string {
  if (unknown.length === 0) return '';
  return `These are not labels of any ${kind} in this task: ${previewLabels(unknown)}. Use only supplied labels.`;
}

export function describeReusedLabels(reused: readonly string[], container = 'submission'): string {
  if (reused.length === 0) return '';
  return `Each label belongs to at most one ${container}; these are reused: ${previewLabels(reused)}. Remove every duplicate claim.`;
}
