// Generates idempotency keys for write requests. The same key must be reused
// across retries of one logical operation (the server replays the first
// response), so callers generate a key once per call and the HTTP layer reuses
// it for that call's retries.

const cryptoRef: undefined | { randomUUID?: () => string } = (
  globalThis as { crypto?: { randomUUID?: () => string } }
).crypto;

/**
 * Returns a UUID v4 for use as an `Idempotency-Key`. Prefers the platform crypto
 * (web, Node 19+, modern Hermes); falls back to a `Math.random`-based v4 where
 * `crypto.randomUUID` is unavailable (older Hermes / React Native). Idempotency
 * keys need uniqueness, not cryptographic strength. The crypto source is
 * injectable so both branches are testable (it is captured at module load,
 * otherwise the fallback is unreachable).
 *
 * The SDK calls this automatically for writes; use it directly to pre-generate a
 * key you can reuse to retry a write safely across sessions.
 *
 * @param crypto - Optional crypto source exposing `randomUUID`; defaults to the
 *   platform `globalThis.crypto`.
 * @returns A UUID v4 string.
 * @example
 * ```ts
 * import { generateIdempotencyKey } from "@expys/sdk";
 *
 * const key = generateIdempotencyKey();
 * await expys.createRedemption({ offer: "off_123" }, { idempotencyKey: key });
 * ```
 */
export function generateIdempotencyKey(
  crypto: undefined | { randomUUID?: () => string } = cryptoRef,
): string {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
