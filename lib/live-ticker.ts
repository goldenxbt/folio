export type LiveTick = {
  id: string;
  price: number;
  tradedAt: number;
  change24h: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  priceFromTrade: boolean;
};

function mergeTick(existing: LiveTick | undefined, tick: LiveTick): LiveTick {
  if (existing?.priceFromTrade && !tick.priceFromTrade && existing.tradedAt >= tick.tradedAt) {
    return {
      ...tick,
      price: existing.price,
      tradedAt: existing.tradedAt,
      priceFromTrade: true,
    };
  }
  if (existing && tick.priceFromTrade) {
    return {
      ...existing,
      price: tick.price,
      tradedAt: tick.tradedAt,
      priceFromTrade: true,
    };
  }
  return tick;
}

function isTick(value: unknown): value is LiveTick {
  if (!value || typeof value !== "object") return false;
  const tick = value as Partial<LiveTick>;
  return (
    typeof tick.id === "string" &&
    typeof tick.price === "number" &&
    tick.price > 0 &&
    typeof tick.tradedAt === "number" &&
    Number.isFinite(tick.tradedAt) &&
    typeof tick.priceFromTrade === "boolean"
  );
}

export function subscribeTicker(onTicks: (ticks: LiveTick[]) => void): {
  setCoins: (coinIds: readonly string[]) => void;
  close: () => void;
} {
  let source: EventSource | null = null;
  let closed = false;
  let frame = 0;
  let currentKey = "";
  const pending = new Map<string, LiveTick>();
  let wanted = new Set<string>();

  function flush() {
    frame = 0;
    if (pending.size === 0) return;
    onTicks([...pending.values()]);
    pending.clear();
  }

  function queue(tick: LiveTick) {
    pending.set(tick.id, mergeTick(pending.get(tick.id), tick));
    if (frame === 0) frame = window.requestAnimationFrame(flush);
  }

  function listen(key: string) {
    source?.close();
    source = null;
    wanted = new Set(key ? key.split(",") : []);
    if (closed || key.length === 0) return;
    const next = new EventSource(`/api/live?ids=${encodeURIComponent(key)}`);
    source = next;
    next.onmessage = (event) => {
      if (closed || source !== next) return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!Array.isArray(payload)) return;
      for (const item of payload) {
        if (!isTick(item) || !wanted.has(item.id)) continue;
        queue(item);
      }
    };
  }

  return {
    setCoins(coinIds: readonly string[]) {
      const key = [...new Set(coinIds)].filter((id) => id.length > 0).sort().join(",");
      if (key === currentKey) return;
      currentKey = key;
      listen(key);
    },
    close() {
      if (closed) return;
      closed = true;
      currentKey = "";
      source?.close();
      source = null;
      if (frame) window.cancelAnimationFrame(frame);
    },
  };
}
