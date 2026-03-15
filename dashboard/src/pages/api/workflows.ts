/**
 * GET /api/workflows
 *
 * Returns live workflow data from Temporal, enriched with progress
 * queries for running workflows.
 *
 * Query params:
 *   ?status=running|completed|failed
 *   ?pageSize=100
 */

import type { APIRoute } from 'astro';
import { listWorkflowsWithProgress } from '../../lib/temporal.js';

export const GET: APIRoute = async ({ url }) => {
  try {
    const status = url.searchParams.get('status') || undefined;
    const pageSize = parseInt(url.searchParams.get('pageSize') || '100', 10);

    const workflows = await listWorkflowsWithProgress({ status, pageSize });

    return new Response(JSON.stringify({ workflows }), {
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
