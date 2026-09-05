// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Admit committed producer observations or a complete existing class publication. */

import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { Check } from 'typebox/value';
import {
  blobShaFromHead,
  readCommittedFile,
  restorePathsFromHead,
  withGitRepoLock,
} from '../../services/git-manager.js';
import type { ReconciliationClass } from '../../types/reconciliation.js';
import { classEntrySchema, QUEUE_ENTRY_FIELD_NAMES } from '../queue-schemas.js';
import {
  ArtifactIntegrityError,
  PublicationConflictError,
  ReconciliationError,
  ReconciliationIoError,
  writeArtifact,
} from './artifact-store.js';
import type { PublicationContract, ReconciliationObservation } from './contracts.js';
import { isManifestCoherent, type PublicationManifest, readPublishedManifest } from './manifest.js';
import { isProducerId, isTaskReference } from './refs.js';
import type { PrepareResult, ProducerObservationsBody } from './stage-contracts.js';

// Duplicated from the identical set in publish.ts, which guards the fresh-publish path; this copy
// guards the lost-acknowledgement repair path below, where an already-published queue is read back
// and re-verified before being trusted. Both sets must list the same internal-only keys, or a key
// added to only one path could round-trip a leaked queue back into "coherent" on the other.
const FORBIDDEN_PUBLISHED_KEYS: ReadonlySet<string> = new Set([
  'producer_id',
  'primary_preference',
  'observation_key',
  'novelty',
  '_sastId',
  '_sast_id',
  'repository_id',
  'scan_run_id',
]);

