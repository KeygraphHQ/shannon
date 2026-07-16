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
import { AGENTS } from '../session-manager.js';
import type { AgentName } from '../types/agents.js';

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
  return [...new Set(paths)];
}
