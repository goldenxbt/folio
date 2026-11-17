import type { Candle } from "@/lib/types";

export function mergeCandles(current: Candle[], incoming: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of current) byTime.set(candle.time, candle);
  for (const candle of incoming) byTime.set(candle.time, candle);
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

export function aggregateCandles(candles: Candle[], step: number): Candle[] {
  if (step <= 0) return candles;
  const sorted = candles.slice().sort((left, right) => left.time - right.time);
  const buckets = new Map<number, Candle>();

  for (const candle of sorted) {
    const time = Math.floor(candle.time / step) * step;
    const existing = buckets.get(time);
    if (!existing) {
      buckets.set(time, { ...candle, time });
      continue;
    }
    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  }

  return [...buckets.values()];
}

export function applyTrade(
  candles: Candle[],
  price: number,
  tradeSec: number,
  step: number,
): Candle[] {
  if (candles.length === 0 || !(price > 0) || !(tradeSec > 0) || !(step > 0)) return candles;
  const last = candles[candles.length - 1];
  if (!(last.close > 0)) return candles;
  if (Math.abs(price - last.close) / last.close > 0.3) return candles;

  const bucket = Math.floor(tradeSec / step) * step;
  if (bucket < last.time) return candles;
  if (bucket === last.time) {
    if (price === last.close && price <= last.high && price >= last.low) return candles;
    const next = candles.slice();
    next[next.length - 1] = {
      ...last,
      close: price,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
    };
    return next;
  }

  const next = candles.slice();
  next.push({
    time: bucket,
    open: last.close,
    high: Math.max(last.close, price),
    low: Math.min(last.close, price),
    close: price,
    volume: 0,
  });
  return next;
}
