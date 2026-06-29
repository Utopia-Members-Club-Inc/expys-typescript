/**
 * Error handling: branch on the typed error subclasses and the stable `code`,
 * and surface `requestId` for support. Zero UI.
 *
 * Run: EXPYS_MEMBER_TOKEN=... bun examples/error-handling.ts
 *
 * EXPYS_MEMBER_TOKEN is a short-lived member token your backend obtained from
 * POST /v1/auth/exchange.
 */
/* eslint-disable no-console -- runnable sample prints flow output */
import {
  ApiError,
  ConflictError,
  initialize,
  NetworkError,
  RateLimitError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
} from "../src/index";

const token = process.env.EXPYS_MEMBER_TOKEN;
if (!token) {
  throw new Error(
    "Set EXPYS_MEMBER_TOKEN (a member token from your backend's /v1/auth/exchange)",
  );
}

const expys = initialize({
  baseUrl: process.env.EXPYS_BASE_URL,
  environment: "sandbox",
  // A short ceiling so the timeout branch is reachable on a slow network.
  timeoutMs: 10_000,
  token,
});

async function main(): Promise<void> {
  try {
    await expys.createRedemption({
      offer: process.env.EXPYS_OFFER_ID ?? "off_1",
    });
    console.log("redemption created");
  } catch (error) {
    // Prefer instanceof on the specific subclass, then refine with the code.
    if (
      error instanceof ConflictError &&
      error.code === "REDEMPTION_ALREADY_EXISTS"
    ) {
      console.log("already redeemed by this member");
    } else if (error instanceof ValidationError) {
      console.log(`validation failed: ${error.code}`);
    } else if (error instanceof UnauthorizedError) {
      console.log(
        "token rejected; re-exchange a fresh member token on your backend",
      );
    } else if (error instanceof RateLimitError) {
      console.log(`rate limited; retry after ${error.retryAfterMs ?? "?"}ms`);
    } else if (error instanceof TimeoutError) {
      console.log("request timed out");
    } else if (error instanceof NetworkError) {
      console.log("network failure; no response received");
    } else if (error instanceof ApiError) {
      // Unknown code: handle as the generic class for its status. Quote requestId.
      console.log(
        `api error ${error.status} (${error.code}) requestId=${error.requestId ?? "n/a"}`,
      );
    } else {
      throw error;
    }
  }
}

void main();
