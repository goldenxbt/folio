import { connection } from "next/server";
import { getCoin, getInterval, getSpan } from "@/lib/coins";
import { getCandles, getRatioCandles } from "@/lib/market";

function parseBefore(value: string | null): number | null {
  if (!value || !/^[0-9]{9,10}$/.test(value)) return null;
  const parsed = Number(value);
  const now = Math.floor(Date.now() / 1000);
  const oldest = now - 20 * 365 * 24 * 60 * 60;
  if (parsed < oldest || parsed > now + 24 * 60 * 60) return null;
  return parsed;
}

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const coin = getCoin(url.searchParams.get("coin") ?? "");
  const interval = getInterval(url.searchParams.get("interval") ?? "");
  const spanParam = url.searchParams.get("span");
  const span = spanParam ? getSpan(spanParam) : null;
  const before = parseBefore(url.searchParams.get("before"));
  const versusParam = url.searchParams.get("versus");
  const versus = versusParam ? getCoin(versusParam) : null;

  if (!coin || !interval || (spanParam && !span) || (versusParam && !versus) || (before == null && !span)) {
    return Response.json({ error: "Unknown market." }, { status: 400 });
  }
  if (versus && versus.id === coin.id) {
    return Response.json({ error: "A ratio needs two different coins." }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const earliest = span ? now - span.windowSec : now - interval.seconds * 300;

  try {
    const result = versus
      ? await getRatioCandles(coin, versus, interval, earliest, before)
      : await getCandles(coin, interval, earliest, before);
    return Response.json(
      {
        coin: coin.id,
        interval: interval.name,
        intervalId: interval.id,
        span: span?.id ?? null,
        versus: versus?.id ?? null,
        source: result.source,
        candles: result.candles,
      },
      {
        headers: {
          "cache-control": before == null ? "no-store" : "public, max-age=60",
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
