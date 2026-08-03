/**
 * Balance: read your org's points balance, credit limit, and settlement mode.
 *
 * RUN THIS ON YOUR BACKEND ONLY. Reading the balance needs an Org-API-Key
 * (`expys_live_...` / `expys_sandbox_...`) with the BILLING_READ scope. That key
 * is a secret and must NEVER ship in a browser, mobile, or any client app.
 *
 * Which layer your redemptions debit depends on `settlementMode`:
 *  - MEMBER_WALLET: each VIP has their own wallet, which you fund by crediting
 *    points. Redemptions debit the VIP.
 *  - ORG_POOL: there are no per-VIP balances at all. Redemptions debit this
 *    org-level balance directly, so you never mirror or reconcile a VIP balance.
 *
 * In ORG_POOL mode no webhook fires per redemption, so poll this endpoint (or
 * subscribe to `org.points.low`) to know when to top up.
 *
 * Run: EXPYS_ORG_API_KEY=expys_live_... bun examples/balance.ts
 */
/* eslint-disable no-console -- runnable sample prints flow output */
import { initialize } from "../src/index";

const orgApiKey = process.env.EXPYS_ORG_API_KEY;
if (!orgApiKey) {
  throw new Error(
    "Set EXPYS_ORG_API_KEY (your secret Org-API-Key, e.g. expys_live_...). " +
      "Run this on a backend only, never in a client app.",
  );
}

const expys = initialize({
  baseUrl: process.env.EXPYS_BASE_URL,
  environment: "sandbox",
  token: orgApiKey,
});

async function main(): Promise<void> {
  const account = await expys.balance();

  console.log(`settlement mode: ${account.settlementMode}`);
  console.log(`balance: ${account.balance} points`);

  if (account.settlementMode === "ORG_POOL") {
    // Spendable headroom includes the credit limit: a postpaid org may overdraw
    // to -creditLimit before redemptions are refused with INSUFFICIENT_ORG_POINTS.
    const spendable = account.balance + account.creditLimit;
    console.log(`spendable now: ${spendable} points`);
    console.log(`lifetime spent from the pool: ${account.lifetimeSpent}`);

    if (spendable <= 0) {
      console.warn(
        "Pool exhausted - redemptions will be refused until topped up.",
      );
    }
  } else {
    // MEMBER_WALLET: this balance funds the points you credit to VIPs, and each
    // VIP's own wallet is what a redemption debits.
    console.log(
      "VIP redemptions debit each member's wallet, not this balance.",
    );
  }
}

void main();
