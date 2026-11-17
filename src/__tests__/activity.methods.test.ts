import { describe, expect, it } from "bun:test";

import type {
  ExperienceImpactPage,
  ExperienceImpactSummary,
  MemberActivity,
  MemberActivityImportReport,
  MemberActivityWriteResult,
} from "../types";

import { initialize } from "../client";
import { NotConfiguredError } from "../errors";

/// The VIP activity and experience impact methods (plans/vip-activity-lift 6.3).

interface RecordedCall {
  init: RequestInit;
  url: string;
}

const MACHINE_TOKEN = "expys_live_t0";
const MEMBER_TOKEN = "v4.local.xxx";

const headerOf = (init: RequestInit, name: string): string | undefined =>
  (init.headers as Record<string, string>)[name];

const clientWith = (body: unknown, token = MACHINE_TOKEN) => {
  const calls: RecordedCall[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ init, url });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
  };
  const client = initialize({
    baseUrl: "https://api.test",
    fetch: fetchImpl as unknown as typeof fetch,
    token,
  });
  return { calls, client };
};

const queryOf = (url: string): Record<string, string> =>
  Object.fromEntries(new URL(url).searchParams);

describe("server::setMemberActivity", () => {
  it("PUTs the months to the path-encoded activity route without an idempotency key", async () => {
    const result: MemberActivityWriteResult = {
      created: 1,
      externalUserID: "u 1",
      unchanged: 0,
      updated: 1,
    };
    const { calls, client } = clientWith(result);
    const months = [
      { activeDays: 12, deposits: { index: 120 }, month: "2026-10" },
      { deposits: { amount: 240_000, currency: "USD" }, month: "2026-09" },
    ];

    const written = await client.setMemberActivity("u 1", { months });

    expect(written).toEqual(result);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.test/v1/members/u%201/activity");
    expect(calls[0].init.body).toBe(JSON.stringify({ months }));
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeUndefined();
  });

  it("sends a caller-supplied idempotency key", async () => {
    const { calls, client } = clientWith({
      created: 0,
      externalUserID: "u1",
      unchanged: 1,
      updated: 0,
    });

    await client.setMemberActivity(
      "u1",
      { months: [{ month: "2026-10" }] },
      { idempotencyKey: "act-1" },
    );

    expect(headerOf(calls[0].init, "Idempotency-Key")).toBe("act-1");
  });
});

describe("server::getMemberActivity", () => {
  it("GETs the member's months, newest first, in the stored form", async () => {
    const activity: MemberActivity = {
      externalUserID: "u1",
      form: "INDEX",
      months: [
        { deposits: { index: 120 }, month: "2026-10", spend: { index: 95 } },
        { deposits: { index: 100 }, month: "2026-09" },
      ],
    };
    const { calls, client } = clientWith(activity);

    const result = await client.getMemberActivity("u1");

    expect(result).toEqual(activity);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/v1/members/u1/activity");
  });
});

describe("server::importMemberActivity", () => {
  it("posts rows to the activity batch route with an idempotency key and parses the report", async () => {
    const report: MemberActivityImportReport = {
      accepted: 1,
      created: 1,
      rejected: 1,
      unchanged: 0,
      updated: 0,
      errors: [
        {
          code: "member_not_found",
          externalUserID: "u2",
          field: "externalUserID",
          row: 2,
        },
      ],
    };
    const { calls, client } = clientWith(report);
    const rows = [
      {
        externalUserID: "u1",
        months: [{ deposits: { index: 120 }, month: "2026-10" }],
      },
      {
        externalUserID: "u2",
        months: [{ deposits: { index: 55 }, month: "2026-10" }],
      },
    ];

    const result = await client.importMemberActivity({ rows });

    expect(result).toEqual(report);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].url).toBe("https://api.test/v1/members/activity/batch");
    expect(calls[0].init.body).toBe(JSON.stringify({ rows }));
    expect(headerOf(calls[0].init, "Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it("sends dryRun and a caller-supplied idempotency key", async () => {
    const { calls, client } = clientWith({
      accepted: 0,
      created: 0,
      errors: [],
      rejected: 0,
      unchanged: 0,
      updated: 0,
    });

    await client.importMemberActivity(
      { rows: [{ externalUserID: "u1", months: [{ month: "2026-10" }] }] },
      { dryRun: true, idempotencyKey: "activity-1" },
    );

    expect(calls[0].url).toBe(
      "https://api.test/v1/members/activity/batch?dryRun=true",
    );
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBe("activity-1");
  });
});

