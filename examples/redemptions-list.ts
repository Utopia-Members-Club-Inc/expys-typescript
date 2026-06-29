/**
 * Redemptions history and wallet ledger: the member-facing list read paths. Zero UI.
 *
 * Run: EXPYS_MEMBER_TOKEN=... bun examples/redemptions-list.ts
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

const externalUserID = process.env.EXPYS_EXTERNAL_USER_ID;

async function main(): Promise<void> {
  // Cursor-paginate the member's open redemptions until nextCursor is null.
  let cursor: string | undefined;
  do {
    const page = await expys.listRedemptions({
      cursor,
      externalUserID,
      limit: 50,
      status: "OPEN",
    });
    for (const redemption of page.redemptions) {
      console.log(`redemption ${redemption.id} [${redemption.status}]`);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  // The points ledger: each credit/debit on the member's wallet.
  const ledger = await expys.walletTransactions({ externalUserID, limit: 50 });
  for (const transaction of ledger.transactions) {
    console.log(
      `tx ${transaction.id}: ${transaction.type} ${transaction.amount} ` +
        `(${transaction.reason ?? "no reason"})`,
    );
  }
}

void main();
