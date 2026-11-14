import type {
  AcceptTermsRequest,
  AnalyticsSegmentField,
  ConfirmPhoneVerificationRequest,
  ConfirmPhoneVerificationResponse,
  CreateInterestRequest,
  CreateInterestResponse,
  CreateRedemptionRequest,
  CreateWebhookRequest,
  CreditWalletRequest,
  CreditWalletResponse,
  DeleteWebhookResponse,
  GetAnalyticsLiftResponse,
  GetAnalyticsOffersResponse,
  GetAnalyticsSegmentsResponse,
  GetAnalyticsSummaryResponse,
  GetAnalyticsTimeseriesResponse,
  GetBalanceResponse,
  GetTermsContentResponse,
  GetTermsResponse,
  ImportMembersRequest,
  ListConversationsResponse,
  ListMemberSignalHistoryResponse,
  ListMembersResponse,
  ListMessagesResponse,
  ListRedemptionsResponse,
  ListTransactionsResponse,
  MemberEligibility,
  MemberImportReport,
  MemberSignals,
  MemberSummary,
  Message,
  Offer,
  OfferList,
  Redemption,
  RemoveMemberResponse,
  SendMessageResponse,
  SetInterestIntakeRequest,
  SetMemberRequest,
  SetMemberResponse,
  SetOfferPriceRequest,
  SetRedemptionFeedbackRequest,
  StartPhoneVerificationResponse,
  TokenExchangeRequest,
  TokenGrant,
  UpdateConfigurationRequest,
  UpdateConfigurationResponse,
  Wallet,
  WebhookEndpointList,
  WebhookEndpointWithSecret,
} from "./types";

import { streamSse } from "./stream";
import { createHttpClient } from "./http";
import { buildUserAgent } from "./version";
import { createAuthSession } from "./auth.session";
import { assertMachineCredential } from "./credential";
import { generateIdempotencyKey } from "./idempotency";
import { DEFAULT_BASE_URL, type ExpysConfig } from "./config";

/**
 * Parameters for {@link ExpysClient.analyticsTimeseries}. All three are required.
 */
export interface AnalyticsTimeseriesParams {
  /** Start of the window, an ISO-8601 date-time string. */
  from: string;
  /** Bucket interval. */
  interval: "day" | "month" | "week";
  /** End of the window, an ISO-8601 date-time string. */
  to: string;
}

/**
 * Parameters for {@link ExpysClient.eligibility}.
 */
export interface EligibilityParams {
  /** Names the member when a machine token calls on their behalf. */
  externalUserID?: string;
}

/**
 * The Expys data SDK client. Create one with {@link initialize}, configured with
 * a short-lived member token and an optional refresh hook; every call retries
 * 429/5xx with backoff and sends an idempotency key on writes.
 *
 * @example
 * ```ts
 * import { initialize } from "@expys/sdk";
 *
 * const expys = initialize({ token: memberToken, environment: "live" });
 * const { data } = await expys.listOffers({ limit: 20 });
 * ```
 */
