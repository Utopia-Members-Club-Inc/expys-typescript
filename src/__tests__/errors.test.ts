import { describe, expect, it } from "bun:test";

import {
  ApiError,
  ConflictError,
  ExpysError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
  toApiError,
  UnauthorizedError,
  ValidationError,
} from "../errors";

describe("errors::toApiError status mapping", () => {
  const envelope = (code: string) => ({
    error: { code, message: `${code} msg` },
  });

  it("maps 401 to UnauthorizedError carrying code and message", () => {
    const error = toApiError(401, envelope("UNAUTHORIZED"));
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(ExpysError);
    expect(error.status).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("UNAUTHORIZED msg");
  });

  it("maps 403 to ForbiddenError", () => {
    expect(toApiError(403, envelope("FORBIDDEN"))).toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("maps 404 to NotFoundError", () => {
    expect(toApiError(404, envelope("NOT_FOUND"))).toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps 409 to ConflictError and preserves the granular code", () => {
    const error = toApiError(409, envelope("REDEMPTION_ALREADY_EXISTS"));
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe("REDEMPTION_ALREADY_EXISTS");
  });

  it("maps 422 to ValidationError (incl OFFER_UNAVAILABLE)", () => {
    expect(toApiError(422, envelope("OFFER_UNAVAILABLE"))).toBeInstanceOf(
      ValidationError,
    );
  });

  it("maps 429 to RateLimitError and attaches retryAfterMs", () => {
    const error = toApiError(429, envelope("RATE_LIMITED"), 1500);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBe(1500);
  });

  it("maps any 5xx to ServerError", () => {
    expect(toApiError(500, envelope("INTERNAL"))).toBeInstanceOf(ServerError);
    expect(toApiError(503, envelope("ERROR"))).toBeInstanceOf(ServerError);
  });

  it("falls back to a base ApiError for an unmapped 4xx", () => {
    const error = toApiError(418, envelope("TEAPOT"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ValidationError);
    expect(error.status).toBe(418);
  });

  it("defaults code/message from status when the body is not an envelope", () => {
    const error = toApiError(404, "not json");
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("attaches the request id (from x-request-id) to every API error", () => {
    expect(
      toApiError(409, envelope("CONFLICT"), undefined, "req_1").requestId,
    ).toBe("req_1");
    expect(
      (
        toApiError(
          429,
          envelope("RATE_LIMITED"),
          1000,
          "req_2",
        ) as RateLimitError
      ).requestId,
    ).toBe("req_2");
    expect(
      toApiError(500, envelope("INTERNAL"), undefined, "req_3").requestId,
    ).toBe("req_3");
  });

  it("leaves requestId undefined when no header was present", () => {
    expect(toApiError(409, envelope("CONFLICT")).requestId).toBeUndefined();
  });
});

describe("errors::network and timeout", () => {
  it("NetworkError is an ExpysError but not an ApiError", () => {
    const error = new NetworkError("offline");
    expect(error).toBeInstanceOf(ExpysError);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it("TimeoutError is a NetworkError", () => {
    expect(new TimeoutError("slow")).toBeInstanceOf(NetworkError);
  });

  it("errors expose a name matching their class for logging", () => {
    expect(new UnauthorizedError("x", "UNAUTHORIZED").name).toBe(
      "UnauthorizedError",
    );
    expect(new NetworkError("x").name).toBe("NetworkError");
  });
});
