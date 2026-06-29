// The error envelope every /v1 response uses: { error: { code, message } }.
// `code` is the stable, machine-readable contract; switch on it for granular
// handling (e.g. "REDEMPTION_ALREADY_EXISTS", "IDEMPOTENCY_KEY_REUSED").
export interface ErrorEnvelope {
  error: { code: string; message: string };
}

// Default code per status, mirroring the server's mapper, used when a response
// body is not a parseable envelope.
const STATUS_CODE: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "UNPROCESSABLE_ENTITY",
  429: "RATE_LIMITED",
  500: "INTERNAL",
};

/**
 * Base class for every error the SDK throws (API, network, timeout). Catch this
 * to handle any SDK failure uniformly.
 *
 * @example
 * ```ts
 * import { ExpysError } from "@expys/sdk";
 *
 * try {
 *   await expys.wallet();
 * } catch (error) {
 *   if (error instanceof ExpysError) {
 *     // any error originating from the SDK
 *   }
 * }
 * ```
 */
export class ExpysError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The request reached the server but returned a non-2xx response. Subclasses map
 * to specific statuses; the stable {@link ApiError.code} is the machine-readable
 * contract to branch on.
 *
 * @example
 * ```ts
 * import { ApiError } from "@expys/sdk";
 *
 * try {
 *   await expys.createRedemption({ offer });
 * } catch (error) {
 *   if (error instanceof ApiError) {
 *     // error.status, error.code, error.requestId
 *   }
 * }
 * ```
 */
export class ApiError extends ExpysError {
  /** Stable, machine-readable error code from the response envelope. */
  readonly code: string;
  /**
   * Server-assigned correlation id from the `x-request-id` response header, when
   * present. Quote it to support to trace the failure in the server logs.
   */
  readonly requestId?: string;
  /** HTTP status code of the response. */
  readonly status: number;

  constructor(
    message: string,
    code: string,
    status: number,
    requestId?: string,
  ) {
    super(message);
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

/**
 * A 409 Conflict, e.g. a reused idempotency key or an already-booked offer (code
 * `REDEMPTION_ALREADY_EXISTS`).
 *
 * @example
 * ```ts
 * if (error instanceof ConflictError && error.code === "REDEMPTION_ALREADY_EXISTS") {
 *   // the member already booked this offer
 * }
 * ```
 */
export class ConflictError extends ApiError {
  constructor(message: string, code: string, requestId?: string) {
    super(message, code, 409, requestId);
  }
}

/**
 * A 403 Forbidden: authenticated, but not permitted to access the resource.
 *
 * @example
 * ```ts
 * if (error instanceof ForbiddenError) {
 *   // the member token may not act on this resource
 * }
 * ```
 */
export class ForbiddenError extends ApiError {
  constructor(message: string, code: string, requestId?: string) {
    super(message, code, 403, requestId);
  }
}

/**
 * The request never produced a response (offline, DNS failure, connection reset).
 *
 * @example
 * ```ts
 * if (error instanceof NetworkError) {
 *   // no response was received; consider retrying later
 * }
 * ```
 */
export class NetworkError extends ExpysError {}

/**
 * A required credential or option was missing or wrong for the operation, caught
 * client-side before any network call. Thrown when a server-only method (e.g.
 * {@link ExpysClient.creditPoints}) is called with a member token instead of an
 * Org-API-Key machine credential.
 *
 * @example
 * ```ts
 * if (error instanceof NotConfiguredError) {
 *   // a server-only method was called without an Org-API-Key credential
 * }
 * ```
 */
export class NotConfiguredError extends ExpysError {}

/**
 * A 404 Not Found: the resource does not exist or is not visible to this caller.
 *
 * @example
 * ```ts
 * if (error instanceof NotFoundError) {
 *   // no redemption/offer with that id
 * }
 * ```
 */
export class NotFoundError extends ApiError {
  constructor(message: string, code: string, requestId?: string) {
    super(message, code, 404, requestId);
  }
}

/**
 * A 429 Too Many Requests. {@link RateLimitError.retryAfterMs} carries the parsed
 * `Retry-After` delay when the server sent one.
 *
 * @example
 * ```ts
 * if (error instanceof RateLimitError) {
 *   // error.retryAfterMs is set when the server sent Retry-After
 * }
 * ```
 */
export class RateLimitError extends ApiError {
  /** Milliseconds to wait before retrying, parsed from the `Retry-After` header. */
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    code: string,
    retryAfterMs?: number,
    requestId?: string,
  ) {
    super(message, code, 429, requestId);
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * A 5xx server error. The SDK retries these (with backoff) before surfacing one.
 *
 * @example
 * ```ts
 * if (error instanceof ServerError) {
 *   // error.status is the specific 5xx code
 * }
 * ```
 */
export class ServerError extends ApiError {
  constructor(
    message: string,
    code: string,
    status: number,
    requestId?: string,
  ) {
    super(message, code, status, requestId);
  }
}

/**
 * The request exceeded the configured `timeoutMs`. A subclass of
 * {@link NetworkError}.
 *
 * @example
 * ```ts
 * if (error instanceof TimeoutError) {
 *   // the request took longer than the configured timeout
 * }
 * ```
 */
export class TimeoutError extends NetworkError {}

/**
 * A 401 Unauthorized: the member token is missing, invalid, or expired. With a
 * `refreshToken` hook configured, the SDK first attempts one reactive refresh.
 *
 * @example
 * ```ts
 * if (error instanceof UnauthorizedError) {
 *   // re-exchange a fresh member token on your backend
 * }
 * ```
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string, code: string, requestId?: string) {
    super(message, code, 401, requestId);
  }
}

/**
 * A 422 Unprocessable Entity: the request failed server-side validation.
 *
 * @example
 * ```ts
 * if (error instanceof ValidationError) {
 *   // inspect error.code / error.message for the specific failure
 * }
 * ```
 */
export class ValidationError extends ApiError {
  constructor(message: string, code: string, requestId?: string) {
    super(message, code, 422, requestId);
  }
}

const parseEnvelope = (body: unknown): { code?: string; message?: string } => {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as ErrorEnvelope).error;
    if (typeof error === "object" && error !== null) {
      return { code: error.code, message: error.message };
    }
  }
  return {};
};

// Maps an HTTP status + response body to the matching typed error. The granular
// envelope code is always preserved on `.code`; retryAfterMs (computed from the
// Retry-After header by the caller) is attached to RateLimitError; requestId
// (the `x-request-id` response header) is attached to every API error.
export function toApiError(
  status: number,
  body: unknown,
  retryAfterMs?: number,
  requestId?: string,
): ApiError {
  const parsed = parseEnvelope(body);
  const code = parsed.code ?? STATUS_CODE[status] ?? "ERROR";
  const message = parsed.message ?? `Request failed with status ${status}`;

  switch (status) {
    case 401:
      return new UnauthorizedError(message, code, requestId);
    case 403:
      return new ForbiddenError(message, code, requestId);
    case 404:
      return new NotFoundError(message, code, requestId);
    case 409:
      return new ConflictError(message, code, requestId);
    case 422:
      return new ValidationError(message, code, requestId);
    case 429:
      return new RateLimitError(message, code, retryAfterMs, requestId);
    default:
      if (status >= 500) {
        return new ServerError(message, code, status, requestId);
      }
      return new ApiError(message, code, status, requestId);
  }
}
