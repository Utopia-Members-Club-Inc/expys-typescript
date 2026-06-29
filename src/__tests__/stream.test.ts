import { describe, expect, it } from "bun:test";

import type { Message } from "../types";
import type { AuthSession } from "../auth.session";

import { streamSse } from "../stream";
import {
  ApiError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../errors";

// Builds a Response whose body is a ReadableStream emitting the given SSE text
// chunks, recording when the underlying reader is cancelled so cancellation can
// be asserted. status defaults to 200 (text/event-stream).
const sseResponse = (
  parts: string[],
  status = 200,
  headers: Record<string, string> = {},
): { cancelled: () => boolean; response: Response } => {
  let cancelledFlag = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelledFlag = true;
    },
    start(controller) {
      const encoder = new TextEncoder();
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    },
  });
  return {
    response: new Response(body, {
      headers: { "content-type": "text/event-stream", ...headers },
      status,
    }),
    cancelled: () => cancelledFlag,
  };
};

// Like sseResponse, but the body's reader rejects when cancelled. This drives
// the teardown closure (`reader.cancel().catch(() => undefined)`) inside
// readTextChunks, proving the swallow-on-cancel path is exercised, not just
// declared.
const sseResponseRejectingCancel = (
  parts: string[],
): { cancelRejected: () => boolean; response: Response } => {
  let cancelRejectedFlag = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelRejectedFlag = true;
      return Promise.reject(new Error("cancel boom"));
    },
    start(controller) {
      const encoder = new TextEncoder();
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      // Intentionally left open so a consumer break triggers reader.cancel().
    },
  });
  return {
    response: new Response(body, {
      headers: { "content-type": "text/event-stream" },
      status: 200,
    }),
    cancelRejected: () => cancelRejectedFlag,
  };
};

const errorResponse = (
  status: number,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify({ error: { code: "X", message: "nope" } }), {
    headers: { "content-type": "application/json", ...headers },
    status,
  });

const messageJson = (id: string): string =>
  JSON.stringify({
    authorID: "a1",
    body: "hi",
    createdAt: "2026-01-01T00:00:00Z",
    id,
    type: "member",
  });

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

// A fetch that returns each queued response/error in order and records the
// init it was called with (so headers / abort signal can be asserted).
const queueFetch = (queue: Array<Error | Response>) => {
  const inits: RequestInit[] = [];
  const fetchImpl = (_url: string, init: RequestInit) => {
    inits.push(init);
    const next = queue.shift();
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return Promise.resolve(next as Response);
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, inits };
};

const base = {
  baseUrl: "https://api.test",
  path: "/v1/conversations/c1/stream",
  userAgent: "ua/1",
  now: () => 1000,
  random: () => 1,
};

const take = async (
  stream: AsyncIterable<Message>,
  count: number,
): Promise<Message[]> => {
  const out: Message[] = [];
  for await (const message of stream) {
    out.push(message);
    if (out.length >= count) {
      break;
    }
  }
  return out;
};

