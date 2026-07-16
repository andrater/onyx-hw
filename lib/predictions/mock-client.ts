import type { Market, PredictionsApiClient, PriceQuote } from "./types";
import snapshot from "@/data/markets-snapshot.json";

// Mock client backed by a real 1000-market capture from the Onyx dev API
// (data/markets-snapshot.json, fetched 2026-07-16). The ~146 markets that had
// live prices random-walk ±2¢ every TICK_MS so polling, fills, and P&L are
// all exercisable with zero upstream dependency. Ticking is lazy (advanced on
// read) so it works in serverless environments with no long-lived timers.
//
// Note: prices live in module memory, so on serverless each instance walks
// its own path — fine for a paper-trading mock.
const TICK_MS = 3000;

const MARKETS = snapshot as Market[];
const prices = new Map(
  MARKETS.filter((m) => m.yes_price != null).map((m) => [m.symbol, m.yes_price!])
);
let lastTick = Date.now();

function tick() {
  const now = Date.now();
  const steps = Math.floor((now - lastTick) / TICK_MS);
  if (steps === 0) return;
  lastTick += steps * TICK_MS;
  for (const [symbol, price] of prices) {
    let p = price;
    for (let i = 0; i < Math.min(steps, 20); i++) {
      p += (Math.floor(Math.random() * 5) - 2) / 100; // ±2¢
    }
    prices.set(symbol, Math.min(0.98, Math.max(0.02, Math.round(p * 100) / 100)));
  }
}

export const mockClient: PredictionsApiClient = {
  async getMarkets() {
    tick();
    return {
      markets: MARKETS.map((m) =>
        m.yes_price == null ? m : { ...m, yes_price: prices.get(m.symbol)! }
      ),
      stale: false,
      ageMs: 0,
    };
  },

  async getPrices(symbols: string[]) {
    tick();
    const out: Record<string, PriceQuote> = {};
    for (const symbol of symbols) {
      const p = prices.get(symbol);
      if (p == null) continue;
      out[symbol] = {
        symbol,
        last_price: p,
        bid_price: Math.max(0.01, p - 0.01),
        ask_price: Math.min(0.99, p + 0.01),
        updated_at: new Date().toISOString(),
      };
    }
    return out;
  },
};
