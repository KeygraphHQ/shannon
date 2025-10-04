import { fs, path } from 'zx';
import chalk from 'chalk';
import crypto from 'crypto';
import { PentestError } from './error-handling.js';

// Generate a session-based log folder path
export const generateSessionLogPath = (webUrl, sessionId) => {
  // Create a hash of the webUrl for uniqueness while keeping it readable
  const urlHash = crypto.createHash('md5').update(webUrl).digest('hex').substring(0, 8);
  const hostname = new URL(webUrl).hostname.replace(/[^a-zA-Z0-9-]/g, '-');
  const shortSessionId = sessionId.substring(0, 8);

  const sessionFolderName = `${hostname}_${urlHash}_${shortSessionId}`;
  return path.join(process.cwd(), 'agent-logs', sessionFolderName);
};

// Mutex for session file operations to prevent race conditions
class SessionMutex {
  constructor() {
    this.locks = new Map();
  }

  async lock(sessionId) {
    if (this.locks.has(sessionId)) {
      // Wait for existing lock to be released
      await this.locks.get(sessionId);
    }

    let resolve;
    const promise = new Promise(r => resolve = r);
    this.locks.set(sessionId, promise);

    return () => {
      this.locks.delete(sessionId);
      resolve();
    };
  }
}

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
  const { createInterface } = await import('readline');
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve, reject) => {
    readline.question(chalk.cyan(`Select session (1-${sessions.length}): `), (answer) => {
      readline.close();
      
      const choice = parseInt(answer);
      if (isNaN(choice) || choice < 1 || choice > sessions.length) {
        reject(new PentestError(
          `Invalid selection. Please enter a number between 1 and ${sessions.length}`,
          'validation',
          false,
          { choice: answer }
        ));
      } else {
        resolve(sessions[choice - 1]);
      }
    });
  });
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
export const markAgentCompleted = async (sessionId, agentName, checkpointCommit, timingData = null, costData = null, validationData = null) => {
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
  
  // Update timing data if provided
  if (timingData) {
    updates.timingBreakdown = {
      ...session.timingBreakdown,
      agents: {
        ...session.timingBreakdown?.agents,
        [agentName]: timingData
      }
    };
  }
  
  // Update cost data if provided
  if (costData) {
    const existingCost = session.costBreakdown?.total || 0;
    updates.costBreakdown = {
      total: existingCost + costData,
      agents: {
        ...session.costBreakdown?.agents,
        [agentName]: costData
      }
    };
  }


  // Update validation data if provided (for vulnerability agents)
  if (validationData && agentName.includes('-vuln')) {
    updates.validationResults = {
      ...session.validationResults,
      [agentName]: validationData
    };
  }

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
  const validationResults = session.validationResults || {};

  let totalVulnerabilities = 0;
  let agentsWithVulns = 0;

  for (const agent of completedVulnAgents) {
    const validation = validationResults[agent];
    if (validation?.vulnerabilityCount > 0) {
      totalVulnerabilities += validation.vulnerabilityCount;
      agentsWithVulns++;
    }
  }

  return Object.freeze({
    totalAnalyses: completedVulnAgents.length,
    totalVulnerabilities,
    agentsWithVulnerabilities: agentsWithVulns,
    successRate: completedVulnAgents.length > 0 ? (agentsWithVulns / completedVulnAgents.length) * 100 : 0,
    exploitationCandidates: Object.values(validationResults).filter(v => v?.shouldExploit).length
  });
};

// Calculate exploitation summary statistics
export const calculateExploitationSummary = (session) => {
  const exploitAgents = PHASES['exploitation'];
  const completedExploitAgents = session.completedAgents.filter(agent => exploitAgents.includes(agent));
  const validationResults = session.validationResults || {};

  // Count how many exploitation agents were eligible to run
  const eligibleExploits = exploitAgents.filter(agentName => {
    const vulnAgentName = agentName.replace('-exploit', '-vuln');
    return validationResults[vulnAgentName]?.shouldExploit;
  });

  return Object.freeze({
    totalAttempts: completedExploitAgents.length,
    eligibleExploits: eligibleExploits.length,
    skippedExploits: eligibleExploits.length - completedExploitAgents.length,
    successRate: eligibleExploits.length > 0 ? (completedExploitAgents.length / eligibleExploits.length) * 100 : 0
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
  
  // Clean up timing data for rolled-back agents
  if (session.timingBreakdown?.agents) {
    const filteredTimingAgents = Object.fromEntries(
      Object.entries(session.timingBreakdown.agents).filter(([agent]) => !agentsToRemove.includes(agent))
    );
    updates.timingBreakdown = {
      ...session.timingBreakdown,
      agents: filteredTimingAgents
    };
  }
  
  // Clean up cost data for rolled-back agents and recalculate total
  if (session.costBreakdown?.agents) {
    const filteredCostAgents = Object.fromEntries(
      Object.entries(session.costBreakdown.agents).filter(([agent]) => !agentsToRemove.includes(agent))
    );
    const recalculatedTotal = Object.values(filteredCostAgents).reduce((sum, cost) => sum + cost, 0);
    updates.costBreakdown = {
      total: recalculatedTotal,
      agents: filteredCostAgents
    };
  }
  
  return await updateSession(sessionId, updates);
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