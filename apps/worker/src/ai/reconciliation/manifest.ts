// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Validation and committed reads for the durable class-publication manifest. */

import { readCommittedFile } from '../../services/git-manager.js';
import { ALL_RECONCILIATION_CLASSES, type ReconciliationClass } from '../../types/reconciliation.js';
import type { PublicationContract } from './contracts.js';
import { mintTaskReferences } from './materialize-core.js';
import { isProducerId, isTaskReference } from './refs.js';
import { RECONCILIATION_SCHEMA_VERSION } from './schema-version.js';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_BLOB_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

/** One committed consumer file and the digest the manifest vouches for. */
export interface ManifestConsumerFile {
  path: string;
  sha256: string;
}

/** One stable task's producer lineage. OSS omits `novelty`. */
export interface ManifestLineageEntry {
  primary: string;
  absorbed: string[];
  novelty?: 'new' | 'recurring';
}

/** The schema-v1 durable completion marker for one class publication. */
export interface PublicationManifest {
  session_id: string;
  vulnerability_class: ReconciliationClass;
  schema_version: 1;
  producer_queue: { path: string; blob_sha: string };
  consumer_files: ManifestConsumerFile[];
  input_digests: Array<{ artifactKind: string; sha256: string }>;
  lineage: Record<string, ManifestLineageEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  return required.every((key) => key in value) && actual.every((key) => allowed.has(key));
}

function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.startsWith('\\') &&
    !value.includes('\0') &&
    !value.split(/[\\/]/).some((segment) => segment === '' || segment === '.' || segment === '..')
  );
}

function isProducerQueueIdentity(value: unknown): value is PublicationManifest['producer_queue'] {
  if (!isRecord(value) || !hasExactKeys(value, ['path', 'blob_sha'])) return false;
  return isSafeRelativePath(value.path) && typeof value.blob_sha === 'string' && GIT_BLOB_PATTERN.test(value.blob_sha);
}

function isConsumerFile(value: unknown): value is ManifestConsumerFile {
  if (!isRecord(value) || !hasExactKeys(value, ['path', 'sha256'])) return false;
  return isSafeRelativePath(value.path) && typeof value.sha256 === 'string' && SHA256_PATTERN.test(value.sha256);
}

function isInputDigest(value: unknown): value is PublicationManifest['input_digests'][number] {
  if (!isRecord(value) || !hasExactKeys(value, ['artifactKind', 'sha256'])) return false;
  return (
    typeof value.artifactKind === 'string' &&
    value.artifactKind.length > 0 &&
    typeof value.sha256 === 'string' &&
    SHA256_PATTERN.test(value.sha256)
  );
}

function isProducerIdForClass(value: string, vulnerabilityClass: ReconciliationClass): boolean {
  return isProducerId(value, vulnerabilityClass, 'VULN') || isProducerId(value, vulnerabilityClass, 'SAST');
}

function isLineageEntry(value: unknown, vulnerabilityClass: ReconciliationClass): value is ManifestLineageEntry {
  if (!isRecord(value) || !hasExactKeys(value, ['primary', 'absorbed'], ['novelty'])) return false;
  if (typeof value.primary !== 'string' || !isProducerIdForClass(value.primary, vulnerabilityClass)) return false;
  if (
    !Array.isArray(value.absorbed) ||
    !value.absorbed.every(
      (producerId) => typeof producerId === 'string' && isProducerIdForClass(producerId, vulnerabilityClass),
    )
  ) {
    return false;
  }
  return value.novelty === undefined || value.novelty === 'new' || value.novelty === 'recurring';
}

