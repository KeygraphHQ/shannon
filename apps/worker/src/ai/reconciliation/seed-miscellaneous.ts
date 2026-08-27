// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Durable, queue-only producer seeding for the analysis-less `miscellaneous` class. */

import { createHash, randomUUID } from 'node:crypto';
import { lstat, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  commitExactPaths,
  ExactPathCommitMismatchError,
  gitBlobShaForContents,
  lastCommitForPathAtHead,
  readCommittedFile,
  restorePathsFromHead,
  withGitRepoLock,
} from '../../services/git-manager.js';
import type { ActivityLogger } from '../../types/activity-logger.js';
import { PublicationConflictError, ReconciliationError, ReconciliationIoError } from './artifact-store.js';
import { isManifestCoherent, readPublishedManifest } from './manifest.js';
import { exploitationQueuePath, reconciliationManifestPath, sastProvenancePath } from './prepare.js';
import { publicationContractForClass } from './publish.js';

/**
 * Canonical committed producer bytes for the analysis-less class.
 *
 * Every seed writes these exact bytes, so a re-run after a lost acknowledgement produces an
 * identical blob and the seed is idempotent. Any other committed content for the `miscellaneous` queue is
 * treated as a conflict, never overwritten.
 */
export const CANONICAL_EMPTY_MISCELLANEOUS_QUEUE = `${JSON.stringify({ vulnerabilities: [] }, null, 2)}\n`;

export interface SeedEmptyProducerQueueArgs {
  deliverablesDir: string;
  sessionId: string;
  logger: ActivityLogger;
}

export interface SeedEmptyProducerQueueResult {
  alreadySeeded: boolean;
  alreadyPublished: boolean;
  commitHash: string;
}

