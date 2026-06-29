# Changelog

All notable changes to `@expys/sdk` are documented here. This project follows
[Semantic Versioning](https://semver.org) and the
[Expys SDK versioning and deprecation policy](https://docs.expys.com/guides/versioning).
Entries are added with [changesets](https://github.com/changesets/changesets).

## 0.1.0 - 2026-06-29

### Changed (breaking — pre-1.0, beta)

- **Flat client methods**: `listOffers`, `createRedemption`, `getRedemption`,
  `eligibility`, and `wallet` replace the previous resource namespaces
  (`offers.list`, `redemptions.create`, …), so the TS, Swift, and Kotlin SDKs share
  one method surface.
- **`userAgentSuffix`** replaces the `userAgent` config option (matches the other SDKs).
- **Trimmed public surface**: transport, session, and error-mapping internals are no
  longer exported — only `initialize`, the config + model types, the error classes,
  `generateIdempotencyKey`, and the version constants.

### Added

- **Server-mode methods** (server-only, require an Org-API-Key machine credential):
  `exchangeToken`, `creditPoints`, `setMember`, `getMember`, `removeMember`,
  `analyticsSummary`, `analyticsOffers`, `analyticsTimeseries`, `createWebhook`,
  `listWebhooks`, and `deleteWebhook` (parity with the Swift and Kotlin SDKs).
  Calling one with a member token throws a new `NotConfiguredError` client-side
  before any request (the server also `403`s it). These add `PUT`/`DELETE`
  transport support.
- **Member-mode methods**: `listRedemptions`, `walletTransactions`,
  `listConversations`, `listMessages`, and `sendMessage` (parity with the Swift and
  Kotlin SDKs).
- **`streamMessages(id)`**: a member-mode SSE stream of new conversation messages,
  returning an `AsyncIterable<Message>` (Swift `AsyncThrowingStream`, Kotlin
  `Flow`). It reconnects with backoff on transient failures, refreshes once on a
  `401`, and ends on a permanent error; breaking the iteration tears down the
  connection.
- **New models** for the surface above: `Conversation`, `Message`, and the wallet
  `Transaction`, plus the member, analytics, and webhook types (`MemberSummary`,
  `SetMemberRequest`/`SetMemberResponse`, `CreditWalletRequest`/`CreditWalletResponse`,
  the `GetAnalytics*Response` shapes, `TokenExchangeRequest`/`TokenGrant`, and
  `CreateWebhookRequest`/`WebhookEndpoint`/`WebhookEndpointWithSecret`/
  `WebhookEndpointList`).
- **`Offer.pointsPrice`** — the points cost of a points-priced offer.
- **`ApiError.requestId`** — the server's `x-request-id`, for support correlation.
- `environment` and `orgId` are now folded into the `User-Agent` for attribution.
- Coverage gate (≥90%) enforced in CI.
- **Packaging gates**: `@arethetypeswrong/cli`, `publint`, and a `size-limit`
  bundle-size budget, wired as scripts and CI/pre-publish steps.
- **Sourcemaps** now ship for both the ESM and CJS builds.
- **TSDoc** on every exported symbol, each with an `@example`; `typedoc` is gated
  on documentation coverage and valid links, and emits a JSON model for the docs
  site.
- Full runnable **examples** set: pagination, error-handling, token-refresh,
  environments, idempotency, configuration, and eligibility-wallet.
- Opt-in **integration suite** (real sandbox, `EXPYS_INTEGRATION=1`) and a
  cross-runtime **smoke** under Node, Bun, and Deno.
- `lcov` coverage report uploaded to Codecov from CI.
- Package-level `CONTRIBUTING.md` and `SECURITY.md`, and a README badge row.

### Changed

- The embedded `SDK_VERSION`/`SPEC_VERSION` are now injected at build time from
  `package.json` and the spec, replacing the release-time `sed` edit of
  `version.ts`.
