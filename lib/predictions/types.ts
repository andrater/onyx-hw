// Provider-agnostic contract for a predictions-market data source.
//
// The app is written entirely against this interface. `onyx-client.ts` talks
// to the real Onyx dev API; `mock-client.ts` serves fixture markets with
// randomly ticking prices for local dev while the (flaky) upstream is down.
// Select with PREDICTIONS_API=mock | onyx (default onyx).

// Shapes mirror the upstream Onyx API JSON so the real client is a passthrough.
export type Market = {
  id: string;
  symbol: string;
  sport: string;
  name: string | null;
  event_name: string | null;
  status: string;
  expiry_date: string | null;
  min_price: number;
  max_price: number;
  yes_price: number | null;
};

export type PriceQuote = {
  symbol: string;
  last_price: number | null;
  bid_price: number | null;
  ask_price: number | null;
  updated_at: string | null;
};

export type MarketsResult = {
  markets: Market[];
  // true when the source couldn't reach live data and returned a cached
  // snapshot instead; ageMs is that snapshot's age.
  stale: boolean;
  ageMs: number;
};

export interface PredictionsApiClient {
  getMarkets(): Promise<MarketsResult>;
  getPrices(symbols: string[]): Promise<Record<string, PriceQuote>>;
}