export interface ExpysClient {
  /**
   * Record that the member accepted one or more document versions. Sends an
   * `Idempotency-Key` so a retry replays rather than double-records.
   *
   * Re-accepting a version already on file is a no-op, not an error.
   *
   * @param input - The `versions` to accept (and optionally the `externalUserID` a
   *   machine token acts for).
   * @param options - Optional per-call write options such as a custom idempotency key.
   * @returns The same shape as {@link ExpysClient.getTerms}, with `acceptedAt`
   *   populated, so a consent sheet can dismiss without a second call.
   * @example
   * ```ts
   * await expys.acceptTerms({ versions: [doc.version] });
   * ```
   */
  acceptTerms(
    input: AcceptTermsRequest,
    options?: WriteOptions,
  ): Promise<GetTermsResponse>;
  /**
   * Per-offer analytics rollups for the org. Server-only: requires an Org-API-Key
   * machine credential; calling it with a member token throws a
   * {@link NotConfiguredError} before any request.
   *
   * @returns A {@link GetAnalyticsOffersResponse}.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * const { offers } = await expys.analyticsOffers();
   * ```
   */
  analyticsOffers(): Promise<GetAnalyticsOffersResponse>;
  /**
   * Org-wide analytics rollups (members, points minted/spent, completion rate).
   * Server-only: requires an Org-API-Key machine credential; calling it with a
   * member token throws a {@link NotConfiguredError} before any request.
   *
   * @returns A {@link GetAnalyticsSummaryResponse}.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * const summary = await expys.analyticsSummary();
   * ```
   */
  analyticsSummary(): Promise<GetAnalyticsSummaryResponse>;
  /**
   * Time-bucketed analytics over a window. Server-only: requires an Org-API-Key
   * machine credential; calling it with a member token throws a
   * {@link NotConfiguredError} before any request.
   *
   * @param params - The required window: `from` and `to` (ISO-8601 date-time
   *   strings) and the `interval` (`day` | `week` | `month`).
   * @returns A {@link GetAnalyticsTimeseriesResponse} of buckets.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * const { buckets } = await expys.analyticsTimeseries({
   *   from: "2026-01-01T00:00:00Z",
   *   to: "2026-02-01T00:00:00Z",
   *   interval: "day",
   * });
   * ```
   */
  analyticsTimeseries(
    params: AnalyticsTimeseriesParams,
  ): Promise<GetAnalyticsTimeseriesResponse>;
  /**
   * The org's points balance, credit limit, lifetime pool spend, and settlement
   * mode. Server-only: requires an Org-API-Key machine credential with the
   * `BILLING_READ` scope; calling it with a member token throws a
   * {@link NotConfiguredError} before any request.
   *
   * In `ORG_POOL` mode no per-redemption webhook fires, so poll this to track a
   * balance your VIPs' bookings are drawing down. An org with no pool yet reports
   * zeros rather than erroring.
   *
   * @returns A {@link GetBalanceResponse}.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * const { balance, settlementMode } = await expys.balance();
   * ```
   */
  balance(): Promise<GetBalanceResponse>;
  /**
   * Confirm a phone verification code.
   *
   * @param id - The interest id.
   * @param input - The `code` the member typed back.
   * @returns `{ verified }`. **False is not an error** - the code was wrong or expired,
   *   which is an ordinary thing for somebody to do. Ask again.
   */
  confirmPhoneVerification(
    id: string,
    input: ConfirmPhoneVerificationRequest,
  ): Promise<ConfirmPhoneVerificationResponse>;
  /**
   * Register interest in an experience: opens a concierge conversation and carries the
   * member's dates, with **no points debited and no inventory held**. Sends an
   * `Idempotency-Key` so a retry replays rather than double-registers.
   *
   * Dietary, allergy and accessibility answers are **not** accepted here - send them
   * to {@link ExpysClient.setInterestIntake}, which does not store them.
   *
   * @param input - The `offer` plus any intake fields already known.
   * @param options - Optional per-call write options such as a custom idempotency key.
   * @returns The interest, including a `conversationId` that is live immediately.
   * @example
   * ```ts
   * const interest = await expys.createInterest({
   *   offer: "off_123",
   *   preferredDates: ["2026-11-06"],
   *   adults: 2,
   * });
   * await expys.sendMessage(interest.conversationId!, "Any chance of the 7th?");
   * ```
   */
  createInterest(
    input: CreateInterestRequest,
    options?: WriteOptions,
  ): Promise<CreateInterestResponse>;
  /**
   * Book (request) an offer for the member. Sends an `Idempotency-Key` so a retry
   * replays rather than double-books; override it via `options.idempotencyKey`.
   *
   * @param input - The offer to redeem (and optionally the `externalUserID` a
   *   machine token acts for).
   * @param options - Optional per-call write options such as a custom idempotency key.
   * @returns The created {@link Redemption}.
   * @throws A {@link ConflictError} (code `REDEMPTION_ALREADY_EXISTS`) on 409 when the
   *   member already booked this offer, or a {@link ValidationError} with
   *   `code === "INSUFFICIENT_POINTS"` on 422 when the wallet balance is too low.
   * @example
   * ```ts
   * const redemption = await expys.createRedemption({ offer: "off_123" });
   * ```
   */
  createRedemption(
    input: CreateRedemptionRequest,
    options?: WriteOptions,
  ): Promise<Redemption>;
  /**
   * Register a webhook endpoint. Sends an `Idempotency-Key` so a retry replays
   * rather than double-registers; override it via `options.idempotencyKey`.
   * Server-only: requires an Org-API-Key machine credential; calling it with a
   * member token throws a {@link NotConfiguredError} before any request.
   *
   * @param input - The webhook `events` and delivery `url`.
   * @param options - Optional per-call write options such as a custom idempotency key.
   * @returns A {@link WebhookEndpointWithSecret} (the `signingSecret` is shown only
   *   on creation).
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * const webhook = await expys.createWebhook({
   *   events: ["redemption.created"],
   *   url: "https://example.com/webhooks",
   * });
   * ```
   */
  createWebhook(
    input: CreateWebhookRequest,
    options?: WriteOptions,
  ): Promise<WebhookEndpointWithSecret>;
  /**
   * Credit points to a member's wallet. Sends an `Idempotency-Key` so a retry
   * replays rather than double-credits; override it via `options.idempotencyKey`.
   * Server-only: requires an Org-API-Key machine credential; calling it with a
   * member token throws a {@link NotConfiguredError} before any request.
   *
   * @param input - The `amount` to credit, the `externalUserID`, and an optional
   *   `reason`.
   * @param options - Optional per-call write options such as a custom idempotency key.
   * @returns A {@link CreditWalletResponse} with the member's new balance.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * const { balance } = await expys.creditPoints({
   *   amount: 100,
   *   externalUserID: "user_42",
   * });
   * ```
   */
  creditPoints(
    input: CreditWalletRequest,
    options?: WriteOptions,
  ): Promise<CreditWalletResponse>;
  /**
   * Clear the org's authored display price for one experience, reverting it to the
   * figure derived from the dollar price and your currency ratio. Idempotent by HTTP
   * semantics (DELETE), so no idempotency key is sent. Server-only: requires an
   * Org-API-Key machine credential with `CONFIG_WRITE`; calling it with a member
   * token throws a {@link NotConfiguredError} before any request.
   *
   * @param id - The offer id.
   * @returns The {@link Offer} as your members now see it (`display.source` is
   *   `DERIVED`).
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @throws A {@link NotFoundError} when the offer is not visible to your org.
   * @example
   * ```ts
   * const offer = await expys.deleteOfferPrice("off_123");
   * ```
   */
  deleteOfferPrice(id: string): Promise<Offer>;
  /**
   * Delete a webhook endpoint by its id. Server-only: requires an Org-API-Key
   * machine credential; calling it with a member token throws a
   * {@link NotConfiguredError} before any request.
   *
   * @param id - The webhook id.
   * @returns A {@link DeleteWebhookResponse}.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * await expys.deleteWebhook("wh_123");
   * ```
   */
  deleteWebhook(id: string): Promise<DeleteWebhookResponse>;
  /**
   * The member's eligibility (tier + wallet).
   *
   * @param params - Optional parameters; `params.externalUserID` names the member
   *   when a machine token calls on their behalf.
   * @returns The member's {@link MemberEligibility}.
   * @example
   * ```ts
   * const { tier, wallet } = await expys.eligibility();
   * ```
   */
  eligibility(params?: EligibilityParams): Promise<MemberEligibility>;
  /**
   * Exchange this org's credential for a short-lived member token. Sends an
   * `Idempotency-Key` so a retry replays rather than re-mints; override it via
   * `options.idempotencyKey`. Server-only: requires an Org-API-Key machine
   * credential; calling it with a member token throws a {@link NotConfiguredError}
   * before any request.
   *
   * @param input - The member to mint a token for (`externalUserID`) plus optional
   *   profile fields.
   * @param options - Optional per-call write options such as a custom idempotency key.
   * @returns A {@link TokenGrant} (`accessToken` + `expiresAt`).
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * const grant = await expys.exchangeToken({ externalUserID: "user_42" });
   * ```
   */
  exchangeToken(
    input: TokenExchangeRequest,
    options?: WriteOptions,
  ): Promise<TokenGrant>;
  /**
   * How the activity of VIPs who booked an experience in the period moved, against
   * similar VIPs (same `valueBand` + `vipStatus` at the period start) who did not.
   * Association, not cause. Reads live data only, so a sandbox key gets no groups.
   * Server-only: requires an Org-API-Key machine credential with `ANALYTICS_READ`;
   * calling it with a member token throws a {@link NotConfiguredError} before any
   * request.
   *
   * A cohort with fewer than 5 VIPs comes back with `suppressed: true` and every
   * number `null`.
   *
   * @param params - The required period: `from` (inclusive) and `to` (exclusive),
   *   ISO-8601 date-time strings.
   * @returns A {@link GetAnalyticsLiftResponse} of groups.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @throws A {@link ValidationError} when `from` is after `to`.
   * @example
   * ```ts
   * const { groups } = await expys.getAnalyticsLift({
   *   from: "2026-10-01T00:00:00Z",
   *   to: "2026-11-01T00:00:00Z",
   * });
   * ```
   */
  getAnalyticsLift(
    params: GetAnalyticsLiftParams,
  ): Promise<GetAnalyticsLiftResponse>;
  /**
   * VIP counts, bookings and top categories per segment, grouping VIPs by one or
   * two signal fields (`vipStatus` counts as a field). Reads live data only, so a
   * sandbox key gets no segments. Server-only: requires an Org-API-Key machine
   * credential with `ANALYTICS_READ`; calling it with a member token throws a
   * {@link NotConfiguredError} before any request.
   *
   * A segment with fewer than 5 VIPs comes back with `suppressed: true` and its
   * counts `null`.
   *
   * @param params - The required period, `from` (inclusive) and `to` (exclusive)
   *   as ISO-8601 date-time strings, and the `groupBy` fields.
   * @returns A {@link GetAnalyticsSegmentsResponse} of segments.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @throws A {@link ValidationError} when a `groupBy` field is unknown or not
   *   switched on for your org, or `from` is after `to`.
   * @example
   * ```ts
   * const { segments } = await expys.getAnalyticsSegments({
   *   from: "2026-10-01T00:00:00Z",
   *   to: "2026-11-01T00:00:00Z",
   *   groupBy: ["valueBand", "vipStatus"],
   * });
   * ```
   */
  getAnalyticsSegments(
    params: GetAnalyticsSegmentsParams,
  ): Promise<GetAnalyticsSegmentsResponse>;
  /**
   * Read an interest and its intake.
   *
   * @param id - The interest id.
   * @returns The interest.
   */
  getInterest(id: string): Promise<CreateInterestResponse>;
  /**
   * Read a member's profile by their external id. Server-only: requires an
   * Org-API-Key machine credential; calling it with a member token throws a
   * {@link NotConfiguredError} before any request.
   *
   * @param externalUserID - The member's external user id.
   * @returns A {@link MemberSummary}.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * const member = await expys.getMember("user_42");
   * ```
   */
  getMember(externalUserID: string): Promise<MemberSummary>;
  /**
   * Read one offer by its id: the same shape {@link ExpysClient.listOffers} returns,
   * for a deep link. Works with a member token or a machine credential.
   *
   * @param id - The offer id.
   * @returns The {@link Offer}.
   * @throws A {@link NotFoundError} when no offer with that id is visible to your
   *   org (another tenant's id gets the same 404).
   * @example
   * ```ts
   * const offer = await expys.getOffer("off_123");
   * ```
   */
  getOffer(id: string): Promise<Offer>;
  /**
   * Read a redemption by its id.
   *
   * @param id - The redemption id.
   * @returns The {@link Redemption}.
   * @throws A {@link NotFoundError} when no redemption has that id (404).
   * @example
   * ```ts
   * const redemption = await expys.getRedemption("rdm_123");
   * ```
   */
  getRedemption(id: string): Promise<Redemption>;
  /**
   * Read a member's VIP signal history: one snapshot of their full signal set per
   * change, newest first by `observedAt`. Cursor-paginate with `params.cursor`
   * until the response's `nextCursor` is null. Server-only: requires an
   * Org-API-Key machine credential with `MEMBERS_READ`; calling it with a member
   * token throws a {@link NotConfiguredError} before any request.
   *
   * @param externalUserID - The member's external user id.
   * @param params - Optional `from` / `to` (ISO 8601, inclusive), `limit` (1-100)
   *   and pagination `cursor`.
   * @returns A {@link ListMemberSignalHistoryResponse} plus the next `nextCursor`.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @throws A {@link NotFoundError} when the member is not in your org.
   * @example
   * ```ts
   * const { snapshots } = await expys.getSignalHistory("user_42", { limit: 50 });
   * ```
   */
  getSignalHistory(
    externalUserID: string,
    params?: GetSignalHistoryParams,
  ): Promise<ListMemberSignalHistoryResponse>;
  /**
   * List the legal documents this member has and has not accepted.
   *
   * Metadata only - safe to call on every launch. The document text is a separate,
   * cacheable call: see {@link ExpysClient.getTermsContent}.
   *
   * @param params - Optionally the `externalUserID` a machine token acts for.
   * @returns Each document with its current `version` and an `acceptedAt` that is null
   *   while outstanding - including when the member accepted an earlier version.
   * @example
   * ```ts
   * const { documents } = await expys.getTerms();
   * const outstanding = documents.filter((d) => d.acceptedAt === null);
   * ```
   */
  getTerms(params?: GetTermsParams): Promise<GetTermsResponse>;
  /**
   * Read one version's text, rendered for your organisation.
   *
   * A published version never changes, so this response is stable forever and is served
   * `Cache-Control: immutable`. Fetch it when the consent sheet opens, not on launch -
   * the terms of service are around 28kB.
   *
   * @param version - The version id from {@link ExpysClient.getTerms}.
   * @returns `contentHTML` (a complete HTML fragment to render) and `renderedHash`.
   */
  getTermsContent(version: string): Promise<GetTermsContentResponse>;
  /**
   * Upsert up to 1,000 members in one call: each row takes the fields of
   * {@link ExpysClient.setMember} (`tier`, `signals`, `attributes`, `asOf`). A bad
   * row is skipped and listed in the report with its 1-based row number, field and
   * code; every other row is written. Sends an `Idempotency-Key` (the route
   * requires one) so a retry replays the original report; override it via
   * `params.idempotencyKey`. Pass `params.dryRun` to check every row without
   * writing. Server-only: requires an Org-API-Key machine credential with
   * `MEMBERS_WRITE`; calling it with a member token throws a
   * {@link NotConfiguredError} before any request.
   *
   * @param input - The `rows` to import.
   * @param params - Optional `dryRun` and a custom `idempotencyKey`.
   * @returns A {@link MemberImportReport}: `accepted` and the `rejected` rows.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @throws A {@link ValidationError} when the body itself is malformed (a row
   *   without `externalUserID`), or an {@link ApiError} with status 413 and
   *   `code === "batch_too_large"` over 1,000 rows.
   * @example
   * ```ts
   * const report = await expys.importMembers({
   *   rows: [{ externalUserID: "user_42", signals: { activityBand: "HIGH" } }],
   * });
   * // report.accepted, report.rejected
   * ```
   */
  importMembers(
    input: ImportMembersRequest,
    params?: ImportMembersParams,
  ): Promise<MemberImportReport>;
  /**
   * List the member's conversations.
   *
   * @param params - Optional parameters; `params.externalUserID` names the member
   *   when a machine token calls on their behalf.
   * @returns A {@link ListConversationsResponse} of conversations.
   * @example
   * ```ts
   * const { conversations } = await expys.listConversations();
   * ```
   */
  listConversations(
    params?: ListConversationsParams,
  ): Promise<ListConversationsResponse>;
  /**
   * List the org's members, newest-first. Cursor-paginate with `params.cursor`
   * until the response's `nextCursor` is null. Server-only: requires an
   * Org-API-Key machine credential; calling it with a member token throws a
   * {@link NotConfiguredError} before any request.
   *
   * @param params - Optional `tier`, `limit`, and pagination `cursor`.
   * @returns A {@link ListMembersResponse} plus the next `nextCursor`.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * const { members } = await expys.listMembers({ tier: "gold" });
   * ```
   */
  listMembers(params?: ListMembersParams): Promise<ListMembersResponse>;
  /**
   * List the messages in a conversation. Cursor-paginate with `params.cursor`
   * until the response's `nextCursor` is null.
   *
   * @param id - The conversation id.
   * @param params - Optional `limit`, pagination `cursor`, and `externalUserID`.
   * @returns A {@link ListMessagesResponse} of messages plus the next `nextCursor`.
   * @example
   * ```ts
   * const { messages } = await expys.listMessages("cnv_123", { limit: 50 });
   * ```
   */
  listMessages(
    id: string,
    params?: ListMessagesParams,
  ): Promise<ListMessagesResponse>;
  /**
   * Browse available offers. Cursor-paginate with `params.cursor` until the
   * response's `nextCursor` is null.
   *
   * @param params - Optional `available` filter, `limit` and pagination `cursor`.
   * @returns An {@link OfferList} of offers plus the next `nextCursor`.
   * @example
   * ```ts
   * let cursor: string | undefined;
   * do {
   *   const page = await expys.listOffers({ limit: 50, cursor });
   *   cursor = page.nextCursor ?? undefined;
   * } while (cursor);
   * ```
   */
  listOffers(params?: ListOffersParams): Promise<OfferList>;
  /**
   * List the member's redemptions. Cursor-paginate with `params.cursor` until the
   * response's `nextCursor` is null; filter by lifecycle `params.status`.
   *
   * @param params - Optional `status`, `limit`, pagination `cursor`, and
   *   `externalUserID`.
   * @returns A {@link ListRedemptionsResponse} plus the next `nextCursor`.
   * @example
   * ```ts
   * const { redemptions } = await expys.listRedemptions({ status: "OPEN" });
   * ```
   */
  listRedemptions(
    params?: ListRedemptionsParams,
  ): Promise<ListRedemptionsResponse>;
  /**
   * List the org's webhook endpoints. Server-only: requires an Org-API-Key machine
   * credential; calling it with a member token throws a {@link NotConfiguredError}
   * before any request.
   *
   * @returns A {@link WebhookEndpointList}.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * const { data } = await expys.listWebhooks();
   * ```
   */
  listWebhooks(): Promise<WebhookEndpointList>;
  /**
   * Remove (archive) a member by their external id. Idempotent by HTTP semantics,
   * so no idempotency key is sent. Server-only: requires an Org-API-Key machine
   * credential; calling it with a member token throws a {@link NotConfiguredError}
   * before any request.
   *
   * @param externalUserID - The member's external user id.
   * @param params - Optional `retainBalance` to keep the member's points balance.
   * @returns A {@link RemoveMemberResponse}.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * await expys.removeMember("user_42", { retainBalance: true });
   * ```
   */
  removeMember(
    externalUserID: string,
    params?: RemoveMemberParams,
  ): Promise<RemoveMemberResponse>;
  /**
   * Send a message into a conversation. Sends an `Idempotency-Key` so a retry
   * replays rather than double-posts; override it via `options.idempotencyKey`.
   *
   * @param id - The conversation id.
   * @param message - The message body to send.
   * @param options - Optional per-call write options such as a custom idempotency key.
   * @returns A {@link SendMessageResponse} (`ok: true` when accepted).
   * @example
   * ```ts
   * await expys.sendMessage("cnv_123", "Hello");
   * ```
   */
  sendMessage(
    id: string,
    message: string,
    options?: WriteOptions,
  ): Promise<SendMessageResponse>;
  /**
   * Replace an interest's intake. Send the complete answer each time - a partial merge
   * over a set of dates has no sane meaning.
   *
   * The `dietary`, `allergies` and `accessibility` fields are forwarded to the concierge
   * team and **never stored**: you can send them, you cannot read them back, and the
   * response records only when they were sent.
   *
   * @param id - The interest id.
   * @param input - The whole intake block.
   * @returns The interest with its updated intake.
   */
  setInterestIntake(
    id: string,
    input: SetInterestIntakeRequest,
  ): Promise<CreateInterestResponse>;
  /**
   * Upsert a member's profile (tier, display name, attributes) by their external
   * id. Idempotent by HTTP semantics (PUT), so no idempotency key is sent.
   * Server-only: requires an Org-API-Key machine credential; calling it with a
   * member token throws a {@link NotConfiguredError} before any request.
   *
   * @param externalUserID - The member's external user id.
   * @param input - The fields to upsert (`tier`, `displayName`, `attributes`).
   * @returns A {@link SetMemberResponse}.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @example
   * ```ts
   * await expys.setMember("user_42", { tier: "gold" });
   * ```
   */
  setMember(
    externalUserID: string,
    input: SetMemberRequest,
  ): Promise<SetMemberResponse>;
  /**
   * Set the org's own display price for one experience, in your currency. Your
   * members see this amount instead of the derived figure; the points debited on
   * redemption are unchanged. Idempotent by HTTP semantics (PUT), so no idempotency
   * key is sent. Server-only: requires an Org-API-Key machine credential with
   * `CONFIG_WRITE`; calling it with a member token throws a
   * {@link NotConfiguredError} before any request.
   *
   * @param id - The offer id.
   * @param input - The `amount` to display (0 or more; decimals allowed).
   * @returns The {@link Offer} as your members now see it (`display.source` is
   *   `AUTHORED`).
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @throws A {@link NotFoundError} when the offer is not visible to your org, or a
   *   {@link ValidationError} when `amount` is negative.
   * @example
   * ```ts
   * const offer = await expys.setOfferPrice("off_123", { amount: 39.5 });
   * ```
   */
  setOfferPrice(id: string, input: SetOfferPriceRequest): Promise<Offer>;
  /**
   * Record a member's score for a completed experience. 0-10, the NPS scale.
   *
   * @param id - The redemption id.
   * @param input - The `rating` and an optional `comment`.
   * @returns The redemption, now carrying `feedback`.
   * @throws A {@link ValidationError} with `code === "REDEMPTION_NOT_COMPLETED"` when
   *   the experience has not happened yet; its `details.status` names the current one.
   */
  setRedemptionFeedback(
    id: string,
    input: SetRedemptionFeedbackRequest,
  ): Promise<Redemption>;
  /**
   * Send a verification code to the number on an interest's intake.
   *
   * Until a number is verified it is display-only and the concierge team will not text
   * it: an unverified number is one typo away from sending a stranger somebody else's
   * itinerary.
   *
   * @param id - The interest id.
   * @returns `{ sent }`.
   */
  startPhoneVerification(id: string): Promise<StartPhoneVerificationResponse>;
  /**
   * Stream new, member-visible messages in a conversation over Server-Sent
   * Events as they arrive. Returns a lazy `AsyncIterable<Message>`; consume it
   * with `for await`. History is not replayed - pair this with
   * {@link ExpysClient.listMessages} for the backlog. The stream reconnects with
   * backoff on transient failures and ends on a permanent {@link ForbiddenError}
   * /{@link NotFoundError} (or {@link UnauthorizedError} after one refresh).
   * Breaking the iteration (or `break`ing the loop) tears down the connection.
   * Member-only; takes no `externalUserID`.
   *
   * @param id - The conversation id.
   * @returns An `AsyncIterable<Message>` of new messages.
   * @example
   * ```ts
   * for await (const message of expys.streamMessages("cnv_123")) {
   *   console.log(message.body);
   *   if (done) break; // breaking closes the connection
   * }
   * ```
   */
  streamMessages(id: string): AsyncIterable<Message>;
  /**
   * Name the org's display currency and set how many units of it make a dollar.
   * Send only the fields you are changing. Idempotent by HTTP semantics (PUT), so no
   * idempotency key is sent. Server-only (and not callable from a browser): requires
   * an Org-API-Key machine credential with `CONFIG_WRITE`; calling it with a member
   * token throws a {@link NotConfiguredError} before any request.
   *
   * A ratio change large enough to reprice the catalogue by more than the guard
   * factor is refused unless `confirmReprice` is true.
   *
   * @param input - Any of `currencyName`, `currencySymbol`, `currencyUnitsPerUSD`,
   *   and `confirmReprice`.
   * @returns The org's currency after the change, an
   *   {@link UpdateConfigurationResponse}.
   * @throws A {@link NotConfiguredError} when configured with a member token.
   * @throws An {@link ApiError} with status 400 when the input is invalid or the
   *   reprice needs confirming, or with `code === "FIELD_NOT_WRITABLE"` when it names
   *   a commercial term such as `creditLimit`.
   * @example
   * ```ts
   * await expys.updateConfiguration({
   *   currencyName: "Credits",
   *   currencySymbol: "C",
   *   currencyUnitsPerUSD: 1,
   * });
   * ```
   */
  updateConfiguration(
    input: UpdateConfigurationRequest,
  ): Promise<UpdateConfigurationResponse>;
  /**
   * The member's wallet (balances).
   *
   * @returns The member's {@link Wallet}.
   * @example
   * ```ts
   * const wallet = await expys.wallet();
   * // wallet.balance, wallet.currency.symbol
   * ```
   */
  wallet(): Promise<Wallet>;
  /**
   * List the member's wallet transactions (the points ledger). Cursor-paginate
   * with `params.cursor` until the response's `nextCursor` is null.
   *
   * @param params - Optional `limit`, pagination `cursor`, and `externalUserID`.
   * @returns A {@link ListTransactionsResponse} plus the next `nextCursor`.
   * @example
   * ```ts
   * const { transactions } = await expys.walletTransactions({ limit: 50 });
   * ```
   */
  walletTransactions(
    params?: WalletTransactionsParams,
  ): Promise<ListTransactionsResponse>;
}

