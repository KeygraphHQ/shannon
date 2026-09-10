/**
 * Local autonomous simulation loader.
 *
 * Assembles a complete `AdaptiveHuntInput` from the bundled offline
 * simulation under `fixtures/simulation/` — multiple domains/subdomains
 * discovered by overlapping passive sources, active-recon endpoint
 * discovery, two JS bundles (one with a DOM-XSS candidate sink, one with a
 * secret/internal-host/feature-flag mix), a behavioral auth-state
 * comparison, a captured Shannon output for the one finding that gets
 * validated, and a small set of "investigation follow-up" fixtures used
 * when the loop's next-best-action picks a lead to dig into further
 * (including one that turns out to be a false lead). No external target is
 * ever contacted — every source here is `LocalFixtureReconSource` reading a
 * file from disk.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { StateResponseMap } from '../recon/behavioral.js';
import { LocalFixtureReconSource } from '../recon/sources.js';
import type { Observation, ObservationSource, RawDiscovery, WorldModelNodeKind } from '../types.js';
import type {
  AdaptiveHuntInput,
  BehavioralFixtureInput,
  InvestigationFixture,
  JsArtifactInput,
} from './adaptive-loop.js';

function fixturePath(relativePath: string): string {
  return fileURLToPath(new URL(`../../fixtures/simulation/${relativePath}`, import.meta.url));
}

interface FollowupObservationRecord {
  readonly vulnClass: string;
  readonly title: string;
  readonly description: string;
  readonly severityHint: string;
  readonly confidenceHint: string;
  readonly verified: boolean;
  readonly tags?: readonly string[];
}

interface FollowupDiscoveryRecord {
  readonly kind: WorldModelNodeKind;
  readonly label: string;
  readonly confidence: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

interface FollowupFixtureRecord {
  readonly actionKey: string;
  readonly discoveries?: readonly FollowupDiscoveryRecord[];
  readonly observations?: readonly FollowupObservationRecord[];
}

const OBSERVATION_SOURCE_BY_ACTION_KIND: Readonly<Record<string, ObservationSource>> = {
  'behavioral-diff': 'behavioral-diff',
  'active-recon': 'active-recon',
  'js-intelligence': 'js-intelligence',
  'manual-review': 'manual',
  shannon: 'shannon',
};

let followupCounter = 0;
function nextFollowupObservationId(): string {
  followupCounter += 1;
  return `obs-followup-${followupCounter}`;
}

export async function loadInvestigationFixtures(
  filePath: string,
  engagementId: string,
): Promise<Map<string, InvestigationFixture>> {
  const raw = JSON.parse(await readFile(filePath, 'utf8')) as readonly FollowupFixtureRecord[];
  const map = new Map<string, InvestigationFixture>();
  const now = new Date().toISOString();

  for (const record of raw) {
    const separatorIndex = record.actionKey.indexOf('::');
    const kind = record.actionKey.slice(0, separatorIndex);
    const targetRef = record.actionKey.slice(separatorIndex + 2);

    const discoveries: RawDiscovery[] = (record.discoveries ?? []).map((d) => ({
      source: kind,
      kind: d.kind,
      label: d.label,
      confidence: d.confidence,
      attributes: d.attributes ?? {},
      discoveredAt: now,
    }));

    const observations: Observation[] = (record.observations ?? []).map((o) => ({
      id: nextFollowupObservationId(),
      engagementId,
      source: OBSERVATION_SOURCE_BY_ACTION_KIND[kind] ?? 'manual',
      assetRef: targetRef,
      vulnClass: o.vulnClass,
      title: o.title,
      description: o.description,
      severityHint: o.severityHint,
      confidenceHint: o.confidenceHint,
      verified: o.verified,
      tags: o.tags ?? [],
      collectedAt: now,
    }));

    map.set(record.actionKey, { discoveries, observations });
  }
  return map;
}

export interface BundledSimulationOptions {
  readonly engagementId: string;
  readonly workspaceDir: string;
  readonly maxRounds: number;
}

/** Builds the full input for `runAdaptiveHunt` against the bundled offline simulation scenario. */
export async function buildBundledSimulationInput(options: BundledSimulationOptions): Promise<AdaptiveHuntInput> {
  const passiveSources = [
    new LocalFixtureReconSource('subfinder', fixturePath('passive/subfinder.json')),
    new LocalFixtureReconSource('ct-logs', fixturePath('passive/ct-logs.json')),
    new LocalFixtureReconSource('amass', fixturePath('passive/amass.json')),
  ];
  const activeSources = [new LocalFixtureReconSource('httpx', fixturePath('active/httpx.json'))];

  const jsArtifacts: JsArtifactInput[] = [
    {
      sourceRef: 'bundle-search.js',
      assetRef: 'https://app.example.com/search',
      content: await readFile(fixturePath('js/bundle-search.js'), 'utf8'),
    },
    {
      sourceRef: 'bundle-admin.js',
      assetRef: 'https://app.example.com/internal/admin/users',
      content: await readFile(fixturePath('js/bundle-admin.js'), 'utf8'),
    },
  ];

  const behavioralRaw = JSON.parse(await readFile(fixturePath('behavioral/admin-users-auth-states.json'), 'utf8')) as {
    readonly assetRef: string;
    readonly endpoint: string;
    readonly responses: StateResponseMap;
  };
  const behavioralFixtures: BehavioralFixtureInput[] = [behavioralRaw];

  const investigationFixtures = await loadInvestigationFixtures(
    fixturePath('investigation-followups.json'),
    options.engagementId,
  );

  const shannonOutputsByAsset = new Map<string, string>([
    ['https://app.example.com/search', fixturePath('shannon-output/xss-search.json')],
  ]);

  return {
    engagementId: options.engagementId,
    programScopePath: fixturePath('program.json'),
    url: 'https://app.example.com',
    repoPath: fixturePath('.'),
    workspaceDir: options.workspaceDir,
    maxRounds: options.maxRounds,
    passiveSources,
    activeSources,
    jsArtifacts,
    behavioralFixtures,
    investigationFixtures,
    shannonOutputsByAsset,
  };
}
