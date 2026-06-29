/**
 * Idempotency: writes auto-send an Idempotency-Key so a retry replays rather than
 * double-books. Pre-generate an explicit key to make a write retry-safe across
 * process restarts (resume the same logical operation with the same key). Zero UI.
 *
 * Run: EXPYS_MEMBER_TOKEN=... bun examples/idempotency.ts
 */
/* eslint-disable no-console -- runnable sample prints flow output */
import {
  ConflictError,
  generateIdempotencyKey,
  initialize,
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
  token,
});

async function main(): Promise<void> {
  const offer = process.env.EXPYS_OFFER_ID ?? "off_1";

  // Generate the key once and persist it (e.g. with the operation record) so a
  // retry after a crash reuses it; the server replays the original response.
  const idempotencyKey = generateIdempotencyKey();
  console.log(`idempotency key: ${idempotencyKey}`);

  // The same key sent twice replays the first result rather than acting twice.
  for (const attempt of [1, 2]) {
    try {
      const redemption = await expys.createRedemption(
        { offer },
        { idempotencyKey },
      );
      console.log(
        `attempt ${attempt}: redemption ${redemption.id} [${redemption.status}]`,
      );
    } catch (error) {
      if (error instanceof ConflictError) {
        console.log(`attempt ${attempt}: conflict (${error.code})`);
        continue;
      }
      throw error;
    }
  }
}

void main();