/**
 * Parameters for {@link ExpysClient.getAnalyticsLift}. Both are required.
 */
export interface GetAnalyticsLiftParams {
  /** Start of the period (inclusive), an ISO-8601 date-time string. */
  from: string;
  /** End of the period (exclusive), an ISO-8601 date-time string. */
  to: string;
}

/**
 * Parameters for {@link ExpysClient.getAnalyticsSegments}. All three are required.
 */
export interface GetAnalyticsSegmentsParams {
  /** Start of the period (inclusive), an ISO-8601 date-time string. */
  from: string;
  /**
   * One or two fields to group VIPs by, each switched on for your org
   * (`vipStatus` needs `activityBand`).
   */
  groupBy: readonly AnalyticsSegmentField[];
  /** End of the period (exclusive), an ISO-8601 date-time string. */
  to: string;
}

/**
 * Parameters for {@link ExpysClient.getSignalHistory}.
 */
export interface GetSignalHistoryParams {
  /** Pagination cursor from a previous response's `nextCursor`. */
  cursor?: string;
  /** Only snapshots observed at or after this time (ISO 8601, inclusive). */
  from?: string;
  /** Maximum number of snapshots to return (1-100). */
  limit?: number;
  /** Only snapshots observed at or before this time (ISO 8601, inclusive). */
  to?: string;
}

