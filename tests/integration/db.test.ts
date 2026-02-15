import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Set a temp DB path before importing db module
let tmpDir: string;

function setupTmpDb(): void {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shannon-test-'));
  process.env.SHANNON_DB_PATH = path.join(tmpDir, 'test.db');
}

function cleanupTmpDb(): void {
  // Need to dynamically import to reset module state
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.SHANNON_DB_PATH;
}

describe('Database layer', () => {
  beforeEach(() => {
    setupTmpDb();
  });

  afterEach(async () => {
    // Dynamic import so each test gets the module after env is set
    const db = await import('../../dist/web/db.js');
    db.resetDb();
    cleanupTmpDb();
  });

  it('should create a scan and retrieve it', async () => {
    const db = await import('../../dist/web/db.js');

    const scan = db.createScan({
      targetUrl: 'https://example.com',
      repoPath: 'my-repo',
    });

    expect(scan.id).toBeTruthy();
    expect(scan.target_url).toBe('https://example.com');
    expect(scan.repo_path).toBe('my-repo');
    expect(scan.status).toBe('pending');
    expect(scan.config_path).toBeNull();
    expect(JSON.parse(scan.completed_agents)).toEqual([]);

    const retrieved = db.getScan(scan.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(scan.id);
  });

  it('should create a scan with configPath', async () => {
    const db = await import('../../dist/web/db.js');

    const scan = db.createScan({
      targetUrl: 'https://example.com',
      repoPath: 'my-repo',
      configPath: './configs/test.yaml',
    });

    expect(scan.config_path).toBe('./configs/test.yaml');
  });

  it('should list scans in reverse chronological order', async () => {
    const db = await import('../../dist/web/db.js');

    const scan1 = db.createScan({ targetUrl: 'https://first.com', repoPath: 'repo1' });
    // Small delay so created_at differs
    await new Promise((r) => setTimeout(r, 10));
    const scan2 = db.createScan({ targetUrl: 'https://second.com', repoPath: 'repo2' });

    const list = db.listScans();
    expect(list.length).toBe(2);
    expect(list[0]!.id).toBe(scan2.id);
    expect(list[1]!.id).toBe(scan1.id);
  });

  it('should update a scan', async () => {
    const db = await import('../../dist/web/db.js');

    const scan = db.createScan({ targetUrl: 'https://example.com', repoPath: 'repo' });

    const updated = db.updateScan(scan.id, {
      workflowId: 'wf-123',
      status: 'running',
      currentPhase: 'pre-recon',
      currentAgent: 'pre-recon',
      completedAgents: [],
    });

    expect(updated).toBeDefined();
    expect(updated!.workflow_id).toBe('wf-123');
    expect(updated!.status).toBe('running');
    expect(updated!.current_phase).toBe('pre-recon');
    expect(updated!.current_agent).toBe('pre-recon');
  });

  it('should update completed agents and summary', async () => {
    const db = await import('../../dist/web/db.js');

    const scan = db.createScan({ targetUrl: 'https://example.com', repoPath: 'repo' });

    const summary = { totalCostUsd: 1.23, totalDurationMs: 60000, totalTurns: 50, agentCount: 13 };
    db.updateScan(scan.id, {
      status: 'completed',
      completedAgents: ['pre-recon', 'recon'],
      summary,
    });

    const retrieved = db.getScan(scan.id)!;
    expect(retrieved.status).toBe('completed');
    expect(JSON.parse(retrieved.completed_agents)).toEqual(['pre-recon', 'recon']);
    expect(JSON.parse(retrieved.summary!)).toEqual(summary);
  });

  it('should find scan by workflow ID', async () => {
    const db = await import('../../dist/web/db.js');

    const scan = db.createScan({ targetUrl: 'https://example.com', repoPath: 'repo' });
    db.updateScan(scan.id, { workflowId: 'wf-unique-123' });

    const found = db.getScanByWorkflowId('wf-unique-123');
    expect(found).toBeDefined();
    expect(found!.id).toBe(scan.id);
  });

  it('should return undefined for non-existent scan', async () => {
    const db = await import('../../dist/web/db.js');

    expect(db.getScan('non-existent-id')).toBeUndefined();
    expect(db.getScanByWorkflowId('non-existent-wf')).toBeUndefined();
  });

  it('should update error field', async () => {
    const db = await import('../../dist/web/db.js');

    const scan = db.createScan({ targetUrl: 'https://example.com', repoPath: 'repo' });
    db.updateScan(scan.id, {
      status: 'failed',
      error: 'Connection refused',
    });

    const retrieved = db.getScan(scan.id)!;
    expect(retrieved.status).toBe('failed');
    expect(retrieved.error).toBe('Connection refused');
  });
});
