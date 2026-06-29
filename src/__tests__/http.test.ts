import { describe, expect, it } from "bun:test";

import type { AuthSession } from "../auth.session";

import { createHttpClient } from "../http";
import {
  ConflictError,
  NetworkError,
  RateLimitError,
  ServerError,
  TimeoutError,
  UnauthorizedError,
} from "../errors";

interface RecordedCall {
  init: RequestInit;
  url: string;
}

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...headers },
    status,
  });

// A fetch that returns each queued response/error in order and records calls.
const queueFetch = (queue: Array<Error | Response>) => {
  const calls: RecordedCall[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ init, url });
    const next = queue.shift();
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return Promise.resolve(next as Response);
  };
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
};

const fakeSession = (token = "t0", canRefresh = false): AuthSession => {
  let current = token;
  return {
    canRefresh: () => canRefresh,
    getToken: () => current,
    shouldRefreshProactively: () => false,
    refresh: () => {
      current = "t-refreshed";
      return Promise.resolve();
    },
  };
};

const headerOf = (init: RequestInit, name: string): string | undefined =>
  (init.headers as Record<string, string>)[name];

const base = {
  baseUrl: "https://api.test",
  now: () => 1000,
  random: () => 1,
  sleep: async () => {},
};

describe("http::request success path", () => {
  it("GETs and parses JSON, attaching the bearer token and Accept", async () => {
    const { calls, fetchImpl } = queueFetch([jsonResponse({ ok: true })]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
    });

    const result = await client.request({ method: "GET", path: "/v1/offers" });

    expect(result).toEqual({ ok: true });
    expect(calls[0].url).toBe("https://api.test/v1/offers");
    expect(headerOf(calls[0].init, "Authorization")).toBe("Bearer t0");
    expect(headerOf(calls[0].init, "Accept")).toBe("application/json");
  });

  it("serializes query params and skips undefined", async () => {
    const { calls, fetchImpl } = queueFetch([jsonResponse({ data: [] })]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
    });

    await client.request({
      method: "GET",
      path: "/v1/offers",
      query: { cursor: undefined, limit: 25 },
    });

    expect(calls[0].url).toBe("https://api.test/v1/offers?limit=25");
  });

  it("POSTs JSON with Content-Type and the idempotency key", async () => {
    const { calls, fetchImpl } = queueFetch([jsonResponse({ id: "r1" })]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
    });

    await client.request({
      body: { offer: "off_1" },
      idempotencyKey: "key-123",
      method: "POST",
      path: "/v1/redemptions",
    });

    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0].init, "Content-Type")).toBe("application/json");
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBe("key-123");
    expect(calls[0].init.body).toBe(JSON.stringify({ offer: "off_1" }));
  });

  it("PUTs JSON with a body and Content-Type", async () => {
    const { calls, fetchImpl } = queueFetch([jsonResponse({ tier: "gold" })]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
    });

    await client.request({
      body: { tier: "gold" },
      method: "PUT",
      path: "/v1/members/u1",
    });

    expect(calls[0].init.method).toBe("PUT");
    expect(headerOf(calls[0].init, "Content-Type")).toBe("application/json");
    expect(calls[0].init.body).toBe(JSON.stringify({ tier: "gold" }));
  });

  it("DELETEs with no body and no Content-Type", async () => {
    const { calls, fetchImpl } = queueFetch([jsonResponse({ ok: true })]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
    });

    await client.request({ method: "DELETE", path: "/v1/webhooks/wh1" });

    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].init.body).toBeUndefined();
    expect(headerOf(calls[0].init, "Content-Type")).toBeUndefined();
  });
});