/**
 * Parameters for {@link ExpysClient.getTerms}.
 */
export interface GetTermsParams {
  /** Names the member when a machine token calls on their behalf. */
  externalUserID?: string;
}

/**
 * Parameters for {@link ExpysClient.importMembers}.
 */
export interface ImportMembersParams extends WriteOptions {
  /** Check every row and return the report without writing anything. */
  dryRun?: boolean;
}

/**
 * Parameters for {@link ExpysClient.listConversations}.
 */
export interface ListConversationsParams {
  /** Names the member when a machine token calls on their behalf. */
  externalUserID?: string;
}

/**
 * Parameters for {@link ExpysClient.listMembers}.
 */
export interface ListMembersParams {
  /** Return only members whose current `activityBand` signal is this value. */
  activityBand?: NonNullable<NonNullable<MemberSignals>["activityBand"]>;
  /** Pagination cursor from a previous response's `nextCursor`. */
  cursor?: string;
  /** Maximum number of members to return (1-100). */
  limit?: number;
  /** Return only members whose effective tier matches this value exactly. */
  tier?: string;
  /** Return only members whose current `valueBand` signal is this value. */
  valueBand?: NonNullable<NonNullable<MemberSignals>["valueBand"]>;
  /** Return only members with this derived VIP status. */
  vipStatus?: MemberSummary["vipStatus"];
}

