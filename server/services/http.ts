/** Error that must not be retried or failed over (the service answered; the answer is "no"). */
export class UserError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON from the first base URL that answers. Free public services (OSRM demo,
 * Nominatim) throttle and time out, so each base gets retries before we move on.
 */
export async function getJsonWithFallback<T>(
  bases: string[],
  path: string,
  { timeoutMs = 12_000, retries = 2, headers }: { timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  let last: unknown = new Error('No service configured');
  for (const base of bases) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(base + path, { headers, signal: AbortSignal.timeout(timeoutMs) });
        if (res.status === 429 || res.status >= 500) throw new Error(`${new URL(base).host} returned ${res.status}`);
        return (await res.json()) as T;
      } catch (e) {
        last = e;
        await sleep(400 * (attempt + 1));
      }
    }
  }
  throw new Error(`Service unavailable (${(last as Error).message}). Try again in a moment.`);
}

/** Run `fn` over items with at most `limit` in flight, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
