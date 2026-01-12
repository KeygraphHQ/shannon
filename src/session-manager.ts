// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import chalk from 'chalk';
import crypto from 'crypto';
import { PentestError } from './error-handling.js';
import type { AgentName } from './types/index.js';

// Agent definition interface
export interface AgentDefinition {
  name: AgentName;
  displayName: string;
  prerequisites: AgentName[];
}

// Session interface
export interface Session {
  id: string;
  webUrl: string;
  repoPath: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
}

// Generate a session-based log folder path
// NEW FORMAT: {hostname}_{sessionId} (no hash, full UUID for consistency with audit system)
export const generateSessionLogPath = (webUrl: string, sessionId: string): string => {
  const hostname = new URL(webUrl).hostname.replace(/[^a-zA-Z0-9-]/g, '-');
  const sessionFolderName = `${hostname}_${sessionId}`;
  return path.join(process.cwd(), 'agent-logs', sessionFolderName);
};

// Agent definitions according to PRD
export const AGENTS: Readonly<Record<AgentName, AgentDefinition>> = Object.freeze({
  'pre-recon': {
    name: 'pre-recon',
    displayName: 'Pre-recon agent',
    prerequisites: []
  },
  'recon': {
    name: 'recon',
    displayName: 'Recon agent',
    prerequisites: ['pre-recon']
  },
  'injection-vuln': {
    name: 'injection-vuln',
    displayName: 'Injection vuln agent',
    prerequisites: ['recon']
  },
  'xss-vuln': {
    name: 'xss-vuln',
    displayName: 'XSS vuln agent',
    prerequisites: ['recon']
  },
  'auth-vuln': {
    name: 'auth-vuln',
    displayName: 'Auth vuln agent',
    prerequisites: ['recon']
  },
  'ssrf-vuln': {
    name: 'ssrf-vuln',
    displayName: 'SSRF vuln agent',
    prerequisites: ['recon']
  },
  'authz-vuln': {
    name: 'authz-vuln',
    displayName: 'Authz vuln agent',
    prerequisites: ['recon']
  },
  'injection-exploit': {
    name: 'injection-exploit',
    displayName: 'Injection exploit agent',
    prerequisites: ['injection-vuln']
  },
  'xss-exploit': {
    name: 'xss-exploit',
    displayName: 'XSS exploit agent',
    prerequisites: ['xss-vuln']
  },
  'auth-exploit': {
    name: 'auth-exploit',
    displayName: 'Auth exploit agent',
    prerequisites: ['auth-vuln']
  },
  'ssrf-exploit': {
    name: 'ssrf-exploit',
    displayName: 'SSRF exploit agent',
    prerequisites: ['ssrf-vuln']
  },
  'authz-exploit': {
    name: 'authz-exploit',
    displayName: 'Authz exploit agent',
    prerequisites: ['authz-vuln']
  },
  'report': {
    name: 'report',
    displayName: 'Report agent',
    prerequisites: ['injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit']
  }
});

// Agent execution order
export const AGENT_ORDER: readonly AgentName[] = Object.freeze([
  'pre-recon',
  'recon',
  'injection-vuln',
  'xss-vuln',
  'auth-vuln',
  'ssrf-vuln',
  'authz-vuln',
  'injection-exploit',
  'xss-exploit',
  'auth-exploit',
  'ssrf-exploit',
  'authz-exploit',
  'report'
] as const);

// Parallel execution groups
export const getParallelGroups = (): Readonly<{ vuln: AgentName[]; exploit: AgentName[] }> => Object.freeze({
  vuln: ['injection-vuln', 'xss-vuln', 'auth-vuln', 'ssrf-vuln', 'authz-vuln'],
  exploit: ['injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit']
});

// Session store file path
const STORE_FILE = path.join(process.cwd(), '.shannon-store.json');

// Session store interface
interface SessionStore {
  sessions: Record<string, Session>;
}

// Load sessions from store file
const loadSessions = async (): Promise<SessionStore> => {
  try {
    if (!await fs.pathExists(STORE_FILE)) {
      return { sessions: {} };
    }

    const content = await fs.readFile(STORE_FILE, 'utf8');
    const store = JSON.parse(content) as unknown;

    // Validate store structure
    if (!store || typeof store !== 'object' || !('sessions' in store)) {
      console.log(chalk.yellow('⚠️ Invalid session store format, creating new store'));
      return { sessions: {} };
    }

    return store as SessionStore;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`⚠️ Failed to load session store: ${errMsg}, creating new store`));
    return { sessions: {} };
  }
};

// Save sessions to store file atomically
const saveSessions = async (store: SessionStore): Promise<void> => {
  try {
    const tempFile = `${STORE_FILE}.tmp`;
    await fs.writeJSON(tempFile, store, { spaces: 2 });
    await fs.move(tempFile, STORE_FILE, { overwrite: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    throw new PentestError(
      `Failed to save session store: ${errMsg}`,
      'filesystem',
      false,
      { storeFile: STORE_FILE, originalError: errMsg }
    );
  }
};

// Generate session ID
const generateSessionId = (): string => {
  return crypto.randomUUID();
};

// Check if a session is already running for this target
const findRunningSession = async (webUrl: string, repoPath: string): Promise<Session | undefined> => {
  const store = await loadSessions();
  const sessions = Object.values(store.sessions);

  const normalizedRepoPath = path.resolve(repoPath);

  return sessions.find(session => {
    const normalizedSessionRepo = path.resolve(session.repoPath);
    return session.webUrl === webUrl &&
           normalizedSessionRepo === normalizedRepoPath &&
           session.status === 'running';
  });
};

// Create a new session (lock file)
export const createSession = async (
  webUrl: string,
  repoPath: string
): Promise<Session> => {
  // Check for existing running session
  const runningSession = await findRunningSession(webUrl, repoPath);
  if (runningSession) {
    throw new PentestError(
      `A session is already running for ${webUrl} at ${repoPath}. Session ID: ${runningSession.id}`,
      'validation',
      false,
      { sessionId: runningSession.id }
    );
  }

  const sessionId = generateSessionId();

  const session: Session = {
    id: sessionId,
    webUrl,
    repoPath,
    status: 'running',
    startedAt: new Date().toISOString()
  };

  const store = await loadSessions();
  store.sessions[sessionId] = session;
  await saveSessions(store);

  return session;
};

// Update session status
export const updateSessionStatus = async (
  sessionId: string,
  status: 'running' | 'completed' | 'failed'
): Promise<Session> => {
  const store = await loadSessions();

  if (!store.sessions[sessionId]) {
    throw new PentestError(
      `Session ${sessionId} not found`,
      'validation',
      false,
      { sessionId }
    );
  }

  store.sessions[sessionId]!.status = status;
  await saveSessions(store);
  return store.sessions[sessionId]!;
};

