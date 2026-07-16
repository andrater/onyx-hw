# Onyx Paper Trading

Paper-trade Onyx prediction markets with live prices. Users sign up, get a
$1,000 paper balance, buy YES/NO on any live-priced market at the current
upstream price, and track positions and unrealized P&L in real time.

**Live:** https://onyx-hw.vercel.app

## Running locally

```bash
npm install
cp .env.example .env.local   # then edit:
#   DATABASE_URL    — any Postgres (Neon, local, docker)
#   SESSION_SECRET  — `openssl rand -hex 32`
#   PREDICTIONS_API — "onyx" for the real API, "mock" for offline fixtures
npm run db:push              # create tables (drizzle-kit)
npm run dev                  # http://localhost:3000
```

`PREDICTIONS_API=mock` runs the app with zero upstream dependency: 5 real
markets captured from the Onyx dev API, with prices that random-walk ±2¢ every
3s — enough to exercise polling, fills, and P&L. This exists because the Onyx
dev API went down mid-build (see "Upstream quirks").

## Architecture

- **Next.js App Router + TypeScript** on Vercel; **Postgres (Neon)** via
  **Drizzle**; hand-rolled auth (**bcryptjs** + **iron-session** signed
  cookie). No auth framework — under a time cap, provider/adapter setup costs
  more than `bcrypt.compare` and an encrypted cookie, and the requirements
  (email/password, per-user state) don't need more.
- **`PredictionsApiClient` interface** (`lib/predictions/`): the app is
  written against `getMarkets()` / `getPrices(symbols)`, with two
  implementations — the real Onyx client and the ticking mock — selected by
  env var. This is the right seam regardless of the outage that motivated it:
  it makes the app testable offline and makes swapping/adding data providers
  trivial.
- **Data model: two tables + a cache.** `users` (email, bcrypt hash, balance
  in integer cents) and `orders` — an immutable log of fills. There is no
  `positions` table: positions and P&L are *derived* by aggregating orders per
  (user, market, side). One source of truth, no sync bugs between orders and
  positions. All money is integer cents; contract prices are 1–99¢.
- **Live prices via 3–5s client polling**, not websockets/SSE. Vercel's
  serverless model fights long-lived connections; polling a 3s-cached proxy
  route gives "prices update live" semantics with none of that fight. The
  proxy caches upstream pages for 3s, so N browsers cost ~1 upstream fetch
  per 3s, not N.

## Order fill correctness

Orders fill instantly at the current upstream price (YES at `yes_price`, NO at
`1 − yes_price`), fetched fresh at fill time from `/prices/batch`. Two things
worth calling out:

- **No balance race:** the debit is a single conditional
  `UPDATE users SET balance = balance − cost WHERE id = ? AND balance >= cost`.
  Concurrent orders serialize on the row lock; one of two racing orders that
  would overdraw loses and gets "insufficient balance". The debit and the
  order insert share a transaction, so a failed insert rolls back the debit.
- **No stale fills:** if the fresh price fetch fails and our cached market
  list is older than 30s, the order is rejected rather than filled at a price
  we can't trust.

## Upstream quirks discovered (Onyx dev API)

- `GET /markets/{symbol}` and `POST /markets/batch` hang indefinitely — the
  app uses the paginated `GET /markets` list and `POST /prices/batch` instead.
- Only ~15% of open markets have a live price; the UI defaults to "priced
  only" since unpriced markets can't be traded (orders on them are rejected).
- The whole API went down for an extended period mid-build. Resilience layers
  added in response: 8s hard timeout on every upstream call, per-page
  `allSettled` (partial market list beats none), and a last-known-good
  snapshot in memory + a single-row Postgres `market_snapshots` table (survives
  serverless cold starts). During an outage the UI shows a "degraded" banner,
  browsing and P&L continue from the snapshot, and order fills are refused.

## With more time

- **Sell/close positions and settlement** — orders are buy-only; closing is
  just a negative-size order against the same log, settlement is a job that
  resolves expired markets at 0/100 and realizes P&L into the balance.
- **Real E2E/unit tests** — the fill math and the conditional-debit
  concurrency property are the two things I'd pin down first (the mock client
  makes both testable without the network).
- **Price-move protection** — reject fills if the price moved more than X¢
  between quote display and order submission (client sends the price it saw).
- **Auth hardening** — rate-limit login, CSRF token (currently mitigated by
  `SameSite=Lax`), email verification.
- **UI** — group markets by event, price-change flashes, position detail pages,
  pagination past the 300-row cap.