/** Whether a decoded value is a complete schema-v1 publication manifest. */
export function isManifest(value: unknown): value is PublicationManifest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'session_id',
      'vulnerability_class',
      'schema_version',
      'producer_queue',
      'consumer_files',
      'input_digests',
      'lineage',
    ])
  ) {
    return false;
  }
  if (
    typeof value.session_id !== 'string' ||
    value.session_id.length === 0 ||
    !ALL_RECONCILIATION_CLASSES.includes(value.vulnerability_class as ReconciliationClass) ||
    value.schema_version !== RECONCILIATION_SCHEMA_VERSION ||
    !isProducerQueueIdentity(value.producer_queue) ||
    !Array.isArray(value.consumer_files) ||
    !value.consumer_files.every(isConsumerFile) ||
    !Array.isArray(value.input_digests) ||
    !value.input_digests.every(isInputDigest) ||
    !isRecord(value.lineage)
  ) {
    return false;
  }

  const vulnerabilityClass = value.vulnerability_class as ReconciliationClass;
  const consumerPaths = value.consumer_files.map((consumer) => consumer.path);
  if (new Set(consumerPaths).size !== consumerPaths.length) return false;

  // A coherent publication is derived from exactly the three stage artifacts, one of each kind.
  // A different count or a repeated kind means the manifest was not built from a complete lineage.
  const inputKinds = value.input_digests.map((input) => input.artifactKind);
  if (inputKinds.length !== 3 || new Set(inputKinds).size !== inputKinds.length) return false;
  if (
    !['producer-observations', 'supplemental-observations', 'fixed-tasks'].every((kind) => inputKinds.includes(kind))
  ) {
    return false;
  }

  // Lineage keys must be the dense minted references PREFIX-01..PREFIX-NN in order, and every
  // producer ID across all entries must be unique. This is the same task numbering the published
  // queue carries, so a manifest that renumbers or repeats a producer cannot pass.
  const lineageEntries = Object.entries(value.lineage);
  const expectedTaskReferences = mintTaskReferences(lineageEntries.length, vulnerabilityClass);
  const producerIds = new Set<string>();
  for (const [index, [taskReference, entry]] of lineageEntries.entries()) {
    if (
      !isTaskReference(taskReference, vulnerabilityClass) ||
      taskReference !== expectedTaskReferences[index] ||
      !isLineageEntry(entry, vulnerabilityClass)
    ) {
      return false;
    }
    const typedEntry = entry as ManifestLineageEntry;
    for (const producerId of [typedEntry.primary, ...typedEntry.absorbed]) {
      if (producerIds.has(producerId)) return false;
      producerIds.add(producerId);
    }
  }
  return true;
}

/** Classified outcome of reading a class manifest from Git `HEAD`. */
export type ManifestRead =
  | { state: 'absent' }
  | { state: 'invalid'; reason: string }
  | { state: 'present'; manifest: PublicationManifest; contents: string };

/** Read and strictly validate one committed manifest. */
export async function readPublishedManifest(
  deliverablesDirPath: string,
  manifestRelPath: string,
): Promise<ManifestRead> {
  const read = await readCommittedFile(deliverablesDirPath, manifestRelPath);
  if (read.state === 'absent') return { state: 'absent' };
  if (read.state === 'corrupt') {
    return { state: 'invalid', reason: 'manifest object is unreadable' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(read.contents);
  } catch {
    return { state: 'invalid', reason: 'manifest is not valid JSON' };
  }
  if (!isManifest(parsed)) {
    return { state: 'invalid', reason: 'manifest is truncated, malformed, or contains unexpected fields' };
  }
  return { state: 'present', manifest: parsed, contents: read.contents };
}

function samePathSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  return actualSet.size === actual.length && expected.every((path) => actualSet.has(path));
}

/** Whether a manifest exactly matches the expected OSS publication identity and path set. */
export function isManifestCoherent(args: {
  manifest: PublicationManifest;
  sessionId: string;
  vulnerabilityClass: ReconciliationClass;
  contract: PublicationContract;
  producerQueuePath: string;
  producerBlobSha?: string;
}): boolean {
  const { manifest, sessionId, vulnerabilityClass, contract, producerQueuePath, producerBlobSha } = args;
  if (contract.publicationKind !== 'class-reconciliation') return false;
  if (contract.schemaVersion !== RECONCILIATION_SCHEMA_VERSION) return false;
  if (manifest.session_id !== sessionId) return false;
  if (manifest.vulnerability_class !== vulnerabilityClass) return false;
  if (manifest.schema_version !== contract.schemaVersion) return false;
  if (manifest.producer_queue.path !== producerQueuePath) return false;
  if (producerBlobSha !== undefined && manifest.producer_queue.blob_sha !== producerBlobSha) return false;
  return samePathSet(
    manifest.consumer_files.map((consumer) => consumer.path),
    contract.requiredOutputPaths,
  );
}
