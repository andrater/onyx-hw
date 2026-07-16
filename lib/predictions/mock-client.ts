import type { Market, PredictionsApiClient, PriceQuote } from "./types";

// Five real markets captured from the Onyx dev API on 2026-07-16, used as
// fixtures. Prices random-walk ±2¢ every TICK_MS so polling, fills, and P&L
// are all exercisable offline. Ticking is lazy (advanced on read) so it works
// in serverless environments with no long-lived timers.
const TICK_MS = 3000;

const FIXTURES: Market[] = [
  {
    id: "98c43d56-d648-4632-8649-970c2217aaa1",
    symbol: "NX.F.OPT.MLB-00001-260716-M.O.1.1.20261130",
    sport: "MLB",
    name: "Mets vs Phillies ; Mets ; Citizens Bank Park ; 260716",
    event_name: null,
    status: "open",
    expiry_date: "2026-11-30T23:59:59Z",
    min_price: 0.01,
    max_price: 0.99,
    yes_price: 0.41,
  },
  {
    id: "87b5269c-c3b6-42aa-9501-59e0378c241a",
    symbol: "NX.F.OPT.MLB-00001-260716-M.O.1.11.20261130",
    sport: "MLB",
    name: "Mets vs Phillies ; Mets -3.5 ; Citizens Bank Park ; 260716",
    event_name: null,
    status: "open",
    expiry_date: "2026-11-30T23:59:59Z",
    min_price: 0.01,
    max_price: 0.99,
    yes_price: 0.56,
  },
  {
    id: "c78ce114-4326-431b-9fa1-20e1a113b7dd",
    symbol: "NX.F.OPT.MLB-00001-260716-M.O.1.122.20261130",
    sport: "MLB",
    name: "Mets vs Phillies ; Juan Soto Total RBIs Over 0.5 ; 260716",
    event_name: null,
    status: "open",
    expiry_date: "2026-11-30T23:59:59Z",
    min_price: 0.01,
    max_price: 0.99,
    yes_price: 0.48,
  },
  {
    id: "a4b186a0-f1ad-4f3b-9e1e-8c38fc1cdcbf",
    symbol: "NX.F.OPT.MLB-00001-260716-M.O.1.123.20261130",
    sport: "MLB",
    name: "Mets vs Phillies ; Bryce Harper Total RBIs Over 0.5 ; 260716",
    event_name: null,
    status: "open",
    expiry_date: "2026-11-30T23:59:59Z",
    min_price: 0.01,
    max_price: 0.99,
    yes_price: 0.45,
  },
  {
    id: "1f9192ee-478c-4da2-966a-1bcf3e73d0f9",
    symbol: "NX.F.OPT.MLB-00001-260716-M.O.1.125.20261130",
    sport: "MLB",
    name: "Mets vs Phillies ; Trea Turner Total RBIs Over 0.5 ; 260716",
    event_name: null,
    status: "open",
    expiry_date: "2026-11-30T23:59:59Z",
    min_price: 0.01,
    max_price: 0.99,
    yes_price: 0.34,
  },
];

const prices = new Map(FIXTURES.map((m) => [m.symbol, m.yes_price!]));
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
      markets: FIXTURES.map((m) => ({ ...m, yes_price: prices.get(m.symbol)! })),
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
