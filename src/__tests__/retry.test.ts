import { describe, expect, it } from "bun:test";

import { backoffDelayMs, isRetryableStatus, parseRetryAfter } from "../retry";

describe("retry::parseRetryAfter", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("parses delta-seconds into milliseconds", () => {
    expect(parseRetryAfter("2", now)).toBe(2000);
    expect(parseRetryAfter("0", now)).toBe(0);
  });

  it("parses an HTTP-date into ms remaining from now", () => {
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:05 GMT", now)).toBe(5000);
  });

  it("clamps a past HTTP-date to 0", () => {
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:00 GMT", now + 9000)).toBe(
      0,
    );
  });

  it("clamps an out-of-range delta-seconds value to the ceiling", () => {
    // A hostile/buggy "Retry-After: 99999999999999999999" must never become an
    // unbounded sleep; it clamps to the 300s ceiling.
    expect(parseRetryAfter("99999999999999999999", now)).toBe(300_000);
  });

  it("clamps a far-future HTTP-date to the ceiling", () => {
    expect(parseRetryAfter("Wed, 01 Jan 2031 00:00:00 GMT", now)).toBe(300_000);
  });

  it("returns undefined for a missing or unparseable value", () => {
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter("garbage", now)).toBeUndefined();
  });
});

describe("retry::isRetryableStatus", () => {
  it("retries 429 and 5xx", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("does not retry other 4xx or success", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(409)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe("retry::backoffDelayMs", () => {
  it("grows exponentially from base when jitter random returns 1", () => {
    const opts = { baseMs: 500, capMs: 10_000, random: () => 1 };
    expect(backoffDelayMs(0, opts)).toBe(500);
    expect(backoffDelayMs(1, opts)).toBe(1000);
    expect(backoffDelayMs(2, opts)).toBe(2000);
  });

  it("caps the ceiling", () => {
    expect(
      backoffDelayMs(20, { baseMs: 500, capMs: 10_000, random: () => 1 }),
    ).toBe(10_000);
  });

  it("applies full jitter against the random source", () => {
    expect(
      backoffDelayMs(2, { baseMs: 500, capMs: 10_000, random: () => 0 }),
    ).toBe(0);
    expect(
      backoffDelayMs(2, { baseMs: 500, capMs: 10_000, random: () => 0.5 }),
    ).toBe(1000);
  });
});
