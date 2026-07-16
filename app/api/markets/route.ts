import { NextResponse } from "next/server";
import { getPredictions, type Market } from "@/lib/predictions";

const MAX_RESULTS = 300;

// Upstream's `sport` field is almost always "OTHER"; the real league is
// encoded in the symbol: NX.F.OPT.MLB-00001-260716-... -> MLB.
function leagueOf(m: Market): string {
  return m.symbol.match(/^NX\.F\.OPT\.([A-Z0-9]+)-/)?.[1] ?? m.sport;
}

const SORTS: Record<string, (a: Market & { league: string }, b: Market & { league: string }) => number> = {
  name: (a, b) => (a.name ?? a.symbol).localeCompare(b.name ?? b.symbol),
  price: (a, b) => (b.yes_price ?? -1) - (a.yes_price ?? -1),
  expiry: (a, b) => (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999"),
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").toLowerCase().trim();
  const pricedOnly = searchParams.get("priced") !== "0";
  const league = searchParams.get("league") ?? "";
  const sort = SORTS[searchParams.get("sort") ?? "name"] ?? SORTS.name;

  const { client, source } = await getPredictions();
  let result;
  try {
    result = await client.getMarkets();
  } catch {
    return NextResponse.json(
      { error: "Upstream markets API is unavailable" },
      { status: 503 }
    );
  }
  const all = result.markets.map((m) => ({ ...m, league: leagueOf(m) }));
  const totalOpen = all.length;
  const leagues = [...new Set(all.map((m) => m.league))].sort();

  let markets = all;
  if (pricedOnly) markets = markets.filter((m) => m.yes_price != null);
  if (league) markets = markets.filter((m) => m.league === league);
  if (q) {
    // Every whitespace-separated token must match somewhere in the market.
    const tokens = q.split(/\s+/);
    markets = markets.filter((m) => {
      const haystack =
        `${m.name ?? ""} ${m.event_name ?? ""} ${m.symbol} ${m.league}`.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }
  const totalMatching = markets.length;
  markets = [...markets].sort(sort);

  return NextResponse.json({
    totalOpen,
    totalMatching,
    leagues,
    stale: result.stale,
    source,
    markets: markets.slice(0, MAX_RESULTS),
  });
}
