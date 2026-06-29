/**
 * The official Expys data SDK for TypeScript. Call {@link initialize} to create
 * an {@link ExpysClient}, then browse offers, redeem them, check eligibility, and
 * read the wallet. Fetch-only, with zero runtime dependencies.
 *
 * @packageDocumentation
 */

// Public API surface of @expys/sdk. Intentionally small: only the entry point,
// the typed config + models, the error classes a consumer branches on, the
// idempotency-key helper, and the version constants. Session, transport, retry,
// and error-mapping internals are NOT exported - see public.surface.test.ts,
// which pins this surface so it cannot grow by accident.
export type {
  // Types a consumer needs to annotate their refresh hook / token expiry.
  Timestamp,
  TokenRefreshResult,
} from "./auth.session";
export {
  type AnalyticsTimeseriesParams,
  type EligibilityParams,
  type ExpysClient,
  initialize,
  type ListConversationsParams,
  type ListMessagesParams,
  type ListOffersParams,
  type ListRedemptionsParams,
  type RemoveMemberParams,
  type WalletTransactionsParams,
  type WriteOptions,
} from "./client";
export { type Environment, type ExpysConfig } from "./config";
export {
  ApiError,
  ConflictError,
  ExpysError,
  ForbiddenError,
  NetworkError,
  NotConfiguredError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
export { generateIdempotencyKey } from "./idempotency";
export type {
  Conversation,
  CreateRedemptionRequest,
  CreateWebhookRequest,
  CreditWalletRequest,
  CreditWalletResponse,
  Currency,
  DeleteWebhookResponse,
  GetAnalyticsOffersResponse,
  GetAnalyticsSummaryResponse,
  GetAnalyticsTimeseriesResponse,
  ListConversationsResponse,
  ListMessagesResponse,
  ListRedemptionsResponse,
  ListTransactionsResponse,
  MemberEligibility,
  MemberSummary,
  Message,
  Offer,
  OfferList,
  Redemption,
  RemoveMemberResponse,
  SendMessageResponse,
  SetMemberRequest,
  SetMemberResponse,
  TokenExchangeRequest,
  TokenGrant,
  Transaction,
  Wallet,
  WebhookEndpoint,
  WebhookEndpointList,
  WebhookEndpointWithSecret,
} from "./types";
export { SDK_VERSION, SPEC_VERSION, USER_AGENT } from "./version";
