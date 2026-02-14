/**
 * stop_scan Tool
 *
 * Cancels or terminates a running Shannon workflow.
 */

import type { TemporalBridge } from '../infrastructure/temporal-client.js';
import { toolSuccess, toolError, type ToolResult } from '../types.js';

export interface StopScanInput {
  workflow_id: string;
  reason?: string;
  force?: boolean;
}

export async function stopScan(
  input: StopScanInput,
  temporal: TemporalBridge
): Promise<ToolResult> {
  try {
    if (input.force) {
      await temporal.terminateWorkflow(input.workflow_id, input.reason);
      return toolSuccess({
        workflowId: input.workflow_id,
        action: 'terminated',
        reason: input.reason ?? 'User requested termination',
      });
    }

    await temporal.cancelWorkflow(input.workflow_id);
    return toolSuccess({
      workflowId: input.workflow_id,
      action: 'cancelled',
      reason: input.reason ?? 'User requested cancellation',
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return toolError(`Failed to stop workflow: ${errMsg}`, {
      workflowId: input.workflow_id,
    });
  }
}
