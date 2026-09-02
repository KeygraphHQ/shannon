// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Deterministic OSS queue shaping and lost-acknowledgement-safe class publication. */

import { createHash, randomUUID } from 'node:crypto';
import { lstat, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  blobShaFromHead,
  commitExactPaths,
  ExactPathCommitMismatchError,
  lastCommitForPathAtHead,
  readCommittedFile,
  restorePathsFromHead,
  withGitRepoLock,
} from '../../services/git-manager.js';
import type { ActivityLogger } from '../../types/activity-logger.js';
import type { ReconciliationClass } from '../../types/reconciliation.js';
import {
  ArtifactIntegrityError,
  PublicationConflictError,
  ReconciliationError,
  ReconciliationIoError,
  readArtifact,
} from './artifact-store.js';
import type { ArtifactInputDigest, ArtifactRef, PublicationContract, ReconciliationObservation } from './contracts.js';
import {
  isManifest,
  isManifestCoherent,
  type ManifestLineageEntry,
  type PublicationManifest,
  readPublishedManifest,
} from './manifest.js';
import { mintTaskReferences } from './materialize-core.js';
import { exploitationQueuePath, reconciliationManifestPath, sastProvenancePath } from './prepare.js';
import { isProducerId, isTaskReference } from './refs.js';
import { RECONCILIATION_SCHEMA_VERSION } from './schema-version.js';
import type { FixedTasksBody, ProducerObservationsBody, SupplementalObservationsBody } from './stage-contracts.js';

// Every key here is internal bookkeeping that must never reach the exploitation queue a downstream
// exploit agent reads: a producer ID or source-adapter identifier would tell that agent exactly
// which scan producer (and by extension, which internal class/source combination) found the
// vulnerability. This exact set is duplicated in prepare.ts (guarding the lost-acknowledgement
// repair path there); the two must be kept identical, since a key added to only one would let it
// slip through whichever path was not updated.
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

interface PublicationFile {
  path: string;
  contents: string;
}

interface PreparedPublication {
  contract: PublicationContract;
  files: PublicationFile[];
  manifest: PublicationManifest;
  manifestContents: string;
  manifestSha256: string;
  producerBody: ProducerObservationsBody;
  includeSastProvenance: boolean;
}

/** Result returned both for a fresh commit and an existing coherent publication. */
export interface PublishClassReconciliationResult {
  alreadyPublished: boolean;
  manifestSha256: string;
  commitHash: string;
}

export interface PublishClassReconciliationOssArgs {
  deliverablesDir: string;
  sessionId: string;
  workspacesDir?: string;
  vulnerabilityClass: ReconciliationClass;
  producerRef: ArtifactRef<'producer-observations'>;
  supplementalRef: ArtifactRef<'supplemental-observations'>;
  fixedTasksRef: ArtifactRef<'fixed-tasks'>;
  logger: ActivityLogger;
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Text(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function arraysEqual<T>(first: readonly T[], second: readonly T[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function sameStringSet(first: readonly string[], second: readonly string[]): boolean {
  return (
    first.length === second.length &&
    new Set(first).size === first.length &&
    first.every((value) => second.includes(value))
  );
}

/** Derive the exact consumer and manifest paths for one OSS class publication. */
export function publicationContractForClass(
  vulnerabilityClass: ReconciliationClass,
  includeSastProvenance: boolean,
): PublicationContract {
  const requiredOutputPaths = [
    exploitationQueuePath(vulnerabilityClass),
    ...(includeSastProvenance ? [sastProvenancePath(vulnerabilityClass)] : []),
  ];
  return {
    publicationKind: 'class-reconciliation',
    schemaVersion: RECONCILIATION_SCHEMA_VERSION,
    manifestPath: reconciliationManifestPath(vulnerabilityClass),
    requiredOutputPaths,
  };
}

function producerIdsFromFixed(fixed: FixedTasksBody): string[] {
  const producerIds: string[] = [];
  for (const task of fixed.tasks) {
    producerIds.push(task.producer_id);
    for (const member of task.merged_from ?? []) producerIds.push(member.producer_id);
  }
  return producerIds;
}

// Redact longest IDs first so a short producer ID that is a substring of a longer one cannot
// partially rewrite the longer token and leave a recognizable fragment behind.
function redactProducerIds(value: string, producerIds: readonly string[]): string {
  let redacted = value;
  for (const producerId of [...producerIds].sort((first, second) => second.length - first.length)) {
    if (redacted.includes(producerId)) redacted = redacted.split(producerId).join('[redacted]');
  }
  return redacted;
}

function scrubPublishedValue(value: unknown, producerIds: readonly string[]): unknown {
  if (typeof value === 'string') return redactProducerIds(value, producerIds);
  if (Array.isArray(value)) return value.map((entry) => scrubPublishedValue(entry, producerIds));
  if (value === null || typeof value !== 'object') return value;

  const cleaned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PUBLISHED_KEYS.has(key)) continue;
    const publicKey = redactProducerIds(key, producerIds);
    if (publicKey in cleaned) {
      throw new ArtifactIntegrityError('Producer-ID redaction would collide two published evidence keys');
    }
    cleaned[publicKey] = scrubPublishedValue(entry, producerIds);
  }
  return cleaned;
}

function findForbiddenPublishedKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findForbiddenPublishedKey(entry);
      if (found !== null) return found;
    }
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PUBLISHED_KEYS.has(key)) return key;
    const found = findForbiddenPublishedKey(entry);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Build the canonical consumer queue while retaining evidence and public source annotations.
 *
 * Internal producer identity must never reach the published queue that a downstream exploit agent
 * reads. Three independent passes enforce that: drop forbidden keys and redact ID tokens while
 * copying, then re-scan the result for any forbidden key, then serialize and fail if any producer
 * ID string survived. The second and third passes are belt-and-suspenders against a redaction miss.
 */
