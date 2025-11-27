// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import chalk from 'chalk';
import crypto from 'crypto';
import { PentestError } from './error-handling.js';
import { SessionMutex } from './utils/concurrency.js';
import { promptSelection } from './cli/prompts.js';

// Generate a session-based log folder path
// NEW FORMAT: {hostname}_{sessionId} (no hash, full UUID for consistency with audit system)
export const generateSessionLogPath = (webUrl, sessionId) => {
  const hostname = new URL(webUrl).hostname.replace(/[^a-zA-Z0-9-]/g, '-');
  const sessionFolderName = `${hostname}_${sessionId}`;
  return path.join(process.cwd(), 'agent-logs', sessionFolderName);
};

const sessionMutex = new SessionMutex();

// Agent definitions according to PRD
export const AGENTS = Object.freeze({
  // Phase 1 - Pre-reconnaissance
  'pre-recon': {
    name: 'pre-recon',
    displayName: 'Pre-recon agent',
    phase: 'pre-reconnaissance',
    order: 1,
    prerequisites: []
  },
  
  // Phase 2 - Reconnaissance  
  'recon': {
    name: 'recon',
    displayName: 'Recon agent',
    phase: 'reconnaissance',
    order: 2,
    prerequisites: ['pre-recon']
  },
  
  // Phase 3 - Vulnerability Analysis
  'injection-vuln': {
    name: 'injection-vuln',
    displayName: 'Injection vuln agent',
    phase: 'vulnerability-analysis',
    order: 3,
    prerequisites: ['recon']
  },
  'xss-vuln': {
    name: 'xss-vuln',
    displayName: 'XSS vuln agent',
    phase: 'vulnerability-analysis',
    order: 4,
    prerequisites: ['recon']
  },
  'auth-vuln': {
    name: 'auth-vuln',
    displayName: 'Auth vuln agent',
    phase: 'vulnerability-analysis',
    order: 5,
    prerequisites: ['recon']
  },
  'ssrf-vuln': {
    name: 'ssrf-vuln',
    displayName: 'SSRF vuln agent',
    phase: 'vulnerability-analysis',
    order: 6,
    prerequisites: ['recon']
  },
  'authz-vuln': {
    name: 'authz-vuln',
    displayName: 'Authz vuln agent',
    phase: 'vulnerability-analysis',
    order: 7,
    prerequisites: ['recon']
  },
  
  // Phase 4 - Exploitation
  'injection-exploit': {
    name: 'injection-exploit',
    displayName: 'Injection exploit agent',
    phase: 'exploitation',
    order: 8,
    prerequisites: ['injection-vuln']
  },
  'xss-exploit': {
    name: 'xss-exploit',
    displayName: 'XSS exploit agent',
    phase: 'exploitation',
    order: 9,
    prerequisites: ['xss-vuln']
  },
  'auth-exploit': {
    name: 'auth-exploit',
    displayName: 'Auth exploit agent',
    phase: 'exploitation',
    order: 10,
    prerequisites: ['auth-vuln']
  },
  'ssrf-exploit': {
    name: 'ssrf-exploit',
    displayName: 'SSRF exploit agent',
    phase: 'exploitation',
    order: 11,
    prerequisites: ['ssrf-vuln']
  },
  'authz-exploit': {
    name: 'authz-exploit',
    displayName: 'Authz exploit agent',
    phase: 'exploitation',
    order: 12,
    prerequisites: ['authz-vuln']
  },
  
  // Phase 5 - Reporting
  'report': {
    name: 'report',
    displayName: 'Report agent',
    phase: 'reporting',
    order: 13,
    prerequisites: ['authz-exploit']
  }
});

// Phase definitions
export const PHASES = Object.freeze({
  'pre-reconnaissance': ['pre-recon'],
  'reconnaissance': ['recon'],
  'vulnerability-analysis': ['injection-vuln', 'xss-vuln', 'auth-vuln', 'ssrf-vuln', 'authz-vuln'],
  'exploitation': ['injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit'],
  'reporting': ['report']
});

// Session store file path
const STORE_FILE = path.join(process.cwd(), '.shannon-store.json');

