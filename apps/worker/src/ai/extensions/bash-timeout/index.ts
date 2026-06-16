/**
 * pi extension: enforce a bounded timeout on every `bash` tool call.
 *
 * pi's built-in bash tool accepts an optional `timeout` (in seconds) but applies
 * NO default and NO upper bound — an unbounded command (e.g. a `playwright-cli`
 * browser action that never returns) hangs the agent indefinitely. This extension
 * registers a `tool_call` pre-execution handler that blocks any `bash` invocation
 * that omits `timeout` or sets it above the maximum, returning a message that tells
 * the model how to re-run the command correctly.
 */

import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from '@earendil-works/pi-coding-agent';
import { isToolCallEventType } from '@earendil-works/pi-coding-agent';

/** Recommended timeout (seconds) suggested to the model when it omits one. */
const DEFAULT_TIMEOUT_SECONDS = 120;

/** Hard upper bound (seconds) a single bash command may run. */
const MAX_TIMEOUT_SECONDS = 600;

function evaluateBashTimeout(timeout: number | undefined): ToolCallEventResult | undefined {
  const hasValidTimeout = typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0;
  if (!hasValidTimeout) {
    return {
      block: true,
      reason: `Set bash 'timeout' (seconds). Default ${DEFAULT_TIMEOUT_SECONDS}s, max ${MAX_TIMEOUT_SECONDS}s.`,
    };
  }

  if (timeout > MAX_TIMEOUT_SECONDS) {
    return {
      block: true,
      reason: `bash 'timeout' ${timeout}s exceeds max ${MAX_TIMEOUT_SECONDS}s. Default ${DEFAULT_TIMEOUT_SECONDS}s, max ${MAX_TIMEOUT_SECONDS}s.`,
    };
  }

  return undefined;
}

export default function bashTimeoutExtension(pi: ExtensionAPI): void {
  pi.on('tool_call', (event: ToolCallEvent): ToolCallEventResult | undefined => {
    if (!isToolCallEventType('bash', event)) {
      return undefined;
    }
    return evaluateBashTimeout(event.input.timeout);
  });
}
