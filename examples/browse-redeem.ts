/**
 * Reference sample: data-only browse -> eligibility -> redemption flow. Zero UI.
 *
 * Run: EXPYS_MEMBER_TOKEN=... bun examples/browse-redeem.ts
 *
 * CROSS-PHASE DEPENDENCY: this completes end-to-end against the seeded sandbox
 * tenant from Phase 4.6 (not yet built). Until then, point EXPYS_BASE_URL at a
 * stub. EXPYS_MEMBER_TOKEN is a short-lived member token your backend obtained
 * from POST /v1/auth/exchange.
 */
/* eslint-disable no-console -- runnable sample prints flow output */
import { ConflictError, initialize } from "../src/index";

const token = process.env.EXPYS_MEMBER_TOKEN;
if (!token) {
  throw new Error(
    "Set EXPYS_MEMBER_TOKEN (a member token from your backend's /v1/auth/exchange)",
  );
}

const expys = initialize({
  baseUrl: process.env.EXPYS_BASE_URL,
  environment: "sandbox",
  token,
});

async function main(): Promise<void> {
  const eligibility = await expys.eligibility();
  console.log(
    `tier: ${eligibility.tier}, balance: ${eligibility.wallet.balance}`,
  );

  const { data: offers } = await expys.listOffers({ limit: 10 });
  console.log(`browsed ${offers.length} offers`);

  const offer = offers[0];
  if (!offer) {
    return;
  }

  console.log(`redeeming: ${offer.title} (${offer.id})`);
  try {
    const redemption = await expys.createRedemption({ offer: offer.id });
    console.log(`redemption created: ${redemption.id} [${redemption.status}]`);

    const status = await expys.getRedemption(redemption.id);
    console.log(`status now: ${status.status}`);
  } catch (error) {
    if (error instanceof ConflictError) {
      console.log(`already redeemed: ${error.code}`);
      return;
    }
    throw error;
  }
}

void main();
