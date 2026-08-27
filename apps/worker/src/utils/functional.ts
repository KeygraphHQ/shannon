// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Functional Programming Utilities
 *
 * Generic functional composition patterns for async operations.
 */

// biome-ignore lint/suspicious/noExplicitAny: pipeline functions need flexible typing for composition
type PipelineFunction = (x: any) => any | Promise<any>;

/**
 * Async pipeline that passes result through a series of functions.
 * Clearer than reduce-based pipe and easier to debug.
 *
 * There is no per-step try/catch: a thrown error or rejected promise from any function
 * stops the pipeline immediately and propagates to the caller, skipping the remaining
 * functions. Callers that need partial-failure handling must do it inside a step.
 */
export async function asyncPipe<TResult>(initial: unknown, ...fns: PipelineFunction[]): Promise<TResult> {
  let result = initial;
  for (const fn of fns) {
    result = await fn(result);
  }
  return result as TResult;
}