export function buildPublishedQueue(fixed: FixedTasksBody): { vulnerabilities: Record<string, unknown>[] } {
  const producerIds = producerIdsFromFixed(fixed);
  const scrubbed = scrubPublishedValue({ vulnerabilities: fixed.tasks }, producerIds) as {
    vulnerabilities: Record<string, unknown>[];
  };
  const forbiddenKey = findForbiddenPublishedKey(scrubbed);
  if (forbiddenKey !== null) {
    throw new ArtifactIntegrityError(`Published queue retained forbidden internal key ${forbiddenKey}`);
  }
  const serialized = JSON.stringify(scrubbed);
  if (producerIds.some((producerId) => serialized.includes(producerId))) {
    throw new ArtifactIntegrityError('Published queue retained a producer identifier token');
  }
  return scrubbed;
}

function observationIds(
  producerBody: ProducerObservationsBody,
  supplementalBody: SupplementalObservationsBody,
): string[] {
  return [...producerBody.observations, ...supplementalBody.observations].map((observation) => observation.producer_id);
}

// Confirms a producer ID actually belongs to the namespace its own declared scan_source implies
// (VULN for pentest, SAST for static analysis), for the declared class. This is what stops a
// mislabeled or forged scan_source from having its identity validated against the wrong producer
// namespace, which would otherwise let it dodge the class/source checks the rest of publication
// relies on.
function validateProducerIdentity(
  producerId: string,
  scanSource: ReconciliationObservation['scan_source'],
  vulnerabilityClass: ReconciliationClass,
): boolean {
  if (scanSource === 'sast') return isProducerId(producerId, vulnerabilityClass, 'SAST');
  if (scanSource === 'vulnerability_analysis') return isProducerId(producerId, vulnerabilityClass, 'VULN');
  return false;
}

/**
 * Refuse to publish unless the fixed tasks are a complete, exact partition of the observation set.
 *
 * Checks, independently: every observation ID appears at most once across the two input bodies;
 * every task reference is the dense, class-namespaced value materialization should have minted for
 * its position, with no duplicates; every member's producer ID belongs to the class/source
 * namespace its own scan_source claims; and the observation-to-task map agrees with task membership
 * in both directions. Any one of these failing means either an observation was silently dropped or
 * duplicated, or a task references identity outside its declared boundary, either of which is a
 * fail-closed reason to abort the publish rather than commit an inconsistent queue.
 */
