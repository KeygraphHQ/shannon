// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Shared display/formatting types for the agent executor output layer.

export interface ExecutionContext {
  isParallelExecution: boolean;
  useCleanOutput: boolean;
  agentType: string;
  agentKey: string;
}
