/**
 * GET /api/workflow/:runId
 *
 * Returns comprehensive workflow detail including description,
 * history events, and progress query data.
 */

import type { APIRoute } from 'astro';
import { getTemporalClient } from '../../../lib/temporal.js';

export const GET: APIRoute = async ({ params }) => {
  const { runId } = params;

  if (!runId) {
    return new Response(JSON.stringify({ error: 'runId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const client = await getTemporalClient();

    // Find workflow by runId
    let workflowId: string | null = null;
    for await (const wf of client.workflow.list({
      query: `RunId = "${runId}"`,
    })) {
      workflowId = wf.workflowId;
      break;
    }

    if (!workflowId) {
      return new Response(JSON.stringify({ error: 'Workflow not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const handle = client.workflow.getHandle(workflowId, runId);
    const description = await handle.describe();

    // Build detail object
    const detail: Record<string, unknown> = {
      workflowId: description.workflowId,
      runId: description.runId,
      type: description.type,
      status: description.status.name.toLowerCase(),
      taskQueue: description.taskQueue,
      startTime: description.startTime?.toISOString() || null,
      closeTime: description.closeTime?.toISOString() || null,
      executionTime: description.executionTime?.toISOString() || null,
      historyLength: description.historyLength,
      memo: description.memo,
      searchAttributes: description.searchAttributes,
      parentExecution: description.parentExecution || null,
    };

    // Get progress query for running workflows
    if (description.status.name === 'RUNNING') {
      try {
        const progress = await handle.query('getProgress');
        detail.progress = progress;
      } catch {
        // Query may not be available
      }
    }

    // Fetch history events (last 50)
    try {
      const history: Array<Record<string, unknown>> = [];
      const iter = handle.fetchHistory();
      const fullHistory = await iter;
      const events = fullHistory.events || [];

      for (const event of events.slice(-50)) {
        history.push({
          eventId: Number(event.eventId),
          eventType: event.eventType,
          eventTime: event.eventTime?.toISOString?.() || null,
          // Include relevant attributes based on event type
          attributes: getEventAttributes(event),
        });
      }
      detail.history = history;
      detail.historySize = events.length;
    } catch {
      detail.history = [];
      detail.historySize = 0;
    }

    return new Response(JSON.stringify(detail), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function getEventAttributes(event: Record<string, unknown>): Record<string, unknown> {
  // Extract the relevant attributes object from the event
  const attrKeys = Object.keys(event).filter(k =>
    k.endsWith('EventAttributes') || k.endsWith('Attributes')
  );

  for (const key of attrKeys) {
    const attrs = event[key];
    if (attrs && typeof attrs === 'object') {
      return attrs as Record<string, unknown>;
    }
  }

  return {};
}
