/**
 * Eligibility and wallet: the member-facing read paths. Zero UI.
 *
 * Run: EXPYS_MEMBER_TOKEN=... bun examples/eligibility-wallet.ts
 *
 * EXPYS_MEMBER_TOKEN is a short-lived member token your backend obtained from
 * POST /v1/auth/exchange. Set EXPYS_EXTERNAL_USER_ID when a machine token reads
 * on a specific member's behalf.
 */
/* eslint-disable no-console -- runnable sample prints flow output */
import { initialize } from "../src/index";

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
  // externalUserID names the member when a machine token calls on their behalf.
  const eligibility = await expys.eligibility({
    externalUserID: process.env.EXPYS_EXTERNAL_USER_ID,
  });
  console.log(`tier: ${eligibility.tier}`);
  console.log(`wallet (from eligibility): ${eligibility.wallet.balance}`);

  const wallet = await expys.wallet();
  console.log(
    `wallet: balance=${wallet.balance} received=${wallet.amountReceived} ` +
      `spent=${wallet.amountSpent} ${wallet.currency.symbol} (${wallet.currency.name})`,
  );
}

void main();
