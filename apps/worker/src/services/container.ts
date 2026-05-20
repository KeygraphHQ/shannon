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
import type { CheckpointProvider } from '../interfaces/checkpoint-provider.js';
import { NoOpCheckpointProvider } from '../interfaces/checkpoint-provider.js';
import type { FindingsProvider } from '../interfaces/findings-provider.js';
import { NoOpFindingsProvider } from '../interfaces/findings-provider.js';
import type { ReportOutputProvider } from '../interfaces/report-output-provider.js';
import { NoOpReportOutputProvider } from '../interfaces/report-output-provider.js';
import type { ContainerConfig } from '../types/config.js';
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
  readonly config: ContainerConfig;
  readonly findingsProvider?: FindingsProvider;
  readonly checkpointProvider?: CheckpointProvider;
  readonly reportOutputProvider?: ReportOutputProvider;
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
  readonly config: ContainerConfig;
  readonly agentExecution: AgentExecutionService;
  readonly configLoader: ConfigLoaderService;
  readonly exploitationChecker: ExploitationCheckerService;
  readonly findingsProvider: FindingsProvider;
  readonly checkpointProvider: CheckpointProvider;
  readonly reportOutputProvider: ReportOutputProvider;

  constructor(deps: ContainerDependencies) {
    this.sessionMetadata = deps.sessionMetadata;
    this.config = deps.config;

    // Wire services with explicit constructor injection
    this.configLoader = new ConfigLoaderService();
    this.exploitationChecker = new ExploitationCheckerService();
    this.agentExecution = new AgentExecutionService(this.configLoader);

    // Wire providers with default no-ops when not provided
    this.findingsProvider = deps.findingsProvider ?? new NoOpFindingsProvider();
    this.checkpointProvider = deps.checkpointProvider ?? new NoOpCheckpointProvider();
    this.reportOutputProvider = deps.reportOutputProvider ?? new NoOpReportOutputProvider();
  }
}

/**
 * Map of workflowId to Container instance.
 * Each workflow gets its own container scoped to its lifecycle.
 */
const containers = new Map<string, Container>();

/** Default container config — OSS standalone defaults */
const DEFAULT_CONFIG: ContainerConfig = {
  deliverablesSubdir: '.shannon/deliverables',
  auditDir: './workspaces',
};

/**
 * Factory function for creating containers.
 *
 * Default: creates a plain Container with NoOp providers. Consumers can call
 * setContainerFactory() at worker startup to inject custom provider
 * implementations into every container.
 */
type ContainerFactory = (workflowId: string, sessionMetadata: SessionMetadata, config: ContainerConfig) => Container;

let containerFactory: ContainerFactory = (_workflowId, sessionMetadata, config) =>
  new Container({ sessionMetadata, config });

/**
 * Override the default container factory.
 *
 * Call once at worker startup to inject providers into all containers
 * created during the worker's lifetime.
 */
export function setContainerFactory(factory: ContainerFactory): void {
  containerFactory = factory;
}

/**
 * Get or create a Container for a workflow.
 *
 * If a container already exists for the workflowId, returns it.
 * Otherwise, creates a new container with the provided dependencies.
 *
 * @param workflowId - Unique workflow identifier
 * @param sessionMetadata - Session metadata for audit paths
 * @param config - Runtime configuration (defaults to OSS standalone config)
 * @returns Container instance for the workflow
 */
export function getOrCreateContainer(
  workflowId: string,
  sessionMetadata: SessionMetadata,
  config: ContainerConfig = DEFAULT_CONFIG,
): Container {
  let container = containers.get(workflowId);

  if (!container) {
    container = containerFactory(workflowId, sessionMetadata, config);
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
