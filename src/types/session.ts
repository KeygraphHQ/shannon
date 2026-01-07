// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Session type definitions
 */

import type { AgentName, AgentStatus } from './agents.js';

export type PhaseName =
  | 'pre-reconnaissance'
  | 'reconnaissance'
  | 'vulnerability-analysis'
  | 'exploitation'
  | 'reporting';

export interface AgentInfo {
  name: AgentName;
  displayName: string;
  phase: PhaseName;
  order: number;
  prerequisites: AgentName[];
}

export type AgentDefinitions = Record<AgentName, AgentInfo>;

export type PhaseDefinitions = Record<PhaseName, AgentName[]>;

export interface AgentState {
  status: AgentStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  attempts?: number;
}

export interface Session {
  id: string;
  targetUrl: string;
  repoPath: string;
  configPath?: string;
  createdAt: string;
  updatedAt: string;
  completedAgents: AgentName[];
  agentStates: Record<AgentName, AgentState>;
  checkpoints: Record<AgentName, string>;
}

export interface SessionStore {
  sessions: Record<string, Session>;
}

export interface SessionSummary {
  id: string;
  targetUrl: string;
  repoPath: string;
  createdAt: string;
  completedAgents: number;
  totalAgents: number;
}
