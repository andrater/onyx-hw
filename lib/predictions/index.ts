import { mockClient } from "./mock-client";
import { onyxClient } from "./onyx-client";
import type { Market, PredictionsApiClient } from "./types";

export type { Market, MarketsResult, PredictionsApiClient, PriceQuote } from "./types";

// Max age of a cached markets list we're willing to fill an order against
// when a fresh price fetch fails.
const MAX_FILL_STALENESS_MS = 30_000;

export const predictions: PredictionsApiClient =
  process.env.PREDICTIONS_API === "mock" ? mockClient : onyxClient;

// Market metadata + freshest available yes price, for order fills.
// yesPrice is null when we can't price the fill safely (no fresh price and
// the cached list is too old).
export async function getMarketWithLivePrice(
  symbol: string
): Promise<{ market: Market; yesPrice: number | null } | null> {
  const [listResult, pricesResult] = await Promise.allSettled([
    predictions.getMarkets(),
    predictions.getPrices([symbol]),
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
