import type { Message } from "./types";
import type { AuthSession } from "./auth.session";
import type { ForbiddenError, NotFoundError } from "./errors";

import { toApiError } from "./errors";
import { parseSseEvents } from "./sse";
import { backoffDelayMs, isRetryableStatus, parseRetryAfter } from "./retry";

// The streaming sibling of the buffered transport (`http.ts`). It connects to a
// Server-Sent Events endpoint and yields decoded messages as an AsyncIterable.
// Reconnects with full-jitter backoff on transient failures (network drop / 5xx
// / 429, honoring Retry-After), refreshes once on a 401, and terminates on a
// permanent 403/404. Cancellation (the consumer breaking the `for await`) runs
// the generator's `finally`, which tears down the in-flight connection.

export interface StreamConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  path: string;
  random?: () => number;
  session: AuthSession;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const buildInit = (
  token: string,
  userAgent: string | undefined,
  signal: AbortSignal,
): RequestInit => {
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    Authorization: `Bearer ${token}`,
  };
  if (userAgent) {
    headers["User-Agent"] = userAgent;
  }
  return { headers, method: "GET", signal };
};

const safeReadJson = async (response: Response): Promise<unknown> => {
  try {
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    return undefined;
  }
};

/// Connects to an SSE endpoint and yields each decoded {@link Message}. Lazily
/// reconnects with backoff while the consumer is subscribed; terminates on a
/// permanent error or when the consumer stops iterating. All time/randomness is
/// injectable for testing.
export async function* streamSse(
  config: StreamConfig,
): AsyncGenerator<Message, void, unknown> {
  const {
    baseUrl,
    fetchImpl = fetch,
    now = Date.now,
    path,
    random = Math.random,
    session,
    sleep = defaultSleep,
    userAgent,
  } = config;

  const url = `${baseUrl}${path}`;
  let attempt = 0;
  let refreshedOn401 = false;

  for (;;) {
    if (session.shouldRefreshProactively()) {
      try {
        await session.refresh();
      } catch {
        /* swallow - recovered reactively on a 401 */
      }
    }

    const controller = new AbortController();
    let response: Response;
    try {
      response = await fetchImpl(
        url,
        buildInit(session.getToken(), userAgent, controller.signal),
      );
    } catch {
      // Transient connection failure: back off and reconnect.
      await sleep(backoffDelayMs(attempt, { random }));
      attempt += 1;
      continue;
    }

    if (!response.ok) {
      if (response.status === 403) {
        throw toApiError(403, await safeReadJson(response)) as ForbiddenError;
      }
      if (response.status === 404) {
        throw toApiError(404, await safeReadJson(response)) as NotFoundError;
      }
      if (response.status === 401 && session.canRefresh() && !refreshedOn401) {
        refreshedOn401 = true;
        try {
          await session.refresh();
        } catch {
          throw toApiError(401, await safeReadJson(response));
        }
        // Reconnect immediately with the refreshed token (no backoff sleep:
        // this is an auth recovery, not a transient outage).
        continue;
      }
      if (response.status === 401) {
        throw toApiError(401, await safeReadJson(response));
      }
      if (isRetryableStatus(response.status)) {
        const retryAfterMs =
          response.status === 429
            ? parseRetryAfter(response.headers.get("retry-after"), now())
            : undefined;
        await sleep(retryAfterMs ?? backoffDelayMs(attempt, { random }));
        attempt += 1;
        continue;
      }
      // Any other non-2xx (e.g. 400/422) is permanent for a read stream.
      throw toApiError(response.status, await safeReadJson(response));
    }

    if (!response.body) {
      // No readable body: treat as a dropped connection and reconnect.
      await sleep(backoffDelayMs(attempt, { random }));
      attempt += 1;
      continue;
    }

    // A successful connection resets the backoff sequence and the 401 budget.
    attempt = 0;
    refreshedOn401 = false;
    const chunks = readTextChunks(response.body);
    try {
      for await (const data of parseSseEvents(chunks)) {
        yield JSON.parse(data) as Message;
      }
    } finally {
      // Runs on consumer break/cancel and on natural stream end: aborts the
      // request and cancels the body reader (via the generator's own finally).
      controller.abort();
      await chunks.return(undefined).catch(() => undefined);
    }

    // The server closed the stream cleanly; back off and reconnect.
    await sleep(backoffDelayMs(attempt, { random }));
    attempt += 1;
  }
}

// Turns a Response body (a ReadableStream of bytes) into an async iterable of
// decoded text chunks, releasing the reader lock when iteration ends or the
// consumer aborts. Cancelling the returned iterator cancels the body reader,
// which severs the underlying HTTP connection.
async function* readTextChunks(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) {
      yield tail;
    }
  } finally {
    // Severs the connection on early termination (consumer break / throw).
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