// Load sessions from store file
const loadSessions = async () => {
  try {
    if (!await fs.pathExists(STORE_FILE)) {
      return { sessions: {} };
    }
    
    const content = await fs.readFile(STORE_FILE, 'utf8');
    const store = JSON.parse(content);
    
    // Validate store structure
    if (!store || typeof store !== 'object' || !store.sessions) {
      console.log(chalk.yellow('⚠️ Invalid session store format, creating new store'));
      return { sessions: {} };
    }
    
    return store;
  } catch (error) {
    console.log(chalk.yellow(`⚠️ Failed to load session store: ${error.message}, creating new store`));
    return { sessions: {} };
  }
};

// Save sessions to store file atomically
const saveSessions = async (store) => {
  try {
    const tempFile = `${STORE_FILE}.tmp`;
    await fs.writeJSON(tempFile, store, { spaces: 2 });
    await fs.move(tempFile, STORE_FILE, { overwrite: true });
  } catch (error) {
    throw new PentestError(
      `Failed to save session store: ${error.message}`,
      'filesystem',
      false,
      { storeFile: STORE_FILE, originalError: error.message }
    );
  }
};

// Find existing session for the same web URL and repository path
const findExistingSession = async (webUrl, targetRepo) => {
  const store = await loadSessions();
  const sessions = Object.values(store.sessions);

  // Normalize paths for comparison
  const normalizedTargetRepo = path.resolve(targetRepo);

  // Look for existing session with same webUrl and targetRepo
  const existingSession = sessions.find(session => {
    const normalizedSessionRepo = path.resolve(session.targetRepo || session.repoPath);
    return session.webUrl === webUrl && normalizedSessionRepo === normalizedTargetRepo;
  });

  return existingSession;
};

// Generate session ID as unique UUID
const generateSessionId = () => {
  // Always generate a unique UUID for each session
  return crypto.randomUUID();
};

// Create new session or return existing one
export const createSession = async (webUrl, repoPath, configFile = null, targetRepo = null) => {
  // Use targetRepo if provided, otherwise use repoPath
  const resolvedTargetRepo = targetRepo || repoPath;

  // Check for existing session first
  const existingSession = await findExistingSession(webUrl, resolvedTargetRepo);

  if (existingSession) {
    // If session is not completed, reuse it
    if (existingSession.status !== 'completed') {
      console.log(chalk.blue(`📝 Reusing existing session: ${existingSession.id.substring(0, 8)}...`));
      console.log(chalk.gray(`   Progress: ${existingSession.completedAgents.length}/${Object.keys(AGENTS).length} agents completed`));

      // Update last activity timestamp
      await updateSession(existingSession.id, { lastActivity: new Date().toISOString() });
      return existingSession;
    }

    // If completed, create a new session (allows re-running after completion)
    console.log(chalk.gray(`Previous session was completed, creating new session...`));
  }

  const sessionId = generateSessionId();

  // STANDARD: All sessions use 'id' field (NOT 'sessionId')
  // This is the canonical session structure used throughout the codebase
  const session = {
    id: sessionId,
    webUrl,
    repoPath,
    configFile,
    targetRepo: resolvedTargetRepo,
    status: 'in-progress',
    completedAgents: [],
    failedAgents: [],
    checkpoints: {},
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  };

  const store = await loadSessions();
  store.sessions[sessionId] = session;
  await saveSessions(store);

  return session;
};

// Get session by ID
export const getSession = async (sessionId) => {
  const store = await loadSessions();
  return store.sessions[sessionId] || null;
};

// Update session
export const updateSession = async (sessionId, updates) => {
  const store = await loadSessions();
  
  if (!store.sessions[sessionId]) {
    throw new PentestError(
      `Session ${sessionId} not found`,
      'validation',
      false,
      { sessionId }
    );
  }
  
  store.sessions[sessionId] = {
    ...store.sessions[sessionId],
    ...updates,
    lastActivity: new Date().toISOString()
  };
  
  await saveSessions(store);
  return store.sessions[sessionId];
};

// List all sessions
const listSessions = async () => {
  const store = await loadSessions();
  return Object.values(store.sessions);
};

