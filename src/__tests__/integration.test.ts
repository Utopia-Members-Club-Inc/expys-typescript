import { describe, expect, it } from "bun:test";

import { ConflictError, initialize } from "../index";

// Opt-in live suite: exercises the full browse -> eligibility -> redeem -> get
// flow against a real sandbox tenant. It NEVER runs in normal CI - it is skipped
// unless EXPYS_INTEGRATION=1 and a sandbox member token are both present. Run it
// locally or in a dedicated workflow with:
//
//   EXPYS_INTEGRATION=1 \
//   EXPYS_MEMBER_TOKEN=<sandbox member token from POST /v1/auth/exchange> \
//   EXPYS_BASE_URL=<optional override> \
//   bun test src/__tests__/integration.test.ts
//
// The member token is short-lived; obtain it from your backend's auth exchange.
const token = process.env.EXPYS_MEMBER_TOKEN;
const enabled = process.env.EXPYS_INTEGRATION === "1" && Boolean(token);

// Real network calls can be slow; give each test a generous ceiling.
const NETWORK_TIMEOUT_MS = 30_000;

describe.skipIf(!enabled)("integration (live sandbox)", () => {
  const client = initialize({
    baseUrl: process.env.EXPYS_BASE_URL,
    environment: "sandbox",
    // `enabled` guarantees the token is present when this block runs.
    token: token as string,
  });

  it(
    "reads eligibility (tier + wallet)",
    async () => {
      const eligibility = await client.eligibility();
      expect(typeof eligibility.tier).toBe("string");
      expect(typeof eligibility.wallet.balance).toBe("number");
    },
    NETWORK_TIMEOUT_MS,
  );

  it(
    "reads the wallet",
    async () => {
      const wallet = await client.wallet();
      expect(typeof wallet.balance).toBe("number");
      expect(typeof wallet.currency.symbol).toBe("string");
    },
    NETWORK_TIMEOUT_MS,
  );

  it(
    "browses, redeems, and reads back a redemption",
    async () => {
      const page = await client.listOffers({ limit: 10 });
      expect(Array.isArray(page.data)).toBe(true);

      const offer = page.data[0];
      if (!offer) {
        // An empty sandbox catalog is a valid state; the read path above already
        // proved connectivity, so there is nothing more to assert here.
        return;
      }

      try {
        const redemption = await client.createRedemption({ offer: offer.id });
        expect(redemption.id).toBeTruthy();

        const fetched = await client.getRedemption(redemption.id);
        expect(fetched.id).toBe(redemption.id);
      } catch (error) {
        // A previously-booked offer is an expected outcome on a shared sandbox.
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }
    },
    NETWORK_TIMEOUT_MS,
  );
});
