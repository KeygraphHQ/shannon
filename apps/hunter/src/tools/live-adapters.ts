/**
 * `ToolAdapter` wrappers around the live JS/source-map collector
 * (`recon/js-live.ts`) and live behavioral testing (`recon/behavioral-live.ts`),
 * so both fit the same `ToolRegistry`/`buildInputFromAction` bridge as the
 * CLI-binary adapters in `recon/cli-adapters.ts` — gap #1 explicitly lists
 * both alongside subfinder/httpx/nuclei/etc. Neither wraps a local binary,
 * so `capability()` only ever reports network availability, never a
 * missing-tool condition; both perform real `fetch` requests when run — the
 * same live network calls `recon/live-pipeline.test.ts` already exercises
 * against `testing/local-app-server.ts`.
 */

import { type AuthStateHeaders, compareAuthStatesLive } from '../recon/behavioral-live.js';
import { analyzeLiveApplication } from '../recon/js-live.js';
import type { ActionKind, ToolCapability, ToolRisk, ToolScopeRequirement } from '../types.js';
import type { ToolAdapter, ToolRunResult } from './registry.js';

export interface JsCollectorInput {
  readonly pageUrl: string;
  readonly assetRef: string;
  readonly engagementId: string;
}

export class JsCollectorAdapter implements ToolAdapter<JsCollectorInput> {
  readonly name = 'js-collector';
  readonly kind: ActionKind = 'js-intelligence';
  readonly scopeRequirement: ToolScopeRequirement = 'active-in-scope';
  readonly requiresAuthorization = true;
  readonly cost = 0.2;
  readonly risk: ToolRisk = 'low';
  readonly timeoutMs = 15_000;

  capability(): Promise<ToolCapability> {
    return Promise.resolve({
      available: true,
      reason: 'pure HTTP fetch; no local binary required',
      version: undefined,
    });
  }

  async run(input: JsCollectorInput): Promise<ToolRunResult> {
    try {
      const result = await analyzeLiveApplication(input.pageUrl, input.assetRef, input.engagementId, {
        timeoutMs: this.timeoutMs,
      });
      return {
        ok: true,
        summary: `js-collector analyzed ${result.scriptsAnalyzed} script(s), recovered ${result.sourceMapsRecovered} source map(s), ${result.observations.length} observation(s)`,
        discoveries: result.discoveries,
        observations: result.observations,
        raw: result,
      };
    } catch (error) {
      return {
        ok: false,
        summary: `js-collector failed: ${(error as Error).message}`,
        discoveries: [],
        observations: [],
        raw: undefined,
      };
    }
  }
}

export interface BehavioralTestInput {
  readonly endpointUrl: string;
  readonly assetRef: string;
  readonly engagementId: string;
  readonly headersByState: AuthStateHeaders;
}

export class BehavioralTestAdapter implements ToolAdapter<BehavioralTestInput> {
  readonly name = 'behavioral-test';
  readonly kind: ActionKind = 'behavioral-diff';
  readonly scopeRequirement: ToolScopeRequirement = 'active-in-scope';
  readonly requiresAuthorization = true;
  readonly cost = 0.35;
  readonly risk: ToolRisk = 'low';
  readonly timeoutMs = 15_000;

  capability(): Promise<ToolCapability> {
    return Promise.resolve({
      available: true,
      reason: 'pure HTTP fetch; no local binary required',
      version: undefined,
    });
  }

  async run(input: BehavioralTestInput): Promise<ToolRunResult> {
    try {
      const result = await compareAuthStatesLive(
        input.engagementId,
        input.assetRef,
        input.endpointUrl,
        input.headersByState,
        this.timeoutMs,
      );
      return {
        ok: true,
        summary: `behavioral-test queried ${result.statesQueried} auth state(s), ${result.observations.length} observation(s)`,
        discoveries: [],
        observations: result.observations,
        raw: result,
      };
    } catch (error) {
      return {
        ok: false,
        summary: `behavioral-test failed: ${(error as Error).message}`,
        discoveries: [],
        observations: [],
        raw: undefined,
      };
    }
  }
}