function validateFixedTasks(
  fixed: FixedTasksBody,
  producerBody: ProducerObservationsBody,
  supplementalBody: SupplementalObservationsBody,
  vulnerabilityClass: ReconciliationClass,
): void {
  const expectedObservationIds = observationIds(producerBody, supplementalBody);
  if (new Set(expectedObservationIds).size !== expectedObservationIds.length) {
    throw new ArtifactIntegrityError('Publication inputs contain duplicate observation identifiers');
  }

  const taskIds = new Set<string>();
  const materializedIds = new Set<string>();
  const expectedTaskIds = mintTaskReferences(fixed.tasks.length, vulnerabilityClass);
  for (const [index, task] of fixed.tasks.entries()) {
    if (!isTaskReference(task.ID, vulnerabilityClass) || task.ID !== expectedTaskIds[index] || taskIds.has(task.ID)) {
      throw new ArtifactIntegrityError('Fixed tasks contain an invalid or duplicate task reference');
    }
    taskIds.add(task.ID);
    const members = [task, ...(task.merged_from ?? [])];
    for (const member of members) {
      if (
        materializedIds.has(member.producer_id) ||
        !validateProducerIdentity(member.producer_id, member.scan_source, vulnerabilityClass)
      ) {
        throw new ArtifactIntegrityError('Fixed tasks contain duplicate or cross-namespace producer identity');
      }
      materializedIds.add(member.producer_id);
      if (fixed.observation_to_task[member.producer_id] !== task.ID) {
        throw new ArtifactIntegrityError('Observation-to-task map disagrees with fixed task membership');
      }
    }
  }

  if (!sameStringSet([...materializedIds], expectedObservationIds)) {
    throw new ArtifactIntegrityError('Fixed tasks do not cover the complete observation set exactly once');
  }
  if (!sameStringSet(Object.keys(fixed.observation_to_task), expectedObservationIds)) {
    throw new ArtifactIntegrityError('Observation-to-task map is incomplete or contains extra entries');
  }
}

function lineageHas(
  inputs: readonly ArtifactInputDigest[],
  kind: ArtifactInputDigest['artifactKind'],
  sha256: string,
): boolean {
  return inputs.some((input) => input.artifactKind === kind && input.sha256 === sha256);
}

function assertRefClass(ref: ArtifactRef, vulnerabilityClass: ReconciliationClass): void {
  if (ref.vulnerabilityClass !== vulnerabilityClass) {
    throw new ArtifactIntegrityError('Publication artifact reference crosses the declared class boundary');
  }
}

function buildLineage(fixed: FixedTasksBody): Record<string, ManifestLineageEntry> {
  const lineage: Record<string, ManifestLineageEntry> = Object.create(null);
  for (const task of fixed.tasks) {
    lineage[task.ID] = {
      primary: task.producer_id,
      absorbed: (task.merged_from ?? []).map((member) => member.producer_id),
    };
  }
  return lineage;
}

function buildManifest(args: {
  sessionId: string;
  vulnerabilityClass: ReconciliationClass;
  producerBody: ProducerObservationsBody;
  consumerFiles: readonly PublicationFile[];
  inputDigests: readonly ArtifactInputDigest[];
  fixed: FixedTasksBody;
}): PublicationManifest {
  return {
    session_id: args.sessionId,
    vulnerability_class: args.vulnerabilityClass,
    schema_version: RECONCILIATION_SCHEMA_VERSION,
    producer_queue: {
      path: args.producerBody.producer_queue.path,
      blob_sha: args.producerBody.producer_queue.blob_sha,
    },
    consumer_files: args.consumerFiles.map((file) => ({ path: file.path, sha256: sha256Text(file.contents) })),
    input_digests: args.inputDigests.map((input) => ({ artifactKind: input.artifactKind, sha256: input.sha256 })),
    lineage: buildLineage(args.fixed),
  };
}

