import { setTimeout as sleep } from 'node:timers/promises';

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 250
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= maxAttempts) break;
      const jitter = Math.floor(Math.random() * 50);
      const delay = baseDelayMs * 2 ** (attempt - 1) + jitter;
      await sleep(delay);
    }
  }

  throw lastError;
}
