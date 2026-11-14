import { describe, expect, it } from "bun:test";

import type {
  GetAnalyticsLiftResponse,
  GetAnalyticsSegmentsResponse,
  ListMemberSignalHistoryResponse,
  MemberImportReport,
} from "../types";

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
      currency: { name: "Points", symbol: "P", unitsPerUSD: 100 },
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
      signals: null,
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

describe("server::importMembers", () => {
  it("posts rows to the batch route with an idempotency key and parses the report", async () => {
    const report: MemberImportReport = {
      accepted: 1,
      rejected: [
        {
          code: "signal_not_enabled",
          externalUserID: "u2",
          field: "valueBand",
          row: 2,
        },
      ],
    };
    const { calls, client } = serverClientWith(report);
    const rows = [
      { externalUserID: "u1", signals: { activityBand: "HIGH" as const } },
      { externalUserID: "u2", signals: { valueBand: "TOP_1" as const } },
    ];

    const result = await client.importMembers({ rows });

    expect(result).toEqual(report);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/v1/members/batch");
    expect(calls[0].init.body).toBe(JSON.stringify({ rows }));
    expect(headerOf(calls[0].init, "Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it("sends dryRun and a caller-supplied idempotency key", async () => {
    const { calls, client } = serverClientWith({ accepted: 0, rejected: [] });

    await client.importMembers(
      { rows: [{ externalUserID: "u1" }] },
      { dryRun: true, idempotencyKey: "batch-1" },
    );

    expect(calls[0].url).toBe("https://api.test/v1/members/batch?dryRun=true");
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBe("batch-1");
  });
});

describe("server::getSignalHistory", () => {
  it("GETs a page of the member's signal history and follows the cursor", async () => {
    const page: ListMemberSignalHistoryResponse = {
      nextCursor: "c2",
      snapshots: [
        {
          environment: "LIVE",
          observedAt: "2026-11-01T00:00:00.000Z",
          receivedAt: "2026-11-01T00:00:01.000Z",
          signals: { activityBand: "HIGH" },
          source: "BATCH",
        },
      ],
    };
    const { calls, client } = serverClientWith(page);

    const first = await client.getSignalHistory("u 1", { limit: 1 });
    await client.getSignalHistory("u 1", {
      cursor: first.nextCursor ?? undefined,
      from: "2026-01-01T00:00:00Z",
      limit: 1,
      to: "2026-12-31T00:00:00Z",
    });

    expect(first).toEqual(page);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe(
      "https://api.test/v1/members/u%201/signals/history?limit=1",
    );
    const second = new URL(calls[1].url);
    expect(second.pathname).toBe("/v1/members/u%201/signals/history");
    expect(Object.fromEntries(second.searchParams)).toEqual({
      cursor: "c2",
      from: "2026-01-01T00:00:00Z",
      limit: "1",
      to: "2026-12-31T00:00:00Z",
    });
  });
});

describe("server::listMembers signal filters", () => {
  it("passes the valueBand, activityBand and vipStatus filters", async () => {
    const { calls, client } = serverClientWith({
      members: [],
      nextCursor: null,
    });

    await client.listMembers({
      activityBand: "LOW",
      valueBand: "TOP_1",
      vipStatus: "COOLING",
    });

    const url = new URL(calls[0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      activityBand: "LOW",
      valueBand: "TOP_1",
      vipStatus: "COOLING",
    });
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
      balanceDisplay: 38,
      balanceUSD: 38,
      creditLimit: 1000,
      creditLimitUSD: 10,
      lifetimeSpent: 1200,
      lifetimeSpentUSD: 12,
      ratePerPoint: 0.01,
      settlementMode: "ORG_POOL",
    });

    const result = await client.balance();

    expect(result).toEqual({
      balance: 3800,
      balanceDisplay: 38,
      balanceUSD: 38,
      creditLimit: 1000,
      creditLimitUSD: 10,
      lifetimeSpent: 1200,
      lifetimeSpentUSD: 12,
      ratePerPoint: 0.01,
      settlementMode: "ORG_POOL",
    });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/v1/balance");
    expect(headerOf(calls[0].init, "Authorization")).toBe(
      `Bearer ${MACHINE_TOKEN}`,
    );
  });
});

