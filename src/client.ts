import type {
  CreateRedemptionRequest,
  CreateWebhookRequest,
  CreditWalletRequest,
  CreditWalletResponse,
  DeleteWebhookResponse,
  GetAnalyticsOffersResponse,
  GetAnalyticsSummaryResponse,
  GetAnalyticsTimeseriesResponse,
  GetBalanceResponse,
  ListConversationsResponse,
  ListMembersResponse,
  ListMessagesResponse,
  ListRedemptionsResponse,
  ListTransactionsResponse,
  MemberEligibility,
  MemberSummary,
  Message,
  OfferList,
  Redemption,
  RemoveMemberResponse,
  SendMessageResponse,
  SetMemberRequest,
  SetMemberResponse,
  TokenExchangeRequest,
  TokenGrant,
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
   * @param params - Optional `limit` and pagination `cursor`.
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
  /** Pagination cursor from a previous response's `nextCursor`. */
  cursor?: string;
  /** Maximum number of members to return (1-100). */
  limit?: number;
  /** Return only members whose effective tier matches this value exactly. */
  tier?: string;
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
    getMember: (externalUserID) => {
      guardServerOnly("getMember");
      return http.request<MemberSummary>({
        method: "GET",
        path: `/v1/members/${encodeURIComponent(externalUserID)}`,
      });
    },
    getRedemption: (id) =>
      http.request<Redemption>({
        method: "GET",
        path: `/v1/redemptions/${encodeURIComponent(id)}`,
      }),
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
          cursor: params?.cursor,
          limit: params?.limit,
          tier: params?.tier,
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
        query: { cursor: params?.cursor, limit: params?.limit },
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
    setMember: (externalUserID, input) => {
      guardServerOnly("setMember");
      return http.request<SetMemberResponse>({
        body: input,
        method: "PUT",
        path: `/v1/members/${encodeURIComponent(externalUserID)}`,
      });
    },
    streamMessages: (id) =>
      streamSse({
        baseUrl,
        fetchImpl: config.fetch,
        path: `/v1/conversations/${encodeURIComponent(id)}/stream`,
        session,
        userAgent,
      }),
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
