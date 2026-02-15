/**
 * E2E tests for the Shannon web app.
 *
 * These tests start the real Fastify server with a real SQLite database,
 * only mocking the Temporal client (which requires a running Temporal server).
 * Tests exercise the full HTTP stack: request → routing → DB → response.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

// Mock Temporal client before any app imports
vi.mock('../../dist/web/temporal-client.js', () => {
  let callCount = 0;
  return {
    startWorkflow: vi.fn(async () => {
      callCount++;
      return { workflowId: `e2e-test-workflow-${callCount}` };
    }),
    queryWorkflowProgress: vi.fn(async () => ({
      status: 'running',
      currentPhase: 'recon',
      currentAgent: 'recon',
      completedAgents: ['pre-recon'],
      failedAgent: null,
      error: null,
      startTime: Date.now() - 30000,
      agentMetrics: {},
      summary: null,
      workflowId: 'e2e-test-workflow-1',
      elapsedMs: 30000,
    })),
    closeTemporalConnection: vi.fn(),
  };
});

let app: FastifyInstance;
let tmpDir: string;
let baseUrl: string;

async function fetchJson(urlPath: string, init?: RequestInit) {
  const headers: Record<string, string> = {};
  // Only set Content-Type for requests with a body to avoid Fastify JSON parse errors
  if (init?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${urlPath}`, {
    headers,
    ...init,
  });
  return { status: res.status, body: await res.json() };
}

describe('Web App E2E', () => {
  beforeAll(async () => {
    // Set up temp database
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shannon-e2e-'));
    process.env.SHANNON_DB_PATH = path.join(tmpDir, 'e2e.db');

    // Reset DB singleton
    const db = await import('../../dist/web/db.js');
    db.resetDb();

    // Build and start the real Fastify server
    const { buildApp } = await import('../../dist/web/server.js');
    app = await buildApp({ logger: false });

    // Listen on a random port
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;
    console.log(`E2E test server listening at ${baseUrl}`);
  });

  afterAll(async () => {
    if (app) await app.close();
    const db = await import('../../dist/web/db.js');
    db.resetDb();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.SHANNON_DB_PATH;
  });

  // --- Scan lifecycle ---

  it('GET /api/scans returns empty list initially', async () => {
    const { status, body } = await fetchJson('/api/scans');

    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it('POST /api/scans creates a scan and starts a workflow', async () => {
    const { status, body } = await fetchJson('/api/scans', {
      method: 'POST',
      body: JSON.stringify({
        targetUrl: 'https://example.com',
        repoPath: 'test-repo',
      }),
    });

    expect(status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.workflowId).toMatch(/^e2e-test-workflow-/);
    expect(body.targetUrl).toBe('https://example.com');
    expect(body.repoPath).toBe('test-repo');
    expect(body.status).toBe('running');
    expect(body.completedAgents).toEqual([]);
    expect(body.createdAt).toBeTruthy();
  });

  it('GET /api/scans lists the created scan', async () => {
    const { status, body } = await fetchJson('/api/scans');

    expect(status).toBe(200);
    expect(body.length).toBe(1);

    const scan = body[0];
    expect(scan.targetUrl).toBe('https://example.com');
    expect(scan.status).toBe('running');
    expect(scan.workflowId).toBeTruthy();
  });

  it('GET /api/scans/:id returns the scan by ID', async () => {
    const listRes = await fetchJson('/api/scans');
    const scanId = listRes.body[0].id;

    const { status, body } = await fetchJson(`/api/scans/${scanId}`);

    expect(status).toBe(200);
    expect(body.id).toBe(scanId);
    expect(body.targetUrl).toBe('https://example.com');
    expect(body.repoPath).toBe('test-repo');
  });

  it('GET /api/scans/:id returns 404 for unknown ID', async () => {
    const { status, body } = await fetchJson('/api/scans/nonexistent-id-123');

    expect(status).toBe(404);
    expect(body.error).toBe('Scan not found');
  });

  // --- Sync ---

  it('POST /api/scans/:id/sync updates scan from Temporal query', async () => {
    const listRes = await fetchJson('/api/scans');
    const scanId = listRes.body[0].id;

    const { status, body } = await fetchJson(`/api/scans/${scanId}/sync`, {
      method: 'POST',
    });

    expect(status).toBe(200);
    expect(body.id).toBe(scanId);
    expect(body.status).toBe('running');
    expect(body.currentPhase).toBe('recon');
    expect(body.currentAgent).toBe('recon');
    expect(body.completedAgents).toEqual(['pre-recon']);
  });

  it('POST /api/scans/sync syncs all running scans', async () => {
    const { status, body } = await fetchJson('/api/scans/sync', {
      method: 'POST',
    });

    expect(status).toBe(200);
    expect(typeof body.synced).toBe('number');
    expect(body.synced).toBeGreaterThanOrEqual(1);
  });

  // --- Validation ---

  it('POST /api/scans returns 400 when targetUrl is missing', async () => {
    const { status, body } = await fetchJson('/api/scans', {
      method: 'POST',
      body: JSON.stringify({ repoPath: 'some-repo' }),
    });

    expect(status).toBe(400);
    expect(body.error).toContain('required');
  });

  it('POST /api/scans returns 400 when repoPath is missing', async () => {
    const { status, body } = await fetchJson('/api/scans', {
      method: 'POST',
      body: JSON.stringify({ targetUrl: 'https://example.com' }),
    });

    expect(status).toBe(400);
    expect(body.error).toContain('required');
  });

  // --- Multiple scans ---

  it('can create a second scan', async () => {
    const { status, body } = await fetchJson('/api/scans', {
      method: 'POST',
      body: JSON.stringify({
        targetUrl: 'https://second-target.com',
        repoPath: 'second-repo',
        configPath: './configs/custom.yaml',
      }),
    });

    expect(status).toBe(201);
    expect(body.targetUrl).toBe('https://second-target.com');
    expect(body.configPath).toBe('./configs/custom.yaml');
  });

  it('lists both scans in reverse chronological order', async () => {
    const { status, body } = await fetchJson('/api/scans');

    expect(status).toBe(200);
    expect(body.length).toBe(2);
    // Most recent first
    expect(body[0].targetUrl).toBe('https://second-target.com');
    expect(body[1].targetUrl).toBe('https://example.com');
  });

  // --- Frontend ---

  it('serves a response at the root URL', async () => {
    const res = await fetch(baseUrl);
    expect(res.ok).toBe(true);

    const text = await res.text();
    // Either the Vue SPA or the API fallback when frontend isn't built
    expect(
      text.includes('<div id="app">') || text.includes('Shannon Web API')
    ).toBe(true);
  });

  // --- Completed scan sync skipping ---

  it('skips Temporal query for completed scans on sync', async () => {
    const temporal = await import('../../dist/web/temporal-client.js') as {
      queryWorkflowProgress: ReturnType<typeof vi.fn>;
    };
    const db = await import('../../dist/web/db.js');

    // Create a completed scan directly
    const scan = db.createScan({ targetUrl: 'https://done.com', repoPath: 'done-repo' });
    db.updateScan(scan.id, { workflowId: 'wf-done', status: 'completed' });

    const callsBefore = vi.mocked(temporal.queryWorkflowProgress).mock.calls.length;

    const { status } = await fetchJson(`/api/scans/${scan.id}/sync`, {
      method: 'POST',
    });

    expect(status).toBe(200);
    // Should NOT have made an additional Temporal query for a completed scan
    expect(vi.mocked(temporal.queryWorkflowProgress).mock.calls.length).toBe(callsBefore);
  });
});
