// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Fixed, bounded IPC process; neither source data nor caller options select code. */
export async function runIsolated(
  job: object,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ message?: unknown; code?: 'processing_timeout' | 'processing_failed' }> {
  if (signal?.aborted) return { code: 'processing_timeout' };
  return new Promise((resolve) => {
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        ['systemroot', 'windir', 'temp', 'tmp', 'tmpdir'].includes(key.toLowerCase()),
      ),
    );
    let message: unknown;
    let timedOut = false;
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=128', fileURLToPath(new URL('./worker.js', import.meta.url))],
      {
        env: environment,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      },
    );
    const stop = () => {
      timedOut = true;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    child.once('error', () => child.kill('SIGKILL'));
    child.once('message', (value) => {
      message = value;
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      resolve(
        timedOut
          ? { code: 'processing_timeout' }
          : code === 0 && message !== undefined
            ? { message }
            : { code: 'processing_failed' },
      );
    });
    child.send(job, (error) => {
      if (error) child.kill('SIGKILL');
    });
  });
}
