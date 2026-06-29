import { ExpysError } from "./errors";

export interface AuthConfig {
  /**
   * Clock source in epoch milliseconds, injectable for deterministic tests.
   * @internal
   */
  now?: () => number;
  /** Refresh this many ms before expiry. Default 30s (30000). */
  refreshSkewMs?: number;
  /**
   * Called to obtain a fresh token; should hit the consumer's backend, which
   * re-exchanges the Org-API-Key. Without it, an expired token simply 401s.
   */
  refreshToken?: () => Promise<TokenRefreshResult>;
  /**
   * The short-lived member token, obtained by the consumer's backend via
   * `POST /v1/auth/exchange` (the Org-API-Key never ships in the app).
   */
  token: string;
  /** When the token expires, enabling proactive refresh. Optional. */
  tokenExpiresAt?: Timestamp;
}

export interface AuthSession {
  canRefresh(): boolean;
  getToken(): string;
  refresh(): Promise<void>;
  shouldRefreshProactively(): boolean;
}

/**
 * An instant accepted by the SDK for token expiry: a `Date`, epoch milliseconds
 * (`number`), or an ISO-8601 string.
 *
 * @example
 * ```ts
 * const expiresAt: Timestamp = Date.now() + 60_000;
 * ```
 */
export type Timestamp = Date | number | string;

/**
 * The result of a `refreshToken` hook: the new access token and, optionally, when
 * it expires (which re-arms proactive refresh).
 *
 * @example
 * ```ts
 * const result: TokenRefreshResult = {
 *   accessToken: "eyJ...",
 *   expiresAt: Date.now() + 3_600_000,
 * };
 * ```
 */
export interface TokenRefreshResult {
  /** The new short-lived member access token. */
  accessToken: string;
  /** When the new token expires; re-arms proactive refresh when provided. */
  expiresAt?: Timestamp;
}

const toMs = (value: Timestamp | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

/// Holds the member token and refreshes it via the consumer-supplied hook. The
/// only stateful piece of the SDK; mutation is confined to this closure.
export function createAuthSession(config: AuthConfig): AuthSession {
  let token = config.token;
  let expiresAtMs = toMs(config.tokenExpiresAt);
  const skewMs = config.refreshSkewMs ?? 30_000;
  const now = config.now ?? Date.now;
  const { refreshToken } = config;

  const canRefresh = (): boolean => typeof refreshToken === "function";

  return {
    canRefresh,
    getToken: () => token,
    refresh: async () => {
      if (!refreshToken) {
        throw new ExpysError(
          "Cannot refresh: no refreshToken hook was configured",
        );
      }
      const result = await refreshToken();
      token = result.accessToken;
      expiresAtMs = toMs(result.expiresAt);
    },
    shouldRefreshProactively: () => {
      if (!canRefresh() || expiresAtMs === undefined) {
        return false;
      }
      return now() + skewMs >= expiresAtMs;
    },
  };
}