/**
 * Parameters for {@link ExpysClient.listMessages}.
 */
export interface ListMessagesParams {
  /** Pagination cursor from a previous response's `nextCursor`. */
  cursor?: string;
  /** Names the member when a machine token calls on their behalf. */
  externalUserID?: string;
  /** Maximum number of messages to return. */
  limit?: number;
}

/**
 * Parameters for {@link ExpysClient.listOffers}.
 */
export interface ListOffersParams {
  /**
   * `true` leaves out sold-out offers (`availability.quantityRemaining` of 0).
   * Omitted or `false` returns every offer, sold-out ones included.
   */
  available?: boolean;
  /** Pagination cursor from a previous response's `nextCursor`. */
  cursor?: string;
  /** Maximum number of offers to return. */
  limit?: number;
}

/**
 * Parameters for {@link ExpysClient.listRedemptions}.
 */
export interface ListRedemptionsParams {
  /** Pagination cursor from a previous response's `nextCursor`. */
  cursor?: string;
  /** Names the member when a machine token calls on their behalf. */
  externalUserID?: string;
  /** Maximum number of redemptions to return (1-100). */
  limit?: number;
  /**
   * Filter by redemption lifecycle status (e.g. `SUBMITTED`, `OPEN`,
   * `AWAITING_VENDOR`, `AWAITING_CUSTOMER`, `PURCHASED`, `CANCELED`, `COMPLETED`).
   */
  status?: string;
}

