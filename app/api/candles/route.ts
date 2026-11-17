import { connection } from "next/server";
import { getCoin, getRange } from "@/lib/coins";
import { getCandles, getRatioCandles } from "@/lib/market";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const coin = getCoin(url.searchParams.get("coin") ?? "");
  const range = getRange(url.searchParams.get("range") ?? "");
  const versusParam = url.searchParams.get("versus");
  const versus = versusParam ? getCoin(versusParam) : null;

  if (!coin || !range || (versusParam && !versus)) {
    return Response.json({ error: "Unknown market." }, { status: 400 });
  }
  if (versus && versus.id === coin.id) {
    return Response.json({ error: "A ratio needs two different coins." }, { status: 400 });
  }

  try {
    const result = versus ? await getRatioCandles(coin, versus, range) : await getCandles(coin, range);
    return Response.json(
      {
        coin: coin.id,
        range: range.id,
        versus: versus?.id ?? null,
        source: result.source,
        interval: range.interval,
        candles: result.candles,
      },
      {
        headers: {
          "cache-control": "public, max-age=15, stale-while-revalidate=30",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Market data is temporarily unavailable." },
      { status: 503 },
    );
  }
}
