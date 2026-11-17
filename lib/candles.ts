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

// Coinbase omits minutes with no trades. A few quiet minutes are not a halt,
// so repeat the last close across them. Longer holes stay open.
export function fillQuietMinutes(candles: Candle[], step: number): Candle[] {
  if (step <= 0 || step > 15 * 60 || candles.length < 2) return candles;
  const maxMissing = 5;
  const filled: Candle[] = [candles[0]];
  for (let index = 1; index < candles.length; index += 1) {
    const next = candles[index];
    const previous = filled[filled.length - 1];
    const delta = next.time - previous.time;
    if (delta > step && delta % step === 0) {
      const missing = delta / step - 1;
      if (missing <= maxMissing) {
        for (let offset = 1; offset <= missing; offset += 1) {
          const close = previous.close;
          filled.push({
            time: previous.time + step * offset,
            open: close,
            high: close,
            low: close,
            close,
            volume: 0,
          });
        }
      }
    }
    filled.push(next);
  }
  return filled;
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
  // A trade stamped far past the last loaded bar would open a hole in the
  // time scale. Keep the series continuous until the next history poll.
  if (bucket > last.time + step) return candles;
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
