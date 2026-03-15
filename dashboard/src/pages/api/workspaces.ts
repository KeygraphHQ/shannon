/**
 * GET /api/workspaces
 *
 * Returns workspace data from audit-logs session.json files.
 * This provides historical cost and duration data.
 */

import type { APIRoute } from 'astro';
import { listWorkspaces } from '../../lib/audit-logs.js';

export const GET: APIRoute = async () => {
  try {
    const workspaces = await listWorkspaces();

    return new Response(JSON.stringify({ workspaces }), {
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
