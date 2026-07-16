"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { centsPrice } from "@/lib/format";

type Market = {
  id: string;
  symbol: string;
  sport: string;
  league: string;
  name: string | null;
  event_name: string | null;
  status: string;
  yes_price: number | null;
};

const POLL_MS = 4000;
const DEBOUNCE_MS = 300;

// "Mets vs Phillies ; Mets -3.5 ; Citizens Bank Park ; 260716"
// -> group "Mets vs Phillies", label "Mets -3.5"
function splitName(m: Market): { group: string; label: string } {
  const parts = (m.name ?? "").split(";").map((s) => s.trim());
  if (parts.length >= 2 && parts[0]) return { group: parts[0], label: parts[1] || parts[0] };
  // Fallback: group by the symbol's game prefix (before the market segment).
  return { group: m.symbol.split(".").slice(0, 4).join("."), label: m.name ?? m.symbol };
}

export default function MarketsPage() {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [pricedOnly, setPricedOnly] = useState(true);
  const [league, setLeague] = useState("");
  const [sort, setSort] = useState("name");
  const [leagues, setLeagues] = useState<string[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [totals, setTotals] = useState({ totalOpen: 0, totalMatching: 0 });
  const [size, setSize] = useState(10);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const router = useRouter();
  const seq = useRef(0);

  // Debounce keystrokes into the committed query.
  useEffect(() => {
    const id = setTimeout(() => setQ(qInput), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [qInput]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const mySeq = ++seq.current;
      try {
        const params = new URLSearchParams({
          q,
          priced: pricedOnly ? "1" : "0",
          league,
          sort,
        });
        const res = await fetch(`/api/markets?${params}`);
        const data = await res.json();
        // Ignore stale responses from superseded requests
        if (!cancelled && mySeq === seq.current) {
          if (!res.ok) {
            setDegraded(true); // upstream outage — keep last data
            return;
          }
          setMarkets(data.markets);
          setLeagues(data.leagues ?? []);
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
  }, [q, pricedOnly, league, sort]);

  // Group rows by event, preserving server sort order of first appearance.
  const groups = useMemo(() => {
    const map = new Map<string, { market: Market; label: string }[]>();
    for (const m of markets) {
      const { group, label } = splitName(m);
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push({ market: m, label });
    }
    return [...map.entries()];
  }, [markets]);

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
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search markets… (e.g. mets total)"
          className="w-72 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        <select
          value={league}
          onChange={(e) => setLeague(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm"
        >
          <option value="">All leagues</option>
          {leagues.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm"
        >
          <option value="name">Sort: name</option>
          <option value="price">Sort: YES price</option>
          <option value="expiry">Sort: expiry</option>
        </select>
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
      ) : groups.length === 0 ? (
        <p className="py-8 text-center text-zinc-500">
          No markets match — try a different search or league, or untick “priced only”.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-700 text-left text-zinc-400">
              <th className="py-2 pr-4">Market</th>
              <th className="py-2 pr-4 text-right">YES</th>
              <th className="py-2 pr-4 text-right">NO</th>
              <th className="py-2">Trade</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, rows]) => (
              <GroupRows
                key={group}
                group={group}
                league={rows[0].market.league}
                rows={rows}
                placeOrder={placeOrder}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GroupRows({
  group,
  league,
  rows,
  placeOrder,
}: {
  group: string;
  league: string;
  rows: { market: Market; label: string }[];
  placeOrder: (symbol: string, side: "YES" | "NO") => void;
}) {
  return (
    <>
      <tr className="border-b border-zinc-800 bg-zinc-800/60">
        <td colSpan={4} className="py-2 pr-4">
          <span className="font-semibold text-zinc-100">{group}</span>
          <span className="ml-2 rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
            {league}
          </span>
          <span className="ml-2 text-xs text-zinc-500">{rows.length} markets</span>
        </td>
      </tr>
      {rows.map(({ market: m, label }) => {
        const yes = m.yes_price != null ? Math.round(m.yes_price * 100) : null;
        return (
          <tr key={m.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
            <td className="max-w-md py-2 pl-4 pr-4">
              <div className="truncate">{label}</div>
              <div className="truncate font-mono text-xs text-zinc-500">{m.symbol}</div>
            </td>
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
    </>
  );
}
