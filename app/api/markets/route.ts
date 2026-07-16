import { NextResponse } from "next/server";
import { fetchAllMarkets } from "@/lib/onyx";

const MAX_RESULTS = 300;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").toLowerCase().trim();
  const pricedOnly = searchParams.get("priced") !== "0";

  let markets = await fetchAllMarkets();
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
    markets: markets.slice(0, MAX_RESULTS),
  });
}
