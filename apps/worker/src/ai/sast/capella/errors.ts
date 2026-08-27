// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { ProviderFailureCategory } from '../../../types/errors.js';

const MAX_ERROR_MESSAGE_LENGTH = 2_000;
const MACHINE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

class NamedCapellaError extends Error {
  constructor(
    name: string,
    readonly code: string,
    message: string,
  ) {
    super(message.slice(0, MAX_ERROR_MESSAGE_LENGTH));
    this.name = name;
  }
}

/** A caller supplied an invalid repository, path, artifact, or stage input. */
export class InvalidInputError extends NamedCapellaError {
  constructor(message: string, code = 'INVALID_INPUT') {
    super('InvalidInputError', code, message);
  }
}

/** A Capella format, stage, or SARIF invariant was violated. */
export class SastContractError extends NamedCapellaError {
  constructor(message: string, code = 'SAST_CONTRACT') {
    super('SastContractError', code, message);
  }
}

/** A required Capella prompt or immutable setting is unavailable. */
export class ConfigurationError extends NamedCapellaError {
  constructor(message: string, code = 'CONFIGURATION') {
    super('ConfigurationError', code, message);
  }
}

/** A sanitized local failure that is safe to retry without exposing its underlying I/O error. */
export class CapellaRetryableError extends NamedCapellaError {
  constructor(message: string, code = 'RETRYABLE_IO') {
    super('CapellaRetryableError', code, message);
  }
}

/** Return a bounded machine code, never an error message or provider-authored value. */
export function capellaFailureCode(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return fallback;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' && MACHINE_CODE_PATTERN.test(code) ? code : fallback;
}

/**
 * The most specific bounded code for a classified agent failure. A provider category names a
 * real cause worth preferring (rate_limit, quota, context_limit, ...), but the vocabulary's
 * `unknown` member names nothing, so a concrete fixed code outranks it.
 */
export function capellaClassifiedFailureCode(
  code: string,
  providerCategory: ProviderFailureCategory | undefined,
): string {
  if (providerCategory === undefined || providerCategory === 'unknown') return code;
  return providerCategory;
}
