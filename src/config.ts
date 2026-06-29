import type { AuthConfig } from "./auth.session";

// Default API host (the canonical public domain). Sandbox and live share one
// host (the environment is a token claim, not a host switch). Override `baseUrl`
// to point at a different deployment.
export const DEFAULT_BASE_URL = "https://api.expys.com";

/**
 * The credential's environment. Routing is enforced server-side via the token
 * claim, so the SDK does not route by it - it only surfaces it in the
 * `User-Agent` for attribution.
 *
 * @example
 * ```ts
 * const environment: Environment = "sandbox";
 * ```
 */
export type Environment = "live" | "sandbox";

/**
 * Configuration for {@link initialize}. Carries the short-lived member token plus
 * optional transport, retry, and token-refresh settings. Option names are shared
 * across the TypeScript, Swift, and Kotlin SDKs.
 *
 * @example
 * ```ts
 * const config: ExpysConfig = {
 *   token: memberToken,
 *   environment: "live",
 *   maxRetries: 3,
 *   timeoutMs: 10_000,
 * };
 * ```
 */
export interface ExpysConfig extends AuthConfig {
  /** API base URL. Defaults to the production host. */
  baseUrl?: string;
  /**
   * The credential's environment. Routing is enforced server-side via the token
   * claim; the SDK surfaces this in the `User-Agent` for attribution. Default
   * `"live"`.
   */
  environment?: Environment;
  /** Custom `fetch` implementation (e.g. for Node < 18 or instrumentation). */
  fetch?: typeof fetch;
  /** Additional attempts after the first on retryable (429/5xx) failures. Default 2. */
  maxRetries?: number;
  /**
   * The Expys org id. Optional - the member token already scopes requests to an
   * org server-side; surfaced in the `User-Agent` for attribution when provided.
   */
  orgId?: string;
  /** Per-request timeout in ms (via `AbortController`). Disabled when unset. */
  timeoutMs?: number;
  /**
   * Appended to the SDK `User-Agent` (e.g. your app name/version). Named
   * `userAgentSuffix` to match the Swift and Kotlin SDKs.
   */
  userAgentSuffix?: string;
}
