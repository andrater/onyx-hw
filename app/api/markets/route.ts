import { NextResponse } from "next/server";
import { fetchAllMarkets } from "@/lib/onyx";

const MAX_RESULTS = 300;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").toLowerCase().trim();
  const pricedOnly = searchParams.get("priced") !== "0";

  let result;
  try {
    result = await fetchAllMarkets();
  } catch {
    return NextResponse.json(
      { error: "Upstream markets API is unavailable" },
      { status: 503 }
    );
  }
  let markets = result.markets;
  const totalOpen = markets.length;
  if (pricedOnly) markets = markets.filter((m) => m.yes_price != null);
  if (q) {
    markets = markets.filter((m) =>
      `${m.name ?? ""} ${m.event_name ?? ""} ${m.symbol} ${m.sport}`.toLowerCase().includes(q)
    );
  }
  const totalMatching = markets.length;
  return NextResponse.json({
    totalOpen,
    totalMatching,
    stale: result.stale,
    markets: markets.slice(0, MAX_RESULTS),
  });
}
