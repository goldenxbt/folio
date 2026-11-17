import { COINS, type Coin, type RangeSpec } from "@/lib/coins";
import type { Candle, MarketSource, Quote } from "@/lib/types";

const ALLOWED_HOSTS = new Set([
  "api.kraken.com",
  "api.exchange.coinbase.com",
  "api.coingecko.com",
]);

type CacheEntry<T> = { exp: number; data: T };

const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data as T;

  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;

  const request = load()
    .then((data) => {
      cache.set(key, { exp: Date.now() + ttlMs, data });
      pending.delete(key);
      return data;
    })
    .catch((error: unknown) => {
      pending.delete(key);
      throw error;
    });

  pending.set(key, request);
  return request;
}

async function getJson(url: string): Promise<unknown> {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error("Unexpected market host");
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "CandleFolio/1.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Market request failed (${response.status})`);
  }

  return response.json();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function blankQuote(coin: Coin): Quote {
  return {
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    price: null,
    change24h: null,
    high24h: null,
    low24h: null,
    volume24h: null,
    marketCap: null,
    rank: null,
  };
}

async function quotesFromCoinGecko(): Promise<Quote[]> {
  const ids = COINS.map((coin) => coin.gecko).join(",");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`;
  const payload = await getJson(url);
  if (!Array.isArray(payload)) throw new Error("Unexpected quote payload");

  const byId = new Map<string, Quote>();
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    const coin = COINS.find((entry) => entry.gecko === id);
    if (!coin) continue;
    byId.set(coin.id, {
      ...blankQuote(coin),
      price: asNumber(row.current_price),
      change24h: asNumber(row.price_change_percentage_24h),
      high24h: asNumber(row.high_24h),
      low24h: asNumber(row.low_24h),
      volume24h: asNumber(row.total_volume),
      marketCap: asNumber(row.market_cap),
      rank: asNumber(row.market_cap_rank),
    });
  }

  return COINS.map((coin) => byId.get(coin.id) ?? blankQuote(coin));
}

function krakenRow(result: Record<string, unknown>, coin: Coin): Record<string, unknown> | null {
  const row = result[coin.krakenKey] ?? result[coin.kraken];
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

async function quotesFromKraken(): Promise<Quote[]> {
  const pairs = COINS.map((coin) => coin.kraken).join(",");
  const payload = await getJson(`https://api.kraken.com/0/public/Ticker?pair=${pairs}`);
  if (!payload || typeof payload !== "object") throw new Error("Unexpected Kraken payload");
  const result = (payload as { result?: unknown }).result;
  if (!result || typeof result !== "object") throw new Error("Unexpected Kraken payload");
  const rows = result as Record<string, unknown>;

  return COINS.map((coin) => {
    const row = krakenRow(rows, coin);
    if (!row) return blankQuote(coin);
    const last = Array.isArray(row.c) ? asNumber(row.c[0]) : null;
    const high = Array.isArray(row.h) ? asNumber(row.h[1]) : null;
    const low = Array.isArray(row.l) ? asNumber(row.l[1]) : null;
    const volume = Array.isArray(row.v) ? asNumber(row.v[1]) : null;
    return {
      ...blankQuote(coin),
      price: last,
      high24h: high,
      low24h: low,
      volume24h: last != null && volume != null ? last * volume : null,
    };
  });
}

export async function getQuotes(): Promise<{ source: MarketSource; quotes: Quote[] }> {
  return cached("quotes", 20_000, async () => {
    try {
      const quotes = await quotesFromCoinGecko();
      const priced = quotes.filter((quote) => quote.price != null).length;
      if (priced >= 10) return { source: "coingecko" as const, quotes };
    } catch {
      // Fall through to the exchange ticker.
    }
    return { source: "kraken" as const, quotes: await quotesFromKraken() };
  });
}

function normalizeCandles(
  rows: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>,
): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const row of rows) {
    const time = row.time;
    const open = row.open;
    const high = row.high;
    const low = row.low;
    const close = row.close;
    const volume = row.volume;
    if (![time, open, high, low, close, volume].every(Number.isFinite)) continue;
    if (time <= 0 || high < low || open < 0 || close < 0) continue;
    byTime.set(time, { time, open, high, low, close, volume: Math.max(0, volume) });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function windowCandles(candles: Candle[], windowSec: number): Candle[] {
  if (candles.length === 0) return candles;
  const end = candles[candles.length - 1].time;
  const sliced = candles.filter((candle) => candle.time >= end - windowSec);
  return sliced.length >= 8 ? sliced : candles;
}

async function candlesFromKraken(coin: Coin, range: RangeSpec): Promise<Candle[]> {
  const payload = await getJson(
    `https://api.kraken.com/0/public/OHLC?pair=${coin.kraken}&interval=${range.krakenInterval}`,
  );
  if (!payload || typeof payload !== "object") throw new Error("Unexpected candle payload");
  const body = payload as { error?: unknown; result?: Record<string, unknown> };
  if (Array.isArray(body.error) && body.error.length > 0) {
    throw new Error("Kraken rejected the candle request");
  }
  const result = body.result;
  if (!result) throw new Error("Unexpected candle payload");
  const key = Object.keys(result).find((name) => name !== "last");
  const rows = key ? result[key] : null;
  if (!Array.isArray(rows)) throw new Error("Unexpected candle payload");

  const candles = normalizeCandles(
    rows.map((row) => {
      const values = Array.isArray(row) ? row : [];
      return {
        time: asNumber(values[0]) ?? Number.NaN,
        open: asNumber(values[1]) ?? Number.NaN,
        high: asNumber(values[2]) ?? Number.NaN,
        low: asNumber(values[3]) ?? Number.NaN,
        close: asNumber(values[4]) ?? Number.NaN,
        volume: asNumber(values[6]) ?? 0,
      };
    }),
  );
  return windowCandles(candles, range.windowSec);
}

async function candlesFromCoinbase(coin: Coin, range: RangeSpec): Promise<Candle[]> {
  const payload = await getJson(
    `https://api.exchange.coinbase.com/products/${coin.coinbase}/candles?granularity=${range.coinbaseGranularity}`,
  );
  if (!Array.isArray(payload)) throw new Error("Unexpected Coinbase payload");

  const candles = normalizeCandles(
    payload.map((row) => {
      const values = Array.isArray(row) ? row : [];
      return {
        time: asNumber(values[0]) ?? Number.NaN,
        low: asNumber(values[1]) ?? Number.NaN,
        high: asNumber(values[2]) ?? Number.NaN,
        open: asNumber(values[3]) ?? Number.NaN,
        close: asNumber(values[4]) ?? Number.NaN,
        volume: asNumber(values[5]) ?? 0,
      };
    }),
  );
  return windowCandles(candles, range.windowSec);
}

export async function getCandles(
  coin: Coin,
  range: RangeSpec,
): Promise<{ source: MarketSource; candles: Candle[] }> {
  return cached(`candles:${coin.id}:${range.id}`, 45_000, async () => {
    const errors: string[] = [];
    try {
      const candles = await candlesFromKraken(coin, range);
      if (candles.length >= 8) return { source: "kraken" as const, candles };
      errors.push("Kraken returned too little history");
    } catch {
      errors.push("Kraken unavailable");
    }

    const candles = await candlesFromCoinbase(coin, range);
    if (candles.length >= 8) return { source: "coinbase" as const, candles };
    if (errors.length > 0) {
      throw new Error("Candle history unavailable");
    }
    throw new Error("Candle history unavailable");
  });
}
