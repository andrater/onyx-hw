import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/schema";
import { requireUserId } from "@/lib/session";
import { fetchAllMarkets, fetchPricesBatch } from "@/lib/onyx";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  // Positions are an aggregation over the immutable order log.
  const positions = await db
    .select({
      symbol: orders.symbol,
      side: orders.side,
      marketName: sql<string>`min(${orders.marketName})`,
      size: sql<number>`sum(${orders.size})::int`,
      costCents: sql<number>`sum(${orders.costCents})::int`,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .groupBy(orders.symbol, orders.side);

  const symbols = [...new Set(positions.map((p) => p.symbol))];
  const prices = await fetchPricesBatch(symbols).catch(
    () => ({}) as Awaited<ReturnType<typeof fetchPricesBatch>>
  );
  // For symbols the live price feed can't cover (upstream outage), fall back
  // to the last-known-good snapshot price so P&L stays visible.
  let snapshotPrices = new Map<string, number | null>();
  if (symbols.some((s) => prices[s]?.last_price == null)) {
    const { markets } = await fetchAllMarkets().catch(() => ({ markets: [] }));
    snapshotPrices = new Map(markets.map((m) => [m.symbol, m.yes_price]));
  }

  const enriched = positions.map((p) => {
    const yes = prices[p.symbol]?.last_price ?? snapshotPrices.get(p.symbol);
    const currentPriceCents =
      yes == null ? null : p.side === "YES" ? Math.round(yes * 100) : 100 - Math.round(yes * 100);
    const valueCents = currentPriceCents == null ? null : p.size * currentPriceCents;
    return {
      ...p,
      avgPriceCents: p.costCents / p.size,
      currentPriceCents,
      valueCents,
      unrealizedPnlCents: valueCents == null ? null : valueCents - p.costCents,
    };
  });

  return NextResponse.json({ positions: enriched });
}
