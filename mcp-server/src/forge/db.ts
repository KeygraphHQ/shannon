// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Skill Forge — Database Layer
 *
 * Persistent JSON-file store for execution_log, skill_stats, and
 * skill_versions. Zero external dependencies — reads/writes a single
 * JSON file at ~/.shannon/forge.json (path configurable).
 *
 * Data accumulates across runs. Each call to forge_optimize or
 * forge_status reads this store. There is no scheduling — the forge
 * runs once when the agent calls it, and again only when asked.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  ExecutionLogEntry,
  SkillStats,
  SkillVersion,
  ForgeConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_DB_DIR = path.join(os.homedir(), '.shannon');
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, 'forge.db');

// ---------------------------------------------------------------------------
// JSON-file fallback store (portable, no native deps)
// ---------------------------------------------------------------------------

interface ForgeStore {
  execution_log: ExecutionLogEntry[];
  skill_stats: Record<string, SkillStats>;
  skill_versions: SkillVersion[];
}

function emptyStore(): ForgeStore {
  return { execution_log: [], skill_stats: {}, skill_versions: [] };
}

/** Lightweight persistence backed by a single JSON file */
export class ForgeDatabase {
  private storePath: string;
  private store: ForgeStore;

  constructor(dbPath?: string) {
    const resolvedDir = dbPath
      ? path.dirname(dbPath)
      : DEFAULT_DB_DIR;
    const resolvedPath = dbPath ?? DEFAULT_DB_PATH;
    // Swap .db extension for .json (portable store)
    this.storePath = resolvedPath.replace(/\.db$/, '.json');

    // Ensure directory exists
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }

    this.store = this.load();
  }

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------

  private load(): ForgeStore {
    if (!fs.existsSync(this.storePath)) return emptyStore();
    try {
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      return JSON.parse(raw) as ForgeStore;
    } catch {
      return emptyStore();
    }
  }

  private save(): void {
    fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  // -------------------------------------------------------------------------
  // execution_log CRUD
  // -------------------------------------------------------------------------

  insertExecution(entry: Omit<ExecutionLogEntry, 'id'>): number {
    const id = (this.store.execution_log.length > 0
      ? Math.max(...this.store.execution_log.map((e) => e.id ?? 0))
      : 0) + 1;
    this.store.execution_log.push({ ...entry, id });
    this.save();
    return id;
  }

  getExecutionsBySkill(skillId: string, limit: number = 100): ExecutionLogEntry[] {
    return this.store.execution_log
      .filter((e) => e.skill_id === skillId)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
      .slice(0, limit);
  }

  getExecutionsBySession(sessionId: string): ExecutionLogEntry[] {
    return this.store.execution_log.filter((e) => e.session_id === sessionId);
  }

  getAllExecutions(limit: number = 500): ExecutionLogEntry[] {
    return this.store.execution_log
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
      .slice(0, limit);
  }

  // -------------------------------------------------------------------------
  // skill_stats — computed aggregates
  // -------------------------------------------------------------------------

  refreshSkillStats(): void {
    const grouped = new Map<string, ExecutionLogEntry[]>();
    for (const entry of this.store.execution_log) {
      const existing = grouped.get(entry.skill_id) ?? [];
      existing.push(entry);
      grouped.set(entry.skill_id, existing);
    }

    const newStats: Record<string, SkillStats> = {};
    for (const [skillId, entries] of grouped) {
      const durations = entries
        .filter((e) => e.duration_ms !== null)
        .map((e) => e.duration_ms!);
      const tokensIn = entries
        .filter((e) => e.tokens_in !== null)
        .map((e) => e.tokens_in!);
      const tokensOut = entries
        .filter((e) => e.tokens_out !== null)
        .map((e) => e.tokens_out!);
      const costs = entries
        .filter((e) => e.cost_usd !== null)
        .map((e) => e.cost_usd!);
      const successCount = entries.filter((e) => e.success).length;

      const avg = (arr: number[]) =>
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const p95 = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil(sorted.length * 0.95) - 1;
        return sorted[Math.max(0, idx)] ?? 0;
      };

      // Compute trend: compare last 5 durations vs previous 5
      const recentDurations = durations.slice(-5);
      const olderDurations = durations.slice(-10, -5);
      let trend: 'improving' | 'degrading' | 'stable' = 'stable';
      if (recentDurations.length >= 3 && olderDurations.length >= 3) {
        const recentAvg = avg(recentDurations);
        const olderAvg = avg(olderDurations);
        const delta = (recentAvg - olderAvg) / olderAvg;
        if (delta < -0.1) trend = 'improving';
        else if (delta > 0.1) trend = 'degrading';
      }

      const lastEntry = entries[entries.length - 1];
      newStats[skillId] = {
        skill_id: skillId,
        total_runs: entries.length,
        avg_duration_ms: Math.round(avg(durations)),
        p95_duration_ms: Math.round(p95(durations)),
        avg_tokens_in: Math.round(avg(tokensIn)),
        avg_tokens_out: Math.round(avg(tokensOut)),
        avg_cost_usd: parseFloat(avg(costs).toFixed(4)),
        success_rate: entries.length > 0 ? parseFloat((successCount / entries.length).toFixed(3)) : 0,
        last_run_at: lastEntry?.finished_at ?? lastEntry?.started_at ?? '',
        trend,
      };
    }

    this.store.skill_stats = newStats;
    this.save();
  }

  getSkillStats(skillId: string): SkillStats | null {
    return this.store.skill_stats[skillId] ?? null;
  }

  getAllSkillStats(): SkillStats[] {
    return Object.values(this.store.skill_stats);
  }

  // -------------------------------------------------------------------------
  // skill_versions CRUD
  // -------------------------------------------------------------------------

  insertVersion(version: Omit<SkillVersion, 'id'>): number {
    const id = (this.store.skill_versions.length > 0
      ? Math.max(...this.store.skill_versions.map((v) => v.id ?? 0))
      : 0) + 1;
    this.store.skill_versions.push({ ...version, id });
    this.save();
    return id;
  }

  getVersions(skillId: string): SkillVersion[] {
    return this.store.skill_versions
      .filter((v) => v.skill_id === skillId)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }

  getActiveVersion(skillId: string): SkillVersion | null {
    return this.store.skill_versions.find(
      (v) => v.skill_id === skillId && v.is_active
    ) ?? null;
  }

  setActiveVersion(skillId: string, versionId: string): void {
    for (const v of this.store.skill_versions) {
      if (v.skill_id === skillId) {
        v.is_active = v.version_id === versionId;
      }
    }
    this.save();
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  getStorePath(): string {
    return this.storePath;
  }

  clear(): void {
    this.store = emptyStore();
    this.save();
  }
}

// ---------------------------------------------------------------------------
// Singleton access
// ---------------------------------------------------------------------------

let _instance: ForgeDatabase | null = null;

export function getForgeDb(config?: Partial<ForgeConfig>): ForgeDatabase {
  if (!_instance) {
    _instance = new ForgeDatabase(config?.db_path);
  }
  return _instance;
}

export function resetForgeDb(): void {
  _instance = null;
}
