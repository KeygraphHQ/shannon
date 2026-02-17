// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { Context } from '@temporalio/activity';

/**
 * Logger interface for services called from Temporal activities.
 * Keeps services Temporal-agnostic while providing structured logging.
 */
export interface ActivityLogger {
  info(message: string, attrs?: Record<string, unknown>): void;
  warn(message: string, attrs?: Record<string, unknown>): void;
  error(message: string, attrs?: Record<string, unknown>): void;
}

/**
 * ActivityLogger backed by Temporal's Context.current().log.
 * Must be called inside a running Temporal activity — throws otherwise.
 */
export class TemporalActivityLogger implements ActivityLogger {
  info(message: string, attrs?: Record<string, unknown>): void {
    Context.current().log.info(message, attrs ?? {});
  }

  warn(message: string, attrs?: Record<string, unknown>): void {
    Context.current().log.warn(message, attrs ?? {});
  }

  error(message: string, attrs?: Record<string, unknown>): void {
    Context.current().log.error(message, attrs ?? {});
  }
}

/**
 * Create an ActivityLogger. Must be called inside a Temporal activity.
 * Throws if called outside an activity context.
 */
export function createActivityLogger(): ActivityLogger {
  return new TemporalActivityLogger();
}
