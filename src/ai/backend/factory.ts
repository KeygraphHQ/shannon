// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

export type AiBackendName = 'anthropic' | 'opencode';

const DEFAULT_BACKEND: AiBackendName = 'anthropic';

export function getAiBackend(): AiBackendName {
  const raw = process.env.AI_BACKEND?.trim().toLowerCase();

  if (raw === 'opencode') {
    return 'opencode';
  }

  return DEFAULT_BACKEND;
}
