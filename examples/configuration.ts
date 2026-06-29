/**
 * Configuration: timeouts, retry budget, and a custom fetch (for instrumentation
 * or a polyfill on older runtimes). Zero UI.
 *
 * Run: EXPYS_MEMBER_TOKEN=... bun examples/configuration.ts
 */
/* eslint-disable no-console -- runnable sample prints flow output */
import { initialize } from "../src/index";

const token = process.env.EXPYS_MEMBER_TOKEN;
if (!token) {
  throw new Error(
    "Set EXPYS_MEMBER_TOKEN (a member token from your backend's /v1/auth/exchange)",
  );
}

// A custom fetch wrapper: log each request, then delegate to the platform fetch.
// Use this seam for tracing, metrics, or a polyfill on Node < 18. The cast keeps
// it simple here under bun-types (whose `fetch` carries extra members); in a
// typical web/Node project the arrow satisfies `typeof fetch` without a cast.
const instrumentedFetch = ((input, init) => {
  const method = init?.method ?? "GET";
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  console.log(`-> ${method} ${url}`);
  return fetch(input, init);
}) as typeof fetch;

const expys = initialize({
  baseUrl: process.env.EXPYS_BASE_URL,
  environment: "sandbox",
  fetch: instrumentedFetch,
  // Retry 429/5xx up to 3 extra times (4 attempts total) with backoff.
  maxRetries: 3,
  // Abort any single attempt that exceeds 8s.
  timeoutMs: 8_000,
  token,
});

async function main(): Promise<void> {
  const { data } = await expys.listOffers({ limit: 3 });
  console.log(`fetched ${data.length} offers with the configured client`);
}

void main();