// Interactive session selection
export const selectSession = async () => {
  const sessions = await listSessions();
  
  if (sessions.length === 0) {
    throw new PentestError(
      'No pentest sessions found. Run a normal pentest first to create a session.',
      'validation',
      false
    );
  }
  
  if (sessions.length === 1) {
    return sessions[0];
  }
  
  // Display session options
  console.log(chalk.cyan('\nMultiple pentest sessions found:\n'));
  
  sessions.forEach((session, index) => {
    const completedCount = session.completedAgents.length;
    const totalAgents = Object.keys(AGENTS).length;
    const timeAgo = getTimeAgo(session.lastActivity);

    // Use dynamic status calculation instead of stored status
    const { status } = getSessionStatus(session);
    const statusColor = status === 'completed' ? chalk.green : chalk.blue;
    const statusIcon = status === 'completed' ? '✅' : '🔄';

    console.log(statusColor(`${index + 1}) ${new URL(session.webUrl).hostname} + ${path.basename(session.repoPath)} [${status}]`));
    console.log(chalk.gray(`   Last activity: ${timeAgo}, Completed: ${completedCount}/${totalAgents} agents`));
    console.log(chalk.gray(`   Session ID: ${session.id}`));

    if (session.configFile) {
      console.log(chalk.gray(`   Config: ${session.configFile}`));
    }

    console.log(); // Empty line between sessions
  });
  
  // Get user selection
  return await promptSelection(
    chalk.cyan(`Select session (1-${sessions.length}):`),
    sessions
  );
};

// Validate agent name
export const validateAgent = (agentName) => {
  if (!AGENTS[agentName]) {
    throw new PentestError(
      `Agent '${agentName}' not recognized. Use --list-agents to see valid names.`,
      'validation',
      false,
      { agentName, validAgents: Object.keys(AGENTS) }
    );
  }
  return AGENTS[agentName];
};

// Validate agent range
export const validateAgentRange = (startAgent, endAgent) => {
  const start = validateAgent(startAgent);
  const end = validateAgent(endAgent);
  
  if (start.order >= end.order) {
    throw new PentestError(
      `End agent '${endAgent}' must come after start agent '${startAgent}' in sequence.`,
      'validation',
      false,
      { startAgent, endAgent, startOrder: start.order, endOrder: end.order }
    );
  }
  
  // Get all agents in range
  const agentList = Object.values(AGENTS)
    .filter(agent => agent.order >= start.order && agent.order <= end.order)
    .sort((a, b) => a.order - b.order);
    
  return agentList;
};

// Validate phase name
export const validatePhase = (phaseName) => {
  if (!PHASES[phaseName]) {
    throw new PentestError(
      `Phase '${phaseName}' not recognized. Valid phases: ${Object.keys(PHASES).join(', ')}`,
      'validation',
      false,
      { phaseName, validPhases: Object.keys(PHASES) }
    );
  }
  return PHASES[phaseName].map(agentName => AGENTS[agentName]);
};

// Check prerequisites for an agent
export const checkPrerequisites = (session, agentName) => {
  const agent = validateAgent(agentName);
  
  const missingPrereqs = agent.prerequisites.filter(prereq => 
    !session.completedAgents.includes(prereq)
  );
  
  if (missingPrereqs.length > 0) {
    throw new PentestError(
      `Cannot run '${agentName}': prerequisite agent(s) not completed: ${missingPrereqs.join(', ')}`,
      'validation',
      false,
      { agentName, missingPrerequisites: missingPrereqs, completedAgents: session.completedAgents }
    );
  }
  
  return true;
};

// Get next suggested agent
export const getNextAgent = (session) => {
  const completed = new Set(session.completedAgents);
  const failed = new Set(session.failedAgents);
  
  // Find the next agent that hasn't been completed and has all prerequisites
  const nextAgent = Object.values(AGENTS)
    .sort((a, b) => a.order - b.order)
    .find(agent => {
      if (completed.has(agent.name)) return false; // Already completed
      
      // Check if all prerequisites are completed
      const prereqsMet = agent.prerequisites.every(prereq => completed.has(prereq));
      return prereqsMet;
    });
    
  return nextAgent;
};

