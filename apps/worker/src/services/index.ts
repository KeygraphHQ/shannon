// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Services Module
 *
 * Exports DI container and service classes for Shannon agent execution.
 * Services are pure domain logic with no Temporal dependencies.
 */

export type { ClaudePromptResult } from '../ai/claude-executor.js';
export { runClaudePrompt } from '../ai/claude-executor.js';
export type { AgentExecutionInput } from './agent-execution.js';
export { AgentExecutionService } from './agent-execution.js';
export { ConfigLoaderService } from './config-loader.js';
export type { ContainerDependencies } from './container.js';
export { Container, getContainer, getOrCreateContainer, removeContainer, setContainerFactory } from './container.js';
export { ExploitationCheckerService } from './exploitation-checker.js';
export { loadPrompt } from './prompt-manager.js';
export { assembleFinalReport, injectModelIntoReport } from './reporting.js';
export { SarifReportOutputProvider } from './sarif-output-provider.js';