/**
 * Parameters for {@link ExpysClient.removeMember}.
 */
export interface RemoveMemberParams {
  /** Keep the member's points balance instead of clearing it on removal. */
  retainBalance?: boolean;
}

/**
 * Parameters for {@link ExpysClient.walletTransactions}.
 */
export interface WalletTransactionsParams {
  /** Pagination cursor from a previous response's `nextCursor`. */
  cursor?: string;
  /** Names the member when a machine token calls on their behalf. */
  externalUserID?: string;
  /** Maximum number of transactions to return. */
  limit?: number;
}

/**
 * Per-call options for write requests such as {@link ExpysClient.createRedemption}.
 */
export interface WriteOptions {
  /** Override the auto-generated idempotency key (e.g. to retry across sessions). */
  idempotencyKey?: string;
}

/**
 * Create an {@link ExpysClient}. Holds a short-lived member token and refreshes
 * it via the consumer's `refreshToken` hook (which calls their backend's
 * `POST /v1/auth/exchange`). All calls retry 429/5xx with backoff and send an
 * idempotency key on writes.
 *
 * @param config - The SDK configuration; see {@link ExpysConfig}.
 * @returns A ready-to-use {@link ExpysClient}.
 * @example
 * ```ts
 * import { initialize } from "@expys/sdk";
 *
 * const expys = initialize({
 *   token: memberToken,
 *   environment: "sandbox",
 *   refreshToken: async () =>
 *     (await fetch("/api/expys/refresh", { method: "POST" })).json(),
 * });
 * ```
 */
