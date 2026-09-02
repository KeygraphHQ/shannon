/** Content-addressed, no-replace storage for reconciliation intermediates. */

import { createHash, randomBytes } from 'node:crypto';
import type { Stats } from 'node:fs';
import { link, lstat, mkdir, open, readFile, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACES_DIR } from '../../paths.js';
import { ALL_RECONCILIATION_CLASSES, type ReconciliationClass } from '../../types/reconciliation.js';
import type { ArtifactInputDigest, ArtifactKind, ArtifactRef } from './contracts.js';
import { RECONCILIATION_SCHEMA_VERSION } from './schema-version.js';
import type { ArtifactBodyMap } from './stage-contracts.js';

export { RECONCILIATION_SCHEMA_VERSION };

const KIND_SEQUENCE: Readonly<Record<ArtifactKind, string>> = Object.freeze({
  'producer-observations': '00',
  'supplemental-observations': '01',
  'task-formation': '02',
  'fixed-tasks': '03',
});

const ARTIFACT_KINDS = Object.freeze(Object.keys(KIND_SEQUENCE) as ArtifactKind[]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type ReconciliationFailureType =
  | 'ReconciliationArtifactNotFound'
  | 'ReconciliationIoError'
  | 'ArtifactIntegrityError'
  | 'PublicationConflict'
  | 'SastEnrichmentInputError'
  | 'SastEnrichmentModelError';

/** Typed reconciliation failure normalized by the later Temporal activity boundary. */
export class ReconciliationError extends Error {
  readonly retryable: boolean;
  readonly failureType: ReconciliationFailureType;

  // The default failure type follows `retryable`: a retryable error reads as transient I/O,
  // a non-retryable one as an integrity violation. Temporal keeps retrying the former and
  // fails fast on the latter, so the two must stay aligned.
  constructor(
    message: string,
    retryable: boolean,
    failureType: ReconciliationFailureType = retryable ? 'ReconciliationIoError' : 'ArtifactIntegrityError',
  ) {
    super(message);
    this.name = failureType;
    this.retryable = retryable;
    this.failureType = failureType;
  }
}

export class ReconciliationArtifactNotFoundError extends ReconciliationError {
  constructor(message: string) {
    super(message, true, 'ReconciliationArtifactNotFound');
  }
}

export class ReconciliationIoError extends ReconciliationError {
  constructor(message: string) {
    super(message, true, 'ReconciliationIoError');
  }
}

export class ArtifactIntegrityError extends ReconciliationError {
  constructor(message: string) {
    super(message, false, 'ArtifactIntegrityError');
  }
}

export class PublicationConflictError extends ReconciliationError {
  constructor(message: string) {
    super(message, false, 'PublicationConflict');
  }
}

interface ArtifactEnvelope {
  artifactKind: ArtifactKind;
  vulnerabilityClass: ReconciliationClass;
  schemaVersion: 1;
  inputs: ArtifactInputDigest[];
  counts: Record<string, number>;
  body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

function validateSessionId(sessionId: string): void {
  const valid =
    sessionId.length > 0 &&
    sessionId !== '.' &&
    sessionId !== '..' &&
    !sessionId.includes('/') &&
    !sessionId.includes('\\') &&
    !sessionId.includes('\0');
  if (!valid) {
    throw new ArtifactIntegrityError('Invalid reconciliation session identifier');
  }
}

function validateClass(vulnerabilityClass: ReconciliationClass): void {
  if (!ALL_RECONCILIATION_CLASSES.includes(vulnerabilityClass)) {
    throw new ArtifactIntegrityError('Invalid reconciliation class');
  }
}

function validateDigest(sha256: string, label: string): void {
  if (!SHA256_PATTERN.test(sha256)) {
    throw new ArtifactIntegrityError(`${label} is not a lowercase SHA-256 digest`);
  }
}

function validateInputs(inputs: readonly ArtifactInputDigest[]): void {
  if (!Array.isArray(inputs)) {
    throw new ArtifactIntegrityError('Artifact lineage is not an array');
  }
  for (const input of inputs) {
    if (!isRecord(input) || !ARTIFACT_KINDS.includes(input.artifactKind as ArtifactKind)) {
      throw new ArtifactIntegrityError('Artifact lineage contains an invalid kind');
    }
    validateDigest(input.sha256 as string, 'Artifact lineage digest');
    if (Object.keys(input).sort().join(',') !== 'artifactKind,sha256') {
      throw new ArtifactIntegrityError('Artifact lineage contains unexpected metadata');
    }
  }
}

function validateCounts(counts: Record<string, number>): void {
  if (!isRecord(counts)) {
    throw new ArtifactIntegrityError('Artifact counts are not an object');
  }
  for (const [name, value] of Object.entries(counts)) {
    if (name.length === 0 || !Number.isSafeInteger(value) || value < 0) {
      throw new ArtifactIntegrityError('Artifact counts contain an invalid entry');
    }
  }
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function artifactFilename(kind: ArtifactKind, sha256: string): string {
  return `${KIND_SEQUENCE[kind]}-${kind}-${sha256}.json`;
}

function serializeEnvelope(envelope: ArtifactEnvelope): Buffer {
  try {
    return Buffer.from(JSON.stringify(envelope), 'utf8');
  } catch {
    throw new ArtifactIntegrityError('Reconciliation artifact body is not JSON serializable');
  }
}

/** Stable root for one class, independent of customer output destinations. */
export function reconciliationDir(
  sessionId: string,
  vulnerabilityClass: ReconciliationClass,
  workspacesDir: string = WORKSPACES_DIR,
): string {
  validateSessionId(sessionId);
  validateClass(vulnerabilityClass);
  return path.resolve(workspacesDir, sessionId, '.shannon', 'reconciliation', vulnerabilityClass);
}

async function ensureDirectory(parent: string, segment: string): Promise<string> {
  const next = path.join(parent, segment);
  try {
    await mkdir(next);
  } catch (error) {
    if (!isErrno(error, 'EEXIST')) {
      throw new ReconciliationIoError('Unable to create reconciliation artifact directory');
    }
  }

  let stat: Stats;
  try {
    stat = await lstat(next);
  } catch {
    throw new ReconciliationIoError('Unable to inspect reconciliation artifact directory');
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new ArtifactIntegrityError('Reconciliation artifact root contains a symlink or non-directory');
  }
  return next;
}

// `ensureArtifactRoot` (write path) and `resolveArtifactRoot` (read path) are kept as separate
// functions rather than one with a "create if missing" flag: a read for a session/class that never
// wrote anything must fail as not-found, not silently materialize an empty directory chain that
// would then make an absent artifact look like a not-yet-written one.
async function ensureArtifactRoot(
  sessionId: string,
  vulnerabilityClass: ReconciliationClass,
  workspacesDir: string,
): Promise<string> {
  validateSessionId(sessionId);
  validateClass(vulnerabilityClass);
  try {
    await mkdir(workspacesDir, { recursive: true });
  } catch {
    throw new ReconciliationIoError('Unable to create the reconciliation workspace root');
  }

  let realWorkspaces: string;
  try {
    realWorkspaces = await realpath(workspacesDir);
  } catch {
    throw new ReconciliationIoError('Unable to resolve the reconciliation workspace root');
  }

  let current = realWorkspaces;
  for (const segment of [sessionId, '.shannon', 'reconciliation', vulnerabilityClass]) {
    current = await ensureDirectory(current, segment);
  }
  return current;
}

async function resolveArtifactRoot(
  sessionId: string,
  vulnerabilityClass: ReconciliationClass,
  workspacesDir: string,
): Promise<string> {
  validateSessionId(sessionId);
  validateClass(vulnerabilityClass);

  let current: string;
  try {
    current = await realpath(workspacesDir);
  } catch {
    throw new ReconciliationArtifactNotFoundError('Reconciliation workspace root is not visible');
  }

  for (const segment of [sessionId, '.shannon', 'reconciliation', vulnerabilityClass]) {
    const next = path.join(current, segment);
    let stat: Stats;
    try {
      stat = await lstat(next);
    } catch (error) {
      if (isErrno(error, 'ENOENT')) {
        throw new ReconciliationArtifactNotFoundError('Reconciliation artifact root is not visible');
      }
      throw new ReconciliationIoError('Unable to inspect reconciliation artifact root');
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new ArtifactIntegrityError('Reconciliation artifact root contains a symlink or non-directory');
    }
    current = next;
  }
  return current;
}

async function writeDurableTemporaryFile(tempPath: string, bytes: Buffer): Promise<void> {
  try {
    // `wx` fails if the attempt-unique temp path already exists, and the fsync forces the bytes
    // to disk before the later `link` publishes them. Publishing an unsynced file would let a
    // crash leave a linked-but-empty artifact that its digest no longer matches.
    const handle = await open(tempPath, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    await unlink(tempPath).catch(() => undefined);
    throw new ReconciliationIoError('Unable to durably create an attempt-unique reconciliation artifact');
  }
}

// Some filesystems reject fsync on a directory handle. Those codes mean the durability barrier
// is unavailable, not that publication failed, so the caller treats them as success.
function directorySyncIsUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EINVAL' || code === 'ENOTSUP' || code === 'EOPNOTSUPP' || code === 'EBADF' || code === 'EISDIR';
}

async function syncPublishedDirectory(directory: string): Promise<void> {
  try {
    const handle = await open(directory, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (directorySyncIsUnsupported(error)) return;
    throw new ReconciliationIoError('Unable to make the reconciliation artifact directory durable');
  }
}

export type WriteArtifactArgs<TKind extends ArtifactKind = ArtifactKind> = {
  [K in TKind]: {
    sessionId: string;
    workspacesDir?: string;
    artifactKind: K;
    vulnerabilityClass: ReconciliationClass;
    body: ArtifactBodyMap[K];
    inputs: ArtifactInputDigest[];
    counts: Record<string, number>;
  };
}[TKind];

/** Serialize and publish one whole-envelope artifact without replacing an existing path. */
export async function writeArtifact<TKind extends ArtifactKind>(
  args: WriteArtifactArgs<TKind>,
): Promise<ArtifactRef<TKind>> {
  validateInputs(args.inputs);
  validateCounts(args.counts);

  const envelope: ArtifactEnvelope = {
    artifactKind: args.artifactKind,
    vulnerabilityClass: args.vulnerabilityClass,
    schemaVersion: RECONCILIATION_SCHEMA_VERSION,
    inputs: args.inputs,
    counts: args.counts,
    body: args.body,
  };
  const bytes = serializeEnvelope(envelope);
  const sha256 = sha256Hex(bytes);
  const root = await ensureArtifactRoot(args.sessionId, args.vulnerabilityClass, args.workspacesDir ?? WORKSPACES_DIR);
  const filename = artifactFilename(args.artifactKind, sha256);
  const finalPath = path.join(root, filename);
  const tempPath = path.join(root, `.${filename}.tmp-${randomBytes(12).toString('hex')}`);

  await writeDurableTemporaryFile(tempPath, bytes);

  // The final path is content-addressed by digest, so an EEXIST link means a prior attempt already
  // published these exact bytes. Identical bytes are adopted as success (idempotent republish);
  // different bytes at the same digest path can only be corruption or a hash collision, so they
  // conflict. This is what makes a retried write after a lost acknowledgement safe.
  let failure: unknown;
  try {
    await link(tempPath, finalPath);
  } catch (error) {
    if (!isErrno(error, 'EEXIST')) {
      failure = new ReconciliationIoError('Unable to publish reconciliation artifact');
    } else {
      try {
        const stat = await lstat(finalPath);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          failure = new ArtifactIntegrityError('Existing reconciliation artifact is not a regular file');
        } else {
          const existing = await readFile(finalPath);
          if (!existing.equals(bytes)) {
            failure = new PublicationConflictError('Existing reconciliation artifact has different exact bytes');
          }
        }
      } catch (readError) {
        failure =
          readError instanceof ReconciliationError
            ? readError
            : new ReconciliationIoError('Unable to verify existing reconciliation artifact');
      }
    }
  }

  if (failure === undefined) {
    try {
      await syncPublishedDirectory(root);
    } catch (error) {
      failure = error;
    }
  }

  // Remove the attempt-local temp link last. A cleanup failure is only reported when nothing
  // earlier failed, so temp-file noise never masks a real publication or conflict error.
  try {
    await unlink(tempPath);
  } catch (error) {
    if (!isErrno(error, 'ENOENT') && failure === undefined) {
      failure = new ReconciliationIoError('Unable to remove attempt-local reconciliation artifact');
    }
  }
  if (failure !== undefined) throw failure;

  return {
    path: finalPath,
    artifactKind: args.artifactKind,
    vulnerabilityClass: args.vulnerabilityClass,
    schemaVersion: RECONCILIATION_SCHEMA_VERSION,
    sha256,
    inputs: args.inputs,
    counts: args.counts,
  };
}

/** Whether two ordered artifact lineages contain identical kinds and digests. */
export function artifactInputsMatch(
  first: readonly ArtifactInputDigest[],
  second: readonly ArtifactInputDigest[],
): boolean {
  return (
    first.length === second.length &&
    first.every(
      (entry, index) => entry.artifactKind === second[index]?.artifactKind && entry.sha256 === second[index]?.sha256,
    )
  );
}

function countsMatch(first: Record<string, number>, second: Record<string, number>): boolean {
  const firstKeys = Object.keys(first).sort();
  const secondKeys = Object.keys(second).sort();
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every((key, index) => key === secondKeys[index] && first[key] === second[key])
  );
}

function parseEnvelope(bytes: Buffer): ArtifactEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ArtifactIntegrityError('Reconciliation artifact is not valid JSON');
  }
  if (!isRecord(parsed)) {
    throw new ArtifactIntegrityError('Reconciliation artifact envelope is not an object');
  }
  const expectedKeys = ['artifactKind', 'body', 'counts', 'inputs', 'schemaVersion', 'vulnerabilityClass'];
  if (Object.keys(parsed).sort().join(',') !== expectedKeys.join(',')) {
    throw new ArtifactIntegrityError('Reconciliation artifact envelope has unexpected fields');
  }
  if (!ARTIFACT_KINDS.includes(parsed.artifactKind as ArtifactKind)) {
    throw new ArtifactIntegrityError('Reconciliation artifact kind is invalid');
  }
  if (!ALL_RECONCILIATION_CLASSES.includes(parsed.vulnerabilityClass as ReconciliationClass)) {
    throw new ArtifactIntegrityError('Reconciliation artifact class is invalid');
  }
  if (parsed.schemaVersion !== RECONCILIATION_SCHEMA_VERSION) {
    throw new ArtifactIntegrityError('Reconciliation artifact schema version is invalid');
  }
  validateInputs(parsed.inputs as ArtifactInputDigest[]);
  validateCounts(parsed.counts as Record<string, number>);
  return parsed as unknown as ArtifactEnvelope;
}

