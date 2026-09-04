import { describe, expect, it } from "bun:test";

import { initialize } from "../client";
import { DEFAULT_BASE_URL } from "../config";
import { ConflictError, ValidationError } from "../errors";

interface RecordedCall {
  init: RequestInit;
  url: string;
}

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });

const errorResponse = (
  status: number,
  code: string,
  message: string,
): Response =>
  new Response(JSON.stringify({ error: { code, message } }), {
    headers: { "content-type": "application/json" },
    status,
  });

const clientWith = (body: unknown, overrides: Record<string, unknown> = {}) => {
  const calls: RecordedCall[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ init, url });
    return Promise.resolve(jsonResponse(body));
  };
  const client = initialize({
    baseUrl: "https://api.test",
    fetch: fetchImpl as unknown as typeof fetch,
    token: "t0",
    ...overrides,
  });
  return { calls, client };
};

const headerOf = (init: RequestInit, name: string): string | undefined =>
  (init.headers as Record<string, string>)[name];

describe("client::offers", () => {
  it("lists offers with limit and cursor query params", async () => {
    const { calls, client } = clientWith({ data: [], nextCursor: null });
    const result = await client.listOffers({ cursor: "c1", limit: 10 });

    expect(result).toEqual({ data: [], nextCursor: null });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toContain("https://api.test/v1/offers?");
    expect(calls[0].url).toContain("limit=10");
    expect(calls[0].url).toContain("cursor=c1");
  });

  it("lists offers with no params", async () => {
    const { calls, client } = clientWith({ data: [], nextCursor: null });
    await client.listOffers();
    expect(calls[0].url).toBe("https://api.test/v1/offers");
  });

  it("paginates by following nextCursor until it is null", async () => {
    const pages = [
      jsonResponse({ data: [{ id: "o1" }], nextCursor: "c2" }),
      jsonResponse({ data: [{ id: "o2" }], nextCursor: null }),
    ];
    const calls: RecordedCall[] = [];
    const fetchImpl = (url: string, init: RequestInit) => {
      calls.push({ init, url });
      return Promise.resolve(pages.shift() as Response);
    };
    const client = initialize({
      baseUrl: "https://api.test",
      fetch: fetchImpl as unknown as typeof fetch,
      token: "t0",
    });

    const page1 = await client.listOffers({ limit: 1 });
    expect(page1.nextCursor).toBe("c2");
    const page2 = await client.listOffers({
      cursor: page1.nextCursor ?? undefined,
      limit: 1,
    });
    expect(page2.nextCursor).toBeNull();
    expect(calls[1].url).toContain("cursor=c2");
  });
});