async function preparePublication(args: PublishClassReconciliationOssArgs): Promise<PreparedPublication> {
  assertRefClass(args.producerRef, args.vulnerabilityClass);
  assertRefClass(args.supplementalRef, args.vulnerabilityClass);
  assertRefClass(args.fixedTasksRef, args.vulnerabilityClass);

  const producerBody = await readArtifact(args.producerRef, args.sessionId, args.workspacesDir);
  const supplementalBody = await readArtifact(args.supplementalRef, args.sessionId, args.workspacesDir);
  const fixed = await readArtifact(args.fixedTasksRef, args.sessionId, args.workspacesDir);
  if (
    !Array.isArray(producerBody.observations) ||
    !isRecord(producerBody.producer_queue) ||
    !Array.isArray(supplementalBody.observations) ||
    !Array.isArray(supplementalBody.provenance) ||
    !Array.isArray(fixed.tasks) ||
    !isRecord(fixed.observation_to_task)
  ) {
    throw new ArtifactIntegrityError('Publication artifact body is truncated or malformed');
  }
  if (
    !lineageHas(args.fixedTasksRef.inputs, 'producer-observations', args.producerRef.sha256) ||
    !lineageHas(args.fixedTasksRef.inputs, 'supplemental-observations', args.supplementalRef.sha256)
  ) {
    throw new ArtifactIntegrityError('Fixed-task lineage does not name the publication observations');
  }
  if (producerBody.producer_queue.path !== exploitationQueuePath(args.vulnerabilityClass)) {
    throw new ArtifactIntegrityError('Producer artifact names the wrong class queue');
  }
  if (supplementalBody.provenance.length !== 0) {
    throw new ArtifactIntegrityError('Standalone OSS supplemental provenance must remain empty');
  }
  validateFixedTasks(fixed, producerBody, supplementalBody, args.vulnerabilityClass);

  const includeSastProvenance = supplementalBody.sarif !== undefined;
  const contract = publicationContractForClass(args.vulnerabilityClass, includeSastProvenance);
  const consumerFiles: PublicationFile[] = [
    { path: exploitationQueuePath(args.vulnerabilityClass), contents: serialize(buildPublishedQueue(fixed)) },
    ...(includeSastProvenance
      ? [{ path: sastProvenancePath(args.vulnerabilityClass), contents: serialize({ entries: [] }) }]
      : []),
  ];
  const inputDigests: ArtifactInputDigest[] = [
    { artifactKind: 'producer-observations', sha256: args.producerRef.sha256 },
    { artifactKind: 'supplemental-observations', sha256: args.supplementalRef.sha256 },
    { artifactKind: 'fixed-tasks', sha256: args.fixedTasksRef.sha256 },
  ];
  const manifest = buildManifest({
    sessionId: args.sessionId,
    vulnerabilityClass: args.vulnerabilityClass,
    producerBody,
    consumerFiles,
    inputDigests,
    fixed,
  });
  if (!isManifest(manifest)) {
    throw new ArtifactIntegrityError('Built OSS publication manifest failed self-validation');
  }
  const manifestContents = serialize(manifest);
  return {
    contract,
    files: [...consumerFiles, { path: contract.manifestPath, contents: manifestContents }],
    manifest,
    manifestContents,
    manifestSha256: sha256Text(manifestContents),
    producerBody,
    includeSastProvenance,
  };
}

function lineageEquals(
  first: Record<string, ManifestLineageEntry>,
  second: Record<string, ManifestLineageEntry>,
): boolean {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  if (!arraysEqual(firstKeys, secondKeys)) return false;
  return firstKeys.every((key) => {
    const firstEntry = first[key];
    const secondEntry = second[key];
    return (
      firstEntry !== undefined &&
      secondEntry !== undefined &&
      firstEntry.primary === secondEntry.primary &&
      arraysEqual(firstEntry.absorbed, secondEntry.absorbed) &&
      firstEntry.novelty === secondEntry.novelty
    );
  });
}

function manifestMatchesPrepared(existing: PublicationManifest, prepared: PublicationManifest): boolean {
  if (
    !arraysEqual(
      existing.input_digests.map((input) => `${input.artifactKind}:${input.sha256}`),
      prepared.input_digests.map((input) => `${input.artifactKind}:${input.sha256}`),
    )
  ) {
    return false;
  }
  const expectedConsumers = new Map(prepared.consumer_files.map((consumer) => [consumer.path, consumer.sha256]));
  if (
    existing.consumer_files.length !== expectedConsumers.size ||
    existing.consumer_files.some((consumer) => expectedConsumers.get(consumer.path) !== consumer.sha256)
  ) {
    return false;
  }
  return lineageEquals(existing.lineage, prepared.lineage);
}

