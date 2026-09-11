/**
 * World model.
 *
 * A generic, persisted node/edge graph rather than one bespoke class per
 * entity kind (program, asset, host, application, endpoint, parameter,
 * js-artifact, source-location, auth-state, role, resource, workflow,
 * integration) — see `WorldModelNodeKind` in types.ts. Every node keeps its
 * own provenance list (which source discovered it, when, at what
 * confidence), so `upsertNode` merges a second source's discovery of the
 * same asset into the existing node instead of creating a duplicate — this
 * is how cross-source correlation is tracked.
 *
 * A node's `scopeStatus` is set independently of discovery: an asset being
 * *in the world model* never means it is authorized to test — only
 * `scope/validator.ts` (or `recon/scope-tagging.ts` for bulk-tagging
 * discovered hosts against the program) may set `scopeStatus` to
 * "in-scope".
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  err,
  ok,
  type Provenance,
  type Result,
  type ScopeStatus,
  type VerificationStatus,
  type WorldModel,
  type WorldModelEdge,
  type WorldModelNode,
  type WorldModelNodeKind,
  type WorldModelRelation,
} from '../types.js';

export function emptyWorldModel(): WorldModel {
  return { nodes: [], edges: [] };
}

export function worldModelFilePath(workspaceDir: string, engagementId: string): string {
  return join(workspaceDir, 'engagements', engagementId, 'world-model.json');
}

export async function saveWorldModel(workspaceDir: string, engagementId: string, model: WorldModel): Promise<void> {
  const filePath = worldModelFilePath(workspaceDir, engagementId);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
}

export async function loadWorldModel(workspaceDir: string, engagementId: string): Promise<Result<WorldModel, string>> {
  const filePath = worldModelFilePath(workspaceDir, engagementId);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok(emptyWorldModel());
    }
    return err(`could not read world model "${filePath}": ${(error as Error).message}`);
  }
  try {
    return ok(JSON.parse(raw) as WorldModel);
  } catch (error) {
    return err(`world model file "${filePath}" is not valid JSON: ${(error as Error).message}`);
  }
}

export interface UpsertNodeInput {
  readonly kind: WorldModelNodeKind;
  readonly label: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly source: string;
  readonly confidence: number;
  readonly scopeStatus?: ScopeStatus;
  readonly verificationStatus?: VerificationStatus;
}

export interface UpsertResult {
  readonly model: WorldModel;
  readonly node: WorldModelNode;
  readonly isNew: boolean;
}

function nodeKey(kind: WorldModelNodeKind, label: string): string {
  return `${kind}::${label.trim().toLowerCase()}`;
}

/**
 * Insert a node, or — if a node of the same kind+label already exists —
 * merge this discovery into it: add the new source to its provenance list
 * (unless that source already contributed), merge attributes, and widen
 * scope/verification status only when the caller explicitly supplies one.
 */
export function upsertNode(model: WorldModel, input: UpsertNodeInput): UpsertResult {
  const key = nodeKey(input.kind, input.label);
  const now = new Date().toISOString();
  const provenance: Provenance = { source: input.source, discoveredAt: now, confidence: input.confidence };
  const existingIndex = model.nodes.findIndex((n) => nodeKey(n.kind, n.label) === key);

  if (existingIndex === -1) {
    const node: WorldModelNode = {
      id: `node-${randomUUID()}`,
      kind: input.kind,
      label: input.label,
      attributes: input.attributes ?? {},
      provenance: [provenance],
      scopeStatus: input.scopeStatus ?? 'unknown',
      verificationStatus: input.verificationStatus ?? 'unverified',
      firstSeenAt: now,
      lastSeenAt: now,
    };
    return { model: { nodes: [...model.nodes, node], edges: model.edges }, node, isNew: true };
  }

  const existing = model.nodes[existingIndex];
  if (!existing) {
    throw new Error('unreachable: existingIndex was found but node is missing');
  }
  const alreadyFromSource = existing.provenance.some((p) => p.source === input.source);
  const updated: WorldModelNode = {
    ...existing,
    attributes: { ...existing.attributes, ...(input.attributes ?? {}) },
    provenance: alreadyFromSource ? existing.provenance : [...existing.provenance, provenance],
    scopeStatus: input.scopeStatus ?? existing.scopeStatus,
    verificationStatus: input.verificationStatus ?? existing.verificationStatus,
    lastSeenAt: now,
  };
  const nodes = [...model.nodes];
  nodes[existingIndex] = updated;
  return { model: { nodes, edges: model.edges }, node: updated, isNew: false };
}

export function addEdge(model: WorldModel, fromId: string, toId: string, relation: WorldModelRelation): WorldModel {
  const alreadyExists = model.edges.some((e) => e.fromId === fromId && e.toId === toId && e.relation === relation);
  if (alreadyExists) {
    return model;
  }
  const edge: WorldModelEdge = {
    id: `edge-${randomUUID()}`,
    fromId,
    toId,
    relation,
    discoveredAt: new Date().toISOString(),
  };
  return { nodes: model.nodes, edges: [...model.edges, edge] };
}

export function nodesByKind(model: WorldModel, kind: WorldModelNodeKind): readonly WorldModelNode[] {
  return model.nodes.filter((n) => n.kind === kind);
}

export function findNode(model: WorldModel, kind: WorldModelNodeKind, label: string): WorldModelNode | undefined {
  return model.nodes.find((n) => nodeKey(n.kind, n.label) === nodeKey(kind, label));
}

export function relatedNodes(
  model: WorldModel,
  nodeId: string,
  relation?: WorldModelRelation,
): readonly WorldModelNode[] {
  const edgeMatches = (edge: WorldModelEdge) =>
    edge.fromId === nodeId && (relation === undefined || edge.relation === relation);
  const targetIds = new Set(model.edges.filter(edgeMatches).map((e) => e.toId));
  return model.nodes.filter((n) => targetIds.has(n.id));
}

/** Nodes discovered independently by more than one source — the recon "correlation" signal. */
export function crossSourceCorrelatedNodes(model: WorldModel): readonly WorldModelNode[] {
  return model.nodes.filter((n) => n.provenance.length > 1);
}

/** Updates a node's verification status (e.g. a later observation contradicts what an earlier one implied) and bumps lastSeenAt. */
export function setVerificationStatus(model: WorldModel, nodeId: string, status: VerificationStatus): WorldModel {
  const now = new Date().toISOString();
  return {
    nodes: model.nodes.map((n) => (n.id === nodeId ? { ...n, verificationStatus: status, lastSeenAt: now } : n)),
    edges: model.edges,
  };
}

/** Nodes not corroborated or refreshed by any source within `ttlMs` of `now` — candidates for re-investigation or exclusion from prioritization. */
export function staleNodes(model: WorldModel, now: string, ttlMs: number): readonly WorldModelNode[] {
  const nowMs = new Date(now).getTime();
  return model.nodes.filter((n) => nowMs - new Date(n.lastSeenAt).getTime() > ttlMs);
}
