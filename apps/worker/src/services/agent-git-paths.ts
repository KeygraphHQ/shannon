// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Per-agent git path scoping.
 *
 * Under parallel agent execution the deliverables git is shared, so each agent's
 * checkpoint/commit/rollback must be limited to the files that agent actually
 * writes. This resolves those paths from the agent's deliverable filename plus
 * its structured exploitation queue (vuln agents only).
 */

import { getQueueFilename } from '../ai/queue-schemas.js';
import { REPORT_JSON_FILENAME } from '../paths.js';
import { AGENTS } from '../session-manager.js';
import type { AgentName } from '../types/agents.js';

// These names must match `sparseExploitCollectorPath` in renumber-core.ts, which derives the
// same filename from the bare ReconciliationClass at read time. If the two fall out of sync,
// git scoping silently drops the collector file from an agent's checkpoint/commit/rollback set:
// the file sits uncommitted in the working tree, or is not restored on rollback, with neither
// side raising an error.
const EXPLOIT_COLLECTOR_PATHS: Readonly<Partial<Record<AgentName, string>>> = Object.freeze({
  'injection-exploit': 'injection_exploit_collector.json',
  'xss-exploit': 'xss_exploit_collector.json',
  'auth-exploit': 'auth_exploit_collector.json',
  'ssrf-exploit': 'ssrf_exploit_collector.json',
  'authz-exploit': 'authz_exploit_collector.json',
  'miscellaneous-exploit': 'miscellaneous_exploit_collector.json',
});

/**
 * Deliverable files an agent writes into the deliverables directory. Used to
 * scope git operations so one agent never touches a sibling agent's output.
 */
export function getAgentGitPaths(agentName: AgentName): string[] {
  const paths = [AGENTS[agentName].deliverableFilename];
  const queueFilename = getQueueFilename(agentName);
  if (queueFilename) {
    paths.push(queueFilename);
  }
  const exploitCollectorPath = EXPLOIT_COLLECTOR_PATHS[agentName];
  if (exploitCollectorPath !== undefined) {
    paths.push(exploitCollectorPath);
  }
  // The report agent owns only its provisional markdown input and structured JSON. Canonical
  // Markdown/SARIF ownership transfers to the finalization transaction after report completion.
  if (agentName === 'report') {
    paths.push(REPORT_JSON_FILENAME);
  }
  return [...new Set(paths)];
}
