/**
 * Data provenance / flow graph.
 *
 * Tracks an interesting value through transformations — SOURCE ->
 * TRANSFORMATION -> DESTINATION/SINK -> OBSERVED EFFECT — as a distinct,
 * append-only edge list persisted alongside (never inside) the node/edge
 * `WorldModel` (`worldmodel/graph.ts`). Kept separate rather than folded
 * into `WorldModel.edges` because a provenance edge carries fields
 * (transformation, verification state, round) that a structural
 * program/asset/endpoint edge never needs, and this keeps `WorldModel`'s
 * existing persisted shape — and every test that already round-trips it —
 * untouched.
 *
 * Suspicious transformations are not just logged: `provenanceToHypotheses`
 * turns a pattern like "URL parameter -> transformed into cookie value ->
 * application behavior changed" into a genuine research hypothesis, so this
 * graph feeds `reasoning/cascade.ts` rather than sitting inert.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { err, type Hypothesis, ok, type Provenance, type Result } from '../types.js';

export type ProvenanceSourceKind =
  | 'url-parameter'
  | 'form-field'
  | 'header'
  | 'cookie'
  | 'api-response'
  | 'resource-id'
  | 'role'
  | 'js-configuration'
  | 'user-input';

export type ProvenanceSinkKind =
  | 'cookie'
  | 'header'
  | 'request-parameter'
  | 'redirect'
  | 'server-side-processing'
  | 'subsequent-request'
  | 'api-endpoint'
  | 'workflow'
  | 'authorization-decision'
  | 'dom-sink';

export type ProvenanceVerificationState = 'unverified' | 'verified' | 'contradicted';

export interface ProvenanceEdge {
  readonly id: string;
  readonly engagementId: string;
  readonly sourceKind: ProvenanceSourceKind;
  readonly sourceRef: string;
  readonly transformation: string;
  readonly sinkKind: ProvenanceSinkKind;
  readonly sinkRef: string;
  readonly observation: string;
  readonly provenance: Provenance;
  readonly round: number | undefined;
  readonly verificationState: ProvenanceVerificationState;
  readonly recordedAt: string;
}

export interface NewProvenanceEdgeInput {
  readonly engagementId: string;
  readonly sourceKind: ProvenanceSourceKind;
  readonly sourceRef: string;
  readonly transformation: string;
  readonly sinkKind: ProvenanceSinkKind;
  readonly sinkRef: string;
  readonly observation: string;
  readonly source: string;
  readonly confidence: number;
  readonly round?: number;
  readonly verificationState?: ProvenanceVerificationState;
}

export function recordProvenanceEdge(input: NewProvenanceEdgeInput): ProvenanceEdge {
  const now = new Date().toISOString();
  return {
    id: `prov-${randomUUID()}`,
    engagementId: input.engagementId,
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    transformation: input.transformation,
    sinkKind: input.sinkKind,
    sinkRef: input.sinkRef,
    observation: input.observation,
    provenance: { source: input.source, discoveredAt: now, confidence: input.confidence },
    round: input.round,
    verificationState: input.verificationState ?? 'unverified',
    recordedAt: now,
  };
}

export function provenanceFilePath(workspaceDir: string, engagementId: string): string {
  return join(workspaceDir, 'engagements', engagementId, 'provenance.json');
}

export async function saveProvenanceGraph(
  workspaceDir: string,
  engagementId: string,
  edges: readonly ProvenanceEdge[],
): Promise<void> {
  const filePath = provenanceFilePath(workspaceDir, engagementId);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(edges, null, 2)}\n`, 'utf8');
}

export async function loadProvenanceGraph(
  workspaceDir: string,
  engagementId: string,
): Promise<Result<readonly ProvenanceEdge[], string>> {
  const filePath = provenanceFilePath(workspaceDir, engagementId);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok([]);
    }
    return err(`could not read provenance graph "${filePath}": ${(error as Error).message}`);
  }
  try {
    return ok(JSON.parse(raw) as readonly ProvenanceEdge[]);
  } catch (error) {
    return err(`provenance graph file "${filePath}" is not valid JSON: ${(error as Error).message}`);
  }
}

/** Edges whose sink kind is one a downstream security decision plausibly reads (never blindly "everything is suspicious"). */
const SECURITY_RELEVANT_SINKS: ReadonlySet<ProvenanceSinkKind> = new Set([
  'cookie',
  'authorization-decision',
  'redirect',
  'workflow',
  'dom-sink',
  'server-side-processing',
]);

