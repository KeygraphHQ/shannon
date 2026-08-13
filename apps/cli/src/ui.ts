/**
 * Terminal status output for long-running steps.
 *
 * Runs a command with its output captured rather than inherited, so raw docker
 * plumbing never floods the terminal. Progress is shown with a `@clack/prompts`
 * spinner, which renders its own start/stop/error states. On failure the captured
 * output is printed so the error stays visible instead of being swallowed.
 */

import { spawn } from 'node:child_process';
import * as p from '@clack/prompts';

export interface StepResult {
  ok: boolean;
  output: string;
}

/**
 * Run a command as a labeled step, capturing stdout and stderr. Returns the exit
 * result and the captured output; the caller decides what to do on failure.
 */
export async function runStep(label: string, cmd: string, args: string[]): Promise<StepResult> {
  let captured = '';

  const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', (chunk) => {
    captured += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    captured += chunk.toString();
  });

  const spinner = p.spinner();
  spinner.start(label);

  const code = await new Promise<number>((resolve) => {
    child.on('close', (exitCode) => resolve(exitCode ?? 1));
    child.on('error', () => resolve(1));
  });

  const ok = code === 0;
  if (ok) {
    spinner.stop(label);
  } else {
    spinner.error(label);
    const trimmed = captured.trim();
    if (trimmed) process.stderr.write(`${trimmed}\n`);
  }

  return { ok, output: captured };
}
