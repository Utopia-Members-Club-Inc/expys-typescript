<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Utopia-Members-Club-Inc/expys-typescript/main/assets/expys-logo-white.png" />
    <img alt="Expys" src="https://raw.githubusercontent.com/Utopia-Members-Club-Inc/expys-typescript/main/assets/expys-logo-black.png" width="150" />
  </picture>
</p>

<h1 align="center">@expys/sdk</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@expys/sdk"><img alt="npm version" src="https://img.shields.io/npm/v/@expys/sdk?style=flat-square&labelColor=000000&color=9EC1DE" /></a>
  <a href="https://www.npmjs.com/package/@expys/sdk"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@expys/sdk?style=flat-square&labelColor=000000&color=9EC1DE" /></a>
  <a href="https://www.npmjs.com/package/@expys/sdk"><img alt="node" src="https://img.shields.io/node/v/@expys/sdk?style=flat-square&labelColor=000000&color=555555" /></a>
  <a href="https://arethetypeswrong.github.io/?p=%40expys%2Fsdk"><img alt="types included" src="https://img.shields.io/badge/types-included-9EC1DE?style=flat-square&labelColor=000000" /></a>
  <a href="./LICENSE"><img alt="license MIT" src="https://img.shields.io/badge/license-MIT-9EC1DE?style=flat-square&labelColor=000000" /></a>
</p>

Official Expys data SDK for TypeScript. Embed Expys experiences into your web,
React Native, or Node app. Fetch-only, **zero runtime dependencies**.

