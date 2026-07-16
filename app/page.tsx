"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { centsPrice } from "@/lib/format";

type Market = {
  id: string;
  symbol: string;
  sport: string;
  name: string | null;
  event_name: string | null;
  status: string;
  yes_price: number | null;
};

const POLL_MS = 4000;

export default function MarketsPage() {
  const [q, setQ] = useState("");
  const [pricedOnly, setPricedOnly] = useState(true);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [totals, setTotals] = useState({ totalOpen: 0, totalMatching: 0 });
  const [size, setSize] = useState(10);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const router = useRouter();
  const seq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const mySeq = ++seq.current;
      try {
        const res = await fetch(
          `/api/markets?q=${encodeURIComponent(q)}&priced=${pricedOnly ? 1 : 0}`
        );
        const data = await res.json();
        // Ignore stale responses from superseded requests
        if (!cancelled && mySeq === seq.current) {
          if (!res.ok) {
            setDegraded(true); // upstream outage — keep last data
            return;
          }
          setMarkets(data.markets);
          setTotals({ totalOpen: data.totalOpen, totalMatching: data.totalMatching });
          setDegraded(Boolean(data.stale));
          setLoading(false);
        }
      } catch {
        /* transient poll failure — keep last data */
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [q, pricedOnly]);

  async function placeOrder(symbol: string, side: "YES" | "NO") {
    setMsg(null);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, side, size }),
    });
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    if (!res.ok) {
      setMsg({ text: data.error ?? "Order failed", ok: false });
    } else {
      setMsg({
        text: `Filled: ${data.order.size} × ${side} @ ${centsPrice(data.order.fillPriceCents)} on "${data.order.marketName}"`,
        ok: true,
      });
      window.dispatchEvent(new Event("balance-refresh"));
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search markets…"
          className="w-72 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={pricedOnly}
            onChange={(e) => setPricedOnly(e.target.checked)}
          />
          Priced only (tradable)
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Contracts:
          <input
            type="number"
            min={1}
            value={size}
            onChange={(e) => setSize(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            className="w-20 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm"
          />
        </label>
        <span className="text-xs text-zinc-500">
          {totals.totalMatching} matching / {totals.totalOpen} open · live, refreshes every 4s
        </span>
      </div>

      {degraded && (
        <div className="mb-4 rounded bg-amber-900/50 px-3 py-2 text-sm text-amber-300">
          Upstream Onyx API is degraded — showing last-known prices. Orders may be rejected
          until live pricing recovers.
        </div>
      )}
      {msg && (
        <div
          className={`mb-4 rounded px-3 py-2 text-sm ${msg.ok ? "bg-emerald-900/50 text-emerald-300" : "bg-red-900/50 text-red-300"}`}
        >
          {msg.text}
        </div>
      )}

      {loading ? (
        <p className="text-zinc-400">Loading markets…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-700 text-left text-zinc-400">
              <th className="py-2 pr-4">Market</th>
              <th className="py-2 pr-4">Sport</th>
              <th className="py-2 pr-4 text-right">YES</th>
              <th className="py-2 pr-4 text-right">NO</th>
              <th className="py-2">Trade</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => {
              const yes = m.yes_price != null ? Math.round(m.yes_price * 100) : null;
              return (
                <tr key={m.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                  <td className="max-w-md py-2 pr-4">
                    <div className="truncate">{m.name ?? m.symbol}</div>
                    <div className="truncate font-mono text-xs text-zinc-500">{m.symbol}</div>
                  </td>
                  <td className="py-2 pr-4 text-zinc-400">{m.sport}</td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {yes != null ? centsPrice(yes) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {yes != null ? centsPrice(100 - yes) : "—"}
                  </td>
                  <td className="py-2">
                    {yes != null ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => placeOrder(m.symbol, "YES")}
                          className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold hover:bg-emerald-600"
                        >
                          Buy YES
                        </button>
                        <button
                          onClick={() => placeOrder(m.symbol, "NO")}
                          className="rounded bg-rose-700 px-2 py-1 text-xs font-semibold hover:bg-rose-600"
                        >
                          Buy NO
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-600">no price</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
