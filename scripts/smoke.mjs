/* eslint-disable no-console -- runnable smoke script reports its result */

// Cross-runtime smoke: imports the built ESM artifact and asserts the public
// entry points resolve and a client assembles without any network I/O. Run under
// Node, Bun, and Deno in CI to prove the published package loads on every
// supported runtime. Not shipped (outside `files`). Build first: `bun run build`.

import { initialize, SDK_VERSION, USER_AGENT } from "../dist/index.mjs";

if (typeof initialize !== "function") {
  throw new Error("smoke: `initialize` is not a function");
}
if (typeof SDK_VERSION !== "string" || typeof USER_AGENT !== "string") {
  throw new Error("smoke: version constants are missing");
}

// initialize() must build the full method surface synchronously, without I/O.
const client = initialize({ token: "smoke-token" });
for (const method of [
  "listOffers",
  "createRedemption",
  "getRedemption",
  "eligibility",
  "wallet",
]) {
  if (typeof client[method] !== "function") {
    throw new Error(`smoke: client.${method} is missing`);
  }
}

console.log(`smoke ok: @expys/sdk ESM loaded (SDK_VERSION=${SDK_VERSION})`);
