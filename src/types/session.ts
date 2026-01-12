// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Session type definitions
 */

import type { AgentName } from './agents.js';

export interface Session {
  id: string;
  webUrl: string;
  repoPath: string;
  targetRepo: string;
  configFile: string | null;
  outputPath: string | null;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
}

export interface SessionStore {
  sessions: Record<string, Session>;
}

export interface SessionSummary {
  id: string;
  webUrl: string;
  repoPath: string;
  startedAt: string;
  status: 'running' | 'completed' | 'failed';
}
