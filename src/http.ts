import type { AuthSession } from "./auth.session";

import { NetworkError, TimeoutError, toApiError } from "./errors";
import { backoffDelayMs, isRetryableStatus, parseRetryAfter } from "./retry";

export interface HttpClient {
  request<T>(req: HttpRequest): Promise<T>;
}

export interface HttpClientConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /// Additional attempts after the first on retryable failures. Default 2.
  maxRetries?: number;
  now?: () => number;
  random?: () => number;
  session: AuthSession;
  sleep?: (ms: number) => Promise<void>;
  /// Per-attempt timeout via AbortController. Disabled when undefined.
  timeoutMs?: number;
  userAgent?: string;
}

export interface HttpRequest {
  body?: unknown;
  idempotencyKey?: string;
  method: "DELETE" | "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, number | string | undefined>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isAbortError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { name?: string }).name === "AbortError";

const buildUrl = (
  baseUrl: string,
  path: string,
  query?: Record<string, number | string | undefined>,
): string => {
  const url = `${baseUrl}${path}`;
  if (!query) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
};

const buildInit = (
  req: HttpRequest,
  token: string,
  userAgent: string | undefined,
  signal: AbortSignal | undefined,
): RequestInit => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  if (req.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (req.idempotencyKey) {
    headers["Idempotency-Key"] = req.idempotencyKey;
  }
  if (userAgent) {
    headers["User-Agent"] = userAgent;
  }
  return {
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    headers,
    method: req.method,
    signal,
  };
};

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  return JSON.parse(text) as unknown;
};

const safeReadJson = async (response: Response): Promise<unknown> => {
  try {
    return await readJson(response);
  } catch {
    return undefined;
  }
};

/// Builds the request engine: token attach, proactive + reactive (401) refresh,
/// retry/backoff on 429/5xx honoring Retry-After, idempotency-key passthrough,
/// and typed-error mapping. All time/randomness is injectable for testing.
export function createHttpClient(config: HttpClientConfig): HttpClient {
  const {
    baseUrl,
    fetchImpl = fetch,
    maxRetries = 2,
    now = Date.now,
    random = Math.random,
    session,
    sleep = defaultSleep,
    timeoutMs,
    userAgent,
  } = config;

  return {
    async request<T>(req: HttpRequest): Promise<T> {
      if (session.shouldRefreshProactively()) {
        // Best effort: a transient refresh failure must not block a token that
        // may still be valid; the reactive 401 path will recover otherwise.
        try {
          await session.refresh();
        } catch {
          /* swallow - handled reactively */
        }
      }

      const url = buildUrl(baseUrl, req.path, req.query);
      let attempt = 0;
      let refreshedOn401 = false;

      for (;;) {
        const controller =
          timeoutMs === undefined ? undefined : new AbortController();
        const timer = controller
          ? setTimeout(() => controller.abort(), timeoutMs)
          : undefined;

        let response: Response;
        try {
          response = await fetchImpl(
            url,
            buildInit(req, session.getToken(), userAgent, controller?.signal),
          );
        } catch (cause) {
          if (timer) {
            clearTimeout(timer);
          }
          if (attempt < maxRetries) {
            await sleep(backoffDelayMs(attempt, { random }));
            attempt += 1;
            continue;
          }
          if (isAbortError(cause)) {
            throw new TimeoutError("Request timed out");
          }
          throw new NetworkError(
            `Network request failed: ${String(
              (cause as undefined | { message?: string })?.message ?? cause,
            )}`,
          );
        }
        if (timer) {
          clearTimeout(timer);
        }

        if (response.ok) {
          return (await readJson(response)) as T;
        }

        if (
          response.status === 401 &&
          session.canRefresh() &&
          !refreshedOn401
        ) {
          refreshedOn401 = true;
          try {
            await session.refresh();
          } catch {
            throw toApiError(
              401,
              await safeReadJson(response),
              undefined,
              response.headers.get("x-request-id") ?? undefined,
            );
          }
          continue;
        }

        if (isRetryableStatus(response.status) && attempt < maxRetries) {
          const retryAfterMs = parseRetryAfter(
            response.headers.get("retry-after"),
            now(),
          );
          await sleep(retryAfterMs ?? backoffDelayMs(attempt, { random }));
          attempt += 1;
          continue;
        }

        const body = await safeReadJson(response);
        const retryAfterMs =
          response.status === 429
            ? parseRetryAfter(response.headers.get("retry-after"), now())
            : undefined;
        throw toApiError(
          response.status,
          body,
          retryAfterMs,
          response.headers.get("x-request-id") ?? undefined,
        );
      }
    },
  };
}
