/**
 * Server-mode: backend-only methods that require an Org-API-Key (machine
 * credential), e.g. minting member tokens, crediting points, upserting members,
 * and managing webhooks. Zero UI.
 *
 * RUN THIS ON YOUR BACKEND ONLY. The Org-API-Key (`expys_live_...` /
 * `expys_sandbox_...`) is a secret and must NEVER ship in a browser, mobile, or
 * any client app. If you configure the SDK with a member token (a `v4.local.…`
 * PASETO) and call a server-mode method, the SDK fails fast with a
 * NotConfiguredError before any network call (and the server 403s it anyway).
 *
 * Run: EXPYS_ORG_API_KEY=expys_live_... bun examples/server-mode.ts
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

// Construct the client with the machine credential as the token. Server-mode
// methods are guarded against member tokens client-side.
const expys = initialize({
  baseUrl: process.env.EXPYS_BASE_URL,
  environment: "sandbox",
  token: orgApiKey,
});

const externalUserID = process.env.EXPYS_EXTERNAL_USER_ID ?? "user_42";

async function main(): Promise<void> {
  // Mint a short-lived member token for your app to use (return this to the app,
  // never the Org-API-Key). Idempotent POST: a retry replays rather than re-mints.
  const grant = await expys.exchangeToken({ externalUserID });
  console.log(`minted member token expiring at ${grant.expiresAt}`);

  // Upsert the member's profile. PUT is idempotent by HTTP semantics (no key).
  const member = await expys.setMember(externalUserID, {
    displayName: "Ada Lovelace",
    tier: "gold",
  });
  console.log(`member ${member.externalUserID} is now tier=${member.tier}`);

  // Credit points to the member's wallet. Idempotent POST sends an Idempotency-Key.
  const credited = await expys.creditPoints({
    amount: 100,
    externalUserID,
    reason: "welcome bonus",
  });
  console.log(`new balance: ${credited.balance} ${credited.currency.symbol}`);

  // Register a webhook. The signingSecret is shown ONLY on creation - store it now.
  const webhook = await expys.createWebhook({
    events: ["redemption.created"],
    url: "https://example.com/expys/webhooks",
  });
  console.log(`webhook ${webhook.id} secret: ${webhook.signingSecret}`);

  // Org-wide analytics rollups.
  const summary = await expys.analyticsSummary();
  console.log(
    `members: ${summary.memberCount}, minted: ${summary.pointsMinted}`,
  );
}

void main();
