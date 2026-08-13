/**
 * Terminal status output for long-running steps.
 *
 * Commands are run with their output captured rather than inherited, so raw docker
 * plumbing never floods the terminal. Progress is shown with a `@clack/prompts`
 * spinner. On failure the captured output is printed so the error stays visible
 * instead of being swallowed.
 */

import { spawn } from 'node:child_process';
import * as p from '@clack/prompts';

export interface StepResult {
  ok: boolean;
  output: string;
}

/**
 * Run a command capturing stdout and stderr. Resolves the exit result and combined
 * output; never rejects. Callers that want a spinner wrap this in one themselves.
 */
export function spawnCaptured(cmd: string, args: string[]): Promise<StepResult> {
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('close', (code) => resolve({ ok: code === 0, output }));
    child.on('error', () => resolve({ ok: false, output }));
  });
}

/** Print captured command output to stderr, so a failure is never swallowed. */
export function surfaceOutput(output: string): void {
  const trimmed = output.trim();
  if (trimmed) process.stderr.write(`${trimmed}\n`);
}

/**
 * Run a command as a labeled step, with a spinner over it. On failure the captured
 * output is surfaced. Returns the exit result and captured output.
 */
export async function runStep(label: string, cmd: string, args: string[]): Promise<StepResult> {
  const spinner = p.spinner();
  spinner.start(label);

  const result = await spawnCaptured(cmd, args);
  if (result.ok) {
    spinner.stop(label);
  } else {
    spinner.error(label);
    surfaceOutput(result.output);
  }

  return result;
}
