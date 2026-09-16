// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Registering OrcaRouter into a model runtime, as a seam of its own.
 *
 * Registration is what makes a `orcarouter:<vendor/model>` spec resolve: the live
 * catalogue is read with the user's own key, turned into descriptors, and handed to the
 * harness as an extension provider. Without it, the id falls through to the builtin
 * catalogue — which has never heard of these models — and the run fails at preflight.
 *
 * This lives apart from `models.ts` for two reasons. The contract is narrow — "given a
 * runtime and a selected provider id, add the provider when it is missing" — and it is
 * worth testing on its own; and it keeps the OrcaRouter path importable by a test
 * without pulling in the harness, whose own module graph needs a newer Node than the
 * rest of this package does.
 */

import type { ModelRuntime, ProviderConfig } from '@earendil-works/pi-coding-agent';
import { adoptOrcaEnv, ORCAROUTER_PROVIDER_ID, prepareOrcaProvider } from './provider.js';

/**
 * The registration shape `ModelRuntime.registerProvider` accepts. pi does not export the
 * input type directly, so it is taken from the method signature itself.
 */
export type OrcaProviderRegistration = NonNullable<Parameters<ModelRuntime['registerProvider']>[1]>;

/**
 * The part of a model runtime registration needs. Structural rather than the concrete
 * class, so the seam can be driven by a stand-in in a test and by `ModelRuntime` in a run.
 */
export interface OrcaRegistrationTarget {
  getProvider(providerId: string): unknown;
  registerProvider(providerId: string, config: OrcaProviderRegistration): void;
}

export interface RegisterOrcaRouterOptions {
  /** Overrides how the credential and catalogue are resolved. Tests inject one. */
  readonly prepare?: typeof prepareOrcaProvider;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Register OrcaRouter in `runtime` when that provider was selected. Never throws and
 * never overwrites: a provider the runtime already knows, or a run with no OrcaRouter
 * credential, leaves the runtime exactly as it was.
 *
 * The catalogue is read here rather than at request time, so what the runtime holds is
 * the list this workspace can actually call. Discovery failure degrades to the verified
 * seed inside `prepareOrcaProvider`, which keeps a fresh install usable through an
 * outage instead of registering nothing.
 */
export async function registerOrcaRouter(
  runtime: OrcaRegistrationTarget,
  providerId: string,
  options: RegisterOrcaRouterOptions = {},
): Promise<boolean> {
  if (providerId !== ORCAROUTER_PROVIDER_ID) return false;
  if (runtime.getProvider(ORCAROUTER_PROVIDER_ID)) return false;

  // The registered provider resolves its key from ORCAROUTER_API_KEY, so a key supplied
  // under an accepted alias is adopted under that name before registration.
  const env = options.env ?? process.env;
  adoptOrcaEnv(env);

  const prepare = options.prepare ?? prepareOrcaProvider;
  const prepared = await prepare({ env });
  if (!prepared) return false;

  runtime.registerProvider(ORCAROUTER_PROVIDER_ID, prepared.config);
  return true;
}

/** The registered provider's model count, for status output. */
export function registeredModelCount(config: OrcaProviderRegistration): number {
  return config.models?.length ?? 0;
}

/** Descriptor shape a registered provider hands the runtime. Exported for callers' typing. */
export type OrcaRegisteredModel = NonNullable<ProviderConfig['models']>[number];
