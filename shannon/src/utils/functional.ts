// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Functional Programming Utilities
 *
 * Generic functional composition patterns for async operations.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PipelineFunction = (x: any) => any | Promise<any>;

/**
 * Async pipeline that passes result through a series of functions.
 * Clearer than reduce-based pipe and easier to debug.
 */
export async function asyncPipe<TResult>(
  initial: unknown,
  ...fns: PipelineFunction[]
): Promise<TResult> {
  let result = initial;
  for (const fn of fns) {
    result = await fn(result);
  }
  return result as TResult;
}
