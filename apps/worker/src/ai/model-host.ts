// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { classifyProviderFailure } from '../services/error-handling.js';
import type { ProviderFailure } from '../types/errors.js';
import { type ModelSelection, resolveModelSelection } from './models.js';

/** Intended cost/capability role for a model call. All roles use the run's one selected model. */
export type ModelRole = 'small' | 'medium' | 'large';

/** Credential-preserving model selection and provider-failure classification boundary. */
export interface ModelHost {
  resolve(role: ModelRole): Promise<ModelSelection>;
  classify(error: unknown, contextWindow?: number): ProviderFailure;
}

export type ModelSelectionResolver = () => Promise<ModelSelection>;

class ShannonModelHost implements ModelHost {
  private selection: Promise<ModelSelection> | undefined;

  constructor(private readonly resolver: ModelSelectionResolver) {}

  // Cache only a selection that resolves. The catch clears the slot on rejection so a later
  // attempt (a retried activity) can resolve again instead of replaying the first failure forever.
  // The identity guard leaves a newer in-flight selection in place if one already replaced this one.
  resolve(_role: ModelRole): Promise<ModelSelection> {
    if (this.selection) return this.selection;

    const selection = Promise.resolve()
      .then(() => this.resolver())
      .catch((error: unknown) => {
        if (this.selection === selection) this.selection = undefined;
        throw error;
      });
    this.selection = selection;
    return this.selection;
  }

  classify(error: unknown, contextWindow?: number): ProviderFailure {
    return classifyProviderFailure(error, contextWindow);
  }
}

/** Create an isolated host, primarily for callers with an explicit lifecycle or focused verification. */
export function createModelHost(resolver: ModelSelectionResolver = resolveModelSelection): ModelHost {
  return new ShannonModelHost(resolver);
}

/** Process-local model host shared by production model callers. */
export const modelHost: ModelHost = createModelHost();
