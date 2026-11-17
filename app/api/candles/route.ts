import { connection } from "next/server";
import { getCoin, getRange } from "@/lib/coins";
import { getCandles } from "@/lib/market";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const coin = getCoin(url.searchParams.get("coin") ?? "");
  const range = getRange(url.searchParams.get("range") ?? "");

  if (!coin || !range) {
    return Response.json({ error: "Unknown market." }, { status: 400 });
  }

  try {
    const result = await getCandles(coin, range);
    return Response.json(
      {
        coin: coin.id,
        range: range.id,
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
