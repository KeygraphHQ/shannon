// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Dependency Injection Container
 *
 * Provides a per-workflow container for service instances.
 * Services are wired with explicit constructor injection.
 *
 * Usage:
 *   const container = getOrCreateContainer(workflowId, sessionMetadata);
 *   const auditSession = new AuditSession(sessionMetadata);  // Per-agent
 *   await auditSession.initialize(workflowId);
 *   const result = await container.agentExecution.executeOrThrow(agentName, input, auditSession);
 */

import type { SessionMetadata } from '../audit/utils.js';
import { AgentExecutionService } from './agent-execution.js';
import { ConfigLoaderService } from './config-loader.js';
import { ExploitationCheckerService } from './exploitation-checker.js';

/**
 * Dependencies required to create a Container.
 *
 * NOTE: AuditSession is NOT stored in the container.
 * Each agent execution receives its own AuditSession instance
 * because AuditSession uses instance state (currentAgentName) that
 * cannot be shared across parallel agents.
 */
export interface ContainerDependencies {
  readonly sessionMetadata: SessionMetadata;
}

/**
 * DI Container for a single workflow.
 *
 * Holds all service instances for the workflow lifecycle.
 * Services are instantiated once and reused across agent executions.
 *
 * NOTE: AuditSession is NOT stored here - it's passed per agent execution
 * to support parallel agents each having their own logging context.
 */
export class Container {
  readonly sessionMetadata: SessionMetadata;
  readonly agentExecution: AgentExecutionService;
  readonly configLoader: ConfigLoaderService;
  readonly exploitationChecker: ExploitationCheckerService;

  constructor(deps: ContainerDependencies) {
    this.sessionMetadata = deps.sessionMetadata;

    // Wire services with explicit constructor injection
    this.configLoader = new ConfigLoaderService();
    this.exploitationChecker = new ExploitationCheckerService();
    this.agentExecution = new AgentExecutionService(this.configLoader);
  }
}

/**
 * Map of workflowId to Container instance.
 * Each workflow gets its own container scoped to its lifecycle.
 */
const containers = new Map<string, Container>();

/**
 * Get or create a Container for a workflow.
 *
 * If a container already exists for the workflowId, returns it.
 * Otherwise, creates a new container with the provided dependencies.
 *
 * @param workflowId - Unique workflow identifier
 * @param sessionMetadata - Session metadata for audit paths
 * @returns Container instance for the workflow
 */
export function getOrCreateContainer(
  workflowId: string,
  sessionMetadata: SessionMetadata
): Container {
  let container = containers.get(workflowId);

  if (!container) {
    container = new Container({ sessionMetadata });
    containers.set(workflowId, container);
  }

  return container;
}

/**
 * Remove a Container when a workflow completes.
 *
 * Should be called in logWorkflowComplete to clean up resources.
 *
 * @param workflowId - Unique workflow identifier
 */
export function removeContainer(workflowId: string): void {
  containers.delete(workflowId);
}

/**
 * Get an existing Container for a workflow, if one exists.
 *
 * Unlike getOrCreateContainer, this does NOT create a new container.
 * Returns undefined if no container exists for the workflowId.
 *
 * Useful for lightweight activities that can benefit from an existing
 * container but don't need to create one.
 *
 * @param workflowId - Unique workflow identifier
 * @returns Container instance or undefined
 */
export function getContainer(workflowId: string): Container | undefined {
  return containers.get(workflowId);
}
