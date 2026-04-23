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
 */

import { ClaudeSdkExecutor } from '../ai/claude-sdk-executor.js';
import { KiroCliExecutor } from '../ai/kiro-cli-executor.js';
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

// === Backend Selection ===

type ExecutorBackend = 'claude-sdk' | 'kiro-cli';

const VALID_BACKENDS = new Set<ExecutorBackend>(['claude-sdk', 'kiro-cli']);

/**
 * Resolve which executor backend to use.
 *
 * Precedence: env var > config > default 'claude-sdk'.
 */
export function resolveExecutorBackend(config: ContainerConfig): ExecutorBackend {
  const envBackend = process.env.SHANNON_EXECUTOR_BACKEND;
  if (envBackend && VALID_BACKENDS.has(envBackend as ExecutorBackend)) {
    return envBackend as ExecutorBackend;
  }
  return config.executorBackend ?? 'claude-sdk';
}

// === Container Dependencies ===

/**
 * Dependencies required to create a Container.
 *
 * NOTE: AuditSession is NOT stored in the container.
 * Each agent execution receives its own AuditSession instance
 * because AuditSession uses instance state (currentAgentName)
 * that cannot be shared across parallel agents.
 */
export interface ContainerDependencies {
  readonly sessionMetadata: SessionMetadata;
  readonly config: ContainerConfig;
  readonly findingsProvider?: FindingsProvider;
  readonly checkpointProvider?: CheckpointProvider;
  readonly reportOutputProvider?: ReportOutputProvider;
}

// === Container Class ===

/**
 * DI Container for a single workflow.
 *
 * Holds all service instances for the workflow lifecycle.
 * Services are instantiated once and reused across agent
 * executions.
 *
 * NOTE: AuditSession is NOT stored here - it's passed per
 * agent execution to support parallel agents each having
 * their own logging context.
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

    // Select executor backend and wire into AgentExecutionService
    const backend = resolveExecutorBackend(deps.config);
    const executor = backend === 'kiro-cli' ? new KiroCliExecutor() : new ClaudeSdkExecutor();
    this.agentExecution = new AgentExecutionService(this.configLoader, executor);

    // Wire providers with default no-ops when not provided
    this.findingsProvider = deps.findingsProvider ?? new NoOpFindingsProvider();
    this.checkpointProvider = deps.checkpointProvider ?? new NoOpCheckpointProvider();
    this.reportOutputProvider = deps.reportOutputProvider ?? new NoOpReportOutputProvider();
  }
}

// === Container Lifecycle ===

const containers = new Map<string, Container>();

/** Default container config — OSS standalone defaults */
const DEFAULT_CONFIG: ContainerConfig = {
  deliverablesSubdir: '.shannon/deliverables',
  auditDir: './workspaces',
};

type ContainerFactory = (workflowId: string, sessionMetadata: SessionMetadata, config: ContainerConfig) => Container;

let containerFactory: ContainerFactory = (_workflowId, sessionMetadata, config) =>
  new Container({ sessionMetadata, config });

/**
 * Override the default container factory.
 *
 * Call once at worker startup to inject providers into all
 * containers created during the worker's lifetime.
 */
export function setContainerFactory(factory: ContainerFactory): void {
  containerFactory = factory;
}

/**
 * Get or create a Container for a workflow.
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

/** Remove a Container when a workflow completes. */
export function removeContainer(workflowId: string): void {
  containers.delete(workflowId);
}

/**
 * Get an existing Container for a workflow, if one exists.
 */
export function getContainer(workflowId: string): Container | undefined {
  return containers.get(workflowId);
}
