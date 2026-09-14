/**
 * Wraps the real recon `ToolAdapter`s (`recon/cli-adapters.ts`) as bootstrap
 * `ReconSource`s.
 *
 * `pipeline/adaptive-loop.ts`'s bootstrap phase (`DISCOVER`/`ENUMERATE`,
 * before the round loop starts) only ever accepts `ReconSource[]`
 * (`isAvailable()`/`discover(): RawDiscovery[]`) — a different, narrower
 * interface than the `ToolAdapter<TInput>` (`capability()`/`run(): ToolRunResult`)
 * that `pipeline/tool-bridge.ts` drives during the round loop's own
 * investigation actions. Before this module, the only `ReconSource`
 * implementation this package shipped was `sources.ts:LocalFixtureReconSource`
 * — real command-line tools could investigate a live target once selected
 * by the round loop, but could never seed the *initial* hypotheses a live
 * engagement needs the round loop to have anything to select in the first
 * place.
 *
 * `reconSourceFromToolAdapter` is a thin, generic bridge: a bootstrap
 * `ReconSource`'s `discover()` only ever returns `RawDiscovery[]`, so any
 * `Observation`s a wrapped adapter's `run()` also produces (e.g. nuclei's
 * candidate-vulnerability observations) are intentionally not surfaced here
 * — that is exactly why only tools whose bootstrap value is pure discovery
 * (subdomain/host/URL enumeration) are wrapped by `buildLiveBootstrapSources`
 * below, never ffuf/nuclei, which stay reachable only through the round
 * loop's own tool-bridge gate chain, where their observations are not
 * silently dropped.
 */

import type { ToolAdapter, ToolRegistry } from '../tools/registry.js';
import type { ReconSource } from './sources.js';

export function reconSourceFromToolAdapter<TInput>(
  name: string,
  adapter: ToolAdapter<TInput>,
  buildInput: () => TInput,
): ReconSource {
  return {
    name,
    isAvailable: async () => (await adapter.capability()).available,
    discover: async () => {
      const result = await adapter.run(buildInput());
      return result.discoveries;
    },
  };
}

export interface LiveBootstrapSourcesOptions {
  /** Required to include amass — modern Amass writes to a directory, not stdout (see cli-adapters.ts). Omitted, amass is left out rather than run with an invalid input. */
  readonly amassOutputDir?: string;
}

export interface LiveBootstrapSources {
  readonly passiveSources: readonly ReconSource[];
  readonly activeSources: readonly ReconSource[];
}

/**
 * Builds the passive/active `ReconSource[]` for a live bootstrap phase
 * against `domain`/`url`, from whichever of the default registry's
 * discovery-shaped adapters are actually registered. Every adapter this
 * wraps still goes through its own real `capability()` check — an
 * uninstalled or misidentified tool (`recon/sources.ts:verifyToolIdentity`)
 * simply reports itself unavailable, exactly as it already does when driven
 * directly through the tool-bridge.
 */
export function buildLiveBootstrapSources(
  registry: ToolRegistry,
  domain: string,
  url: string,
  options: LiveBootstrapSourcesOptions = {},
): LiveBootstrapSources {
  const passiveSources: ReconSource[] = [];
  const passiveDomainAdapters = ['certificate-transparency', 'subfinder', 'chaos', 'gau', 'waybackurls'];
  for (const name of passiveDomainAdapters) {
    const adapter = registry.get(name);
    if (adapter) {
      passiveSources.push(reconSourceFromToolAdapter(name, adapter, () => ({ domain }) as never));
    }
  }
  const amassAdapter = options.amassOutputDir ? registry.get('amass') : undefined;
  if (amassAdapter) {
    const outputDir = options.amassOutputDir as string;
    passiveSources.push(reconSourceFromToolAdapter('amass', amassAdapter, () => ({ domain, outputDir }) as never));
  }

  const activeSources: ReconSource[] = [];
  for (const name of ['httpx', 'katana']) {
    const adapter = registry.get(name);
    if (adapter) {
      activeSources.push(reconSourceFromToolAdapter(name, adapter, () => ({ url }) as never));
    }
  }
  const naabuAdapter = registry.get('naabu');
  if (naabuAdapter) {
    activeSources.push(reconSourceFromToolAdapter('naabu', naabuAdapter, () => ({ host: domain }) as never));
  }

  return { passiveSources, activeSources };
}
