import type { Market, PredictionsApiClient, PriceQuote } from "./types";

// Real client for the upstream Onyx Predictions API. All endpoints used are
// public.
//
// Upstream quirks discovered while building:
//  - GET /markets/{symbol} and POST /markets/batch hang indefinitely → unusable.
//  - The whole API intermittently times out, so every call has a hard timeout,
//    list pages degrade partially (allSettled), and we keep a last-known-good
//    snapshot (in memory + Postgres) to serve through outages.
const BASE = "https://predictions.dev-onyxodds.com";
const FETCH_TIMEOUT_MS = 8000;
const PAGE = 1000;
const MAX_PAGES = 3;
// Persist the snapshot to Postgres at most this often.
const SNAPSHOT_WRITE_INTERVAL_MS = 60_000;

// Last-known-good snapshot, per serverless instance / dev process. Backed by
// a single-row Postgres table so it survives restarts and cold starts.
let lastGood: { at: number; markets: Market[] } | null = null;
let lastSnapshotWrite = 0;

async function persistSnapshot(markets: Market[], at: number) {
  if (at - lastSnapshotWrite < SNAPSHOT_WRITE_INTERVAL_MS) return;
  lastSnapshotWrite = at;
  const { db } = await import("../db");
  const { marketSnapshots } = await import("../schema");
  await db
    .insert(marketSnapshots)
    .values({ id: 1, markets, fetchedAt: new Date(at) })
    .onConflictDoUpdate({
      target: marketSnapshots.id,
      set: { markets, fetchedAt: new Date(at) },
    });
}

async function loadSnapshotFromDb(): Promise<{ at: number; markets: Market[] } | null> {
  const { db } = await import("../db");
  const { marketSnapshots } = await import("../schema");
  const [row] = await db.select().from(marketSnapshots).limit(1);
  return row ? { at: row.fetchedAt.getTime(), markets: row.markets } : null;
}

export const onyxClient: PredictionsApiClient = {
  // All open markets (paginated upstream, pages fetched in parallel). Cached
  // 3s per page URL so many polling clients don't hammer upstream.
  async getMarkets() {
    const results = await Promise.allSettled(
      Array.from({ length: MAX_PAGES }, (_, i) =>
        fetch(`${BASE}/markets?status=open&limit=${PAGE}&offset=${i * PAGE}`, {
          next: { revalidate: 3 },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }).then((res) => {
          if (!res.ok) throw new Error(`Upstream /markets failed: ${res.status}`);
          return res.json() as Promise<Market[]>;
        })
      )
    );
    const markets = results
      .filter((r): r is PromiseFulfilledResult<Market[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
    if (markets.length > 0) {
      const at = Date.now();
      lastGood = { at, markets };
      persistSnapshot(markets, at).catch(() => {}); // best-effort, off hot path
      return { markets, stale: false, ageMs: 0 };
    }
    if (!lastGood) {
      lastGood = await loadSnapshotFromDb().catch(() => null);
    }
    if (lastGood) {
      return { markets: lastGood.markets, stale: true, ageMs: Date.now() - lastGood.at };
    }
    throw new Error("Upstream markets API unavailable and no cached snapshot yet");
  },

  // Fresh prices (uncached).
  async getPrices(symbols: string[]): Promise<Record<string, PriceQuote>> {
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
  },
};
