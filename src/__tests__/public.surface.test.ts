import { describe, expect, it } from "bun:test";

import * as sdk from "../index";

// Pins the runtime public surface of @expys/sdk. Type-only exports (interfaces,
// type aliases) do not appear here - only runtime values do - so this guards
// against accidentally re-exporting an internal value (the session factory, the
// error mapper, the default base URL) or dropping a public one. Growing the
// surface is a deliberate act: update this list and the README together.
const PUBLIC_RUNTIME_EXPORTS = [
  "ApiError",
  "ConflictError",
  "ExpysError",
  "ForbiddenError",
  "NetworkError",
  "NotConfiguredError",
  "NotFoundError",
  "RateLimitError",
  "SDK_VERSION",
  "SPEC_VERSION",
  "ServerError",
  "TimeoutError",
  "USER_AGENT",
  "UnauthorizedError",
  "ValidationError",
  "generateIdempotencyKey",
  "initialize",
].sort();

describe("sdk public surface", () => {
  it("exports exactly the intended runtime values", () => {
    expect(Object.keys(sdk).sort()).toEqual(PUBLIC_RUNTIME_EXPORTS);
  });

  it("does not leak transport/session/mapping internals", () => {
    const namespace = sdk as Record<string, unknown>;
    for (const leaked of [
      "createAuthSession",
      "createHttpClient",
      "toApiError",
      "DEFAULT_BASE_URL",
      "backoffDelayMs",
      "parseRetryAfter",
    ]) {
      expect(namespace[leaked], `${leaked} must stay internal`).toBeUndefined();
    }
  });
});
