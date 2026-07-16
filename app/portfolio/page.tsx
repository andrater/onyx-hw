"use client";

import { useEffect, useState } from "react";
import { centsPrice, usd } from "@/lib/format";

type Position = {
  symbol: string;
  side: "YES" | "NO";
  marketName: string;
  size: number;
  costCents: number;
  avgPriceCents: number;
  currentPriceCents: number | null;
  valueCents: number | null;
  unrealizedPnlCents: number | null;
};

type Order = {
  id: string;
  symbol: string;
  marketName: string;
  side: "YES" | "NO";
  size: number;
  fillPriceCents: number;
  costCents: number;
  createdAt: string;
};

const POLL_MS = 4000;

function Pnl({ cents }: { cents: number | null }) {
  if (cents == null) return <span className="text-zinc-500">—</span>;
  const cls = cents > 0 ? "text-emerald-400" : cents < 0 ? "text-red-400" : "text-zinc-400";
  return (
    <span className={`font-mono ${cls}`}>
      {cents > 0 ? "+" : ""}
      {usd(cents)}
    </span>
  );
}

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [unauthed, setUnauthed] = useState(false);
  const [stale, setStale] = useState(false);
  const [staleAgeMs, setStaleAgeMs] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [pRes, oRes] = await Promise.all([fetch("/api/portfolio"), fetch("/api/orders")]);
        if (pRes.status === 401) {
          setUnauthed(true);
          return;
        }
        const p = await pRes.json();
        const o = await oRes.json();
        setPositions(p.positions);
        setOrders(o.orders);
        setStale(Boolean(p.stale));
        setStaleAgeMs(p.ageMs ?? 0);
      } catch {
        /* keep last data on transient failure */
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (unauthed)
    return (
      <p className="text-zinc-400">
        Please{" "}
        <a href="/login" className="text-emerald-400 underline">
          log in
        </a>{" "}
        to see your portfolio.
      </p>
    );
  if (positions === null) return <p className="text-zinc-400">Loading portfolio…</p>;

  const totalPnl = positions.reduce<number | null>(
    (acc, p) => (p.unrealizedPnlCents == null ? acc : (acc ?? 0) + p.unrealizedPnlCents),
    null
  );

  return (
    <div className="flex flex-col gap-8">
      {stale && (
        <div className="rounded bg-amber-900/50 px-3 py-2 text-sm text-amber-300">
          ⚠ STALE DATA — the live Onyx API is unreachable. Position values and P&L are based
          on the last known prices{staleAgeMs > 0 ? ` (${Math.round(staleAgeMs / 60000)}m ago)` : ""}.
        </div>
      )}
      <section>
        <div className="mb-3 flex items-baseline gap-4">
          <h2 className="text-lg font-semibold">Positions</h2>
          <span className="text-sm text-zinc-400">
            Total unrealized P&L: <Pnl cents={totalPnl} />
          </span>
          <span className="text-xs text-zinc-500">prices refresh every 4s</span>
        </div>
        {positions.length === 0 ? (
          <p className="text-sm text-zinc-500">No positions yet — place an order on the Markets page.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-left text-zinc-400">
                <th className="py-2 pr-4">Market</th>
                <th className="py-2 pr-4">Side</th>
                <th className="py-2 pr-4 text-right">Size</th>
                <th className="py-2 pr-4 text-right">Avg price</th>
                <th className="py-2 pr-4 text-right">Now</th>
                <th className="py-2 pr-4 text-right">Cost</th>
                <th className="py-2 pr-4 text-right">Value</th>
                <th className="py-2 text-right">Unrealized P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={`${p.symbol}-${p.side}`} className="border-b border-zinc-800">
                  <td className="max-w-xs truncate py-2 pr-4">{p.marketName}</td>
                  <td className="py-2 pr-4">{p.side}</td>
                  <td className="py-2 pr-4 text-right font-mono">{p.size}</td>
                  <td className="py-2 pr-4 text-right font-mono">{centsPrice(p.avgPriceCents)}</td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {p.currentPriceCents != null ? centsPrice(p.currentPriceCents) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono">{usd(p.costCents)}</td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {p.valueCents != null ? usd(p.valueCents) : "—"}
                  </td>
                  <td className="py-2 text-right">
                    <Pnl cents={p.unrealizedPnlCents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Order history</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-zinc-500">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-left text-zinc-400">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Market</th>
                <th className="py-2 pr-4">Side</th>
                <th className="py-2 pr-4 text-right">Size</th>
                <th className="py-2 pr-4 text-right">Fill</th>
                <th className="py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-zinc-800">
                  <td className="py-2 pr-4 text-zinc-400">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="max-w-xs truncate py-2 pr-4">{o.marketName}</td>
                  <td className="py-2 pr-4">{o.side}</td>
                  <td className="py-2 pr-4 text-right font-mono">{o.size}</td>
                  <td className="py-2 pr-4 text-right font-mono">{centsPrice(o.fillPriceCents)}</td>
                  <td className="py-2 text-right font-mono">{usd(o.costCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
