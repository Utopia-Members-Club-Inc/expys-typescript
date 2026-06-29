import type { components } from "./generated/schema";

/**
 * A conversation between a member and the org (e.g. a support thread).
 *
 * @example
 * ```ts
 * const { conversations } = await expys.listConversations();
 * const conversation: Conversation = conversations[0];
 * // conversation.id, conversation.title, conversation.lastMessageAt
 * ```
 */
export type Conversation = Schemas["Conversation"];

/**
 * The body for {@link ExpysClient.createRedemption}: the `offer` to book and,
 * optionally, the `externalUserID` a machine token acts for.
 *
 * @example
 * ```ts
 * const input: CreateRedemptionRequest = { offer: "off_123" };
 * ```
 */
export type CreateRedemptionRequest = Schemas["CreateRedemptionRequest"];

/**
 * The body for {@link ExpysClient.createWebhook}: the subscribed `events` and the
 * delivery `url`. Server-only.
 *
 * @example
 * ```ts
 * const body: CreateWebhookRequest = {
 *   events: ["redemption.created"],
 *   url: "https://example.com/webhooks",
 * };
 * ```
 */
export type CreateWebhookRequest = Schemas["CreateWebhookRequest"];

/**
 * The body for {@link ExpysClient.creditPoints}: the integer `amount` to credit,
 * the `externalUserID` to credit, and an optional `reason`. Server-only.
 *
 * @example
 * ```ts
 * const body: CreditWalletRequest = { amount: 100, externalUserID: "user_42" };
 * ```
 */
export type CreditWalletRequest = Schemas["CreditWalletRequest"];

/**
 * The result of {@link ExpysClient.creditPoints}: the member's new `balance` and
 * the {@link Currency} it is denominated in.
 *
 * @example
 * ```ts
 * const { balance }: CreditWalletResponse = await expys.creditPoints({
 *   amount: 100,
 *   externalUserID: "user_42",
 * });
 * ```
 */
export type CreditWalletResponse = Schemas["CreditWalletResponse"];

/**
 * A currency descriptor: human `name` and display `symbol`.
 *
 * @example
 * ```ts
 * const currency: Currency = { name: "Points", symbol: "pts" };
 * ```
 */
export type Currency = Schemas["Currency"];

/**
 * The result of {@link ExpysClient.deleteWebhook}: the deleted webhook `id` and
 * `ok: true` when removed.
 *
 * @example
 * ```ts
 * const { ok }: DeleteWebhookResponse = await expys.deleteWebhook("wh_123");
 * ```
 */
export type DeleteWebhookResponse = Schemas["DeleteWebhookResponse"];

/**
 * The result of {@link ExpysClient.analyticsOffers}: per-offer analytics rollups.
 * Server-only.
 *
 * @example
 * ```ts
 * const { offers }: GetAnalyticsOffersResponse = await expys.analyticsOffers();
 * ```
 */
export type GetAnalyticsOffersResponse = Schemas["GetAnalyticsOffersResponse"];

/**
 * The result of {@link ExpysClient.analyticsSummary}: org-wide rollups (members,
 * points minted/spent, completion rate, redemption status counts). Server-only.
 *
 * @example
 * ```ts
 * const summary: GetAnalyticsSummaryResponse = await expys.analyticsSummary();
 * ```
 */
export type GetAnalyticsSummaryResponse =
  Schemas["GetAnalyticsSummaryResponse"];

/**
 * The result of {@link ExpysClient.analyticsTimeseries}: time-bucketed analytics
 * over the requested window. Server-only.
 *
 * @example
 * ```ts
 * const { buckets }: GetAnalyticsTimeseriesResponse =
 *   await expys.analyticsTimeseries({
 *     from: "2026-01-01T00:00:00Z",
 *     to: "2026-02-01T00:00:00Z",
 *     interval: "day",
 *   });
 * ```
 */
export type GetAnalyticsTimeseriesResponse =
  Schemas["GetAnalyticsTimeseriesResponse"];

