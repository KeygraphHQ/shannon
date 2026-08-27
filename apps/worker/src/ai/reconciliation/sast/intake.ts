/** Digest-pinned, workspace-contained SARIF byte intake. */

import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { WORKSPACES_DIR } from '../../../paths.js';
import type { SarifRef } from '../../sast/types.js';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type SarifIntakeFailureKind = 'invalid' | 'io';

export class SarifIntakeError extends Error {
  readonly kind: SarifIntakeFailureKind;

  constructor(message: string, kind: SarifIntakeFailureKind = 'invalid') {
    super(message);
    this.name = 'SarifIntakeError';
    this.kind = kind;
  }
}

function isErrno(error: unknown, ...codes: readonly string[]): boolean {
  return error instanceof Error && codes.includes((error as NodeJS.ErrnoException).code ?? '');
}

function intakeFileSystemError(error: unknown, invalidMessage: string, ioMessage: string): SarifIntakeError {
  if (isErrno(error, 'ENOENT', 'ENOTDIR', 'ELOOP')) {
    return new SarifIntakeError(invalidMessage);
  }
  return new SarifIntakeError(ioMessage, 'io');
}

function validSessionId(sessionId: string): boolean {
  return (
    sessionId.length > 0 &&
    sessionId !== '.' &&
    sessionId !== '..' &&
    !sessionId.includes('/') &&
    !sessionId.includes('\\') &&
    !sessionId.includes('\0')
  );
}

function contained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** Read exact SARIF bytes only after containment and no-symlink checks. */
export async function readPinnedSarif(
  sessionId: string,
  ref: SarifRef,
  workspacesDir: string = WORKSPACES_DIR,
): Promise<Buffer> {
  if (!validSessionId(sessionId)) throw new SarifIntakeError('Invalid SARIF session identifier');
  if (!SHA256_PATTERN.test(ref.sha256)) throw new SarifIntakeError('SARIF reference digest is invalid');

  let realWorkspaces: string;
  try {
    realWorkspaces = await realpath(workspacesDir);
  } catch (error) {
    throw intakeFileSystemError(
      error,
      'SARIF workspace root is not visible',
      'SARIF workspace root could not be resolved',
    );
  }
  const sessionRoot = path.join(realWorkspaces, sessionId);
  let sessionStat: Stats;
  try {
    sessionStat = await lstat(sessionRoot);
  } catch (error) {
    throw intakeFileSystemError(
      error,
      'SARIF session workspace is not visible',
      'SARIF session workspace could not be inspected',
    );
  }
  if (sessionStat.isSymbolicLink() || !sessionStat.isDirectory()) {
    throw new SarifIntakeError('SARIF session workspace is not a regular directory');
  }

  if (!path.isAbsolute(ref.path) || path.normalize(ref.path) !== ref.path || !contained(sessionRoot, ref.path)) {
    throw new SarifIntakeError('SARIF path is outside the current scan workspace');
  }

  // Walk every path segment under the session root and reject a symlink at any level. Checking only
  // the final component would let a symlinked parent directory redirect the read outside the
  // workspace before the byte read and digest check ever run.
  const relativeSegments = path.relative(sessionRoot, ref.path).split(path.sep);
  let current = sessionRoot;
  for (const segment of relativeSegments) {
    current = path.join(current, segment);
    let stat: Stats;
    try {
      stat = await lstat(current);
    } catch (error) {
      throw intakeFileSystemError(error, 'SARIF path is not visible', 'SARIF path could not be inspected');
    }
    if (stat.isSymbolicLink()) throw new SarifIntakeError('SARIF path contains a symlink');
  }

  let resolvedPath: string;
  try {
    resolvedPath = await realpath(ref.path);
  } catch (error) {
    throw intakeFileSystemError(error, 'SARIF path is not visible', 'SARIF path could not be resolved');
  }
  if (resolvedPath !== ref.path || !contained(sessionRoot, resolvedPath)) {
    throw new SarifIntakeError('SARIF path escapes the current scan workspace');
  }

  let finalStat: Stats;
  try {
    finalStat = await lstat(resolvedPath);
  } catch (error) {
    throw intakeFileSystemError(error, 'SARIF path is not visible', 'SARIF path could not be inspected');
  }
  if (!finalStat.isFile()) throw new SarifIntakeError('SARIF path is not a regular file');

  let bytes: Buffer;
  try {
    bytes = await readFile(resolvedPath);
  } catch (error) {
    throw intakeFileSystemError(error, 'SARIF bytes are not readable', 'SARIF bytes could not be read');
  }
  const observed = createHash('sha256').update(bytes).digest('hex');
  if (observed !== ref.sha256) throw new SarifIntakeError('SARIF digest does not match the exact bytes');
  return bytes;
}
