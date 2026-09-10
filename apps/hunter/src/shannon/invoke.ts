/**
 * Shannon invocation adapter.
 *
 * `planInvocation` is the only path the dry-run pipeline ever takes: it
 * returns the command that *would* run, and never touches the network or a
 * child process. `executeInvocation` exists for a future authorized, live
 * run, and is gated on an explicit `confirmed: true` — it is not called from
 * anywhere in this package today.
 */

import { spawn } from 'node:child_process';
import { err, ok, type Result } from '../types.js';
import { formatInvocation, type ShannonInvocation } from './config.js';

export interface ShannonPlan {
  readonly commandLine: string;
  readonly invocation: ShannonInvocation;
}

/** Dry-run: describe the Shannon invocation without executing anything. */
export function planInvocation(invocation: ShannonInvocation): ShannonPlan {
  return { commandLine: formatInvocation(invocation), invocation };
}

export interface ExecuteOptions {
  /**
   * Must be explicitly set to true by a caller that has already completed
   * scope validation and obtained operator confirmation. There is no
   * default of true.
   */
  readonly confirmed: boolean;
}

export interface ShannonExecutionResult {
  readonly exitCode: number;
}

/**
 * Executes the Shannon CLI for real. Only reachable when `confirmed: true`
 * is passed explicitly; nothing in this package's dry-run or test paths sets
 * that flag, so this function is never invoked as part of the MVP.
 */
export async function executeInvocation(
  invocation: ShannonInvocation,
  options: ExecuteOptions,
): Promise<Result<ShannonExecutionResult, string>> {
  if (!options.confirmed) {
    return err('refusing to execute Shannon: caller did not pass confirmed: true');
  }

  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, { stdio: 'inherit' });
    child.on('error', (error) => resolve(err(`failed to start Shannon: ${error.message}`)));
    child.on('close', (code) => resolve(ok({ exitCode: code ?? 1 })));
  });
}
