import { describe, expect, it } from "bun:test";

import { ExpysError } from "../errors";
import { createAuthSession } from "../auth.session";

describe("auth.session", () => {
  it("returns the initial token", () => {
    const session = createAuthSession({ token: "t0" });
    expect(session.getToken()).toBe("t0");
  });

  it("reports canRefresh based on the presence of a refresh hook", () => {
    expect(createAuthSession({ token: "t0" }).canRefresh()).toBe(false);
    expect(
      createAuthSession({
        token: "t0",
        refreshToken: () => Promise.resolve({ accessToken: "t1" }),
      }).canRefresh(),
    ).toBe(true);
  });

  it("refresh() swaps in the new token from the hook", async () => {
    const session = createAuthSession({
      token: "t0",
      refreshToken: () => Promise.resolve({ accessToken: "t1" }),
    });
    await session.refresh();
    expect(session.getToken()).toBe("t1");
  });

  it("refresh() without a hook throws an ExpysError", async () => {
    const session = createAuthSession({ token: "t0" });
    const error = await session.refresh().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExpysError);
  });

  it("does not proactively refresh without a known expiry", () => {
    const session = createAuthSession({
      token: "t0",
      now: () => 1_000,
      refreshToken: () => Promise.resolve({ accessToken: "t1" }),
    });
    expect(session.shouldRefreshProactively()).toBe(false);
  });

  it("proactively refreshes within the skew window of expiry", () => {
    const session = createAuthSession({
      refreshSkewMs: 30_000,
      token: "t0",
      tokenExpiresAt: 100_000,
      now: () => 75_000, // 25s to expiry, inside the 30s skew
      refreshToken: () => Promise.resolve({ accessToken: "t1" }),
    });
    expect(session.shouldRefreshProactively()).toBe(true);
  });

  it("does not proactively refresh while comfortably before expiry", () => {
    const session = createAuthSession({
      refreshSkewMs: 30_000,
      token: "t0",
      tokenExpiresAt: 100_000,
      now: () => 10_000,
      refreshToken: () => Promise.resolve({ accessToken: "t1" }),
    });
    expect(session.shouldRefreshProactively()).toBe(false);
  });

  it("never proactively refreshes without a hook even when expired", () => {
    const session = createAuthSession({
      token: "t0",
      tokenExpiresAt: 100_000,
      now: () => 200_000,
    });
    expect(session.shouldRefreshProactively()).toBe(false);
  });

  it("updates the expiry from the refresh result (ISO string accepted)", async () => {
    const session = createAuthSession({
      refreshSkewMs: 30_000,
      token: "t0",
      tokenExpiresAt: 100_000,
      now: () => 90_000,
      refreshToken: () =>
        Promise.resolve({
          accessToken: "t1",
          expiresAt: new Date(500_000).toISOString(),
        }),
    });
    expect(session.shouldRefreshProactively()).toBe(true);
    await session.refresh();
    expect(session.shouldRefreshProactively()).toBe(false);
  });
});