function validateRef(ref: ArtifactRef): void {
  if (!ARTIFACT_KINDS.includes(ref.artifactKind)) {
    throw new ArtifactIntegrityError('Artifact reference kind is invalid');
  }
  validateClass(ref.vulnerabilityClass);
  if (ref.schemaVersion !== RECONCILIATION_SCHEMA_VERSION) {
    throw new ArtifactIntegrityError('Artifact reference schema version is invalid');
  }
  validateDigest(ref.sha256, 'Artifact reference digest');
  validateInputs(ref.inputs);
  validateCounts(ref.counts);
}

/** Read and verify one artifact's path, bytes, envelope metadata, and ordered lineage. */
export async function readArtifact<TKind extends ArtifactKind>(
  ref: ArtifactRef<TKind>,
  sessionId: string,
  workspacesDir: string = WORKSPACES_DIR,
): Promise<ArtifactBodyMap[TKind]> {
  validateRef(ref);
  const root = await resolveArtifactRoot(sessionId, ref.vulnerabilityClass, workspacesDir);
  // A reference carries its own path through Temporal history. Recompute the only path this
  // kind and digest may occupy and demand an exact match, so a tampered or stale ref cannot
  // point a read at an arbitrary file outside the class artifact root.
  const expectedPath = path.join(root, artifactFilename(ref.artifactKind, ref.sha256));
  if (!path.isAbsolute(ref.path) || path.normalize(ref.path) !== ref.path || ref.path !== expectedPath) {
    throw new ArtifactIntegrityError('Artifact reference path is not the expected contained path');
  }

  let stat: Stats;
  try {
    stat = await lstat(ref.path);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) {
      throw new ReconciliationArtifactNotFoundError('Referenced reconciliation artifact is not visible');
    }
    throw new ReconciliationIoError('Unable to inspect referenced reconciliation artifact');
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new ArtifactIntegrityError('Referenced reconciliation artifact is not a regular file');
  }

  let resolvedPath: string;
  try {
    resolvedPath = await realpath(ref.path);
  } catch {
    throw new ReconciliationArtifactNotFoundError('Referenced reconciliation artifact is not visible');
  }
  if (resolvedPath !== expectedPath) {
    throw new ArtifactIntegrityError('Referenced reconciliation artifact resolves outside its expected path');
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(resolvedPath);
  } catch {
    throw new ReconciliationIoError('Unable to read referenced reconciliation artifact');
  }
  if (sha256Hex(bytes) !== ref.sha256) {
    throw new ArtifactIntegrityError('Reconciliation artifact digest does not match its reference');
  }

  const envelope = parseEnvelope(bytes);
  if (
    envelope.artifactKind !== ref.artifactKind ||
    envelope.vulnerabilityClass !== ref.vulnerabilityClass ||
    envelope.schemaVersion !== ref.schemaVersion ||
    !artifactInputsMatch(envelope.inputs, ref.inputs) ||
    !countsMatch(envelope.counts, ref.counts)
  ) {
    throw new ArtifactIntegrityError('Reconciliation artifact metadata or lineage does not match its reference');
  }
  return envelope.body as ArtifactBodyMap[TKind];
}
