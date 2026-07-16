// Client for the upstream Onyx Predictions API. All endpoints used are public.
//
// NOTE: upstream GET /markets/{symbol} and POST /markets/batch hang
// indefinitely on the dev API, so we price fills and portfolios via
// POST /prices/batch (works, ~1s) and use the paginated GET /markets
// list for metadata/status.
const BASE = "https://predictions.dev-onyxodds.com";

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

// Fetch all open markets (paginated upstream, pages fetched in parallel).
// Cached 3s per page URL so many polling clients don't hammer upstream.
export async function fetchAllMarkets(): Promise<OnyxMarket[]> {
  const pages = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, i) =>
      fetch(`${BASE}/markets?status=open&limit=${PAGE}&offset=${i * PAGE}`, {
        next: { revalidate: 3 },
      }).then((res) => {
        if (!res.ok) throw new Error(`Upstream /markets failed: ${res.status}`);
        return res.json() as Promise<OnyxMarket[]>;
      })
    )
  );
  return pages.flat();
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
  });
  if (!res.ok) throw new Error(`Upstream /prices/batch failed: ${res.status}`);
  return res.json();
}

// Market metadata (from the ≤3s-stale list) + freshest available yes price.
export async function getMarketWithLivePrice(
  symbol: string
): Promise<{ market: OnyxMarket; yesPrice: number | null } | null> {
  const [markets, prices] = await Promise.all([
    fetchAllMarkets(),
    fetchPricesBatch([symbol]).catch(() => ({}) as Record<string, OnyxPrice>),
  ]);
  const market = markets.find((m) => m.symbol === symbol);
  if (!market) return null;
  const yesPrice = prices[symbol]?.last_price ?? market.yes_price;
  return { market, yesPrice };
}