/**
 * The member's {@link Conversation}s. This response is not cursor-paginated, so
 * it has no `nextCursor`.
 *
 * @example
 * ```ts
 * const page: ListConversationsResponse = await expys.listConversations();
 * for (const conversation of page.conversations) {
 *   // handle conversation
 * }
 * ```
 */
export type ListConversationsResponse = Schemas["ListConversationsResponse"];

/**
 * A page of {@link Message}s plus the `nextCursor` to fetch the following page
 * (`null` when the list is exhausted).
 *
 * @example
 * ```ts
 * const page: ListMessagesResponse = await expys.listMessages("cnv_1");
 * const more = page.nextCursor !== null;
 * ```
 */
export type ListMessagesResponse = Schemas["ListMessagesResponse"];

/**
 * A page of {@link Redemption}s plus the `nextCursor` to fetch the following page
 * (`null` when the list is exhausted).
 *
 * @example
 * ```ts
 * const page: ListRedemptionsResponse = await expys.listRedemptions({ status: "OPEN" });
 * const more = page.nextCursor !== null;
 * ```
 */
export type ListRedemptionsResponse = Schemas["ListRedemptionsResponse"];

/**
 * A page of wallet {@link Transaction}s plus the `nextCursor` to fetch the
 * following page (`null` when the list is exhausted).
 *
 * @example
 * ```ts
 * const page: ListTransactionsResponse = await expys.walletTransactions();
 * const more = page.nextCursor !== null;
 * ```
 */
export type ListTransactionsResponse = Schemas["ListTransactionsResponse"];

/**
 * A member's eligibility: their `tier` and current {@link Wallet}.
 *
 * @example
 * ```ts
 * const eligibility: MemberEligibility = await expys.eligibility();
 * // eligibility.tier, eligibility.wallet.balance
 * ```
 */
export type MemberEligibility = Schemas["MemberEligibility"];

/**
 * The result of {@link ExpysClient.getMember}: the member's profile, tier,
 * {@link Wallet}, and redemption counts. Server-only.
 *
 * @example
 * ```ts
 * const member: MemberSummary = await expys.getMember("user_42");
 * // member.tier, member.wallet.balance
 * ```
 */
export type MemberSummary = Schemas["MemberSummary"];

/**
 * A message within a {@link Conversation}.
 *
 * @example
 * ```ts
 * const { messages } = await expys.listMessages("cnv_1");
 * const message: Message = messages[0];
 * // message.id, message.authorID, message.body
 * ```
 */
export type Message = Schemas["Message"];

/**
 * An offer a member can browse and redeem.
 *
 * @example
 * ```ts
 * const { data } = await expys.listOffers();
 * const offer: Offer = data[0];
 * // offer.id, offer.title, offer.description
 * ```
 */
export type Offer = Schemas["Offer"];

/**
 * A page of {@link Offer}s plus the `nextCursor` to fetch the following page
 * (`null` when the list is exhausted).
 *
 * @example
 * ```ts
 * const page: OfferList = await expys.listOffers({ limit: 50 });
 * const more = page.nextCursor !== null;
 * ```
 */
export type OfferList = Schemas["OfferList"];

/**
 * A redemption (booking request) for an offer, including its lifecycle `status`.
 *
 * @example
 * ```ts
 * const redemption: Redemption = await expys.getRedemption("rdm_123");
 * // redemption.status, redemption.offer
 * ```
 */
export type Redemption = Schemas["Redemption"];

/**
 * The result of {@link ExpysClient.removeMember}: whether the member was
 * `archived` and whether their `balanceRetained`. Server-only.
 *
 * @example
 * ```ts
 * const result: RemoveMemberResponse = await expys.removeMember("user_42");
 * // result.archived, result.balanceRetained
 * ```
 */
export type RemoveMemberResponse = Schemas["RemoveMemberResponse"];

/**
 * The result of {@link ExpysClient.sendMessage}: `ok` is `true` when the message
 * was accepted.
 *
 * @example
 * ```ts
 * const { ok }: SendMessageResponse = await expys.sendMessage("cnv_1", "Hello");
 * ```
 */
