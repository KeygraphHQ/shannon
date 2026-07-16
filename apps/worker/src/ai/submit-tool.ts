// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

/**
 * A pi custom submit tool plus the captured payload it records.
 *
 * pi ships no JSON-schema output format, so an agent that must return structured
 * data does so by calling a purpose-built TypeBox tool. This bundles that tool
 * with its capture accessor and the directive that instructs the model to call
 * it. The executor owns the wiring — it registers the tool, appends the
 * directive to the prompt, and reads `getCaptured()` back as `structuredOutput`
 * — so callers never assemble it by hand.
 */
export interface CapturedSubmitTool {
  readonly tool: ToolDefinition;
  readonly getCaptured: () => unknown | undefined;
  readonly directive?: string;
}

/**
 * Build a `submit_result` tool from a raw JSON Schema, for agents whose result
 * shape is not one of the built-in per-agent schemas (e.g. an out-of-tree agent
 * with its own verdict schema). pi validates the tool call against `schema`
 * before `execute()` runs, so a captured payload is already schema-valid — no
 * separate validation pass is needed.
 */
export function createGenericSubmitTool(schema: Record<string, unknown>): CapturedSubmitTool {
  let captured: unknown | undefined;
  return {
    tool: defineTool({
      name: 'submit_result',
      label: 'Submit Result',
      description: 'Return your final structured answer. Call exactly once as your last action.',
      promptSnippet: 'submit_result: deliver your structured answer (call once)',
      promptGuidelines: [
        'You MUST call submit_result exactly once as your final action.',
        'Fill every required parameter. Do not output JSON as text.',
      ],
      parameters: Type.Unsafe(schema),
      async execute(_toolCallId, params) {
        captured = params;
        return {
          content: [{ type: 'text' as const, text: 'Result submitted.' }],
          details: params,
          terminate: true,
        };
      },
    }),
    getCaptured: () => captured,
    directive:
      '\n\nYou MUST call the submit_result tool exactly once as your final action ' +
      'to deliver your structured answer. Do not output JSON as text. Fill every required parameter.',
  };
}
