import { describe, expect, it } from "bun:test";

import type { Offer, UpdateConfigurationResponse } from "../types";

import { initialize } from "../client";
import {
  ApiError,
  ForbiddenError,
  NotConfiguredError,
  NotFoundError,
  ValidationError,
} from "../errors";

interface RecordedCall {
  init: RequestInit;
  url: string;
}

// Server-mode methods require a machine (Org-API-Key) credential.
const MACHINE_TOKEN = "expys_live_t0";
const MEMBER_TOKEN = "v4.local.xxx";

const OFFER: Offer = {
  addOns: [],
  availability: { isAvailable: true, quantityRemaining: 4 },
  description: "Two courtside seats.",
  disclaimer: null,
  endAt: null,
  exclusions: [],
  expiresAt: null,
  id: "off 1",
  images: [],
  inclusions: [],
  kind: "EXPERIENCE",
  location: null,
  maxGuests: 2,
  pointsPrice: 3950,
  shortDescription: "Courtside",
  startAt: null,
  title: "Courtside",
  type: "SPORTS",
  valueUSD: null,
  display: {
    amount: 39.5,
    currency: { name: "Credits", symbol: "C", unitsPerUSD: 1 },
    source: "AUTHORED",
  },
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

const errorBody = (code: string) => ({ error: { code, message: "nope" } });

const headerOf = (init: RequestInit, name: string): string | undefined =>
  (init.headers as Record<string, string>)[name];

const clientWith = (
  response: Response,
  token: string = MACHINE_TOKEN,
): { calls: RecordedCall[]; client: ReturnType<typeof initialize> } => {
  const calls: RecordedCall[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ init, url });
    return Promise.resolve(response);
  };
  const client = initialize({
    baseUrl: "https://api.test",
    fetch: fetchImpl as unknown as typeof fetch,
    token,
  });
  return { calls, client };
};

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
};

describe("offers::listOffers available filter", () => {
  it("sends available=true when asked for only bookable offers", async () => {
    const { calls, client } = clientWith(
      jsonResponse({ data: [], nextCursor: null }),
    );

    await client.listOffers({ available: true, limit: 5 });

    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v1/offers");
    expect(url.searchParams.get("available")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("sends available=false rather than dropping it", async () => {
    const { calls, client } = clientWith(
      jsonResponse({ data: [], nextCursor: null }),
    );

    await client.listOffers({ available: false });

    expect(calls[0].url).toBe("https://api.test/v1/offers?available=false");
  });
});

describe("offers::getOffer", () => {
  it("GETs the path-encoded offer with a member token and decodes it", async () => {
    const { calls, client } = clientWith(jsonResponse(OFFER), MEMBER_TOKEN);

    const offer = await client.getOffer("off 1");

    expect(offer).toEqual(OFFER);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toBe("https://api.test/v1/offers/off%201");
    expect(calls[0].init.body).toBeUndefined();
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeUndefined();
  });

  it("surfaces a 404 as NotFoundError", async () => {
    const { client } = clientWith(jsonResponse(errorBody("NOT_FOUND"), 404));

    const error = await rejectionOf(client.getOffer("off_gone"));

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).status).toBe(404);
  });
});

describe("offers::setOfferPrice", () => {
  it("PUTs the amount to the price route without an idempotency key", async () => {
    const { calls, client } = clientWith(jsonResponse(OFFER));

    const offer = await client.setOfferPrice("off 1", { amount: 39.5 });

    expect(offer.display?.source).toBe("AUTHORED");
    expect(offer.display?.amount).toBe(39.5);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.test/v1/offers/off%201/price");
    expect(calls[0].init.body).toBe(JSON.stringify({ amount: 39.5 }));
    expect(headerOf(calls[0].init, "Content-Type")).toBe("application/json");
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeUndefined();
  });

  it("surfaces a 422 as ValidationError", async () => {
    const { client } = clientWith(jsonResponse(errorBody("VALIDATION"), 422));

    const error = await rejectionOf(
      client.setOfferPrice("off_1", { amount: -1 }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe("VALIDATION");
  });
});

describe("offers::deleteOfferPrice", () => {
  it("DELETEs the price route without a body or idempotency key", async () => {
    const derived: Offer = {
      ...OFFER,
      display: {
        amount: 40,
        currency: { name: "Credits", symbol: "C", unitsPerUSD: 1 },
        source: "DERIVED",
      },
    };
    const { calls, client } = clientWith(jsonResponse(derived));

    const offer = await client.deleteOfferPrice("off 1");

    expect(offer.display?.source).toBe("DERIVED");
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].url).toBe("https://api.test/v1/offers/off%201/price");
    expect(calls[0].init.body).toBeUndefined();
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeUndefined();
  });

  it("surfaces a 403 (key without config:write) as ForbiddenError", async () => {
    const { client } = clientWith(jsonResponse(errorBody("FORBIDDEN"), 403));

    const error = await rejectionOf(client.deleteOfferPrice("off_1"));

    expect(error).toBeInstanceOf(ForbiddenError);
  });
});

describe("configuration::updateConfiguration", () => {
  it("PUTs the configuration and decodes the confirmed currency", async () => {
    const confirmed: UpdateConfigurationResponse = {
      currencyName: "Credits",
      currencySymbol: "C",
      currencyUnitsPerUSD: 1,
    };
    const { calls, client } = clientWith(jsonResponse(confirmed));

    const result = await client.updateConfiguration({
      confirmReprice: true,
      currencyName: "Credits",
      currencySymbol: "C",
      currencyUnitsPerUSD: 1,
    });

    expect(result).toEqual(confirmed);
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].url).toBe("https://api.test/v1/configuration");
    expect(calls[0].init.body).toBe(
      JSON.stringify({
        confirmReprice: true,
        currencyName: "Credits",
        currencySymbol: "C",
        currencyUnitsPerUSD: 1,
      }),
    );
    expect(headerOf(calls[0].init, "Idempotency-Key")).toBeUndefined();
  });

  it("surfaces a 400 FIELD_NOT_WRITABLE as an ApiError with its code", async () => {
    const { client } = clientWith(
      jsonResponse(errorBody("FIELD_NOT_WRITABLE"), 400),
    );

    const error = await rejectionOf(
      client.updateConfiguration({ currencyName: "Credits" }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).code).toBe("FIELD_NOT_WRITABLE");
  });
});

describe("offers::credential guard", () => {
  it("rejects the machine-only price and configuration writes before any request", () => {
    const { calls, client } = clientWith(jsonResponse(OFFER), MEMBER_TOKEN);

    const serverCalls: Array<() => Promise<unknown>> = [
      () => client.setOfferPrice("off_1", { amount: 1 }),
      () => client.deleteOfferPrice("off_1"),
      () => client.updateConfiguration({ currencyName: "Credits" }),
    ];

    for (const invoke of serverCalls) {
      expect(invoke).toThrow(NotConfiguredError);
    }
    expect(calls.length).toBe(0);
  });
});
