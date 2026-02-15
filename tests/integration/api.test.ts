import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

// Mock the temporal-client module before any imports that use it
vi.mock('../../dist/web/temporal-client.js', () => ({
  startWorkflow: vi.fn(),
  queryWorkflowProgress: vi.fn(),
  closeTemporalConnection: vi.fn(),
}));

let tmpDir: string;
let app: FastifyInstance;

async function getTemporalMock() {
  return await import('../../dist/web/temporal-client.js') as {
    startWorkflow: ReturnType<typeof vi.fn>;
    queryWorkflowProgress: ReturnType<typeof vi.fn>;
    closeTemporalConnection: ReturnType<typeof vi.fn>;
  };
}

describe('Scans API', () => {
  beforeEach(async () => {
    // Fresh temp DB for each test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shannon-api-test-'));
    process.env.SHANNON_DB_PATH = path.join(tmpDir, 'test.db');

    // Reset DB singleton
    const db = await import('../../dist/web/db.js');
    db.resetDb();

    // Reset mocks
    const temporal = await getTemporalMock();
    vi.mocked(temporal.startWorkflow).mockReset();
    vi.mocked(temporal.queryWorkflowProgress).mockReset();

    // Build app
    const { buildApp } = await import('../../dist/web/server.js');
    app = await buildApp({ logger: false });
  });

  afterEach(async () => {
    await app.close();
    const db = await import('../../dist/web/db.js');
    db.resetDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.SHANNON_DB_PATH;
  });

  describe('GET /api/scans', () => {
    it('should return empty array when no scans exist', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/scans' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it('should return all scans', async () => {
      // Create scans directly in DB
      const db = await import('../../dist/web/db.js');
      db.createScan({ targetUrl: 'https://a.com', repoPath: 'repo-a' });
      db.createScan({ targetUrl: 'https://b.com', repoPath: 'repo-b' });

      const res = await app.inject({ method: 'GET', url: '/api/scans' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.length).toBe(2);
      // Most recent first
      expect(body[0].targetUrl).toBe('https://b.com');
      expect(body[1].targetUrl).toBe('https://a.com');
    });

    it('should return camelCase formatted scan objects', async () => {
      const db = await import('../../dist/web/db.js');
      db.createScan({ targetUrl: 'https://a.com', repoPath: 'repo-a' });

      const res = await app.inject({ method: 'GET', url: '/api/scans' });
      const scan = res.json()[0];

      expect(scan).toHaveProperty('id');
      expect(scan).toHaveProperty('targetUrl');
      expect(scan).toHaveProperty('repoPath');
      expect(scan).toHaveProperty('status');
      expect(scan).toHaveProperty('completedAgents');
      expect(scan).toHaveProperty('createdAt');
      expect(scan).toHaveProperty('updatedAt');
      // Should NOT have snake_case keys
      expect(scan).not.toHaveProperty('target_url');
      expect(scan).not.toHaveProperty('repo_path');
    });
  });

  describe('GET /api/scans/:id', () => {
    it('should return a scan by ID', async () => {
      const db = await import('../../dist/web/db.js');
      const scan = db.createScan({ targetUrl: 'https://example.com', repoPath: 'repo' });

      const res = await app.inject({ method: 'GET', url: `/api/scans/${scan.id}` });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(scan.id);
      expect(res.json().targetUrl).toBe('https://example.com');
    });

    it('should return 404 for unknown scan', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/scans/nonexistent' });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Scan not found');
    });
  });

  describe('POST /api/scans', () => {
    it('should create a scan and start a workflow', async () => {
      const temporal = await getTemporalMock();
      vi.mocked(temporal.startWorkflow).mockResolvedValue({ workflowId: 'test-wf-123' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/scans',
        payload: { targetUrl: 'https://target.com', repoPath: 'my-repo' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.targetUrl).toBe('https://target.com');
      expect(body.repoPath).toBe('my-repo');
      expect(body.workflowId).toBe('test-wf-123');
      expect(body.status).toBe('running');

      expect(temporal.startWorkflow).toHaveBeenCalledWith({
        webUrl: 'https://target.com',
        repoPath: 'my-repo',
      });
    });

    it('should pass configPath to workflow when provided', async () => {
      const temporal = await getTemporalMock();
      vi.mocked(temporal.startWorkflow).mockResolvedValue({ workflowId: 'test-wf-456' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/scans',
        payload: {
          targetUrl: 'https://target.com',
          repoPath: 'my-repo',
          configPath: './configs/custom.yaml',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().configPath).toBe('./configs/custom.yaml');

      expect(temporal.startWorkflow).toHaveBeenCalledWith({
        webUrl: 'https://target.com',
        repoPath: 'my-repo',
        configPath: './configs/custom.yaml',
      });
    });

    it('should return 400 when targetUrl is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/scans',
        payload: { repoPath: 'my-repo' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('required');
    });

    it('should return 400 when repoPath is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/scans',
        payload: { targetUrl: 'https://target.com' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('required');
    });

    it('should mark scan as failed when workflow start fails', async () => {
      const temporal = await getTemporalMock();
      vi.mocked(temporal.startWorkflow).mockRejectedValue(new Error('Temporal unavailable'));

      const res = await app.inject({
        method: 'POST',
        url: '/api/scans',
        payload: { targetUrl: 'https://target.com', repoPath: 'my-repo' },
      });

      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.status).toBe('failed');
      expect(body.error).toContain('Temporal unavailable');
    });
  });

  describe('POST /api/scans/:id/sync', () => {
    it('should sync status from Temporal', async () => {
      const temporal = await getTemporalMock();
      vi.mocked(temporal.startWorkflow).mockResolvedValue({ workflowId: 'wf-sync-test' });
      vi.mocked(temporal.queryWorkflowProgress).mockResolvedValue({
        status: 'running',
        currentPhase: 'vulnerability-exploitation',
        currentAgent: 'injection-vuln',
        completedAgents: ['pre-recon', 'recon'],
        failedAgent: null,
        error: null,
        startTime: Date.now() - 60000,
        agentMetrics: {},
        summary: null,
        workflowId: 'wf-sync-test',
        elapsedMs: 60000,
      });

      // Create scan via API
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/scans',
        payload: { targetUrl: 'https://target.com', repoPath: 'repo' },
      });
      const scanId = createRes.json().id;

      // Sync
      const syncRes = await app.inject({
        method: 'POST',
        url: `/api/scans/${scanId}/sync`,
      });

      expect(syncRes.statusCode).toBe(200);
      const body = syncRes.json();
      expect(body.currentPhase).toBe('vulnerability-exploitation');
      expect(body.currentAgent).toBe('injection-vuln');
      expect(body.completedAgents).toEqual(['pre-recon', 'recon']);
    });

    it('should not re-query completed scans', async () => {
      const db = await import('../../dist/web/db.js');
      const temporal = await getTemporalMock();

      const scan = db.createScan({ targetUrl: 'https://a.com', repoPath: 'repo' });
      db.updateScan(scan.id, { workflowId: 'wf-done', status: 'completed' });

      const res = await app.inject({
        method: 'POST',
        url: `/api/scans/${scan.id}/sync`,
      });

      expect(res.statusCode).toBe(200);
      expect(temporal.queryWorkflowProgress).not.toHaveBeenCalled();
    });

    it('should return 404 for unknown scan', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/scans/unknown-id/sync',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/scans/sync', () => {
    it('should sync all running scans', async () => {
      const db = await import('../../dist/web/db.js');
      const temporal = await getTemporalMock();

      // Create two running scans
      const scan1 = db.createScan({ targetUrl: 'https://a.com', repoPath: 'repo1' });
      db.updateScan(scan1.id, { workflowId: 'wf-1', status: 'running' });

      const scan2 = db.createScan({ targetUrl: 'https://b.com', repoPath: 'repo2' });
      db.updateScan(scan2.id, { workflowId: 'wf-2', status: 'running' });

      // One completed scan (should not be synced)
      const scan3 = db.createScan({ targetUrl: 'https://c.com', repoPath: 'repo3' });
      db.updateScan(scan3.id, { workflowId: 'wf-3', status: 'completed' });

      vi.mocked(temporal.queryWorkflowProgress).mockResolvedValue({
        status: 'running',
        currentPhase: 'recon',
        currentAgent: 'recon',
        completedAgents: ['pre-recon'],
        failedAgent: null,
        error: null,
        startTime: Date.now(),
        agentMetrics: {},
        summary: null,
        workflowId: 'wf-1',
        elapsedMs: 1000,
      });

      const res = await app.inject({ method: 'POST', url: '/api/scans/sync' });

      expect(res.statusCode).toBe(200);
      expect(res.json().synced).toBe(2);
      expect(temporal.queryWorkflowProgress).toHaveBeenCalledTimes(2);
    });
  });
});
