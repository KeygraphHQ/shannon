// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Null Object pattern for progress indicator - callers never check for null

import { ProgressIndicator } from '../progress-indicator.js';
import { extractAgentType } from '../utils/formatting.js';

export interface ProgressContext {
  description: string;
  useCleanOutput: boolean;
}

export interface ProgressManager {
  start(): void;
  stop(): void;
  finish(message: string): void;
  isActive(): boolean;
}

class RealProgressManager implements ProgressManager {
  private indicator: ProgressIndicator;
  private active: boolean = false;

  constructor(message: string) {
    this.indicator = new ProgressIndicator(message);
  }

  start(): void {
    this.indicator.start();
    this.active = true;
  }

  stop(): void {
    this.indicator.stop();
    this.active = false;
  }

  finish(message: string): void {
    this.indicator.finish(message);
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}

/** Null Object implementation - all methods are safe no-ops */
class NullProgressManager implements ProgressManager {
  start(): void {}

  stop(): void {}

  finish(_message: string): void {}

  isActive(): boolean {
    return false;
  }
}

// Returns no-op when disabled
export function createProgressManager(
  context: ProgressContext,
  disableLoader: boolean
): ProgressManager {
  if (!context.useCleanOutput || disableLoader) {
    return new NullProgressManager();
  }

  const agentType = extractAgentType(context.description);
  return new RealProgressManager(`Running ${agentType}...`);
}
