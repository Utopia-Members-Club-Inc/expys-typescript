import { describe, expect, it } from "bun:test";

import { generateIdempotencyKey } from "../idempotency";

describe("idempotency::generateIdempotencyKey", () => {
  it("returns a UUID-formatted string", () => {
    expect(generateIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("returns a different key on each call", () => {
    const keys = new Set(
      Array.from({ length: 100 }, () => generateIdempotencyKey()),
    );
    expect(keys.size).toBe(100);
  });

  it("uses crypto.randomUUID when available", () => {
    expect(generateIdempotencyKey({ randomUUID: () => "crypto-uuid" })).toBe(
      "crypto-uuid",
    );
  });

  it("falls back to a Math.random UUID v4 when crypto.randomUUID is unavailable", () => {
    // Older Hermes / React Native lack crypto.randomUUID; the fallback must still
    // produce a well-formed, unique v4 (version nibble 4, variant nibble 8-b).
    const fallback = () => generateIdempotencyKey({});
    expect(fallback()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const keys = new Set(Array.from({ length: 100 }, fallback));
    expect(keys.size).toBe(100);
  });
});