function sha256Text(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

// Same defense as `preflightSymlinks` in publish.ts: a symlinked destination could redirect a write
// (here, the restore step below) outside the deliverables directory, so any symlink found is a
// conflict rather than something to write through.
async function rejectSymlinkDestinations(deliverablesDir: string, relativePaths: readonly string[]): Promise<void> {
  for (const relativePath of relativePaths) {
    try {
      const stat = await lstat(path.join(deliverablesDir, relativePath));
      if (stat.isSymbolicLink()) throw new PublicationConflictError('Refusing to repair a publication symlink');
    } catch (error) {
      if (isErrno(error, 'ENOENT')) continue;
      if (error instanceof ReconciliationError) throw error;
      throw new ReconciliationIoError('Unable to inspect a class publication destination');
    }
  }
}

/** The class-owned producer and published queue path. */
export function exploitationQueuePath(vulnerabilityClass: ReconciliationClass): string {
  return `${vulnerabilityClass}_exploitation_queue.json`;
}

/** The class-owned durable completion-marker path. */
export function reconciliationManifestPath(vulnerabilityClass: ReconciliationClass): string {
  return `${vulnerabilityClass}_reconciliation_manifest.json`;
}

/** The conditional standalone SAST-provenance path. */
export function sastProvenancePath(vulnerabilityClass: ReconciliationClass): string {
  return `sast_provenance_${vulnerabilityClass}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// A raw producer queue carries producer IDs and no merge structure. A task reference or a
// `merged_from` array means the queue was already normalized by a prior publication whose manifest
// is now missing, which is an incoherent state to be reported rather than reprocessed.
function looksNormalized(entry: Record<string, unknown>, vulnerabilityClass: ReconciliationClass): boolean {
  const id = entry.ID;
  return (typeof id === 'string' && isTaskReference(id, vulnerabilityClass)) || Array.isArray(entry.merged_from);
}

/**
 * Parse and strictly validate a committed producer queue before reconciliation ever touches it.
 *
 * Every entry must match its class's declared evidence schema and carry an ID in the VULN producer
 * namespace for this exact class; a queue that already looks normalized (see `looksNormalized`) or
 * carries a duplicate ID is rejected outright. The producer IDs minted or validated here are
 * internal identity: they exist to let reconciliation reason about and dedupe observations, and are
 * scrubbed before anything derived from this queue is published.
 */
function parseProducerQueue(raw: string, vulnerabilityClass: ReconciliationClass): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ArtifactIntegrityError('Producer queue is not valid JSON');
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.vulnerabilities)) {
    throw new ArtifactIntegrityError('Producer queue has no vulnerabilities array');
  }

  const schema = classEntrySchema(vulnerabilityClass);
  const seenIds = new Set<string>();
  for (const entry of parsed.vulnerabilities) {
    if (!isRecord(entry) || typeof entry.ID !== 'string') {
      throw new ArtifactIntegrityError('Producer queue entry is missing a string ID');
    }
    if (looksNormalized(entry, vulnerabilityClass)) {
      throw new PublicationConflictError('Normalized queue in HEAD has no coherent publication manifest');
    }
    if (!Check(schema, entry)) {
      throw new ArtifactIntegrityError(`Producer queue entry does not match the ${vulnerabilityClass} schema`);
    }
    if (!isProducerId(entry.ID, vulnerabilityClass, 'VULN')) {
      throw new ArtifactIntegrityError('Producer queue entry is outside its declared class/source namespace');
    }
    if (seenIds.has(entry.ID)) {
      throw new ArtifactIntegrityError('Producer queue contains a duplicate producer identifier');
    }
    seenIds.add(entry.ID);
  }
  return parsed.vulnerabilities as Record<string, unknown>[];
}

// Every producer-queue (pentest) observation is stamped `primary_preference: 'default'`, the losing
// side of the dedupe contract: if this observation is later merged with a SAST observation for the
// same vulnerability, the SAST evidence becomes the task's primary record instead of this one.
function toObservation(entry: Record<string, unknown>, evidenceKeys: readonly string[]): ReconciliationObservation {
  const evidence: Record<string, unknown> = {};
  for (const key of evidenceKeys) {
    if (key in entry) evidence[key] = entry[key];
  }
  return {
    ...evidence,
    producer_id: entry.ID as string,
    scan_source: 'vulnerability_analysis',
    primary_preference: 'default',
  } as ReconciliationObservation;
}

async function verifyCommittedConsumers(
  deliverablesDir: string,
  consumerFiles: ReadonlyArray<{ path: string; sha256: string }>,
): Promise<Map<string, string>> {
  const contentsByPath = new Map<string, string>();
  for (const consumer of consumerFiles) {
    const committed = await readCommittedFile(deliverablesDir, consumer.path);
    if (committed.state !== 'present') {
      throw new PublicationConflictError('Existing class publication is missing a committed consumer');
    }
    if (sha256Text(committed.contents) !== consumer.sha256) {
      throw new PublicationConflictError('Existing class publication consumer does not match its manifest');
    }
    contentsByPath.set(consumer.path, committed.contents);
  }
  return contentsByPath;
}

// Used only on the repair path below, where a manifest already exists in HEAD and the previously
// published queue is being read back rather than freshly built. Even a publication from a prior run
// gets this same forbidden-key check before it is trusted and adopted.
function containsForbiddenPublishedKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenPublishedKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, entry]) => FORBIDDEN_PUBLISHED_KEYS.has(key) || containsForbiddenPublishedKey(entry),
  );
}

/**
 * Re-verify the internal-identity boundary on a previously published queue before adopting it.
 *
 * A manifest existing in HEAD means some earlier run already published this class, but that
 * publication is only ever restored here, not blindly trusted: this confirms the queue's task IDs
 * match the manifest's lineage exactly, that no forbidden internal key survived, and that no
 * producer-ID token appears anywhere in the serialized queue. The lost-acknowledgement repair path
 * is a second place a boundary-violating queue could otherwise slip through, so it gets the same
 * fail-closed check as a fresh publish.
 */
function verifyPublishedQueue(
  contents: string,
  vulnerabilityClass: ReconciliationClass,
  lineage: Record<string, { primary: string; absorbed: string[] }>,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new PublicationConflictError('Existing published queue is not valid JSON');
  }
  if (!isRecord(parsed) || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.vulnerabilities)) {
    throw new PublicationConflictError('Existing published queue does not have the canonical envelope');
  }

  const queueTaskIds: string[] = [];
  for (const task of parsed.vulnerabilities) {
    if (!isRecord(task) || typeof task.ID !== 'string' || !isTaskReference(task.ID, vulnerabilityClass)) {
      throw new PublicationConflictError('Existing published queue contains an invalid task reference');
    }
    queueTaskIds.push(task.ID);
  }
  const lineageTaskIds = Object.keys(lineage);
  if (
    queueTaskIds.length !== lineageTaskIds.length ||
    queueTaskIds.some((taskId, index) => taskId !== lineageTaskIds[index])
  ) {
    throw new PublicationConflictError('Existing published queue and manifest lineage disagree');
  }
  if (containsForbiddenPublishedKey(parsed)) {
    throw new PublicationConflictError('Existing published queue retains an internal producer-only key');
  }
  const serialized = JSON.stringify(parsed);
  const producerIds = Object.values(lineage).flatMap((entry) => [entry.primary, ...entry.absorbed]);
  if (producerIds.some((producerId) => serialized.includes(producerId))) {
    throw new PublicationConflictError('Existing published queue retains an internal producer identifier');
  }
}

function samePathSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualPaths = new Set(actual);
  return actualPaths.size === actual.length && expected.every((expectedPath) => actualPaths.has(expectedPath));
}

/**
 * Resolve which optional output shape the committed manifest actually published.
 *
 * The standalone SAST-provenance file is the one publication member that legitimately differs
 * between runs: whether the static-analysis stage produced SARIF decides it. That is a property of
 * the run that published, not of the run resuming, so on the repair path the committed manifest is
 * the authority on which shape to expect — otherwise a resume whose SARIF outcome flipped would
 * conflict with an otherwise coherent publication. Only the two shapes a class can legally publish
 * are admitted; any other path set is handed back as this run's own contract and rejected by
 * `isManifestCoherent`.
 */
function contractForCommittedShape(
  contract: PublicationContract,
  manifest: PublicationManifest,
  vulnerabilityClass: ReconciliationClass,
): PublicationContract {
  const committedPaths = manifest.consumer_files.map((consumer) => consumer.path);
  const withoutProvenance = [exploitationQueuePath(vulnerabilityClass)];
  const withProvenance = [...withoutProvenance, sastProvenancePath(vulnerabilityClass)];
  for (const shape of [withoutProvenance, withProvenance]) {
    if (samePathSet(committedPaths, shape)) return { ...contract, requiredOutputPaths: shape };
  }
  return contract;
}

export interface PrepareClassReconciliationArgs {
  deliverablesDir: string;
  sessionId: string;
  vulnerabilityClass: ReconciliationClass;
  contract: PublicationContract;
  workspacesDir?: string;
}

/**
 * Prepare one class from committed `HEAD`, repairing an existing coherent publication when present.
 *
 * Runs entirely inside the Git critical section. Three outcomes: a coherent published manifest is
 * restored from HEAD and reported as `already_published` (the lost-acknowledgement repair path); a
 * present-but-incoherent or corrupt manifest is a hard conflict; otherwise the committed producer
 * queue is parsed and written as the first content-addressed artifact and reported as `pending`.
 */
export async function prepareClassReconciliation(args: PrepareClassReconciliationArgs): Promise<PrepareResult> {
  const queuePath = exploitationQueuePath(args.vulnerabilityClass);
  const manifestPath = reconciliationManifestPath(args.vulnerabilityClass);
  if (args.contract.manifestPath !== manifestPath) {
    throw new ArtifactIntegrityError('Publication contract names the wrong class manifest');
  }

  return withGitRepoLock(async (): Promise<PrepareResult> => {
    const manifestRead = await readPublishedManifest(args.deliverablesDir, manifestPath);
    if (manifestRead.state === 'invalid') {
      throw new PublicationConflictError(`Corrupt class manifest in HEAD: ${manifestRead.reason}`);
    }

    if (manifestRead.state === 'present') {
      const committedContract = contractForCommittedShape(
        args.contract,
        manifestRead.manifest,
        args.vulnerabilityClass,
      );
      if (
        !isManifestCoherent({
          manifest: manifestRead.manifest,
          sessionId: args.sessionId,
          vulnerabilityClass: args.vulnerabilityClass,
          contract: committedContract,
          producerQueuePath: queuePath,
        })
      ) {
        throw new PublicationConflictError('Class manifest does not cohere with the publication contract');
      }
      // Mirrors the same guard on the fresh-publish path: when the publication being repaired
      // declares no standalone provenance, a provenance file in HEAD is residue from an interrupted
      // publish that no manifest vouches for, so it is a conflict rather than something to adopt.
      const provenancePath = sastProvenancePath(args.vulnerabilityClass);
      if (!committedContract.requiredOutputPaths.includes(provenancePath)) {
        const unvouchedProvenance = await readCommittedFile(args.deliverablesDir, provenancePath);
        if (unvouchedProvenance.state !== 'absent') {
          throw new PublicationConflictError('Existing publication has provenance outside its exact manifest path set');
        }
      }
      const consumerContents = await verifyCommittedConsumers(
        args.deliverablesDir,
        manifestRead.manifest.consumer_files,
      );
      const publishedQueueContents = consumerContents.get(queuePath);
      if (publishedQueueContents === undefined) {
        throw new PublicationConflictError('Existing class publication manifest omits its queue consumer');
      }
      verifyPublishedQueue(publishedQueueContents, args.vulnerabilityClass, manifestRead.manifest.lineage);
      await rejectSymlinkDestinations(args.deliverablesDir, [...committedContract.requiredOutputPaths, manifestPath]);
      await restorePathsFromHead(args.deliverablesDir, [...committedContract.requiredOutputPaths, manifestPath]);
      return { outcome: 'already_published', manifestSha256: sha256Text(manifestRead.contents) };
    }

    const unexpectedProvenance = await readCommittedFile(
      args.deliverablesDir,
      sastProvenancePath(args.vulnerabilityClass),
    );
    if (unexpectedProvenance.state !== 'absent') {
      throw new PublicationConflictError('Pre-manifest class state contains standalone provenance');
    }

    const queueRead = await readCommittedFile(args.deliverablesDir, queuePath);
    if (queueRead.state === 'absent') {
      throw new PublicationConflictError('Producer queue is not committed in HEAD');
    }
    if (queueRead.state === 'corrupt') {
      throw new ArtifactIntegrityError('Producer queue is committed but unreadable');
    }
    const blobSha = await blobShaFromHead(args.deliverablesDir, queuePath);
    if (blobSha.state !== 'present') {
      throw new ArtifactIntegrityError('Producer queue has no committed blob identity');
    }

    const entries = parseProducerQueue(queueRead.contents, args.vulnerabilityClass);
    const evidenceKeys = QUEUE_ENTRY_FIELD_NAMES[args.vulnerabilityClass].filter((key) => key !== 'ID');
    const observations = entries.map((entry) => toObservation(entry, evidenceKeys));
    const body: ProducerObservationsBody = {
      observations,
      producer_queue: {
        path: queuePath,
        blob_sha: blobSha.sha,
        digest: sha256Text(queueRead.contents),
      },
    };
    const ref = await writeArtifact({
      sessionId: args.sessionId,
      ...(args.workspacesDir !== undefined ? { workspacesDir: args.workspacesDir } : {}),
      artifactKind: 'producer-observations',
      vulnerabilityClass: args.vulnerabilityClass,
      body,
      inputs: [],
      counts: { observations: observations.length },
    });
    return { outcome: 'pending', ref };
  });
}
