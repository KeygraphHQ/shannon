// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type WorkerOutcome = { message?: unknown; code?: 'processing-timeout' | 'processing-failed' };

async function runFixedWorker(
  worker: URL,
  job: object,
  deadline: bigint,
  signal?: AbortSignal,
): Promise<WorkerOutcome> {
  if (signal?.aborted || deadline <= process.hrtime.bigint()) return { code: 'processing-timeout' };
  return new Promise((resolve) => {
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        ['systemroot', 'windir', 'temp', 'tmp', 'tmpdir'].includes(key.toLowerCase()),
      ),
    );
    let message: unknown;
    let timedOut = false;
    const child = spawn(process.execPath, ['--max-old-space-size=384', fileURLToPath(worker)], {
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    let timer: NodeJS.Timeout | undefined;
    const stop = () => {
      if (timedOut) return;
      timedOut = true;
      child.kill('SIGKILL');
    };
    const remaining = deadline - process.hrtime.bigint();
    if (remaining <= 0n) stop();
    else timer = setTimeout(stop, Number((remaining + 999_999n) / 1_000_000n));
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.once('error', () => child.kill('SIGKILL'));
    child.once('message', (value) => {
      message = value;
    });
    // Resolving only on close ensures deadline/cancellation has reaped our worker.
    child.once('close', (code) => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      resolve(
        timedOut
          ? { code: 'processing-timeout' }
          : code === 0 && message !== undefined
            ? { message }
            : { code: 'processing-failed' },
      );
    });
    if (!timedOut)
      child.send(job, (error) => {
        if (error) child.kill('SIGKILL');
      });
  });
}

/** Only the fixed observation worker can run. Artifact data never selects code. */
export function runObservationWorker(job: object, timeoutMs: number, signal?: AbortSignal): Promise<WorkerOutcome> {
  const deadline = process.hrtime.bigint() + BigInt(Math.max(0, timeoutMs)) * 1_000_000n;
  return runFixedWorker(new URL('./worker.js', import.meta.url), job, deadline, signal);
}

/** Only the fixed comparison worker can run. Artifact data never selects code. */
export function runAccessWorker(job: object, deadline: bigint, signal?: AbortSignal): Promise<WorkerOutcome> {
  return runFixedWorker(new URL('./access-worker.js', import.meta.url), job, deadline, signal);
}
