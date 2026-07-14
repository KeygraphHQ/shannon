// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

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
