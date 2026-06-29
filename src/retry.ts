// Retry policy helpers. Pure functions so the backoff math and Retry-After
// parsing are exhaustively testable without timers.

export interface BackoffOptions {
  baseMs?: number;
  capMs?: number;
  random?: () => number;
}

/// Full-jitter exponential backoff: a uniformly random delay in
/// [0, min(capMs, baseMs * 2^attempt)]. `random` is injectable for determinism.
export function backoffDelayMs(
  attempt: number,
  options: BackoffOptions = {},
): number {
  const baseMs = options.baseMs ?? 500;
  const capMs = options.capMs ?? 10_000;
  const random = options.random ?? Math.random;
  const ceiling = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.round(random() * ceiling);
}

/// Whether a status warrants a retry: 429 (rate limited) and any 5xx.
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/// The honored Retry-After is bounded so a malformed or hostile header value
/// (e.g. "Retry-After: 99999999999999999999") cannot translate into an
/// effectively unbounded sleep. The server's rate-limit window is 60s, so this
/// ceiling never clips a legitimate value while capping pathological ones. The
/// three SDKs share this bound for behavioural parity.
export const MAX_RETRY_AFTER_MS = 300_000;

/// Parses a Retry-After header value (RFC 7231: delta-seconds or HTTP-date) into
/// milliseconds to wait, relative to `nowMs`. Returns undefined when absent or
/// unparseable; clamps to [0, MAX_RETRY_AFTER_MS].
export function parseRetryAfter(
  value: null | string,
  nowMs: number,
): number | undefined {
  if (value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, MAX_RETRY_AFTER_MS);
  }

  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) {
    return undefined;
  }
  return Math.min(Math.max(0, dateMs - nowMs), MAX_RETRY_AFTER_MS);
}
