import { NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, users } from "@/lib/schema";
import { requireUserId } from "@/lib/session";
import { getMarketWithLivePrice } from "@/lib/onyx";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(200);
  return NextResponse.json({ orders: rows });
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { symbol, side, size } = await req.json().catch(() => ({}));
  if (
    typeof symbol !== "string" ||
    (side !== "YES" && side !== "NO") ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 100_000
  ) {
    return NextResponse.json({ error: "Invalid order: need symbol, side YES|NO, integer size >= 1" }, { status: 400 });
  }

  // Fill at the live upstream price, fetched fresh at order time.
  const found = await getMarketWithLivePrice(symbol);
  if (!found || found.market.status !== "open") {
    return NextResponse.json({ error: "Market not found or not open" }, { status: 400 });
  }
  const { market, yesPrice } = found;
  if (yesPrice == null) {
    return NextResponse.json({ error: "Market has no live price; cannot fill" }, { status: 400 });
  }
  const yesCents = Math.round(yesPrice * 100);
  const fillPriceCents = side === "YES" ? yesCents : 100 - yesCents;
  if (fillPriceCents < 1 || fillPriceCents > 99) {
    return NextResponse.json({ error: "Price out of range" }, { status: 400 });
  }
  const costCents = size * fillPriceCents;

  const order = await db.transaction(async (tx) => {
    // Atomic balance check-and-debit: the WHERE clause makes concurrent
    // orders serialize on the user row — no read-then-write race.
    const debited = await tx
      .update(users)
      .set({ balanceCents: sql`${users.balanceCents} - ${costCents}` })
      .where(and(eq(users.id, userId), gte(users.balanceCents, costCents)))
      .returning({ balanceCents: users.balanceCents });
    if (debited.length === 0) return null;
    const [row] = await tx
      .insert(orders)
      .values({
        userId,
        symbol,
        marketName: market.name ?? market.symbol,
        side,
        size,
        fillPriceCents,
        costCents,
      })
      .returning();
    return row;
  });

  if (!order) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }
  return NextResponse.json({ order });
}
