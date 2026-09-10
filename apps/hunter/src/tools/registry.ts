/**
 * Tool adapter/registry.
 *
 * A `ToolAdapter` wraps one execution engine (Shannon, or a real recon
 * binary such as httpx/ffuf/nuclei — see `recon/cli-adapters.ts`) behind a
 * single `run` contract, carrying enough metadata (cost, risk, scope/
 * authorization requirements, timeout) that a policy layer can decide
 * whether running it is appropriate *before* it ever runs. `capability()`
 * is always checked first: a tool must report whether it can even run
 * (binary present, correct identity, required credentials configured)
 * without ever being invoked to find out.
 */

import type {
  ActionKind,
  Observation,
  RawDiscovery,
  ToolCapability,
  ToolRisk,
  ToolScopeRequirement,
} from '../types.js';

export interface ToolRunResult {
  readonly ok: boolean;
  readonly summary: string;
  readonly discoveries: readonly RawDiscovery[];
  readonly observations: readonly Observation[];
  readonly raw: unknown;
}

export interface ToolAdapter<TInput> {
  readonly name: string;
  readonly kind: ActionKind;
  readonly scopeRequirement: ToolScopeRequirement;
  readonly requiresAuthorization: boolean;
  readonly cost: number;
  readonly risk: ToolRisk;
  readonly timeoutMs: number;
  capability(): Promise<ToolCapability>;
  run(input: TInput): Promise<ToolRunResult>;
}

export class ToolRegistry {
  private readonly adapters = new Map<string, ToolAdapter<never>>();

  register<TInput>(adapter: ToolAdapter<TInput>): void {
    this.adapters.set(adapter.name, adapter as ToolAdapter<never>);
  }

  get(name: string): ToolAdapter<never> | undefined {
    return this.adapters.get(name);
  }

  list(): readonly string[] {
    return Array.from(this.adapters.keys());
  }

  /** All registered adapters for a given action kind, in registration order. */
  byKind(kind: ActionKind): readonly ToolAdapter<never>[] {
    return Array.from(this.adapters.values()).filter((adapter) => adapter.kind === kind);
  }

  /** The first adapter for `kind`, in `preferredNames` order, that reports itself capable right now. */
  async firstAvailable(kind: ActionKind, preferredNames: readonly string[]): Promise<ToolAdapter<never> | undefined> {
    const candidates = preferredNames
      .map((name) => this.adapters.get(name))
      .filter((adapter): adapter is ToolAdapter<never> => adapter !== undefined && adapter.kind === kind);
    for (const adapter of candidates) {
      const capability = await adapter.capability();
      if (capability.available) {
        return adapter;
      }
    }
    return undefined;
  }
}
