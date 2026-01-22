// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Telemetry event definitions for Shannon.
 *
 * All PostHog event names are defined here for consistency and type safety.
 * These events are anonymous - no PII or sensitive data is ever sent.
 */

/**
 * Telemetry event names.
 * Using an enum ensures consistency across the codebase.
 */
export enum TelemetryEvent {
  // Workflow lifecycle (emitted from client.ts)
  WORKFLOW_START = 'workflow_start',

  // Agent lifecycle (emitted from activities.ts)
  AGENT_START = 'agent_start',
  AGENT_COMPLETE = 'agent_complete',
  AGENT_FAILED = 'agent_failed',
  AGENT_RETRY = 'agent_retry',

  // Pipeline completion (emitted from report agent in activities.ts)
  WORKFLOW_COMPLETE = 'workflow_complete',
  WORKFLOW_FAILED = 'workflow_failed',
}

/**
 * Base properties included with every telemetry event.
 */
export interface BaseTelemetryProperties {
  os_platform: string;
  node_version: string;
}

/**
 * Properties for agent-level events.
 */
export interface AgentEventProperties {
  agent_name: string;
  attempt_number: number;
  duration_ms?: number;
  cost_usd?: number;
  error_type?: string; // Only error classification, never the actual message
}

/**
 * Properties for workflow-level events.
 */
export interface WorkflowEventProperties {
  has_config?: boolean;
  total_duration_ms?: number;
  total_cost_usd?: number;
  error_type?: string; // Only error classification, never the actual message
}