// Mark agent as completed with checkpoint
// NOTE: Timing, cost, and validation data now managed by AuditSession (audit-logs/session.json)
// Shannon store contains ONLY orchestration state (completedAgents, checkpoints)
export const markAgentCompleted = async (sessionId, agentName, checkpointCommit) => {
  // Use mutex to prevent race conditions during parallel agent execution
  const unlock = await sessionMutex.lock(sessionId);

  try {
    // Get fresh session data under lock
    const session = await getSession(sessionId);
    if (!session) {
      throw new PentestError(`Session ${sessionId} not found`, 'validation', false);
    }

    validateAgent(agentName);

    const updates = {
      completedAgents: [...new Set([...session.completedAgents, agentName])],
      failedAgents: session.failedAgents.filter(agent => agent !== agentName),
      checkpoints: {
        ...session.checkpoints,
        [agentName]: checkpointCommit
      }
    };

    // Check if all agents are now completed and update session status
    const totalAgents = Object.keys(AGENTS).length;
    if (updates.completedAgents.length === totalAgents) {
      updates.status = 'completed';
    }

    return await updateSession(sessionId, updates);
  } finally {
    // Always release the lock, even if an error occurs
    unlock();
  }
};

// Mark agent as failed
export const markAgentFailed = async (sessionId, agentName) => {
  const session = await getSession(sessionId);
  if (!session) {
    throw new PentestError(`Session ${sessionId} not found`, 'validation', false);
  }
  
  validateAgent(agentName);
  
  const updates = {
    failedAgents: [...new Set([...session.failedAgents, agentName])],
    completedAgents: session.completedAgents.filter(agent => agent !== agentName)
  };
  
  return await updateSession(sessionId, updates);
};

// Get time ago helper
const getTimeAgo = (timestamp) => {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now - past;
  
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
};

// Get session status summary
export const getSessionStatus = (session) => {
  const totalAgents = Object.keys(AGENTS).length;
  const completedCount = session.completedAgents.length;
  const failedCount = session.failedAgents.length;

  let status;
  if (completedCount === totalAgents) {
    status = 'completed';
  } else if (failedCount > 0) {
    status = 'failed';
  } else {
    status = 'in-progress';
  }

  return {
    status,
    completedCount,
    totalAgents,
    failedCount,
    completionPercentage: Math.round((completedCount / totalAgents) * 100)
  };
};

// Calculate comprehensive summary statistics for vulnerability analysis
export const calculateVulnerabilityAnalysisSummary = (session) => {
  const vulnAgents = PHASES['vulnerability-analysis'];
  const completedVulnAgents = session.completedAgents.filter(agent => vulnAgents.includes(agent));

  // NOTE: Actual vulnerability counts require reading queue files
  // This summary only shows completion counts
  return Object.freeze({
    totalAnalyses: completedVulnAgents.length,
    completedAgents: completedVulnAgents
  });
};

// Calculate exploitation summary statistics
export const calculateExploitationSummary = (session) => {
  const exploitAgents = PHASES['exploitation'];
  const completedExploitAgents = session.completedAgents.filter(agent => exploitAgents.includes(agent));

  // NOTE: Eligibility requires reading queue files
  // This summary only shows completion counts
  return Object.freeze({
    totalAttempts: completedExploitAgents.length,
    completedAgents: completedExploitAgents
  });
};

// Rollback session to specific agent checkpoint
export const rollbackToAgent = async (sessionId, targetAgent) => {
  const session = await getSession(sessionId);
  if (!session) {
    throw new PentestError(`Session ${sessionId} not found`, 'validation', false);
  }
  
  validateAgent(targetAgent);
  
  if (!session.checkpoints[targetAgent]) {
    throw new PentestError(
      `No checkpoint found for agent '${targetAgent}' in session history`,
      'validation',
      false,
      { targetAgent, availableCheckpoints: Object.keys(session.checkpoints) }
    );
  }
  
  // Find agents that need to be removed (those after the target agent)
  const targetOrder = AGENTS[targetAgent].order;
  const agentsToRemove = Object.values(AGENTS)
    .filter(agent => agent.order > targetOrder)
    .map(agent => agent.name);
  
  const updates = {
    completedAgents: session.completedAgents.filter(agent => !agentsToRemove.includes(agent)),
    failedAgents: session.failedAgents.filter(agent => !agentsToRemove.includes(agent)),
    checkpoints: Object.fromEntries(
      Object.entries(session.checkpoints).filter(([agent]) => !agentsToRemove.includes(agent))
    )
  };

  // NOTE: Timing and cost data now managed in audit-logs/session.json
  // Rollback will be reflected via reconcileSession() which marks agents as "rolled-back"

  return await updateSession(sessionId, updates);
};