describe("stream::streamSse happy path", () => {
  it("decodes a data event into a typed Message with the bearer token", async () => {
    const { fetchImpl, inits } = queueFetch([
      sseResponse([`data: ${messageJson("m1")}\n\n`]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: async () => {},
    });

    const [message] = await take(stream, 1);
    expect(message.id).toBe("m1");
    expect(message.authorID).toBe("a1");
    expect(message.body).toBe("hi");
    const headers = inits[0].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t0");
    expect(headers.Accept).toBe("text/event-stream");
    expect(headers["User-Agent"]).toBe("ua/1");
  });

  it("skips heartbeat comment lines and yields only messages", async () => {
    const { fetchImpl } = queueFetch([
      sseResponse([
        ": heartbeat\n\n",
        `data: ${messageJson("m1")}\n\n`,
        ": heartbeat\n\n",
      ]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: async () => {},
    });

    const messages = await take(stream, 1);
    expect(messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("decodes a multi-line data payload with leading-space stripping", async () => {
    // Multi-line data is joined with a newline (SSE spec). JSON tolerates
    // newlines as inter-token whitespace, so splitting on a structural boundary
    // reconstitutes a valid object. The second line's single leading space is
    // stripped; the object stays well-formed.
    const { fetchImpl } = queueFetch([
      sseResponse([
        'data: {"id":"m1","authorID":"a1",\n',
        'data: "body":"hi","createdAt":"2026-01-01T00:00:00Z","type":"member"}\n\n',
      ]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: async () => {},
    });

    const [message] = await take(stream, 1);
    expect(message.id).toBe("m1");
    expect(message.body).toBe("hi");
  });
});

describe("stream::cancellation", () => {
  it("cancels the underlying body reader when the consumer breaks", async () => {
    const tracked = sseResponse([
      `data: ${messageJson("m1")}\n\n`,
      `data: ${messageJson("m2")}\n\n`,
    ]);
    const { fetchImpl } = queueFetch([tracked.response]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: async () => {},
    });

    // Break after the first message.
    await take(stream, 1);
    expect(tracked.cancelled()).toBe(true);
  });

  it("swallows a reader.cancel rejection during teardown on consumer break", async () => {
    // The body's reader rejects when cancelled; the consumer breaking the
    // for-await must still settle cleanly (the rejection is swallowed) rather
    // than surfacing the teardown error.
    const tracked = sseResponseRejectingCancel([
      `data: ${messageJson("m1")}\n\n`,
      `data: ${messageJson("m2")}\n\n`,
    ]);
    const { fetchImpl } = queueFetch([tracked.response]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: async () => {},
    });

    // Breaking after one message must resolve without throwing the cancel error.
    const result = await take(stream, 1).catch((e: unknown) => e);
    expect(Array.isArray(result)).toBe(true);
    expect((result as Message[])[0].id).toBe("m1");
    expect(tracked.cancelRejected()).toBe(true);
  });
});

describe("stream::reconnect", () => {
  it("sleeps with backoff after a transient network failure then resumes", async () => {
    const sleeps: number[] = [];
    const { fetchImpl } = queueFetch([
      new Error("connection reset"),
      sseResponse([`data: ${messageJson("m1")}\n\n`]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    const [message] = await take(stream, 1);
    expect(message.id).toBe("m1");
    expect(sleeps).toEqual([500]); // random()=1 -> full ceiling at attempt 0
  });

  it("reconnects on a 5xx and honors Retry-After on a 429", async () => {
    const sleeps: number[] = [];
    const { fetchImpl } = queueFetch([
      errorResponse(503),
      errorResponse(429, { "retry-after": "2" }),
      sseResponse([`data: ${messageJson("m1")}\n\n`]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    const [message] = await take(stream, 1);
    expect(message.id).toBe("m1");
    // 503 -> jittered backoff (500), 429 -> Retry-After (2000).
    expect(sleeps).toEqual([500, 2000]);
  });

  it("reconnects after the server closes the stream cleanly", async () => {
    const sleeps: number[] = [];
    const { fetchImpl } = queueFetch([
      // First connection ends with no message (server closed the stream).
      sseResponse([": heartbeat\n\n"]).response,
      sseResponse([`data: ${messageJson("m1")}\n\n`]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    const [message] = await take(stream, 1);
    expect(message.id).toBe("m1");
    expect(sleeps).toEqual([500]);
  });

  it("loops through repeated clean closes before a message arrives", async () => {
    // Two back-to-back clean closes force the loop tail (the post-close
    // backoff -> attempt++ -> loop-back) to run for a *non-final* iteration, so
    // control flows past the closing brace of the `for (;;)` and re-enters it.
    const sleeps: number[] = [];
    const { fetchImpl } = queueFetch([
      sseResponse([": heartbeat\n\n"]).response, // clean close, no message
      sseResponse([": heartbeat\n\n"]).response, // clean close, no message
      sseResponse([`data: ${messageJson("m1")}\n\n`]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    const [message] = await take(stream, 1);
    expect(message.id).toBe("m1");
    // A clean close resets `attempt` to 0 each time, so both backoffs are 500ms.
    expect(sleeps).toEqual([500, 500]);
  });
});

describe("stream::permanent errors", () => {
  it("throws ForbiddenError on 403 without reconnecting", async () => {
    const { fetchImpl, inits } = queueFetch([errorResponse(403)]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: async () => {},
    });

    const error = await take(stream, 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(inits.length).toBe(1);
  });

  it("throws NotFoundError on 404 without reconnecting", async () => {
    const { fetchImpl, inits } = queueFetch([errorResponse(404)]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: async () => {},
    });

    const error = await take(stream, 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(inits.length).toBe(1);
  });

  it("throws on a permanent non-retryable status (400) without reconnecting", async () => {
    const { fetchImpl, inits } = queueFetch([
      // A non-JSON body exercises the safeReadJson fall-through to undefined.
      new Response("<html>bad</html>", {
        headers: { "content-type": "text/html" },
        status: 400,
      }),
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: async () => {},
    });

    const error = (await take(stream, 1).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(inits.length).toBe(1);
  });

  it("refreshes once on 401 then resumes with the new token", async () => {
    const { fetchImpl, inits } = queueFetch([
      errorResponse(401),
      sseResponse([`data: ${messageJson("m1")}\n\n`]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession("t0", true),
      sleep: async () => {},
    });

    const [message] = await take(stream, 1);
    expect(message.id).toBe("m1");
    expect((inits[0].headers as Record<string, string>).Authorization).toBe(
      "Bearer t0",
    );
    expect((inits[1].headers as Record<string, string>).Authorization).toBe(
      "Bearer t-refreshed",
    );
  });

  it("throws UnauthorizedError when a refreshed token still 401s", async () => {
    const { fetchImpl } = queueFetch([errorResponse(401), errorResponse(401)]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession("t0", true),
      sleep: async () => {},
    });

    const error = await take(stream, 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError on 401 when no refresh is possible", async () => {
    const { fetchImpl } = queueFetch([errorResponse(401)]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession("t0", false),
      sleep: async () => {},
    });

    const error = await take(stream, 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when the reactive refresh itself fails", async () => {
    const session: AuthSession = {
      canRefresh: () => true,
      getToken: () => "t0",
      refresh: () => Promise.reject(new Error("refresh boom")),
      shouldRefreshProactively: () => false,
    };
    const { fetchImpl } = queueFetch([errorResponse(401)]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session,
      sleep: async () => {},
    });

    const error = await take(stream, 1).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
  });
});

describe("stream::proactive refresh and edges", () => {
  it("proactively refreshes before connecting when the session asks", async () => {
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
    const { fetchImpl, inits } = queueFetch([
      sseResponse([`data: ${messageJson("m1")}\n\n`]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session,
      sleep: async () => {},
    });

    await take(stream, 1);
    expect((inits[0].headers as Record<string, string>).Authorization).toBe(
      "Bearer t-proactive",
    );
  });

  it("reconnects when a connection has no readable body", async () => {
    const sleeps: number[] = [];
    const { fetchImpl } = queueFetch([
      new Response(null, {
        headers: { "content-type": "text/event-stream" },
        status: 200,
      }),
      sseResponse([`data: ${messageJson("m1")}\n\n`]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });

    const [message] = await take(stream, 1);
    expect(message.id).toBe("m1");
    expect(sleeps).toEqual([500]);
  });

  it("falls back to the built-in sleep when none is injected", async () => {
    // random()=>0 makes the backoff ~0ms so the real setTimeout stays fast.
    const { fetchImpl } = queueFetch([
      new Error("reset"),
      sseResponse([`data: ${messageJson("m1")}\n\n`]).response,
    ]);
    const stream = streamSse({
      ...base,
      fetchImpl,
      session: fakeSession(),
      random: () => 0,
    });

    const [message] = await take(stream, 1);
    expect(message.id).toBe("m1");
  });
});