export function initialize(config: ExpysConfig): ExpysClient {
  const session = createAuthSession(config);
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const userAgent = buildUserAgent(
    config.environment ?? "live",
    config.orgId,
    config.userAgentSuffix,
  );
  const http = createHttpClient({
    baseUrl,
    fetchImpl: config.fetch,
    maxRetries: config.maxRetries,
    session,
    timeoutMs: config.timeoutMs,
    userAgent,
  });

  // Server-mode methods require an Org-API-Key machine credential. The check runs
  // against the initially configured token (machine credentials are long-lived and
  // never refreshed) and throws BEFORE any network call when a member token was
  // supplied. The server also 403s a member token, but the SDK fails fast.
  const guardServerOnly = (method: string): void =>
    assertMachineCredential(config.token, method);

  return {
    wallet: () => http.request<Wallet>({ method: "GET", path: "/v1/wallet" }),
    acceptTerms: (input, options) =>
      http.request<GetTermsResponse>({
        body: input,
        idempotencyKey: options?.idempotencyKey ?? generateIdempotencyKey(),
        method: "POST",
        path: "/v1/terms/acceptance",
      }),
    analyticsOffers: () => {
      guardServerOnly("analyticsOffers");
      return http.request<GetAnalyticsOffersResponse>({
        method: "GET",
        path: "/v1/analytics/offers",
      });
    },
    analyticsSummary: () => {
      guardServerOnly("analyticsSummary");
      return http.request<GetAnalyticsSummaryResponse>({
        method: "GET",
        path: "/v1/analytics/summary",
      });
    },
    analyticsTimeseries: (params) => {
      guardServerOnly("analyticsTimeseries");
      return http.request<GetAnalyticsTimeseriesResponse>({
        method: "GET",
        path: "/v1/analytics/timeseries",
        query: { from: params.from, interval: params.interval, to: params.to },
      });
    },
    balance: () => {
      guardServerOnly("balance");
      return http.request<GetBalanceResponse>({
        method: "GET",
        path: "/v1/balance",
      });
    },
    confirmPhoneVerification: (id, input) =>
      http.request<ConfirmPhoneVerificationResponse>({
        body: input,
        method: "PUT",
        path: `/v1/interests/${encodeURIComponent(id)}/phone/verification`,
      }),
    createInterest: (input, options) =>
      http.request<CreateInterestResponse>({
        body: input,
        idempotencyKey: options?.idempotencyKey ?? generateIdempotencyKey(),
        method: "POST",
        path: "/v1/interests",
      }),
    createRedemption: (input, options) =>
      http.request<Redemption>({
        body: input,
        idempotencyKey: options?.idempotencyKey ?? generateIdempotencyKey(),
        method: "POST",
        path: "/v1/redemptions",
      }),
    createWebhook: (input, options) => {
      guardServerOnly("createWebhook");
      return http.request<WebhookEndpointWithSecret>({
        body: input,
        idempotencyKey: options?.idempotencyKey ?? generateIdempotencyKey(),
        method: "POST",
        path: "/v1/webhooks",
      });
    },
    creditPoints: (input, options) => {
      guardServerOnly("creditPoints");
      return http.request<CreditWalletResponse>({
        body: input,
        idempotencyKey: options?.idempotencyKey ?? generateIdempotencyKey(),
        method: "POST",
        path: "/v1/wallet/credit",
      });
    },
    deleteOfferPrice: (id) => {
      guardServerOnly("deleteOfferPrice");
      return http.request<Offer>({
        method: "DELETE",
        path: `/v1/offers/${encodeURIComponent(id)}/price`,
      });
    },
    deleteWebhook: (id) => {
      guardServerOnly("deleteWebhook");
      return http.request<DeleteWebhookResponse>({
        method: "DELETE",
        path: `/v1/webhooks/${encodeURIComponent(id)}`,
      });
    },
    eligibility: (params) =>
      http.request<MemberEligibility>({
        method: "GET",
        path: "/v1/eligibility",
        query: { externalUserID: params?.externalUserID },
      }),
    exchangeToken: (input, options) => {
      guardServerOnly("exchangeToken");
      return http.request<TokenGrant>({
        body: input,
        idempotencyKey: options?.idempotencyKey ?? generateIdempotencyKey(),
        method: "POST",
        path: "/v1/auth/exchange",
      });
    },
    getAnalyticsLift: (params) => {
      guardServerOnly("getAnalyticsLift");
      return http.request<GetAnalyticsLiftResponse>({
        method: "GET",
        path: "/v1/analytics/lift",
        query: { from: params.from, to: params.to },
      });
    },
    getAnalyticsSegments: (params) => {
      guardServerOnly("getAnalyticsSegments");
      return http.request<GetAnalyticsSegmentsResponse>({
        method: "GET",
        path: "/v1/analytics/segments",
        query: {
          from: params.from,
          groupBy: params.groupBy.join(","),
          to: params.to,
        },
      });
    },
    getInterest: (id) =>
      http.request<CreateInterestResponse>({
        method: "GET",
        path: `/v1/interests/${encodeURIComponent(id)}`,
      }),
    getMember: (externalUserID) => {
      guardServerOnly("getMember");
      return http.request<MemberSummary>({
        method: "GET",
        path: `/v1/members/${encodeURIComponent(externalUserID)}`,
      });
    },
    getOffer: (id) =>
      http.request<Offer>({
        method: "GET",
        path: `/v1/offers/${encodeURIComponent(id)}`,
      }),
    getRedemption: (id) =>
      http.request<Redemption>({
        method: "GET",
        path: `/v1/redemptions/${encodeURIComponent(id)}`,
      }),
    getSignalHistory: (externalUserID, params) => {
      guardServerOnly("getSignalHistory");
      return http.request<ListMemberSignalHistoryResponse>({
        method: "GET",
        path: `/v1/members/${encodeURIComponent(externalUserID)}/signals/history`,
        query: {
          cursor: params?.cursor,
          from: params?.from,
          limit: params?.limit,
          to: params?.to,
        },
      });
    },
    getTerms: (params) =>
      http.request<GetTermsResponse>({
        method: "GET",
        path: "/v1/terms",
        query: { externalUserID: params?.externalUserID },
      }),
    getTermsContent: (version) =>
      http.request<GetTermsContentResponse>({
        method: "GET",
        path: `/v1/terms/${encodeURIComponent(version)}/content`,
      }),
    importMembers: (input, params) => {
      guardServerOnly("importMembers");
      return http.request<MemberImportReport>({
        body: input,
        idempotencyKey: params?.idempotencyKey ?? generateIdempotencyKey(),
        method: "POST",
        path: "/v1/members/batch",
        query: { dryRun: params?.dryRun === true ? "true" : undefined },
      });
    },
    listConversations: (params) =>
      http.request<ListConversationsResponse>({
        method: "GET",
        path: "/v1/conversations",
        query: { externalUserID: params?.externalUserID },
      }),
    listMembers: (params) => {
      guardServerOnly("listMembers");
      return http.request<ListMembersResponse>({
        method: "GET",
        path: "/v1/members",
        query: {
          activityBand: params?.activityBand,
          cursor: params?.cursor,
          limit: params?.limit,
          tier: params?.tier,
          valueBand: params?.valueBand,
          vipStatus: params?.vipStatus,
        },
      });
    },
    listMessages: (id, params) =>
      http.request<ListMessagesResponse>({
        method: "GET",
        path: `/v1/conversations/${encodeURIComponent(id)}/messages`,
        query: {
          cursor: params?.cursor,
          externalUserID: params?.externalUserID,
          limit: params?.limit,
        },
      }),
    listOffers: (params) =>
      http.request<OfferList>({
        method: "GET",
        path: "/v1/offers",
        query: {
          cursor: params?.cursor,
          limit: params?.limit,
          available:
            params?.available === undefined
              ? undefined
              : String(params.available),
        },
      }),
    listRedemptions: (params) =>
      http.request<ListRedemptionsResponse>({
        method: "GET",
        path: "/v1/redemptions",
        query: {
          cursor: params?.cursor,
          externalUserID: params?.externalUserID,
          limit: params?.limit,
          status: params?.status,
        },
      }),
    listWebhooks: () => {
      guardServerOnly("listWebhooks");
      return http.request<WebhookEndpointList>({
        method: "GET",
        path: "/v1/webhooks",
      });
    },
    removeMember: (externalUserID, params) => {
      guardServerOnly("removeMember");
      return http.request<RemoveMemberResponse>({
        method: "DELETE",
        path: `/v1/members/${encodeURIComponent(externalUserID)}`,
        query: {
          retainBalance:
            params?.retainBalance === undefined
              ? undefined
              : String(params.retainBalance),
        },
      });
    },
    sendMessage: (id, message, options) =>
      http.request<SendMessageResponse>({
        body: { message },
        idempotencyKey: options?.idempotencyKey ?? generateIdempotencyKey(),
        method: "POST",
        path: `/v1/conversations/${encodeURIComponent(id)}/messages`,
      }),
    setInterestIntake: (id, input) =>
      http.request<CreateInterestResponse>({
        body: input,
        method: "PUT",
        path: `/v1/interests/${encodeURIComponent(id)}/intake`,
      }),
    setMember: (externalUserID, input) => {
      guardServerOnly("setMember");
      return http.request<SetMemberResponse>({
        body: input,
        method: "PUT",
        path: `/v1/members/${encodeURIComponent(externalUserID)}`,
      });
    },
    setOfferPrice: (id, input) => {
      guardServerOnly("setOfferPrice");
      return http.request<Offer>({
        body: input,
        method: "PUT",
        path: `/v1/offers/${encodeURIComponent(id)}/price`,
      });
    },
    setRedemptionFeedback: (id, input) =>
      http.request<Redemption>({
        body: input,
        method: "PUT",
        path: `/v1/redemptions/${encodeURIComponent(id)}/feedback`,
      }),
    startPhoneVerification: (id) =>
      http.request<StartPhoneVerificationResponse>({
        method: "POST",
        path: `/v1/interests/${encodeURIComponent(id)}/phone/verification`,
      }),
    streamMessages: (id) =>
      streamSse({
        baseUrl,
        fetchImpl: config.fetch,
        path: `/v1/conversations/${encodeURIComponent(id)}/stream`,
        session,
        userAgent,
      }),
    updateConfiguration: (input) => {
      guardServerOnly("updateConfiguration");
      return http.request<UpdateConfigurationResponse>({
        body: input,
        method: "PUT",
        path: "/v1/configuration",
      });
    },
    walletTransactions: (params) =>
      http.request<ListTransactionsResponse>({
        method: "GET",
        path: "/v1/wallet/transactions",
        query: {
          cursor: params?.cursor,
          externalUserID: params?.externalUserID,
          limit: params?.limit,
        },
      }),
  };
}
