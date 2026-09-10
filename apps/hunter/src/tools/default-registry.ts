/**
 * The canonical `ToolRegistry` wiring every real adapter this package ships
 * — every one of these actually executes the named binary/HTTP call when
 * `run()` is called (see `recon/cli-adapters.ts` and `tools/live-adapters.ts`
 * for what "real" means for each). Building the registry never runs
 * anything: `register()` only stores the adapter, and `capability()` is
 * checked later, per action, by `pipeline/tool-bridge.ts` before any
 * adapter is ever invoked.
 *
 * Shannon is deliberately not registered here: it has its own dedicated,
 * separately-gated path in `pipeline/adaptive-loop.ts` (`shannon/
 * execution-adapter.ts`, requiring explicit `confirmed: true`), not the
 * generic recon bridge.
 */

import {
  AmassAdapter,
  CertificateTransparencyAdapter,
  ChaosAdapter,
  FfufAdapter,
  GauAdapter,
  HttpxAdapter,
  KatanaAdapter,
  NaabuAdapter,
  NucleiAdapter,
  SubfinderAdapter,
  WaybackurlsAdapter,
} from '../recon/cli-adapters.js';
import { BehavioralTestAdapter, JsCollectorAdapter } from './live-adapters.js';
import { ToolRegistry } from './registry.js';

export function buildDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(new SubfinderAdapter());
  registry.register(new AmassAdapter());
  registry.register(new ChaosAdapter());
  registry.register(new CertificateTransparencyAdapter());
  registry.register(new GauAdapter());
  registry.register(new WaybackurlsAdapter());
  registry.register(new HttpxAdapter());
  registry.register(new KatanaAdapter());
  registry.register(new NaabuAdapter());
  registry.register(new FfufAdapter());
  registry.register(new NucleiAdapter());
  registry.register(new JsCollectorAdapter());
  registry.register(new BehavioralTestAdapter());
  return registry;
}

/** Default per-`ActionKind` adapter preference order, cheapest/most-reliable first. Callers may override via `LiveReconOptions.preferredToolNames`. */
export const DEFAULT_PREFERRED_TOOL_NAMES: Readonly<Record<string, readonly string[]>> = {
  'passive-recon': ['certificate-transparency', 'subfinder', 'chaos', 'amass', 'gau', 'waybackurls'],
  'active-recon': ['httpx', 'katana', 'naabu', 'ffuf', 'nuclei'],
  'js-intelligence': ['js-collector'],
  'behavioral-diff': ['behavioral-test'],
};
