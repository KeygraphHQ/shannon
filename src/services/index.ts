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

export { Container, getOrCreateContainer, removeContainer } from './container.js';
export type { ContainerDependencies } from './container.js';

export { ConfigLoaderService } from './config-loader.js';
export { ExploitationCheckerService } from './exploitation-checker.js';
export { AgentExecutionService } from './agent-execution.js';
export type { AgentExecutionInput } from './agent-execution.js';

export { assembleFinalReport, injectModelIntoReport } from './reporting.js';
export { loadPrompt } from './prompt-manager.js';
