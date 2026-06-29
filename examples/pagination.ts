/**
 * Pagination: walk the cursor to exhaustion. Zero UI.
 *
 * Run: EXPYS_MEMBER_TOKEN=... bun examples/pagination.ts
 *
 * EXPYS_MEMBER_TOKEN is a short-lived member token your backend obtained from
 * POST /v1/auth/exchange. Point EXPYS_BASE_URL at a stub until the sandbox tenant
 * is seeded.
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
  let cursor: string | undefined;
  let page = 0;
  let total = 0;

  // Loop until the server returns a null nextCursor, marking the end of the list.
  do {
    const result = await expys.listOffers({ cursor, limit: 50 });
    page += 1;
    total += result.data.length;
    console.log(`page ${page}: ${result.data.length} offers`);
    cursor = result.nextCursor ?? undefined;
  } while (cursor);

  console.log(`done: ${total} offers across ${page} page(s)`);
}

void main();
