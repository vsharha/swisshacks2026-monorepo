/**
 * Ingestion hardening primitives (proposal 11): a bounded-concurrency map and a
 * retry-with-backoff wrapper, shared by the offline extract scripts so a wide
 * connector layer doesn't hammer a source or abort a batch on a transient 429.
 * Pure and deterministic in tests — `sleep` is injectable, so backoff costs no
 * real time under Vitest.
 */

export interface RetryOptions {
  /** Max attempts after the first try (default 3). */
  retries?: number;
  /** Base backoff in ms; doubles each attempt (default 500). */
  baseDelayMs?: number;
  /** Decide whether a thrown error is worth retrying (default: always). */
  shouldRetry?: (error: unknown) => boolean;
  /** Injectable delay (default real setTimeout); tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Run `fn`, retrying on failure with exponential backoff. Re-throws the last
 * error once attempts are exhausted or `shouldRetry` returns false.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const sleep = options.sleep ?? realSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

/** True for HTTP statuses worth retrying (rate-limit / transient server error). */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

/**
 * Map `worker` over `items` with at most `concurrency` in flight, preserving
 * input order in the results. A rejecting worker rejects the whole call (callers
 * that want per-item tolerance should catch inside the worker).
 */
export async function mapPool<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 4,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: limit }, run));
  return results;
}
