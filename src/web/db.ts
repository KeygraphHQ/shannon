import Database from 'better-sqlite3';
import path from 'node:path';
import crypto from 'node:crypto';

let db: Database.Database | null = null;

function getDbPath(): string {
  return process.env.SHANNON_DB_PATH || path.join(process.cwd(), 'data', 'shannon.db');
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      workflow_id TEXT UNIQUE,
      target_url TEXT NOT NULL,
      repo_path TEXT NOT NULL,
      config_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      current_phase TEXT,
      current_agent TEXT,
      completed_agents TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      summary TEXT
    );
  `);
}

// --- Row types ---

export interface ScanRow {
  id: string;
  workflow_id: string | null;
  target_url: string;
  repo_path: string;
  config_path: string | null;
  status: string;
  current_phase: string | null;
  current_agent: string | null;
  completed_agents: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  summary: string | null;
}

// --- Queries ---

export function listScans(): ScanRow[] {
  return getDb()
    .prepare('SELECT * FROM scans ORDER BY created_at DESC')
    .all() as ScanRow[];
}

export function getScan(id: string): ScanRow | undefined {
  return getDb()
    .prepare('SELECT * FROM scans WHERE id = ?')
    .get(id) as ScanRow | undefined;
}

export function getScanByWorkflowId(workflowId: string): ScanRow | undefined {
  return getDb()
    .prepare('SELECT * FROM scans WHERE workflow_id = ?')
    .get(workflowId) as ScanRow | undefined;
}

export interface CreateScanInput {
  targetUrl: string;
  repoPath: string;
  configPath?: string;
}

export function createScan(input: CreateScanInput): ScanRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO scans (id, target_url, repo_path, config_path, status, completed_agents, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', '[]', ?, ?)`
    )
    .run(id, input.targetUrl, input.repoPath, input.configPath ?? null, now, now);

  return getScan(id)!;
}

export interface UpdateScanInput {
  workflowId?: string;
  status?: string;
  currentPhase?: string | null;
  currentAgent?: string | null;
  completedAgents?: string[];
  error?: string | null;
  summary?: object | null;
}

export function updateScan(id: string, input: UpdateScanInput): ScanRow | undefined {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (input.workflowId !== undefined) {
    fields.push('workflow_id = ?');
    values.push(input.workflowId);
  }
  if (input.status !== undefined) {
    fields.push('status = ?');
    values.push(input.status);
  }
  if (input.currentPhase !== undefined) {
    fields.push('current_phase = ?');
    values.push(input.currentPhase);
  }
  if (input.currentAgent !== undefined) {
    fields.push('current_agent = ?');
    values.push(input.currentAgent);
  }
  if (input.completedAgents !== undefined) {
    fields.push('completed_agents = ?');
    values.push(JSON.stringify(input.completedAgents));
  }
  if (input.error !== undefined) {
    fields.push('error = ?');
    values.push(input.error);
  }
  if (input.summary !== undefined) {
    fields.push('summary = ?');
    values.push(input.summary ? JSON.stringify(input.summary) : null);
  }

  if (fields.length === 0) return getScan(id);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  getDb()
    .prepare(`UPDATE scans SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values);

  return getScan(id);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Reset the singleton so the next getDb() call creates a fresh connection.
 * Used by tests to point at a different SHANNON_DB_PATH between runs.
 */
export function resetDb(): void {
  closeDb();
}