describe("server::getExperienceImpact", () => {
  it("GETs a page of impact rows with their dates and follows the cursor with every filter", async () => {
    const page: ExperienceImpactPage = {
      nextCursor: "c2",
      unlinked: 2,
      rows: [
        {
          anchorMonth: "2026-03",
          deskLabel: "John D.",
          experienceAt: "2026-04-09T12:00:00.000Z",
          externalUserID: "48213",
          offer: "offer_123",
          offerTitle: "The Masters",
          overlapping: false,
          redeemedAt: "2026-03-14T18:02:11.000Z",
          redemptionID: "redemption_789",
          spend: null,
          state: "COMPLETE",
          viaHostDesk: true,
          window: 3,
          deposits: {
            afterAmount: null,
            afterMonths: 3,
            beforeAmount: null,
            beforeMonths: 3,
            change: 0.2,
            comparison: { medianChange: 0.02, vips: 37 },
            comparisonReason: null,
            currency: null,
            net: 0.18,
            state: "COMPLETE",
          },
        },
      ],
    };
    const { calls, client } = clientWith(page);

    const first = await client.getExperienceImpact({
      from: "2026-01-01T00:00:00Z",
      to: "2026-07-01T00:00:00Z",
    });
    await client.getExperienceImpact({
      cursor: first.nextCursor ?? undefined,
      from: "2026-01-01T00:00:00Z",
      limit: 100,
      offer: "offer_123",
      status: "COMPLETE",
      to: "2026-07-01T00:00:00Z",
      window: 6,
    });

    expect(first).toEqual(page);
    expect(first.rows[0].redeemedAt).toBe("2026-03-14T18:02:11.000Z");
    expect(calls[0].init.method).toBe("GET");
    expect(new URL(calls[0].url).pathname).toBe("/v1/analytics/impact");
    expect(queryOf(calls[0].url)).toEqual({
      from: "2026-01-01T00:00:00Z",
      to: "2026-07-01T00:00:00Z",
    });
    expect(queryOf(calls[1].url)).toEqual({
      cursor: "c2",
      from: "2026-01-01T00:00:00Z",
      limit: "100",
      offer: "offer_123",
      status: "COMPLETE",
      to: "2026-07-01T00:00:00Z",
      window: "6",
    });
  });
});

describe("server::getExperienceImpactSummary", () => {
  it("GETs the summary with win-back and keeps a suppressed cell as nulls", async () => {
    const hidden = {
      compared: null,
      medianChange: null,
      medianComparisonChange: null,
      netLift: null,
      redeemers: null,
      roseShare: null,
      suppressed: true,
    };
    const summary: ExperienceImpactSummary = {
      experiences: [{ ...hidden, offer: "offer_456", offerTitle: "F1" }],
      metric: "spend",
      window: 6,
      all: {
        compared: 39,
        medianChange: 0.17,
        medianComparisonChange: 0.02,
        netLift: 0.15,
        redeemers: 40,
        roseShare: 0.7,
        suppressed: false,
      },
      winBack: {
        notSent: {
          measured: null,
          medianChange: null,
          redeemed: null,
          redeemedShare: null,
          suppressed: true,
          vips: null,
        },
        sent: {
          measured: 38,
          medianChange: 0.31,
          redeemed: 14,
          redeemedShare: 0.35,
          suppressed: false,
          vips: 40,
        },
      },
    };
    const { calls, client } = clientWith(summary);

    const result = await client.getExperienceImpactSummary({
      from: "2026-01-01T00:00:00Z",
      metric: "spend",
      to: "2026-07-01T00:00:00Z",
      window: 6,
    });

    expect(result).toEqual(summary);
    expect(result.experiences[0].netLift).toBeNull();
    expect(result.winBack.sent.medianChange).toBe(0.31);
    expect(new URL(calls[0].url).pathname).toBe("/v1/analytics/impact/summary");
    expect(queryOf(calls[0].url)).toEqual({
      from: "2026-01-01T00:00:00Z",
      metric: "spend",
      to: "2026-07-01T00:00:00Z",
      window: "6",
    });
  });

  it("sends only the period when window and metric are left to the server", async () => {
    const { calls, client } = clientWith({});

    await client.getExperienceImpactSummary({ from: "a", to: "b" });

    expect(queryOf(calls[0].url)).toEqual({ from: "a", to: "b" });
  });
});

describe("server::activity credential guard", () => {
  it("throws NotConfiguredError without any HTTP call when given a member token", () => {
    const { calls, client } = clientWith({}, MEMBER_TOKEN);

    const serverCalls: Array<() => Promise<unknown>> = [
      () => client.setMemberActivity("u1", { months: [] }),
      () => client.getMemberActivity("u1"),
      () => client.importMemberActivity({ rows: [] }),
      () => client.getExperienceImpact({ from: "a", to: "b" }),
      () => client.getExperienceImpactSummary({ from: "a", to: "b" }),
    ];

    for (const invoke of serverCalls) {
      expect(invoke).toThrow(NotConfiguredError);
    }
    expect(calls.length).toBe(0);
  });
});
