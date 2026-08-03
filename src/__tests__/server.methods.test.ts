import { describe, expect, it } from "bun:test";

import { initialize } from "../client";
import { NotConfiguredError } from "../errors";

interface RecordedCall {
  init: RequestInit;
  url: string;
}

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });

const headerOf = (init: RequestInit, name: string): string | undefined =>
  (init.headers as Record<string, string>)[name];

// Server-mode methods require a machine (Org-API-Key) credential.
const MACHINE_TOKEN = "expys_live_t0";
const MEMBER_TOKEN = "v4.local.xxx";

const serverClientWith = (
  body: unknown,
  overrides: Record<string, unknown> = {},
) => {
  const calls: RecordedCall[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ init, url });
    return Promise.resolve(jsonResponse(body));
  };
  const client = initialize({
    baseUrl: "https://api.test",
    fetch: fetchImpl as unknown as typeof fetch,
    token: MACHINE_TOKEN,
    ...overrides,
  });
  return { calls, client };
};

describe("server::exchangeToken", () => {
  it("posts the body and auto-generates an idempotency key", async () => {
    const grant = { accessToken: "v4.local.member", expiresAt: "2026-01-01" };
    const { calls, client } = serverClientWith(grant);

    const result = await client.exchangeToken({ externalUserID: "u1" });

    expect(result).toEqual(grant);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/v1/auth/exchange");
    expect(calls[0].init.body).toBe(JSON.stringify({ externalUserID: "u1" }));
    expect(headerOf(calls[0].init, "Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it("respects a caller-supplied idempotency key", async () => {
    const { calls, client } = serverClientWith({ accessToken: "x" });
    await client.exchangeToken(
      { externalUserID: "u1" },
      { idempotencyKey: "my-key" },
    );
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBe("my-key");
  });
});

describe("server::creditPoints", () => {
  it("posts amount/externalUserID and auto-generates an idempotency key", async () => {
    const response = {
      balance: 150,
      currency: { name: "Points", symbol: "P" },
    };
    const { calls, client } = serverClientWith(response);

    const result = await client.creditPoints({
      amount: 100,
      externalUserID: "u1",
      reason: "bonus",
    });

    expect(result).toEqual(response);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/v1/wallet/credit");
    expect(calls[0].init.body).toBe(
      JSON.stringify({ amount: 100, externalUserID: "u1", reason: "bonus" }),
    );
    expect(headerOf(calls[0].init, "Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });
});

describe("server::setMember", () => {
  it("PUTs the body to the path-encoded member route without an idempotency key", async () => {
    const member = {
      attributes: null,
      displayName: "Ada",
      externalUserID: "u 1",
      tier: "gold",
    };
    const { calls, client } = serverClientWith(member);

    const result = await client.setMember("u 1", {
      displayName: "Ada",
      tier: "gold",
    });

    expect(result).toEqual(member);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.test/v1/members/u%201");
    expect(calls[0].init.body).toBe(
      JSON.stringify({ displayName: "Ada", tier: "gold" }),
    );
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeUndefined();
    expect(headerOf(calls[0].init, "Content-Type")).toBe("application/json");
  });
});

describe("server::getMember", () => {
  it("GETs the path-encoded member route", async () => {
    const { calls, client } = serverClientWith({ externalUserID: "u 1" });

    const result = await client.getMember("u 1");

    expect(result.externalUserID).toBe("u 1");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/v1/members/u%201");
  });
});

describe("server::removeMember", () => {
  it("DELETEs the member without a body and without an idempotency key", async () => {
    const response = {
      archived: true,
      balanceRetained: false,
      externalUserID: "u 1",
    };
    const { calls, client } = serverClientWith(response);

    const result = await client.removeMember("u 1");

    expect(result).toEqual(response);
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.test/v1/members/u%201");
    expect(calls[0].init.body).toBeUndefined();
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeUndefined();
  });

  it("serializes retainBalance=true as a query param when provided", async () => {
    const { calls, client } = serverClientWith({ archived: true });
    await client.removeMember("u1", { retainBalance: true });
    expect(calls[0].url).toBe(
      "https://api.test/v1/members/u1?retainBalance=true",
    );
  });

  it("serializes retainBalance=false as a query param when provided", async () => {
    const { calls, client } = serverClientWith({ archived: true });
    await client.removeMember("u1", { retainBalance: false });
    expect(calls[0].url).toBe(
      "https://api.test/v1/members/u1?retainBalance=false",
    );
  });

  it("omits retainBalance when not provided", async () => {
    const { calls, client } = serverClientWith({ archived: true });
    await client.removeMember("u1");
    expect(calls[0].url).toBe("https://api.test/v1/members/u1");
  });
});

describe("server::analytics", () => {
  it("GETs the analytics summary", async () => {
    const { calls, client } = serverClientWith({
      completionRate: 0.5,
      memberCount: 10,
      pointsMinted: 100,
      pointsSpent: 50,
      redemptions: {},
    });

    const result = await client.analyticsSummary();

    expect(result.memberCount).toBe(10);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/v1/analytics/summary");
  });

  it("GETs the analytics offers", async () => {
    const { calls, client } = serverClientWith({ offers: [] });
    const result = await client.analyticsOffers();
    expect(result).toEqual({ offers: [] });
    expect(calls[0].url).toBe("https://api.test/v1/analytics/offers");
  });

  it("GETs the analytics timeseries with required from/to/interval", async () => {
    const { calls, client } = serverClientWith({ buckets: [] });

    const result = await client.analyticsTimeseries({
      from: "2026-01-01T00:00:00Z",
      interval: "day",
      to: "2026-02-01T00:00:00Z",
    });

    expect(result).toEqual({ buckets: [] });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toContain("https://api.test/v1/analytics/timeseries?");
    expect(calls[0].url).toContain("from=2026-01-01T00%3A00%3A00Z");
    expect(calls[0].url).toContain("to=2026-02-01T00%3A00%3A00Z");
    expect(calls[0].url).toContain("interval=day");
  });

  it("GETs the org balance and sends the machine credential", async () => {
    const { calls, client } = serverClientWith({
      balance: 3800,
      creditLimit: 1000,
      lifetimeSpent: 1200,
      settlementMode: "ORG_POOL",
    });

    const result = await client.balance();

    expect(result).toEqual({
      balance: 3800,
      creditLimit: 1000,
      lifetimeSpent: 1200,
      settlementMode: "ORG_POOL",
    });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/v1/balance");
    expect(headerOf(calls[0].init, "Authorization")).toBe(
      `Bearer ${MACHINE_TOKEN}`,
    );
  });
});

describe("server::webhooks", () => {
  it("creates a webhook (201) with an auto-generated idempotency key", async () => {
    const { calls, client } = serverClientWith({
      createdAt: "t",
      environment: "LIVE",
      events: ["redemption.created"],
      id: "wh_1",
      signingSecret: "whsec_x",
      url: "https://example.com/hook",
    });

    const result = await client.createWebhook({
      events: ["redemption.created"],
      url: "https://example.com/hook",
    });

    expect(result.signingSecret).toBe("whsec_x");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/v1/webhooks");
    expect(calls[0].init.body).toBe(
      JSON.stringify({
        events: ["redemption.created"],
        url: "https://example.com/hook",
      }),
    );
    expect(headerOf(calls[0].init, "Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it("lists webhooks", async () => {
    const { calls, client } = serverClientWith({ data: [] });
    const result = await client.listWebhooks();
    expect(result).toEqual({ data: [] });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/v1/webhooks");
  });

  it("deletes a webhook (path-encoded) without an idempotency key", async () => {
    const { calls, client } = serverClientWith({ id: "wh 1", ok: true });

    const result = await client.deleteWebhook("wh 1");

    expect(result).toEqual({ id: "wh 1", ok: true });
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.test/v1/webhooks/wh%201");
    expect(calls[0].init.body).toBeUndefined();
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeUndefined();
  });
});

describe("server::credential guard", () => {
  it("throws NotConfiguredError without any HTTP call when given a member token", () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = (url: string, init: RequestInit) => {
      calls.push({ init, url });
      return Promise.resolve(jsonResponse({}));
    };
    const client = initialize({
      baseUrl: "https://api.test",
      fetch: fetchImpl as unknown as typeof fetch,
      token: MEMBER_TOKEN,
    });

    const serverCalls: Array<() => Promise<unknown>> = [
      () => client.exchangeToken({ externalUserID: "u1" }),
      () => client.creditPoints({ amount: 1, externalUserID: "u1" }),
      () => client.setMember("u1", { tier: "gold" }),
      () => client.getMember("u1"),
      () => client.removeMember("u1"),
      () => client.analyticsSummary(),
      () => client.analyticsOffers(),
      () => client.analyticsTimeseries({ from: "a", interval: "day", to: "b" }),
      () => client.balance(),
      () => client.createWebhook({ events: [], url: "https://x" }),
      () => client.listWebhooks(),
      () => client.deleteWebhook("wh_1"),
    ];

    for (const invoke of serverCalls) {
      // The guard throws synchronously (before producing a Promise / any fetch).
      expect(invoke).toThrow(NotConfiguredError);
    }

    // Crucially, NOT ONE method reached the transport.
    expect(calls.length).toBe(0);
  });
});
