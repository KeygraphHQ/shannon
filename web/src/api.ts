export interface Scan {
  id: string;
  workflowId: string | null;
  targetUrl: string;
  repoPath: string;
  configPath: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentPhase: string | null;
  currentAgent: string | null;
  completedAgents: string[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
  summary: {
    totalCostUsd: number;
    totalDurationMs: number;
    totalTurns: number;
    agentCount: number;
  } | null;
}

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function listScans(): Promise<Scan[]> {
  return request<Scan[]>('/scans');
}

export function getScan(id: string): Promise<Scan> {
  return request<Scan>(`/scans/${id}`);
}

export function createScan(input: {
  targetUrl: string;
  repoPath: string;
  configPath?: string;
}): Promise<Scan> {
  return request<Scan>('/scans', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function syncScan(id: string): Promise<Scan> {
  return request<Scan>(`/scans/${id}/sync`, { method: 'POST' });
}

export function syncAllScans(): Promise<{ synced: number }> {
  return request<{ synced: number }>('/scans/sync', { method: 'POST' });
}