describe("client::redemptions", () => {
  it("gets a redemption by id (path-encoded)", async () => {
    const { calls, client } = clientWith({ id: "r 1" });
    await client.getRedemption("r 1");
    expect(calls[0].url).toBe("https://api.test/v1/redemptions/r%201");
    expect(calls[0].init.method).toBe("GET");
  });

  it("creates a redemption, auto-generating an idempotency key", async () => {
    const redemption = {
      canceledNote: null,
      canceledReason: null,
      /// The booking's concierge thread, returned on the create so a client can open
      /// the conversation without a second call.
      conversationId: "r1",
      createdAt: "2026-01-01T00:00:00Z",
      endAt: null,
      /// Present as null until the member scores the experience, never absent.
      feedback: null,
      id: "r1",
      offer: "off_1",
      startAt: null,
      status: "OPEN",
    };
    const { calls, client } = clientWith(redemption);
    const result = await client.createRedemption({ offer: "off_1" });

    expect(result).toEqual(redemption);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify({ offer: "off_1" }));
    expect(headerOf(calls[0].init, "Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it("creates a redemption with a caller-supplied idempotency key", async () => {
    const { calls, client } = clientWith({ id: "r1" });
    await client.createRedemption(
      { externalUserID: "u1", offer: "off_1" },
      { idempotencyKey: "my-key" },
    );
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBe("my-key");
    expect(calls[0].init.body).toBe(
      JSON.stringify({ externalUserID: "u1", offer: "off_1" }),
    );
  });

  it("surfaces a 409 as ConflictError(REDEMPTION_ALREADY_EXISTS)", async () => {
    const client = initialize({
      baseUrl: "https://api.test",
      token: "t0",
      fetch: (() =>
        Promise.resolve(
          errorResponse(409, "REDEMPTION_ALREADY_EXISTS", "duplicate"),
        )) as unknown as typeof fetch,
    });

    try {
      await client.createRedemption({ offer: "off_1" });
      throw new Error("expected createRedemption to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe("REDEMPTION_ALREADY_EXISTS");
      expect((error as ConflictError).status).toBe(409);
    }
  });

  it("surfaces a 422 as ValidationError(INSUFFICIENT_POINTS)", async () => {
    const client = initialize({
      baseUrl: "https://api.test",
      token: "t0",
      fetch: (() =>
        Promise.resolve(
          errorResponse(422, "INSUFFICIENT_POINTS", "not enough points"),
        )) as unknown as typeof fetch,
    });

    try {
      await client.createRedemption({ offer: "off_1" });
      throw new Error("expected createRedemption to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe("INSUFFICIENT_POINTS");
      expect((error as ValidationError).status).toBe(422);
    }
  });
});

describe("client::redemptions list", () => {
  it("lists redemptions with all query params", async () => {
    const { calls, client } = clientWith({ nextCursor: null, redemptions: [] });
    const result = await client.listRedemptions({
      cursor: "c1",
      externalUserID: "u1",
      limit: 25,
      status: "OPEN",
    });

    expect(result).toEqual({ nextCursor: null, redemptions: [] });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toContain("https://api.test/v1/redemptions?");
    expect(calls[0].url).toContain("status=OPEN");
    expect(calls[0].url).toContain("limit=25");
    expect(calls[0].url).toContain("cursor=c1");
    expect(calls[0].url).toContain("externalUserID=u1");
  });

  it("lists redemptions with no params", async () => {
    const { calls, client } = clientWith({ nextCursor: null, redemptions: [] });
    await client.listRedemptions();
    expect(calls[0].url).toBe("https://api.test/v1/redemptions");
  });
});

describe("client::wallet transactions", () => {
  it("lists wallet transactions with query params", async () => {
    const page = {
      nextCursor: "c2",
      transactions: [
        {
          amount: 10,
          createdAt: "t",
          id: "tx1",
          reason: null,
          redemptionID: null,
          type: "CREDIT",
        },
      ],
    };
    const { calls, client } = clientWith(page);
    const result = await client.walletTransactions({
      cursor: "c1",
      externalUserID: "u1",
      limit: 5,
    });

    expect(result).toEqual(page);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toContain("https://api.test/v1/wallet/transactions?");
    expect(calls[0].url).toContain("limit=5");
    expect(calls[0].url).toContain("cursor=c1");
    expect(calls[0].url).toContain("externalUserID=u1");
  });

  it("lists wallet transactions with no params", async () => {
    const { calls, client } = clientWith({
      nextCursor: null,
      transactions: [],
    });
    await client.walletTransactions();
    expect(calls[0].url).toBe("https://api.test/v1/wallet/transactions");
  });
});

describe("client::conversations", () => {
  it("lists conversations with an optional externalUserID", async () => {
    const page = {
      conversations: [
        { id: "c1", lastMessageAt: null, title: null, type: "support" },
      ],
    };
    const { calls, client } = clientWith(page);
    const result = await client.listConversations({ externalUserID: "u1" });

    expect(result).toEqual(page);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe(
      "https://api.test/v1/conversations?externalUserID=u1",
    );
  });

  it("lists conversations with no params", async () => {
    const { calls, client } = clientWith({ conversations: [] });
    await client.listConversations();
    expect(calls[0].url).toBe("https://api.test/v1/conversations");
  });

  it("lists messages for a conversation (path-encoded) with query params", async () => {
    const page = {
      nextCursor: null,
      messages: [
        {
          /// Always present, empty for a text message, so a client maps without a guard.
          attachments: [],
          authorID: "u1",
          body: "hi",
          createdAt: "t",
          id: "m1",
          type: "text",
        },
      ],
    };
    const { calls, client } = clientWith(page);
    const result = await client.listMessages("c 1", {
      cursor: "cur",
      externalUserID: "u1",
      limit: 50,
    });

    expect(result).toEqual(page);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toContain(
      "https://api.test/v1/conversations/c%201/messages?",
    );
    expect(calls[0].url).toContain("limit=50");
    expect(calls[0].url).toContain("cursor=cur");
    expect(calls[0].url).toContain("externalUserID=u1");
  });

  it("lists messages with no query params", async () => {
    const { calls, client } = clientWith({ messages: [], nextCursor: null });
    await client.listMessages("c1");
    expect(calls[0].url).toBe("https://api.test/v1/conversations/c1/messages");
  });

  it("sends a message, auto-generating an idempotency key", async () => {
    const { calls, client } = clientWith({ ok: true });
    const result = await client.sendMessage("c 1", "hello");

    expect(result).toEqual({ ok: true });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe(
      "https://api.test/v1/conversations/c%201/messages",
    );
    expect(calls[0].init.body).toBe(JSON.stringify({ message: "hello" }));
    expect(headerOf(calls[0].init, "Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it("sends a message with a caller-supplied idempotency key", async () => {
    const { calls, client } = clientWith({ ok: true });
    await client.sendMessage("c1", "hi", { idempotencyKey: "my-key" });
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBe("my-key");
    expect(calls[0].init.body).toBe(JSON.stringify({ message: "hi" }));
  });

  it("streams messages from the (path-encoded) stream endpoint", async () => {
    const message = {
      authorID: "a1",
      body: "hi",
      createdAt: "2026-01-01T00:00:00Z",
      id: "m1",
      type: "member",
    };
    const calls: RecordedCall[] = [];
    const fetchImpl = (url: string, init: RequestInit) => {
      calls.push({ init, url });
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(message)}\n\n`),
          );
          controller.close();
        },
      });
      return Promise.resolve(
        new Response(body, {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        }),
      );
    };
    const client = initialize({
      baseUrl: "https://api.test",
      fetch: fetchImpl as unknown as typeof fetch,
      token: "t0",
    });

    const received: string[] = [];
    for await (const item of client.streamMessages("c 1")) {
      received.push(item.id);
      break;
    }

    expect(received).toEqual(["m1"]);
    expect(calls[0].url).toBe("https://api.test/v1/conversations/c%201/stream");
    expect(calls[0].init.method).toBe("GET");
    expect(headerOf(calls[0].init, "Accept")).toBe("text/event-stream");
  });
});

describe("client::eligibility and wallet", () => {
  it("reads eligibility with an optional externalUserID", async () => {
    const { calls, client } = clientWith({ tier: "gold", wallet: {} });
    await client.eligibility({ externalUserID: "u1" });
    expect(calls[0].url).toBe(
      "https://api.test/v1/eligibility?externalUserID=u1",
    );
  });

  it("reads the wallet", async () => {
    const wallet = {
      amountReceived: 0,
      amountReceivedDisplay: 0,
      amountReceivedUSD: 0,
      amountSpent: 0,
      amountSpentDisplay: 0,
      amountSpentUSD: 0,
      balance: 100,
      balanceDisplay: 100,
      balanceUSD: 1,
      currency: { name: "Points", symbol: "PT", unitsPerUSD: 100 },
    };
    const { calls, client } = clientWith(wallet);
    const result = await client.wallet();
    expect(result).toEqual(wallet);
    expect(calls[0].url).toBe("https://api.test/v1/wallet");
  });
});

describe("client::configuration", () => {
  it("sends the SDK User-Agent with the default (live) environment", async () => {
    const { calls, client } = clientWith({ data: [], nextCursor: null });
    await client.listOffers();
    const ua = headerOf(calls[0].init, "User-Agent");
    expect(ua).toMatch(/^expys-sdk-ts\//);
    expect(ua).toContain("env=live");
  });

  it("folds environment, org id, and the suffix into the User-Agent", async () => {
    const { calls, client } = clientWith(
      { data: [], nextCursor: null },
      { environment: "sandbox", orgId: "org_1", userAgentSuffix: "myapp/1.0" },
    );
    await client.listOffers();
    const ua = headerOf(calls[0].init, "User-Agent") ?? "";
    expect(ua).toContain("env=sandbox");
    expect(ua).toContain("org=org_1");
    expect(ua.endsWith("myapp/1.0")).toBe(true);
  });

  it("falls back to the default base URL when none is provided", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (url: string, init: RequestInit) => {
      calls.push({ init, url });
      return Promise.resolve(jsonResponse({ balance: 0 }));
    };
    const client = initialize({
      fetch: fetchImpl as unknown as typeof fetch,
      token: "t0",
    });
    await client.wallet();
    expect(calls[0].url).toBe(`${DEFAULT_BASE_URL}/v1/wallet`);
  });
});

/// The Phase 12-16 surface. These shipped as generated MODELS in 0.7.0 with no client
/// methods, so a consumer had types for endpoints they could not call.
describe("interests, terms and feedback", () => {
  it("creates an interest and sends an idempotency key", async () => {
    const interest = {
      conversationId: "req_1",
      createdAt: "t",
      id: "req_1",
      intake: null,
      offer: "off_1",
      status: "submitted",
    };
    const { calls, client } = clientWith(interest);

    const result = await client.createInterest({
      adults: 2,
      offer: "off_1",
      preferredDates: ["2099-11-06"],
    });

    expect(result).toEqual(interest);
    expect(calls[0].url).toBe("https://api.test/v1/interests");
    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0].init, "Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it("encodes the interest id on every path that takes one", async () => {
    // The id is opaque and comes from us, but encoding it is what stops a future id
    // format from silently breaking the route.
    const { calls, client } = clientWith({});

    await client.getInterest("req 1");
    await client.setInterestIntake("req 1", { adults: 2 });
    await client.startPhoneVerification("req 1");
    await client.confirmPhoneVerification("req 1", { code: "123456" });

    expect(calls[0].url).toBe("https://api.test/v1/interests/req%201");
    expect(calls[1].url).toBe("https://api.test/v1/interests/req%201/intake");
    expect(calls[2].url).toBe(
      "https://api.test/v1/interests/req%201/phone/verification",
    );
    expect(calls[2].init.method).toBe("POST");
    expect(calls[3].init.method).toBe("PUT");
  });

  it("lists terms and passes externalUserID through", async () => {
    const { calls, client } = clientWith({ documents: [] });

    await client.getTerms({ externalUserID: "u1" });

    expect(calls[0].url).toContain("https://api.test/v1/terms?");
    expect(calls[0].url).toContain("externalUserID=u1");
  });

  it("fetches one version's content by id", async () => {
    const { calls, client } = clientWith({
      contentHTML: "<h1>Terms</h1>",
      publishedAt: "t",
      renderedHash: "abc",
      type: "TERMS_OF_SERVICE",
      version: "ldv_1",
    });

    const result = await client.getTermsContent("ldv_1");

    expect(result.contentHTML).toBe("<h1>Terms</h1>");
    expect(calls[0].url).toBe("https://api.test/v1/terms/ldv_1/content");
  });

  it("records acceptance idempotently", async () => {
    const { calls, client } = clientWith({ documents: [] });

    await client.acceptTerms({ versions: ["ldv_1", "ldv_2"] });

    expect(calls[0].url).toBe("https://api.test/v1/terms/acceptance");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(
      JSON.stringify({ versions: ["ldv_1", "ldv_2"] }),
    );
    expect(headerOf(calls[0].init, "Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it("submits feedback against a redemption", async () => {
    const { calls, client } = clientWith({});

    await client.setRedemptionFeedback("req_1", {
      comment: "Superb.",
      rating: 9,
    });

    expect(calls[0].url).toBe("https://api.test/v1/redemptions/req_1/feedback");
    expect(calls[0].init.method).toBe("PUT");
  });
});
