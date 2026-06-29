import { NotConfiguredError } from "./errors";

// Org-API-Key machine credentials are formatted `expys_<env>_<random>` (e.g.
// `expys_live_...`, `expys_sandbox_...`). A member token is a PASETO
// `v4.local.…` and never starts with `expys_`.
const MACHINE_CREDENTIAL_PREFIX = "expys_";

/**
 * Fails fast, client-side, when a server-only method is called without a machine
 * credential (i.e. a member token was supplied). Throws before any network call.
 * The server also enforces this (a member token gets 403 via the route auth
 * matrix), but the SDK rejects it without a round-trip.
 */
export function assertMachineCredential(token: string, method: string): void {
  if (!isMachineCredential(token)) {
    throw new NotConfiguredError(
      `\`${method}\` is a server-only method and requires an Org-API-Key credential, not a member token. Never embed an Org-API-Key in a client app.`,
    );
  }
}

/**
 * Classifies a configured credential as a machine (Org-API-Key) credential. True
 * iff the token starts with `expys_`. This reads the token that was configured on
 * the client; machine credentials are long-lived and never refreshed, so there is
 * no rotated token to re-check.
 */
export function isMachineCredential(token: string): boolean {
  return token.startsWith(MACHINE_CREDENTIAL_PREFIX);
}
