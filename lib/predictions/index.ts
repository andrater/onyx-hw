import { cookies } from "next/headers";
import { mockClient } from "./mock-client";
import { onyxClient } from "./onyx-client";
import type { Market, PredictionsApiClient } from "./types";

export type { Market, MarketsResult, PredictionsApiClient, PriceQuote } from "./types";

export type DataSource = "onyx" | "mock";

// Max age of a cached markets list we're willing to fill an order against
// when a fresh price fetch fails.
const MAX_FILL_STALENESS_MS = 30_000;

// Data source is selected per-request: the `data_source` cookie (set by the
// UI toggle) wins, falling back to the PREDICTIONS_API env var, then the real
// API. Orders placed in mock mode fill at the mock's current ticked price.
export async function getPredictions(): Promise<{
  client: PredictionsApiClient;
  source: DataSource;
}> {
  const store = await cookies();
  const source =
    store.get("data_source")?.value ?? process.env.PREDICTIONS_API ?? "onyx";
  return source === "mock"
    ? { client: mockClient, source: "mock" }
    : { client: onyxClient, source: "onyx" };
}

// Market metadata + freshest available yes price, for order fills.
// yesPrice is null when we can't price the fill safely (no fresh price and
// the cached list is too old).
export async function getMarketWithLivePrice(
  symbol: string
): Promise<{ market: Market; yesPrice: number | null } | null> {
  const { client } = await getPredictions();
  const [listResult, pricesResult] = await Promise.allSettled([
    client.getMarkets(),
    client.getPrices([symbol]),
  ]);
  if (listResult.status === "rejected") return null;
  const { markets, stale, ageMs } = listResult.value;
  const market = markets.find((m) => m.symbol === symbol);
  if (!market) return null;

  const freshPrice =
    pricesResult.status === "fulfilled" ? pricesResult.value[symbol]?.last_price : null;
  if (freshPrice != null) return { market, yesPrice: freshPrice };
  // No fresh price: fall back to the list price only if it's recent enough.
  if (!stale || ageMs <= MAX_FILL_STALENESS_MS) {
    return { market, yesPrice: market.yes_price };
  }
  return { market, yesPrice: null };
}