/**
 * A source feeding a sink of a kind that plausibly affects security
 * behavior is itself research-worthy — not because it is a vulnerability,
 * but because a value moving from user control into an authorization- or
 * session-relevant sink is exactly the pattern worth an experiment over.
 * Untested/attacker-influenceable sources (url-parameter, form-field,
 * header, user-input) are weighted higher than already-trusted-looking
 * ones (api-response, role) reaching the same sink.
 */
const UNTRUSTED_SOURCE_KINDS: ReadonlySet<ProvenanceSourceKind> = new Set([
  'url-parameter',
  'form-field',
  'header',
  'user-input',
  'resource-id',
  // A client-side role check or client-side configuration is itself the
  // suspicious element here, not because the *value* is attacker-supplied,
  // but because the *enforcement* runs in an environment the operator does
  // not control — the same reasoning js-intel.ts documents for auth-logic
  // and feature-flag observations.
  'role',
  'js-configuration',
]);

export interface ProvenanceHypothesisSeed {
  readonly edge: ProvenanceEdge;
  readonly statement: string;
  readonly vulnClass: string;
  readonly confidence: number;
}

/** Finds provenance edges worth turning into a hypothesis — never all edges, only ones where an untrusted source reaches a security-relevant sink. */
export function findSuspiciousTransformations(edges: readonly ProvenanceEdge[]): readonly ProvenanceHypothesisSeed[] {
  const seeds: ProvenanceHypothesisSeed[] = [];
  for (const edge of edges) {
    if (!SECURITY_RELEVANT_SINKS.has(edge.sinkKind)) continue;
    if (edge.verificationState === 'contradicted') continue;
    const untrusted = UNTRUSTED_SOURCE_KINDS.has(edge.sourceKind);
    const baseConfidence = untrusted ? 0.6 : 0.35;
    const confidence = Number(Math.min(1, baseConfidence + edge.provenance.confidence * 0.2).toFixed(4));
    const vulnClass = vulnClassForSink(edge.sinkKind, untrusted);
    seeds.push({
      edge,
      vulnClass,
      confidence,
      statement: `${edge.sourceKind} "${edge.sourceRef}" flows through "${edge.transformation}" into ${edge.sinkKind} "${edge.sinkRef}" (${edge.observation})`,
    });
  }
  return seeds;
}

function vulnClassForSink(sink: ProvenanceSinkKind, untrusted: boolean): string {
  if (!untrusted) return 'provenance-note';
  switch (sink) {
    case 'dom-sink':
      return 'xss';
    case 'authorization-decision':
      return 'authz';
    case 'redirect':
      return 'open-redirect';
    case 'cookie':
      return 'session-manipulation';
    case 'workflow':
      return 'workflow-bypass';
    default:
      return 'provenance-tainted-flow';
  }
}

/**
 * Turns suspicious transformations into real `Hypothesis` records — this is
 * the "this should create a research hypothesis rather than simply being
 * logged" requirement. Grouped by (vulnClass, sinkRef) so ten edges into
 * the same sink become one hypothesis, not ten near-duplicates.
 */
export function provenanceToHypotheses(edges: readonly ProvenanceEdge[], engagementId: string): readonly Hypothesis[] {
  const seeds = findSuspiciousTransformations(edges);
  const groups = new Map<string, ProvenanceHypothesisSeed[]>();
  for (const seed of seeds) {
    if (seed.vulnClass === 'provenance-note') continue;
    const key = `${seed.vulnClass}::${seed.edge.sinkRef}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(seed);
    else groups.set(key, [seed]);
  }

  const now = new Date().toISOString();
  return Array.from(groups.entries()).map(([key, group]) => {
    const [vulnClass] = key.split('::');
    const confidence = Number((group.reduce((s, g) => s + g.confidence, 0) / group.length).toFixed(4));
    return {
      id: `hyp-${randomUUID()}`,
      engagementId,
      statement: `Data-flow analysis: ${group.map((g) => g.statement).join('; ')}`,
      vulnClass: vulnClass ?? 'provenance-tainted-flow',
      assetRef: group[0]?.edge.sinkRef ?? '',
      supportingObservationIds: [],
      contradictingObservationIds: [],
      potentialImpact: confidence >= 0.7 ? 'high' : confidence >= 0.5 ? 'medium' : 'low',
      confidence,
      priorityScore: Number((confidence * 0.6 + 0.1 * group.length).toFixed(4)),
      informationGain: Number((1 - confidence).toFixed(4)),
      requiredEvidence: ['a controlled experiment confirming the source value actually reaches the sink unmodified'],
      nextInvestigation: `trace and confirm the "${group[0]?.edge.transformation}" transformation with a distinguishing marker value`,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    } satisfies Hypothesis;
  });
}
