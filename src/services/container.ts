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

import { path } from 'zx';
import type { SessionMetadata } from '../audit/utils.js';
import { AgentExecutionService } from './agent-execution.js';
import { ConfigLoaderService } from './config-loader.js';
import { ExploitationCheckerService } from './exploitation-checker.js';
import { OptimizationManager } from './optimization-manager.js';
import type { OptimizationConfig } from '../types/config.js';
import type { ActivityLogger } from '../types/activity-logger.js';

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
  readonly optimizationConfig?: OptimizationConfig;
  readonly logger?: ActivityLogger;
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
  readonly optimizationManager: OptimizationManager | null;

  constructor(deps: ContainerDependencies) {
    this.sessionMetadata = deps.sessionMetadata;

    // Wire services with explicit constructor injection
    this.configLoader = new ConfigLoaderService();
    this.exploitationChecker = new ExploitationCheckerService();
    this.agentExecution = new AgentExecutionService(this.configLoader);

    // Initialize OptimizationManager if config provided
    if (deps.optimizationConfig && deps.logger) {
      const workspaceDir = deps.sessionMetadata.outputPath || './audit-logs';
      const cacheDir = path.join(workspaceDir, deps.sessionMetadata.id || 'default', '.shannon-cache');
      
      this.optimizationManager = new OptimizationManager(
        deps.sessionMetadata.repoPath,
        workspaceDir,
        {
          enableIncrementalScan: deps.optimizationConfig.enable_incremental_scan ?? true,
          enableCaching: deps.optimizationConfig.enable_caching ?? true,
          enableContextPrioritization: deps.optimizationConfig.enable_context_prioritization ?? true,
          enableModelOptimization: deps.optimizationConfig.enable_model_optimization ?? true,
          maxContextSize: deps.optimizationConfig.max_context_size,
          cacheDir,
        },
        deps.logger
      );
    } else {
      this.optimizationManager = null;
    }
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
 * @param optimizationConfig - Optional optimization configuration
 * @param logger - Optional logger for optimization manager
 * @returns Container instance for the workflow
 */
export function getOrCreateContainer(
  workflowId: string,
  sessionMetadata: SessionMetadata,
  optimizationConfig?: OptimizationConfig,
  logger?: ActivityLogger
): Container {
  let container = containers.get(workflowId);

  if (!container) {
    container = new Container({ sessionMetadata, optimizationConfig, logger });
    // Initialize optimization manager if present
    if (container.optimizationManager) {
      container.optimizationManager.initialize().catch((err) => {
        if (logger) {
          logger.warn(`Failed to initialize optimization manager: ${err}`);
        }
      });
    }
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