async function verifyCommittedFiles(deliverablesDir: string, files: readonly PublicationFile[]): Promise<void> {
  for (const file of files) {
    const committed = await readCommittedFile(deliverablesDir, file.path);
    if (committed.state !== 'present' || committed.contents !== file.contents) {
      throw new PublicationConflictError('Committed publication bytes do not match the prepared exact bytes');
    }
  }
}

/**
 * Adopt an already-committed publication when the HEAD manifest matches what this call prepared.
 *
 * Returns null when nothing is published yet (the caller then commits). Returns a result with
 * `alreadyPublished: true` when a coherent, byte-identical publication already exists, which is how
 * a re-drive after a lost acknowledgement converges instead of committing a second time. Any
 * manifest that exists but disagrees is a conflict, never a silent overwrite. Before returning, it
 * restores the exact committed paths from HEAD so a partially written retry leaves no dirty bytes.
 */
async function tryReturnExistingPublication(
  args: PublishClassReconciliationOssArgs,
  prepared: PreparedPublication,
): Promise<PublishClassReconciliationResult | null> {
  const manifestRead = await readPublishedManifest(args.deliverablesDir, prepared.contract.manifestPath);
  if (manifestRead.state === 'absent') return null;
  if (manifestRead.state === 'invalid') {
    throw new PublicationConflictError(`Corrupt class manifest in HEAD: ${manifestRead.reason}`);
  }
  if (
    !isManifestCoherent({
      manifest: manifestRead.manifest,
      sessionId: args.sessionId,
      vulnerabilityClass: args.vulnerabilityClass,
      contract: prepared.contract,
      producerQueuePath: exploitationQueuePath(args.vulnerabilityClass),
      producerBlobSha: prepared.producerBody.producer_queue.blob_sha,
    }) ||
    !manifestMatchesPrepared(manifestRead.manifest, prepared.manifest)
  ) {
    throw new PublicationConflictError('Existing class publication conflicts with the prepared publication');
  }
  if (!prepared.includeSastProvenance) {
    const unexpectedProvenance = await readCommittedFile(
      args.deliverablesDir,
      sastProvenancePath(args.vulnerabilityClass),
    );
    if (unexpectedProvenance.state !== 'absent') {
      throw new PublicationConflictError('Existing publication has provenance outside its exact manifest path set');
    }
  }
  await preflightSymlinks(args.deliverablesDir, [
    ...prepared.contract.requiredOutputPaths,
    prepared.contract.manifestPath,
  ]);
  await verifyCommittedFiles(args.deliverablesDir, prepared.files.slice(0, -1));
  await restorePathsFromHead(args.deliverablesDir, [
    ...prepared.contract.requiredOutputPaths,
    prepared.contract.manifestPath,
  ]);
  const commitHash = await lastCommitForPathAtHead(args.deliverablesDir, prepared.contract.manifestPath);
  if (commitHash === null) throw new ReconciliationIoError('Unable to read the existing publication commit');
  return {
    alreadyPublished: true,
    manifestSha256: sha256Text(manifestRead.contents),
    commitHash,
  };
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

// Refuses to publish through a path that is currently a symlink, so a deliverables directory
// entry cannot redirect a publication write to somewhere outside the intended destination. Absence
// (`ENOENT`) is not a violation; the path simply does not exist yet, which is the normal case for a
// first publish.
async function preflightSymlinks(deliverablesDir: string, relativePaths: readonly string[]): Promise<void> {
  for (const relativePath of relativePaths) {
    try {
      const stat = await lstat(path.join(deliverablesDir, relativePath));
      if (stat.isSymbolicLink()) throw new PublicationConflictError('Refusing to publish through a symlink');
    } catch (error) {
      if (isErrno(error, 'ENOENT')) continue;
      if (error instanceof ReconciliationError) throw error;
      throw new ReconciliationIoError('Unable to inspect a class publication destination');
    }
  }
}

async function writeFileReplacingEntry(absolutePath: string, contents: string): Promise<void> {
  const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, contents, { flag: 'wx' });
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function expectedChangedPaths(deliverablesDir: string, files: readonly PublicationFile[]): Promise<string[]> {
  const changed: string[] = [];
  for (const file of files) {
    const committed = await readCommittedFile(deliverablesDir, file.path);
    if (committed.state === 'corrupt') {
      throw new PublicationConflictError('Publication destination has corrupt committed state');
    }
    if (committed.state === 'absent' || committed.contents !== file.contents) changed.push(file.path);
  }
  return changed;
}

// The reconciliation prepared against a specific committed producer queue. If that queue changed
// in HEAD between preparation and commit, the prepared tasks no longer describe it, so publishing
// them would be incoherent. Both the blob SHA and a content digest are checked to catch a change
// even if one identity were somehow reused.
async function assertProducerStillCurrent(
  deliverablesDir: string,
  producerBody: ProducerObservationsBody,
): Promise<void> {
  const queuePath = producerBody.producer_queue.path;
  const currentBlob = await blobShaFromHead(deliverablesDir, queuePath);
  if (currentBlob.state !== 'present' || currentBlob.sha !== producerBody.producer_queue.blob_sha) {
    throw new PublicationConflictError('Producer queue changed after reconciliation preparation');
  }
  const current = await readCommittedFile(deliverablesDir, queuePath);
  if (current.state !== 'present' || sha256Text(current.contents) !== producerBody.producer_queue.digest) {
    throw new PublicationConflictError('Producer queue bytes changed after reconciliation preparation');
  }
}

// Standalone provenance with no manifest can only mean a prior publication attempt wrote some of
// its files and was interrupted before the manifest (and therefore the whole commit) landed. That is
// not a state a fresh publish should build on top of or silently repair by overwriting; it fails
// closed and surfaces as a conflict instead.
async function ensureNoPartialPreManifestState(
  deliverablesDir: string,
  vulnerabilityClass: ReconciliationClass,
): Promise<void> {
  const provenance = await readCommittedFile(deliverablesDir, sastProvenancePath(vulnerabilityClass));
  if (provenance.state !== 'absent') {
    throw new PublicationConflictError('Pre-manifest class state contains standalone provenance');
  }
}

async function commitPreparedPublication(
  args: PublishClassReconciliationOssArgs,
  prepared: PreparedPublication,
): Promise<PublishClassReconciliationResult> {
  const ownedPaths = prepared.files.map((file) => file.path);
  await assertProducerStillCurrent(args.deliverablesDir, prepared.producerBody);
  await ensureNoPartialPreManifestState(args.deliverablesDir, args.vulnerabilityClass);
  await preflightSymlinks(args.deliverablesDir, ownedPaths);
  // Compute the exact set of paths whose bytes differ from HEAD before writing, and hand it to the
  // commit as the expected delta. The commit rejects any staged change outside this set, so a
  // dirty sibling file cannot ride along into this publication commit.
  const expectedChanges = await expectedChangedPaths(args.deliverablesDir, prepared.files);

  try {
    for (const file of prepared.files) {
      await writeFileReplacingEntry(path.join(args.deliverablesDir, file.path), file.contents);
    }
  } catch (error) {
    await restorePathsFromHead(args.deliverablesDir, ownedPaths);
    throw error instanceof ReconciliationError
      ? error
      : new ReconciliationIoError('Unable to write prepared class publication bytes');
  }

  let commitHash: string;
  try {
    const committed = await commitExactPaths(
      args.deliverablesDir,
      ownedPaths,
      `Publish ${args.vulnerabilityClass} reconciliation`,
      args.logger,
      expectedChanges,
    );
    commitHash = committed.commitHash;
  } catch (error) {
    await restorePathsFromHead(args.deliverablesDir, ownedPaths);
    if (error instanceof ExactPathCommitMismatchError) {
      throw new PublicationConflictError('Publication staged path set differs from its exact prepared delta');
    }
    throw error instanceof ReconciliationError
      ? error
      : new ReconciliationIoError('Unable to commit prepared class publication bytes');
  }

  await verifyCommittedFiles(args.deliverablesDir, prepared.files);
  return {
    alreadyPublished: false,
    manifestSha256: prepared.manifestSha256,
    commitHash,
  };
}

/** Publish one OSS class through one reentrant Git critical section. */
export async function publishClassReconciliationOss(
  args: PublishClassReconciliationOssArgs,
): Promise<PublishClassReconciliationResult> {
  const prepared = await preparePublication(args);
  return withGitRepoLock(async () => {
    const existing = await tryReturnExistingPublication(args, prepared);
    if (existing !== null) return existing;
    return commitPreparedPublication(args, prepared);
  });
}
