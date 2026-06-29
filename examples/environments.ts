/**
 * Environments: sandbox vs live. The environment is enforced server-side by the
 * token claim - the SDK does not route by it, it only surfaces it in the
 * User-Agent. Point at sandbox by exchanging a sandbox Org-API-Key on your
 * backend. Zero UI.
 *
 * Run: EXPYS_ENV=sandbox EXPYS_MEMBER_TOKEN=... bun examples/environments.ts
 */
/* eslint-disable no-console -- runnable sample prints flow output */
import { type Environment, initialize } from "../src/index";

const token = process.env.EXPYS_MEMBER_TOKEN;
if (!token) {
  throw new Error(
    "Set EXPYS_MEMBER_TOKEN (a member token from your backend's /v1/auth/exchange)",
  );
}

// Default to sandbox for safe experimentation; pass EXPYS_ENV=live to go live.
const environment: Environment =
  process.env.EXPYS_ENV === "live" ? "live" : "sandbox";

const expys = initialize({
  baseUrl: process.env.EXPYS_BASE_URL,
  environment,
  // orgId is optional and only surfaces in the User-Agent for attribution.
  orgId: process.env.EXPYS_ORG_ID,
  token,
  // Identify your app in the User-Agent alongside the SDK and environment.
  userAgentSuffix: "examples/environments",
});

async function main(): Promise<void> {
  console.log(`using the ${environment} environment`);
  const { data } = await expys.listOffers({ limit: 5 });
  console.log(`fetched ${data.length} offers`);
}

void main();
