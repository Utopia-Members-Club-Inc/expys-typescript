/**
 * Token refresh: proactive (before expiry) and reactive (once on a 401). The hook
 * must call YOUR backend, which re-exchanges the secret Org-API-Key. Zero UI.
 *
 * Run: EXPYS_MEMBER_TOKEN=... bun examples/token-refresh.ts
 *
 * EXPYS_MEMBER_TOKEN is the initial short-lived member token from your backend's
 * POST /v1/auth/exchange. EXPYS_REFRESH_URL is your backend's refresh endpoint.
 */
/* eslint-disable no-console -- runnable sample prints flow output */
import { initialize, type TokenRefreshResult } from "../src/index";

const token = process.env.EXPYS_MEMBER_TOKEN;
if (!token) {
  throw new Error(
    "Set EXPYS_MEMBER_TOKEN (a member token from your backend's /v1/auth/exchange)",
  );
}

const refreshUrl = process.env.EXPYS_REFRESH_URL ?? "/api/expys/refresh";

// Calls your backend, which re-exchanges the Org-API-Key and returns a fresh
// token. Returning `expiresAt` re-arms proactive refresh for the next call.
async function refreshToken(): Promise<TokenRefreshResult> {
  const res = await fetch(refreshUrl, { method: "POST" });
  if (!res.ok) {
    // A thrown refresh propagates to your call as an ExpysError and is NOT retried.
    throw new Error(`refresh failed: ${res.status}`);
  }
  return res.json() as Promise<TokenRefreshResult>;
}

const expys = initialize({
  baseUrl: process.env.EXPYS_BASE_URL,
  environment: "live",
  // Refresh ~60s before expiry. Setting tokenExpiresAt enables proactive refresh;
  // omit it to rely solely on reactive (401) refresh.
  refreshSkewMs: 60_000,
  refreshToken,
  token,
  tokenExpiresAt: Date.now() + 5 * 60_000,
});

async function main(): Promise<void> {
  // If the token is within the skew window, the SDK refreshes before this call;
  // on a 401 it refreshes once and retries with the new token.
  const wallet = await expys.wallet();
  console.log(`wallet balance: ${wallet.balance}`);
}

void main();
