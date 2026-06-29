// Embedded versions surfaced in the User-Agent header for server-side
// attribution and observability. The literals below are the local-dev fallback;
// the published build injects the real values (see tsdown.config.ts). SDK
// versioning is independent semver, decoupled from the spec version.

/**
 * The SDK's own semantic version (mirrors `package.json`). Independent of
 * {@link SPEC_VERSION}.
 *
 * @example
 * ```ts
 * import { SDK_VERSION } from "@expys/sdk";
 * // e.g. "1.2.3"
 * ```
 */
export const SDK_VERSION = process.env.EXPYS_SDK_VERSION ?? "0.0.0";

/**
 * The OpenAPI spec version the SDK's models were generated from (mirrors
 * `packages/api-spec/v1.sdk.json` `info.version`).
 *
 * @example
 * ```ts
 * import { SPEC_VERSION } from "@expys/sdk";
 * // e.g. "1.0.0"
 * ```
 */
export const SPEC_VERSION = process.env.EXPYS_SPEC_VERSION ?? "1.0.0";

/**
 * The default SDK `User-Agent` (without the per-client environment, org, or
 * suffix). Format: `expys-sdk-ts/<sdk> (spec/<spec>)`.
 *
 * @example
 * ```ts
 * import { USER_AGENT } from "@expys/sdk";
 * // e.g. "expys-sdk-ts/1.2.3 (spec/1.0.0)"
 * ```
 */
export const USER_AGENT = `expys-sdk-ts/${SDK_VERSION} (spec/${SPEC_VERSION})`;

// Builds the per-client User-Agent, folding the configured environment and
// optional org id into the comment for server-side attribution, then appending
// the consumer's optional suffix. Keeps the format consistent with the Swift and
// Kotlin SDKs: `expys-sdk-ts/<sdk> (spec/<spec>; env=<env>[; org=<org>])[ <suffix>]`.
export const buildUserAgent = (
  environment: string,
  orgId?: string,
  suffix?: string,
): string => {
  const segments = [`spec/${SPEC_VERSION}`, `env=${environment}`];
  if (orgId) {
    segments.push(`org=${orgId}`);
  }
  const base = `expys-sdk-ts/${SDK_VERSION} (${segments.join("; ")})`;
  return suffix ? `${base} ${suffix}` : base;
};
