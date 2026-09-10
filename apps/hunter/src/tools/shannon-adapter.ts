/**
 * Shannon tool adapter.
 *
 * Registered under the name "shannon". `run()` only ever plans an
 * invocation — it never spawns Shannon. Live execution goes through
 * `shannon/execution-adapter.ts:ShannonExecutionAdapter`, which requires an
 * explicit `confirmed: true` this adapter never supplies, so registering
 * and running this adapter can never be the thing that triggers a live scan.
 */

import { buildShannonInvocation } from '../shannon/config.js';
import { planInvocation } from '../shannon/invoke.js';
import type { ToolCapability } from '../types.js';
import type { ToolAdapter, ToolRunResult } from './registry.js';

export interface ShannonAdapterInput {
  readonly url: string;
  readonly repo: string;
  readonly workspace?: string;
}

export class ShannonAdapter implements ToolAdapter<ShannonAdapterInput> {
  readonly name = 'shannon';
  readonly kind = 'shannon' as const;
  readonly scopeRequirement = 'active-in-scope' as const;
  readonly requiresAuthorization = true;
  readonly cost = 0.6;
  readonly risk = 'medium' as const;
  readonly timeoutMs = 0; // Shannon's own runtime is unbounded from Hunter's point of view; not invoked here regardless.

  /**
   * Whether the Shannon CLI mechanism can be invoked at all — always true,
   * since it runs via `npx` with no local install requirement. Per-target
   * eligibility (does a local source repo actually exist for *this*
   * target?) is a separate, execution-time gate — see
   * `shannon/eligibility.ts:checkShannonEligibility`, which the adaptive
   * loop checks before ever selecting this adapter for a given action.
   */
  capability(): Promise<ToolCapability> {
    return Promise.resolve({ available: true, reason: 'invoked via npx; no local install required', version: '1.9.0' });
  }

  run(input: ShannonAdapterInput): Promise<ToolRunResult> {
    const built = buildShannonInvocation(input);
    if (!built.ok) {
      return Promise.resolve({ ok: false, summary: built.error, discoveries: [], observations: [], raw: undefined });
    }
    const plan = planInvocation(built.value);
    return Promise.resolve({
      ok: true,
      summary: `dry-run: would invoke Shannon as: ${plan.commandLine}`,
      discoveries: [],
      observations: [],
      raw: plan,
    });
  }
}
