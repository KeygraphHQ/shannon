// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

export {
  type ConfinedEntry,
  type ConfinedFile,
  ConfinementError,
  type ConfinementErrorCode,
  type OperationBudget,
  RepositoryConfinement,
  type RepositoryConfinementOptions,
} from './confinement.js';
export {
  CAPELLA_REPOSITORY_TOOL_NAMES,
  type CapellaRepositoryToolOptions,
  createCapellaRepositoryTools,
  isCapellaRepositoryTool,
} from './repository-tools.js';