/**
 * Reconcile Shannon store with audit logs (self-healing)
 *
 * This function ensures the Shannon store (.shannon-store.json) is consistent with
 * the audit logs (audit-logs/session.json) by syncing agent completion status.
 *
 * Three-part reconciliation:
 * 1. PROMOTIONS: Agents completed/failed in audit → added to Shannon store
 * 2. DEMOTIONS: Agents rolled-back in audit → removed from Shannon store
 * 3. VERIFICATION: Ensure audit state fully reflected in orchestration
 *
 * Critical for crash recovery, especially crash during rollback operations.
 *
 * @param {string} sessionId - Session ID to reconcile
 * @returns {Promise<Object>} Reconciliation report with added/removed/failed agents
 */
export const reconcileSession = async (sessionId) => {
  const { AuditSession } = await import('./audit/index.js');

  // Get Shannon store session
  const shannonSession = await getSession(sessionId);
  if (!shannonSession) {
    throw new PentestError(`Session ${sessionId} not found in Shannon store`, 'validation', false);
  }

  // Get audit session data
  const auditSession = new AuditSession(shannonSession);
  await auditSession.initialize();
  const auditData = await auditSession.getMetrics();

  const report = {
    promotions: [],
    demotions: [],
    failures: []
  };

  // PART 1: PROMOTIONS (Additive)
  // Find agents completed in audit but not in Shannon store
  const auditCompleted = Object.entries(auditData.metrics.agents)
    .filter(([_, agentData]) => agentData.status === 'success')
    .map(([agentName]) => agentName);

  const missing = auditCompleted.filter(agent => !shannonSession.completedAgents.includes(agent));

  for (const agentName of missing) {
    const agentData = auditData.metrics.agents[agentName];
    const checkpoint = agentData.checkpoint || null;
    await markAgentCompleted(sessionId, agentName, checkpoint);
    report.promotions.push(agentName);
  }

  // PART 2: DEMOTIONS (Subtractive) - CRITICAL FOR ROLLBACK RECOVERY
  // Find agents rolled-back in audit but still in Shannon store
  const auditRolledBack = Object.entries(auditData.metrics.agents)
    .filter(([_, agentData]) => agentData.status === 'rolled-back')
    .map(([agentName]) => agentName);

  const toRemove = shannonSession.completedAgents.filter(agent => auditRolledBack.includes(agent));

  if (toRemove.length > 0) {
    // Reload session to get fresh state
    const freshSession = await getSession(sessionId);

    const updates = {
      completedAgents: freshSession.completedAgents.filter(agent => !toRemove.includes(agent)),
      checkpoints: Object.fromEntries(
        Object.entries(freshSession.checkpoints).filter(([agent]) => !toRemove.includes(agent))
      )
    };

    await updateSession(sessionId, updates);
    report.demotions.push(...toRemove);
  }

  // PART 3: FAILURES
  // Find agents failed in audit but not marked failed in Shannon store
  const auditFailed = Object.entries(auditData.metrics.agents)
    .filter(([_, agentData]) => agentData.status === 'failed')
    .map(([agentName]) => agentName);

  const failedToAdd = auditFailed.filter(agent => !shannonSession.failedAgents.includes(agent));

  for (const agentName of failedToAdd) {
    await markAgentFailed(sessionId, agentName);
    report.failures.push(agentName);
  }

  return report;
};

// Delete a specific session by ID
export const deleteSession = async (sessionId) => {
  const store = await loadSessions();
  
  if (!store.sessions[sessionId]) {
    throw new PentestError(
      `Session ${sessionId} not found`,
      'validation',
      false,
      { sessionId }
    );
  }
  
  const deletedSession = store.sessions[sessionId];
  delete store.sessions[sessionId];
  await saveSessions(store);
  
  return deletedSession;
};

// Delete all sessions (remove entire storage)
export const deleteAllSessions = async () => {
  try {
    if (await fs.pathExists(STORE_FILE)) {
      await fs.remove(STORE_FILE);
      return true;
    }
    return false; // File didn't exist
  } catch (error) {
    throw new PentestError(
      `Failed to delete session storage: ${error.message}`,
      'filesystem',
      false,
      { storeFile: STORE_FILE, originalError: error.message }
    );
  }
};