#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Workspace listing tool for Shannon.
 *
 * Reads audit-logs/ directories, parses session.json files, and displays
 * a formatted table of all workspaces with status, duration, and cost.
 *
 * Usage:
 *   node dist/temporal/workspaces.js
 *
 * Environment:
 *   AUDIT_LOGS_DIR - Override audit-logs directory (default: ./audit-logs)
 */

import fs from 'fs/promises';
import path from 'path';

interface SessionJson {
  session: {
    id: string;
    webUrl: string;
    status: 'in-progress' | 'completed' | 'failed';
    createdAt: string;
    completedAt?: string;
  };
  metrics: {
    total_cost_usd: number;
  };
}

interface WorkspaceInfo {
  name: string;
  url: string;
  status: 'in-progress' | 'completed' | 'failed';
  createdAt: Date;
  completedAt: Date | null;
  costUsd: number;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function getStatusDisplay(status: string): string {
  return status;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '\u2026';
}

async function listWorkspaces(): Promise<void> {
  const auditDir = process.env.AUDIT_LOGS_DIR || './audit-logs';

  let entries: string[];
  try {
    entries = await fs.readdir(auditDir);
  } catch {
    console.log('No audit-logs directory found.');
    console.log(`Expected: ${auditDir}`);
    return;
  }

  const workspaces: WorkspaceInfo[] = [];

  for (const entry of entries) {
    const sessionPath = path.join(auditDir, entry, 'session.json');
    try {
      const content = await fs.readFile(sessionPath, 'utf8');
      const data = JSON.parse(content) as SessionJson;

      workspaces.push({
        name: entry,
        url: data.session.webUrl,
        status: data.session.status,
        createdAt: new Date(data.session.createdAt),
        completedAt: data.session.completedAt ? new Date(data.session.completedAt) : null,
        costUsd: data.metrics.total_cost_usd,
      });
    } catch {
      // Skip directories without valid session.json
    }
  }

  if (workspaces.length === 0) {
    console.log('\nNo workspaces found.');
    console.log('Run a pipeline first: ./shannon start URL=<url> REPO=<repo>');
    return;
  }

  // Sort by creation date (most recent first)
  workspaces.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  console.log('\n=== Shannon Workspaces ===\n');

  // Column widths
  const nameWidth = 30;
  const urlWidth = 30;
  const statusWidth = 14;
  const durationWidth = 10;
  const costWidth = 10;

  // Header
  console.log(
    '  ' +
    'WORKSPACE'.padEnd(nameWidth) +
    'URL'.padEnd(urlWidth) +
    'STATUS'.padEnd(statusWidth) +
    'DURATION'.padEnd(durationWidth) +
    'COST'.padEnd(costWidth)
  );
  console.log('  ' + '\u2500'.repeat(nameWidth + urlWidth + statusWidth + durationWidth + costWidth));

  let resumableCount = 0;

  for (const ws of workspaces) {
    const now = new Date();
    const endTime = ws.completedAt || now;
    const durationMs = endTime.getTime() - ws.createdAt.getTime();
    const duration = formatDuration(durationMs);
    const cost = `$${ws.costUsd.toFixed(2)}`;
    const isResumable = ws.status !== 'completed';

    if (isResumable) {
      resumableCount++;
    }

    const resumeTag = isResumable ? ' (resumable)' : '';

    console.log(
      '  ' +
      truncate(ws.name, nameWidth - 2).padEnd(nameWidth) +
      truncate(ws.url, urlWidth - 2).padEnd(urlWidth) +
      getStatusDisplay(ws.status).padEnd(statusWidth) +
      duration.padEnd(durationWidth) +
      cost.padEnd(costWidth) +
      resumeTag
    );
  }

  console.log();
  const summary = `${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'} found`;
  const resumeSummary = resumableCount > 0 ? ` (${resumableCount} resumable)` : '';
  console.log(`${summary}${resumeSummary}`);

  if (resumableCount > 0) {
    console.log('\nResume with: ./shannon start URL=<url> REPO=<repo> WORKSPACE=<name>');
  }

  console.log();
}

listWorkspaces().catch((err) => {
  console.error('Error listing workspaces:', err);
  process.exit(1);
});