describe("server::getAnalyticsSegments", () => {
  it("GETs segments for the period and groupBy fields and keeps a suppressed cell as nulls", async () => {
    const response: GetAnalyticsSegmentsResponse = {
      groupBy: ["valueBand", "vipStatus"],
      segments: [
        {
          bookings: 9,
          key: { valueBand: "TOP_1", vipStatus: "ACTIVE" },
          members: 12,
          membersWhoBooked: 7,
          suppressed: false,
          topCategories: [{ members: 5, name: "NBA", slug: "nba" }],
        },
        {
          bookings: null,
          key: { valueBand: "TOP_5", vipStatus: "LAPSED" },
          members: null,
          membersWhoBooked: null,
          suppressed: true,
          topCategories: [],
        },
      ],
    };
    const { calls, client } = serverClientWith(response);

    const result = await client.getAnalyticsSegments({
      from: "2026-10-01T00:00:00Z",
      groupBy: ["valueBand", "vipStatus"],
      to: "2026-11-01T00:00:00Z",
    });

    expect(result).toEqual(response);
    expect(result.segments[1].suppressed).toBe(true);
    expect(result.segments[1].members).toBeNull();
    expect(calls[0].init.method).toBe("GET");
    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.test/v1/analytics/segments",
    );
    expect(url.searchParams.get("from")).toBe("2026-10-01T00:00:00Z");
    expect(url.searchParams.get("to")).toBe("2026-11-01T00:00:00Z");
    expect(url.searchParams.get("groupBy")).toBe("valueBand,vipStatus");
    expect(headerOf(calls[0].init, "Authorization")).toBe(
      `Bearer ${MACHINE_TOKEN}`,
    );
  });
});

describe("server::getAnalyticsLift", () => {
  it("GETs lift for the period and keeps a suppressed cohort as nulls", async () => {
    const response: GetAnalyticsLiftResponse = {
      groups: [
        {
          valueBand: "TOP_1",
          vipStatus: "ACTIVE",
          booked: {
            fell: 0.1,
            held: 0.5,
            members: 20,
            rose: 0.4,
            suppressed: false,
          },
          notBooked: {
            fell: null,
            held: null,
            members: null,
            rose: null,
            suppressed: true,
          },
        },
      ],
    };
    const { calls, client } = serverClientWith(response);

    const result = await client.getAnalyticsLift({
      from: "2026-10-01T00:00:00Z",
      to: "2026-11-01T00:00:00Z",
    });

    expect(result).toEqual(response);
    expect(result.groups[0].notBooked.suppressed).toBe(true);
    expect(result.groups[0].notBooked.members).toBeNull();
    expect(calls[0].init.method).toBe("GET");
    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.test/v1/analytics/lift",
    );
    expect(url.searchParams.get("from")).toBe("2026-10-01T00:00:00Z");
    expect(url.searchParams.get("to")).toBe("2026-11-01T00:00:00Z");
    expect([...url.searchParams.keys()].sort()).toEqual(["from", "to"]);
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
      () => client.importMembers({ rows: [] }),
      () => client.getSignalHistory("u1"),
      () =>
        client.getAnalyticsSegments({
          from: "a",
          groupBy: ["valueBand"],
          to: "b",
        }),
      () => client.getAnalyticsLift({ from: "a", to: "b" }),
    ];

    for (const invoke of serverCalls) {
      // The guard throws synchronously (before producing a Promise / any fetch).
      expect(invoke).toThrow(NotConfiguredError);
    }

    // Crucially, NOT ONE method reached the transport.
    expect(calls.length).toBe(0);
  });
});