describe("http::retry", () => {
  it("retries a 429 honoring Retry-After then succeeds", async () => {
    const sleeps: number[] = [];
    const { calls, fetchImpl } = queueFetch([
      jsonResponse({ error: { code: "RATE_LIMITED", message: "slow" } }, 429, {
        "retry-after": "2",
      }),
      jsonResponse({ ok: true }),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    const result = await client.request({ method: "GET", path: "/v1/offers" });

    expect(result).toEqual({ ok: true });
    expect(calls.length).toBe(2);
    expect(sleeps).toEqual([2000]);
  });

  it("reuses the same idempotency key across a retried write", async () => {
    const { calls, fetchImpl } = queueFetch([
      jsonResponse({ error: { code: "RATE_LIMITED", message: "slow" } }, 429, {
        "retry-after": "1",
      }),
      jsonResponse({ id: "r1" }),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
    });

    await client.request({
      body: { offer: "off_1" },
      idempotencyKey: "key-abc",
      method: "POST",
      path: "/v1/redemptions",
    });

    // The server only replays the first response if every attempt carries the
    // SAME key; a per-attempt regenerated key would create a duplicate booking.
    expect(calls.length).toBe(2);
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBe("key-abc");
    expect(headerOf(calls[1].init, "Idempotency-Key")).toBe("key-abc");
  });

  it("retries a 429 without Retry-After using jittered backoff", async () => {
    const sleeps: number[] = [];
    const { fetchImpl } = queueFetch([
      jsonResponse({ error: { code: "RATE_LIMITED", message: "slow" } }, 429),
      jsonResponse({ ok: true }),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
      random: () => 1, // full ceiling = baseMs (500) at attempt 0
      sleep: (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    await client.request({ method: "GET", path: "/v1/offers" });
    expect(sleeps).toEqual([500]);
  });

  it("retries a 5xx then succeeds", async () => {
    const { calls, fetchImpl } = queueFetch([
      jsonResponse({ error: { code: "INTERNAL", message: "x" } }, 503),
      jsonResponse({ ok: true }),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
    });

    await client.request({ method: "GET", path: "/v1/offers" });
    expect(calls.length).toBe(2);
  });

  it("throws RateLimitError with retryAfterMs once retries are exhausted", async () => {
    const { fetchImpl } = queueFetch([
      jsonResponse({ error: { code: "RATE_LIMITED", message: "slow" } }, 429, {
        "retry-after": "3",
      }),
      jsonResponse({ error: { code: "RATE_LIMITED", message: "slow" } }, 429, {
        "retry-after": "3",
      }),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      maxRetries: 1,
      session: fakeSession(),
    });

    const error = (await client
      .request({ method: "GET", path: "/v1/offers" })
      .catch((e: unknown) => e)) as RateLimitError;
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfterMs).toBe(3000);
  });

  it("retries network failures then throws NetworkError", async () => {
    const { calls, fetchImpl } = queueFetch([
      new Error("connection reset"),
      new Error("connection reset"),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      maxRetries: 1,
      session: fakeSession(),
    });

    const error = await client
      .request({ method: "GET", path: "/v1/offers" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(calls.length).toBe(2);
  });

  it("maps an AbortError to TimeoutError", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const { fetchImpl } = queueFetch([abort as unknown as Error]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      maxRetries: 0,
      session: fakeSession(),
    });

    const error = await client
      .request({ method: "GET", path: "/v1/offers" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeoutError);
  });
});

describe("http::auth refresh", () => {
  it("refreshes on 401 and retries with the new token", async () => {
    const { calls, fetchImpl } = queueFetch([
      jsonResponse(
        { error: { code: "UNAUTHORIZED", message: "expired" } },
        401,
      ),
      jsonResponse({ ok: true }),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession("t0", true),
    });

    const result = await client.request({ method: "GET", path: "/v1/offers" });
    expect(result).toEqual({ ok: true });
    expect(headerOf(calls[0].init, "Authorization")).toBe("Bearer t0");
    expect(headerOf(calls[1].init, "Authorization")).toBe("Bearer t-refreshed");
  });

  it("does not retry a 401 when no refresh is possible", async () => {
    const { calls, fetchImpl } = queueFetch([
      jsonResponse({ error: { code: "UNAUTHORIZED", message: "no" } }, 401),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession("t0", false),
    });

    const error = await client
      .request({ method: "GET", path: "/v1/offers" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(calls.length).toBe(1);
  });

  it("proactively refreshes before the request when the session asks", async () => {
    let token = "t0";
    const session: AuthSession = {
      canRefresh: () => true,
      getToken: () => token,
      shouldRefreshProactively: () => true,
      refresh: () => {
        token = "t-proactive";
        return Promise.resolve();
      },
    };
    const { calls, fetchImpl } = queueFetch([jsonResponse({ ok: true })]);
    const client = createHttpClient({ ...base, fetchImpl, session });

    await client.request({ method: "GET", path: "/v1/offers" });
    expect(headerOf(calls[0].init, "Authorization")).toBe("Bearer t-proactive");
  });
});

describe("http::non-retryable errors", () => {
  it("throws a typed ConflictError immediately, preserving the code", async () => {
    const { calls, fetchImpl } = queueFetch([
      jsonResponse(
        { error: { code: "REDEMPTION_ALREADY_EXISTS", message: "dupe" } },
        409,
      ),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
    });

    const error = (await client
      .request({ body: {}, method: "POST", path: "/v1/redemptions" })
      .catch((e: unknown) => e)) as ConflictError;
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe("REDEMPTION_ALREADY_EXISTS");
    expect(calls.length).toBe(1);
  });

  it("surfaces the x-request-id response header on the thrown error", async () => {
    const { fetchImpl } = queueFetch([
      jsonResponse({ error: { code: "CONFLICT", message: "dupe" } }, 409, {
        "x-request-id": "req_abc123",
      }),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
    });

    const error = (await client
      .request({ body: {}, method: "POST", path: "/v1/redemptions" })
      .catch((e: unknown) => e)) as ConflictError;
    expect(error.requestId).toBe("req_abc123");
  });

  it("throws the 401 (with requestId) when the refresh itself fails", async () => {
    const session: AuthSession = {
      canRefresh: () => true,
      getToken: () => "t0",
      refresh: () => Promise.reject(new Error("refresh boom")),
      shouldRefreshProactively: () => false,
    };
    const { fetchImpl } = queueFetch([
      jsonResponse(
        { error: { code: "UNAUTHORIZED", message: "expired" } },
        401,
        { "x-request-id": "req_401" },
      ),
    ]);
    const client = createHttpClient({ ...base, fetchImpl, session });

    const error = (await client
      .request({ method: "GET", path: "/v1/offers" })
      .catch((e: unknown) => e)) as UnauthorizedError;
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.requestId).toBe("req_401");
  });

  it("tolerates a non-JSON error body, defaulting the code from status", async () => {
    const { fetchImpl } = queueFetch([
      new Response("<html>oops</html>", {
        headers: { "content-type": "text/html" },
        status: 500,
      }),
    ]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      maxRetries: 0,
      session: fakeSession(),
    });

    const error = (await client
      .request({ method: "GET", path: "/v1/offers" })
      .catch((e: unknown) => e)) as ServerError;
    expect(error).toBeInstanceOf(ServerError);
    expect(error.code).toBe("INTERNAL");
  });
});

describe("http::timeout and body edges", () => {
  it("returns undefined for an empty success body", async () => {
    const { fetchImpl } = queueFetch([new Response(null, { status: 200 })]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
    });

    const result = await client.request({ method: "GET", path: "/v1/wallet" });
    expect(result).toBeUndefined();
  });

  it("arms a per-request timeout and clears it on success", async () => {
    const { fetchImpl } = queueFetch([jsonResponse({ ok: true })]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      session: fakeSession(),
      timeoutMs: 1000,
    });

    const result = await client.request({ method: "GET", path: "/v1/offers" });
    expect(result).toEqual({ ok: true });
  });

  it("maps an abort under a configured timeout to TimeoutError", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const { fetchImpl } = queueFetch([abort as unknown as Error]);
    const client = createHttpClient({
      ...base,
      fetchImpl,
      maxRetries: 0,
      session: fakeSession(),
      timeoutMs: 50,
    });

    const error = await client
      .request({ method: "GET", path: "/v1/offers" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeoutError);
  });

  it("falls back to the built-in backoff sleep when none is injected", async () => {
    // No `sleep` override: exercises the real setTimeout-based delay. random()=>0
    // makes the backoff ~0ms so the test stays fast.
    const { calls, fetchImpl } = queueFetch([
      jsonResponse({ error: { code: "INTERNAL", message: "x" } }, 503),
      jsonResponse({ ok: true }),
    ]);
    const client = createHttpClient({
      baseUrl: "https://api.test",
      fetchImpl,
      session: fakeSession(),
      random: () => 0,
    });

    await client.request({ method: "GET", path: "/v1/offers" });
    expect(calls.length).toBe(2);
  });
});
