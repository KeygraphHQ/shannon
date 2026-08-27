// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Workflow-safe error identities shared by the Capella executor and Temporal policy. */

export const CAPELLA_AGENT_ERROR_NAMES = Object.freeze([
  'AgentExecutionError',
  'AuthenticationError',
  'ConfigurationError',
  'InvalidInputError',
  'SastContractError',
] as const);

export type CapellaAgentErrorName = (typeof CAPELLA_AGENT_ERROR_NAMES)[number];

/**
 * Temporal's type-level retry gate. Activity classification separately forwards each error
 * instance's retryability, so `AgentExecutionError` is not a blanket retry guarantee.
 *
 * `AgentExecutionError` is the one name marked retryable at the type level: it covers transient
 * failures (provider hiccups, transport faults) that a retry can plausibly clear. The rest name
 * problems a retry cannot fix on its own: bad credentials, bad configuration, bad input, or a
 * contract violation in Capella's own output.
 */
export const CAPELLA_ERROR_TYPE_NON_RETRYABLE = Object.freeze({
  AgentExecutionError: false,
  AuthenticationError: true,
  ConfigurationError: true,
  InvalidInputError: true,
  SastContractError: true,
} as const satisfies Readonly<Record<CapellaAgentErrorName, boolean>>);

export const CAPELLA_NON_RETRYABLE_ERROR_TYPES = Object.freeze(
  CAPELLA_AGENT_ERROR_NAMES.filter((name) => CAPELLA_ERROR_TYPE_NON_RETRYABLE[name]),
);

// Compile-time exhaustiveness check: if a name is ever added to CAPELLA_AGENT_ERROR_NAMES without
// a matching entry in CAPELLA_ERROR_TYPE_NON_RETRYABLE, UnclassifiedCapellaAgentError stops being
// `never` and this assignment fails to typecheck, catching the gap before it reaches Temporal.
type UnclassifiedCapellaAgentError = Exclude<CapellaAgentErrorName, keyof typeof CAPELLA_ERROR_TYPE_NON_RETRYABLE>;
const _everyCapellaAgentErrorHasTypeGate: UnclassifiedCapellaAgentError extends never ? true : never = true;
void _everyCapellaAgentErrorHasTypeGate;
