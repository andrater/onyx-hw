// Client for the upstream Onyx Predictions API. All endpoints used are public.
//
// Upstream quirks discovered while building:
//  - GET /markets/{symbol} and POST /markets/batch hang indefinitely → unusable.
//  - The whole API intermittently times out, so every call has a hard timeout,
//    list pages degrade partially (allSettled), and we keep a last-known-good
//    snapshot in memory to serve through outages.
const BASE = "https://predictions.dev-onyxodds.com";
const FETCH_TIMEOUT_MS = 8000;
// Max age of the cached list we're willing to fill an order against when a
// fresh price fetch fails.
const MAX_FILL_STALENESS_MS = 30_000;

export type OnyxMarket = {
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

export type OnyxPrice = {
  symbol: string;
  last_price: number | null;
  bid_price: number | null;
  ask_price: number | null;
  updated_at: string | null;
};

const PAGE = 1000;
const MAX_PAGES = 3;

// Last-known-good snapshot, per serverless instance / dev process.
let lastGood: { at: number; markets: OnyxMarket[] } | null = null;

// Fetch all open markets (paginated upstream, pages fetched in parallel).
// Cached 3s per page URL so many polling clients don't hammer upstream.
// Returns { markets, stale } — stale=true means upstream failed and this is
// the last-known-good snapshot.
export async function fetchAllMarkets(): Promise<{
  markets: OnyxMarket[];
  stale: boolean;
  ageMs: number;
}> {
  const results = await Promise.allSettled(
    Array.from({ length: MAX_PAGES }, (_, i) =>
      fetch(`${BASE}/markets?status=open&limit=${PAGE}&offset=${i * PAGE}`, {
        next: { revalidate: 3 },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).then((res) => {
        if (!res.ok) throw new Error(`Upstream /markets failed: ${res.status}`);
        return res.json() as Promise<OnyxMarket[]>;
      })
    )
  );
  const markets = results
    .filter((r): r is PromiseFulfilledResult<OnyxMarket[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
  if (markets.length > 0) {
    lastGood = { at: Date.now(), markets };
    return { markets, stale: false, ageMs: 0 };
  }
  if (lastGood) {
    return { markets: lastGood.markets, stale: true, ageMs: Date.now() - lastGood.at };
  }
  throw new Error("Upstream markets API unavailable and no cached snapshot yet");
}

// Fresh prices for a set of symbols (uncached).
export async function fetchPricesBatch(
  symbols: string[]
): Promise<Record<string, OnyxPrice>> {
  if (symbols.length === 0) return {};
  const res = await fetch(`${BASE}/prices/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbols }),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Upstream /prices/batch failed: ${res.status}`);
  return res.json();
}

// Market metadata + freshest available yes price, for order fills.
// yesPrice is null when we can't price the fill safely (no fresh price and
// the cached list is too old).
export async function getMarketWithLivePrice(
  symbol: string
): Promise<{ market: OnyxMarket; yesPrice: number | null } | null> {
  const [listResult, pricesResult] = await Promise.allSettled([
    fetchAllMarkets(),
    fetchPricesBatch([symbol]),
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