> Beta. The generated types and transport are stable to use; the ergonomic layer
> is hardening during the rollout window. Pin an exact version in production and
> review the [versioning policy](https://docs.expys.com/guides/versioning).

## Getting Started

### Install

```sh
npm install @expys/sdk
# or: bun add @expys/sdk / yarn add @expys/sdk / pnpm add @expys/sdk
```

### Quick start

```ts
import { initialize } from "@expys/sdk";

const expys = initialize({
  // A short-lived member token your backend obtained from POST /v1/auth/exchange.
  token: memberToken,
  environment: "live", // or "sandbox"
  // Optional: let the SDK refresh the token automatically. This must call YOUR
  // backend, which re-exchanges the Org-API-Key. The Org-API-Key never ships in
  // the app.
  refreshToken: async () => {
    const res = await fetch("/api/expys/refresh", { method: "POST" });
    return res.json(); // -> { accessToken, expiresAt }
  },
});

const { data: offers } = await expys.listOffers({ limit: 20 });
const redemption = await expys.createRedemption({ offer: offers[0].id });
const status = await expys.getRedemption(redemption.id);
const eligibility = await expys.eligibility();
const wallet = await expys.wallet();
```

Runnable, copy-pasteable samples for every flow live in `examples/` (linked per
section below).

## Authentication & Token Refresh

The SDK holds a **short-lived member token**, never the Org-API-Key. Your backend
exchanges its secret Org-API-Key for a member token (`POST /v1/auth/exchange`,
server-to-server) and hands it to the app. The SDK attaches it as a Bearer token
and, if you provide a `refreshToken` hook, refreshes it automatically near expiry
and on a `401`.

The `refreshToken` hook must call **your** backend (which re-exchanges the
Org-API-Key) and return `{ accessToken: string; expiresAt?: Date | number | string }`.

- It is called **proactively** ~30s before `tokenExpiresAt` (set `tokenExpiresAt`
  to enable this) and **reactively** once on a `401`.
- If it throws, the error propagates to your call as an `ExpysError` — the SDK does
  **not** retry a hard-failed refresh (so a permanently-bad token can't loop).
- Without a `refreshToken` hook, an expired token simply surfaces as
  `UnauthorizedError`.

See [`examples/token-refresh.ts`](./examples/token-refresh.ts).

## Environments

`environment` (`"live"` / `"sandbox"`, default `"live"`) is **informational**: the
environment is enforced server-side by the token claim, so the SDK does not route
by it — it only surfaces it in the `User-Agent`. Point at sandbox by exchanging a
sandbox Org-API-Key on your backend. See [`examples/environments.ts`](./examples/environments.ts).

## Offers

| Method                                  | Endpoint         |
| --------------------------------------- | ---------------- |
| `expys.listOffers({ limit?, cursor? })` | `GET /v1/offers` |

`listOffers` is cursor-paginated. Pass the previous response's `nextCursor` until
it comes back `null`:

```ts
let cursor: string | undefined;
do {
  const page = await expys.listOffers({ limit: 50, cursor });
  for (const offer of page.data) {
    // handle offer
  }
  cursor = page.nextCursor ?? undefined;
} while (cursor);
```

See [`examples/pagination.ts`](./examples/pagination.ts).

## Redemptions

| Method                                                        | Endpoint                   |
| ------------------------------------------------------------- | -------------------------- |
| `expys.createRedemption(input, { idempotencyKey? })`          | `POST /v1/redemptions`     |
| `expys.getRedemption(id)`                                     | `GET /v1/redemptions/{id}` |
| `expys.listRedemptions({ status?, limit?, cursor?, externalUserID? })` | `GET /v1/redemptions` |

Writes automatically send an `Idempotency-Key` (a client-generated UUIDv4) so the
server safely replays the original response on retry. Override it via the
`idempotencyKey` option to make a write retry-safe across process restarts:

```ts
import { generateIdempotencyKey } from "@expys/sdk";

const key = generateIdempotencyKey();
await expys.createRedemption({ offer: "off_123" }, { idempotencyKey: key });
```

`createRedemption` surfaces the typed failure modes by status + stable `code`: a
`409` throws `ConflictError` (code `REDEMPTION_ALREADY_EXISTS`) when the member
already booked the offer, and a `422` throws `ValidationError` with
`code === "INSUFFICIENT_POINTS"` when the wallet balance is too low. Branch on the
class and refine with the code (see [Errors](#errors)).

`listRedemptions` is cursor-paginated and filters by lifecycle `status`
(`SUBMITTED`, `OPEN`, `AWAITING_VENDOR`, `AWAITING_CUSTOMER`, `PURCHASED`,
`CANCELED`, `COMPLETED`). `externalUserID` names the member when a machine token
reads on their behalf.

See [`examples/idempotency.ts`](./examples/idempotency.ts) and
[`examples/redemptions-list.ts`](./examples/redemptions-list.ts).

## Eligibility

| Method                                   | Endpoint              |
| ---------------------------------------- | --------------------- |
| `expys.eligibility({ externalUserID? })` | `GET /v1/eligibility` |

Returns the member's `tier` and `wallet`. `externalUserID` names the member when a
machine token calls on their behalf. See
[`examples/eligibility-wallet.ts`](./examples/eligibility-wallet.ts).

## Wallet

| Method                                                          | Endpoint                     |
| --------------------------------------------------------------- | ---------------------------- |
| `expys.wallet()`                                                | `GET /v1/wallet`             |
| `expys.walletTransactions({ limit?, cursor?, externalUserID? })` | `GET /v1/wallet/transactions` |

`wallet()` returns the member's `balance`, `amountReceived`, `amountSpent`, and
`currency`. `walletTransactions` is the cursor-paginated points ledger (each
credit/debit); `externalUserID` names the member when a machine token reads on
their behalf.

## Conversations

| Method                                                                  | Endpoint                              |
| ----------------------------------------------------------------------- | ------------------------------------- |
| `expys.listConversations({ externalUserID? })`                          | `GET /v1/conversations`               |
| `expys.listMessages(id, { limit?, cursor?, externalUserID? })`          | `GET /v1/conversations/{id}/messages` |
| `expys.sendMessage(id, message, { idempotencyKey? })`                   | `POST /v1/conversations/{id}/messages` |
| `expys.streamMessages(id)`                                              | `GET /v1/conversations/{id}/stream`   |

`listConversations` and `listMessages` accept an optional `externalUserID` (a
machine token acting on a member's behalf). `listMessages` is cursor-paginated.
`sendMessage` is a member-only write: it auto-sends an `Idempotency-Key` (override
via `idempotencyKey`) and takes no `externalUserID`. See
[`examples/conversations.ts`](./examples/conversations.ts).

### Streaming

`streamMessages(id)` returns an `AsyncIterable<Message>` of new, member-visible
messages over Server-Sent Events. Consume it with `for await`; history is not
replayed (pair it with `listMessages` for the backlog). The stream reconnects
with backoff on transient failures (network drop / `5xx` / `429`, honoring
`Retry-After`) and refreshes once on a `401`; it ends by throwing a
`ForbiddenError`/`NotFoundError` (or `UnauthorizedError` after a failed refresh).
Member-only - it takes no `externalUserID`.

```ts
for await (const message of expys.streamMessages("cnv_123")) {
  console.log(message.body);
  if (done) break; // breaking the loop closes the connection
}
```

Breaking the `for await` (or calling the iterator's `return()`) tears down the
underlying HTTP connection and any pending reconnect timer. This is the one
intentional concurrency difference across the SDKs (Swift returns an
`AsyncStream`, Kotlin a `Flow`); see
[`examples/stream-messages.ts`](./examples/stream-messages.ts) and
[SDK differences](https://docs.expys.com/sdks/differences).

## Server vs app methods (server-only)

Most methods above run with a short-lived **member token** and are safe to call
from your app. The following methods are **server-only**: they require an
**Org-API-Key** machine credential (`expys_live_...` / `expys_sandbox_...`) and
**must run only on your backend**. Never ship an Org-API-Key in a client app.

| Method                                                | Endpoint                          |
| ----------------------------------------------------- | --------------------------------- |
| `expys.exchangeToken(input, { idempotencyKey? })`     | `POST /v1/auth/exchange`          |
| `expys.creditPoints(input, { idempotencyKey? })`      | `POST /v1/wallet/credit`          |
| `expys.setMember(externalUserID, input)`              | `PUT /v1/members/{externalUserID}`    |
| `expys.getMember(externalUserID)`                     | `GET /v1/members/{externalUserID}`    |
| `expys.removeMember(externalUserID, { retainBalance? })` | `DELETE /v1/members/{externalUserID}` |
| `expys.analyticsSummary()`                            | `GET /v1/analytics/summary`       |
| `expys.analyticsOffers()`                             | `GET /v1/analytics/offers`        |
| `expys.analyticsTimeseries({ from, to, interval })`   | `GET /v1/analytics/timeseries`    |
| `expys.createWebhook(input, { idempotencyKey? })`     | `POST /v1/webhooks`               |
| `expys.listWebhooks()`                                | `GET /v1/webhooks`                |
| `expys.deleteWebhook(id)`                             | `DELETE /v1/webhooks/{id}`        |

If you configure the SDK with a member token (a `v4.local.…` PASETO) and call any
of these, the SDK **fails fast client-side** with a `NotConfiguredError` **before
any network request** — the credential is classified as a machine credential iff
it starts with `expys_`. The server **also** enforces this: a member token is
`403`'d via the route auth matrix. The three POSTs (`exchangeToken`,
`creditPoints`, `createWebhook`) auto-send an `Idempotency-Key` like the other
writes; the PUT and DELETEs are idempotent by HTTP semantics and send no key.

```ts
// Backend only — never in a client app.
const expys = initialize({ token: process.env.EXPYS_ORG_API_KEY!, environment: "live" });
const grant = await expys.exchangeToken({ externalUserID: "user_42" });
await expys.creditPoints({ amount: 100, externalUserID: "user_42" });
```

See [`examples/server-mode.ts`](./examples/server-mode.ts).

## Errors

Every failed request throws a typed error carrying the stable envelope `code`:

```ts
import { ConflictError, RateLimitError } from "@expys/sdk";

try {
  await expys.createRedemption({ offer });
} catch (error) {
  if (error instanceof ConflictError && error.code === "REDEMPTION_ALREADY_EXISTS") {
    // the member already booked this offer
  }
  if (error instanceof RateLimitError) {
    // error.retryAfterMs is set
  }
}
```

Classes: `ApiError` (base for HTTP errors) and `UnauthorizedError`,
`ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`,
`RateLimitError`, `ServerError`; plus `NetworkError` / `TimeoutError` and the
common base `ExpysError`.

Every `ApiError` carries `code`, `status`, and `requestId` (the server's
`x-request-id`, when present). Log or surface `requestId` in bug reports so
support can trace the exact call in the server logs.

`code` is the stable, machine-readable contract — branch on it (e.g.
`REDEMPTION_ALREADY_EXISTS` on a 409, `INSUFFICIENT_POINTS` on a 422 when the
wallet balance is too low, `RATE_LIMITED`, `OFFER_UNAVAILABLE`). New codes can
appear without a major version, so **handle an unknown code as the generic class
for its status** rather than assuming the set is closed. The full list lives in
the [`/v1` error responses](https://docs.expys.com/guides/errors). See
[`examples/error-handling.ts`](./examples/error-handling.ts).

## Retries & Timeouts

Requests that fail with `429` or `5xx` are retried with full-jitter exponential
backoff (base 500ms, cap 10s), honoring the `Retry-After` header (clamped to
[0, 300s] to bound a hostile value). Defaults: `maxRetries` is **2** (3 attempts
total); `timeoutMs` is unset (no per-attempt timeout) — set e.g.
`timeoutMs: 10000` for a 10s ceiling via `AbortController`. See
[`examples/configuration.ts`](./examples/configuration.ts).

## Configuration Reference

| Option            | Default         | Description                              |
| ----------------- | --------------- | ---------------------------------------- |
| `token`           | (required)      | Short-lived member token.                |
| `environment`     | `"live"`        | `"sandbox"` or `"live"` (a token claim). |
| `baseUrl`         | production host | Override the API base URL.               |
| `orgId`           | -               | Surfaced in the `User-Agent` only.       |
| `refreshToken`    | -               | Async hook returning a fresh token.      |
| `tokenExpiresAt`  | -               | Enables proactive refresh before expiry. |
| `refreshSkewMs`   | `30000`         | Refresh this long before expiry.         |
| `maxRetries`      | `2`             | Extra attempts on retryable failures.    |
| `timeoutMs`       | -               | Per-request timeout (`AbortController`). |
| `fetch`           | global `fetch`  | Custom fetch implementation.             |
| `userAgentSuffix` | -               | Appended to the SDK `User-Agent`.        |

## Versioning Policy

This package follows [Semantic Versioning](https://semver.org). The public surface
(`initialize`, the config + model types, the error classes, `generateIdempotencyKey`,
and the version constants) is pinned by tests; additive changes are minor, breaking
changes are major. New error `code` values can appear in a minor release. See the
full [Expys SDK versioning and deprecation policy](https://docs.expys.com/guides/versioning)
and the [CHANGELOG](./CHANGELOG.md).

## Runtime support

Works anywhere a standard `fetch` exists: modern browsers (Vite/web), Expo /
React Native, and Node 18+. Provide a `fetch` polyfill for older runtimes. The
built package is smoke-tested on Node 18/20/22, Bun, and Deno.

## Other SDKs

The Swift and Kotlin SDKs expose the same methods and behavior. Porting between
them? See [SDK differences](https://docs.expys.com/sdks/differences) for the intentional
per-language differences (and what's guaranteed identical).

## Security

Report vulnerabilities privately — see [SECURITY.md](./SECURITY.md). Please do
not open a public issue. The SDK sends no telemetry.
```