export type SendMessageResponse = Schemas["SendMessageResponse"];

/**
 * The body for {@link ExpysClient.setMember}: optional `tier`, `displayName`, and
 * `attributes` to upsert on the member. Server-only.
 *
 * @example
 * ```ts
 * const body: SetMemberRequest = { tier: "gold", displayName: "Ada" };
 * ```
 */
export type SetMemberRequest = Schemas["SetMemberRequest"];

/**
 * The result of {@link ExpysClient.setMember}: the member's `externalUserID`,
 * `tier`, `displayName`, and `attributes` after the upsert. Server-only.
 *
 * @example
 * ```ts
 * const member: SetMemberResponse = await expys.setMember("user_42", {
 *   tier: "gold",
 * });
 * ```
 */
export type SetMemberResponse = Schemas["SetMemberResponse"];

/**
 * The server-to-server body for `POST /v1/auth/exchange`, sent by the consumer's
 * backend (never the app) to mint a member token. Exported for backend typing.
 *
 * @example
 * ```ts
 * const body: TokenExchangeRequest = { externalUserID: "user_42" };
 * ```
 */
export type TokenExchangeRequest = Schemas["TokenExchangeRequest"];

/**
 * The token-exchange result: a short-lived `accessToken` and its `expiresAt`.
 * Exported for typing the consumer's backend exchange + refresh hook.
 *
 * @example
 * ```ts
 * const grant: TokenGrant = await exchangeOnBackend();
 * // grant.accessToken, grant.expiresAt
 * ```
 */
export type TokenGrant = Schemas["TokenGrant"];

/**
 * A wallet transaction (a credit or debit) in the member's points ledger.
 *
 * @example
 * ```ts
 * const { transactions } = await expys.walletTransactions();
 * const transaction: Transaction = transactions[0];
 * // transaction.amount, transaction.type, transaction.reason
 * ```
 */
export type Transaction = Schemas["Transaction"];

/**
 * A member's wallet: `balance`, `amountReceived`, `amountSpent`, and the
 * {@link Currency} they are denominated in.
 *
 * @example
 * ```ts
 * const wallet: Wallet = await expys.wallet();
 * // wallet.balance, wallet.currency.symbol
 * ```
 */
export type Wallet = Schemas["Wallet"];

/**
 * A registered webhook endpoint: its `id`, delivery `url`, subscribed `events`,
 * and `environment`. Returned (without the signing secret) by
 * {@link ExpysClient.listWebhooks}. Server-only.
 *
 * @example
 * ```ts
 * const { data } = await expys.listWebhooks();
 * const webhook: WebhookEndpoint = data[0];
 * ```
 */
export type WebhookEndpoint = Schemas["WebhookEndpoint"];

/**
 * The result of {@link ExpysClient.listWebhooks}: the org's webhook endpoints.
 * Server-only.
 *
 * @example
 * ```ts
 * const list: WebhookEndpointList = await expys.listWebhooks();
 * for (const webhook of list.data) {
 *   // handle webhook
 * }
 * ```
 */
export type WebhookEndpointList = Schemas["WebhookEndpointList"];

/**
 * The result of {@link ExpysClient.createWebhook}: a {@link WebhookEndpoint} plus
 * the one-time `signingSecret` (shown only on creation). Server-only.
 *
 * @example
 * ```ts
 * const webhook: WebhookEndpointWithSecret = await expys.createWebhook({
 *   events: ["redemption.created"],
 *   url: "https://example.com/webhooks",
 * });
 * // store webhook.signingSecret now; it is never returned again
 * ```
 */
export type WebhookEndpointWithSecret = Schemas["WebhookEndpointWithSecret"];

// Clean public aliases over the generated schema. The wire shapes are generated
// from packages/api-spec/v1.sdk.json; the aliases above are the SDK's public
// type surface. Field-level docs live in the OpenAPI spec.
type Schemas = components["schemas"];