function sha256Text(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

async function rejectQueueSymlink(deliverablesDir: string, queuePath: string): Promise<void> {
  try {
    const stat = await lstat(path.join(deliverablesDir, queuePath));
    if (stat.isSymbolicLink()) throw new PublicationConflictError('Refusing to seed through a symlink');
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return;
    if (error instanceof ReconciliationError) throw error;
    throw new ReconciliationIoError('Unable to inspect the miscellaneous producer-queue destination');
  }
}

async function writeQueueReplacingEntry(absolutePath: string): Promise<void> {
  const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, CANONICAL_EMPTY_MISCELLANEOUS_QUEUE, { flag: 'wx' });
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function publicationCommit(deliverablesDir: string, relativePath: string): Promise<string> {
  const commitHash = await lastCommitForPathAtHead(deliverablesDir, relativePath);
  if (commitHash === null) throw new ReconciliationIoError('Unable to read the exact-path publication commit');
  return commitHash;
}

async function verifyManifestConsumers(
  deliverablesDir: string,
  consumers: ReadonlyArray<{ path: string; sha256: string }>,
): Promise<void> {
  for (const consumer of consumers) {
    const committed = await readCommittedFile(deliverablesDir, consumer.path);
    if (committed.state !== 'present' || sha256Text(committed.contents) !== consumer.sha256) {
      throw new PublicationConflictError('Existing miscellaneous publication is missing a coherent committed consumer');
    }
  }
}

/**
 * Seed `miscellaneous_exploitation_queue.json` once, or return an existing seed/final publication.
 *
 * Resolves to one of three states under the Git lock: a coherent final publication already exists
 * and is adopted (`alreadyPublished`); the canonical empty queue is already committed and adopted
 * (`alreadySeeded`); or nothing is committed yet and the canonical queue is written and committed
 * fresh. A committed queue with non-canonical bytes, or standalone provenance with no manifest,
 * is a conflict rather than a state to reprocess.
 */
// The `miscellaneous` class has no analysis agent of its own: nothing runs vulnerability analysis
// against it directly, so unlike the five core classes it never gets a producer queue from an
// upstream agent. Seeding the canonical empty queue here, then running it through the same
// publish/manifest machinery as every other class, means downstream consumers (materialization,
// the report, the exploitation phase) never need a miscellaneous-specific code path for "this class
// might not have a queue file at all."
export async function seedEmptyProducerQueue(args: SeedEmptyProducerQueueArgs): Promise<SeedEmptyProducerQueueResult> {
  const queuePath = exploitationQueuePath('miscellaneous');
  const manifestPath = reconciliationManifestPath('miscellaneous');
  const provenancePath = sastProvenancePath('miscellaneous');
  const finalContracts = [
    publicationContractForClass('miscellaneous', false),
    publicationContractForClass('miscellaneous', true),
  ];

  return withGitRepoLock(async (): Promise<SeedEmptyProducerQueueResult> => {
    const manifestRead = await readPublishedManifest(args.deliverablesDir, manifestPath);
    if (manifestRead.state === 'invalid') {
      throw new PublicationConflictError(`Corrupt miscellaneous manifest in HEAD: ${manifestRead.reason}`);
    }
    if (manifestRead.state === 'present') {
      const producerBlobSha = await gitBlobShaForContents(args.deliverablesDir, CANONICAL_EMPTY_MISCELLANEOUS_QUEUE);
      const coherentFinalContract = finalContracts.some((contract) =>
        isManifestCoherent({
          manifest: manifestRead.manifest,
          sessionId: args.sessionId,
          vulnerabilityClass: 'miscellaneous',
          contract,
          producerQueuePath: queuePath,
          producerBlobSha,
        }),
      );
      if (!coherentFinalContract) {
        throw new PublicationConflictError(
          'Existing miscellaneous manifest does not cohere with the final publication',
        );
      }
      await verifyManifestConsumers(args.deliverablesDir, manifestRead.manifest.consumer_files);
      await rejectQueueSymlink(args.deliverablesDir, queuePath);
      await restorePathsFromHead(args.deliverablesDir, [queuePath]);
      return {
        alreadySeeded: true,
        alreadyPublished: true,
        commitHash: await publicationCommit(args.deliverablesDir, manifestPath),
      };
    }

    const provenanceRead = await readCommittedFile(args.deliverablesDir, provenancePath);
    if (provenanceRead.state !== 'absent') {
      throw new PublicationConflictError('Pre-manifest miscellaneous state contains standalone provenance');
    }

    const queueRead = await readCommittedFile(args.deliverablesDir, queuePath);
    if (queueRead.state === 'corrupt') {
      throw new PublicationConflictError('Committed miscellaneous producer queue is unreadable');
    }
    if (queueRead.state === 'present') {
      if (queueRead.contents !== CANONICAL_EMPTY_MISCELLANEOUS_QUEUE) {
        throw new PublicationConflictError('Pre-manifest miscellaneous producer queue is not canonical empty state');
      }
      await rejectQueueSymlink(args.deliverablesDir, queuePath);
      await restorePathsFromHead(args.deliverablesDir, [queuePath]);
      return {
        alreadySeeded: true,
        alreadyPublished: false,
        commitHash: await publicationCommit(args.deliverablesDir, queuePath),
      };
    }

    await rejectQueueSymlink(args.deliverablesDir, queuePath);
    try {
      await writeQueueReplacingEntry(path.join(args.deliverablesDir, queuePath));
    } catch {
      await restorePathsFromHead(args.deliverablesDir, [queuePath]);
      throw new ReconciliationIoError('Unable to write the canonical miscellaneous producer queue');
    }

    let commitHash: string;
    try {
      const committed = await commitExactPaths(
        args.deliverablesDir,
        [queuePath],
        'Seed miscellaneous producer queue',
        args.logger,
        [queuePath],
      );
      commitHash = committed.commitHash;
    } catch (error) {
      await restorePathsFromHead(args.deliverablesDir, [queuePath]);
      if (error instanceof ExactPathCommitMismatchError) {
        throw new PublicationConflictError('Miscellaneous seed staged path set differs from its queue-only contract');
      }
      throw new ReconciliationIoError('Unable to commit the canonical miscellaneous producer queue');
    }
    const committedQueue = await readCommittedFile(args.deliverablesDir, queuePath);
    if (committedQueue.state !== 'present' || committedQueue.contents !== CANONICAL_EMPTY_MISCELLANEOUS_QUEUE) {
      throw new PublicationConflictError('Committed miscellaneous seed bytes do not match canonical empty state');
    }
    return { alreadySeeded: false, alreadyPublished: false, commitHash };
  });
}
