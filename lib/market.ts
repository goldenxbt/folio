import { aggregateCandles, fillQuietMinutes, mergeCandles } from "@/lib/candles";
import { COINS, type Coin, type IntervalSpec } from "@/lib/coins";
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

const COINBASE_PAGE = 300;
const MAX_OLDER_PAGES = 6;

async function candlesFromKraken(coin: Coin, interval: IntervalSpec): Promise<Candle[]> {
  return cached(`kraken-ohlc:${coin.id}:${interval.id}`, 15_000, () => krakenOhlc(coin, interval));
}

async function krakenOhlc(coin: Coin, interval: IntervalSpec): Promise<Candle[]> {
  const payload = await getJson(
    `https://api.kraken.com/0/public/OHLC?pair=${coin.kraken}&interval=${interval.krakenInterval}`,
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

  return normalizeCandles(
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
}

async function coinbaseChunk(
  coin: Coin,
  granularity: number,
  start: number,
  end: number,
): Promise<Candle[]> {
  const payload = await getJson(
    `https://api.exchange.coinbase.com/products/${coin.coinbase}/candles?granularity=${granularity}&start=${encodeURIComponent(new Date(start * 1000).toISOString())}&end=${encodeURIComponent(new Date(end * 1000).toISOString())}`,
  );
  if (!Array.isArray(payload)) throw new Error("Unexpected Coinbase payload");

  return normalizeCandles(
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
}

async function coinbaseHistory(
  coin: Coin,
  interval: IntervalSpec,
  start: number,
  end: number,
  pages: number,
): Promise<Candle[]> {
  const granularity = interval.coinbaseGranularity;
  const raw: Candle[] = [];
  let cursor = end;
  let fetched = 0;

  while (cursor > start && fetched < pages) {
    const pageStart = Math.max(start, cursor - granularity * COINBASE_PAGE);
    const page = await coinbaseChunk(coin, granularity, pageStart, cursor);
    raw.push(...page);
    fetched += 1;
    if (page.length === 0) break;
    const oldest = page.reduce((min, candle) => Math.min(min, candle.time), cursor);
    if (oldest >= cursor) break;
    cursor = oldest;
  }

  const merged = mergeCandles([], raw);
  if (granularity === interval.seconds) return merged;
  return aggregateCandles(merged, interval.seconds);
}

async function loadCandles(
  coin: Coin,
  interval: IntervalSpec,
  earliest: number,
  before: number | null,
): Promise<{ source: MarketSource; candles: Candle[] }> {
  let recent: Candle[] = [];
  try {
    recent = await candlesFromKraken(coin, interval);
  } catch {
    recent = [];
  }

  const step = interval.seconds;
  if (before != null) {
    const olderRecent = recent.filter((candle) => candle.time < before);
    if (olderRecent.length > 0) return { source: "kraken", candles: fillQuietMinutes(olderRecent, step) };
    try {
      const candles = await coinbaseHistory(
        coin,
        interval,
        before - interval.coinbaseGranularity * COINBASE_PAGE,
        before,
        1,
      );
      return {
        source: "coinbase",
        candles: fillQuietMinutes(candles.filter((candle) => candle.time < before), step),
      };
    } catch {
      return { source: recent.length > 0 ? "kraken" : "coinbase", candles: [] };
    }
  }

  if (recent.length < 8) {
    const now = Math.floor(Date.now() / 1000);
    const candles = await coinbaseHistory(coin, interval, earliest, now, MAX_OLDER_PAGES);
    if (candles.length < 8) throw new Error("Candle history unavailable");
    return { source: "coinbase", candles: fillQuietMinutes(candles, step) };
  }

  const first = recent[0]?.time ?? earliest;
  if (first <= earliest) return { source: "kraken", candles: fillQuietMinutes(recent, step) };

  try {
    const older = await coinbaseHistory(coin, interval, earliest, first, MAX_OLDER_PAGES);
    const recentTimes = new Set(recent.map((candle) => candle.time));
    const extra = older.filter((candle) => !recentTimes.has(candle.time) && candle.time < first);
    return { source: "kraken", candles: fillQuietMinutes(mergeCandles(extra, recent), step) };
  } catch {
    return { source: "kraken", candles: fillQuietMinutes(recent, step) };
  }
}

export async function getCandles(
  coin: Coin,
  interval: IntervalSpec,
  earliest: number,
  before: number | null,
): Promise<{ source: MarketSource; candles: Candle[] }> {
  const aligned = earliest - (earliest % interval.seconds);
  const key = before == null
    ? `candles:${coin.id}:${interval.id}:from:${aligned}`
    : `candles:${coin.id}:${interval.id}:before:${before}`;
  const ttl = before == null ? 15_000 : 120_000;
  return cached(key, ttl, () => loadCandles(coin, interval, aligned, before));
}

export function divideCandles(base: Candle[], quote: Candle[]): Candle[] {
  const quoteByTime = new Map(quote.map((candle) => [candle.time, candle]));
  const rows: Candle[] = [];
  for (const bar of base) {
    const other = quoteByTime.get(bar.time);
    if (!other) continue;
    if (other.open <= 0 || other.high <= 0 || other.low <= 0 || other.close <= 0) continue;
    if (bar.open <= 0 || bar.close <= 0) continue;
    const open = bar.open / other.open;
    const close = bar.close / other.close;
    const high = Math.max(open, close, bar.high / other.low, bar.low / other.high);
    const low = Math.min(open, close, bar.low / other.high, bar.high / other.low);
    if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) continue;
    rows.push({ time: bar.time, open, high, low, close, volume: 0 });
  }
  return rows;
}

export async function getRatioCandles(
  base: Coin,
  quote: Coin,
  interval: IntervalSpec,
  earliest: number,
  before: number | null,
): Promise<{ source: MarketSource; candles: Candle[] }> {
  const [left, right] = await Promise.all([
    getCandles(base, interval, earliest, before),
    getCandles(quote, interval, earliest, before),
  ]);
  const candles = divideCandles(left.candles, right.candles);
  if (before == null && candles.length < 8) throw new Error("Ratio history unavailable");
  return { source: left.source, candles };
}
