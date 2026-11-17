import { COINS } from "@/lib/coins";

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

const STREAM_URL = "wss://data-stream.binance.vision/ws";
const idBySymbol = new Map(COINS.map((coin) => [`${coin.symbol}USDT`, coin.id]));

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asEpochSec(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value / 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed / 1000;
  }
  return null;
}

function readPayload(payload: unknown): LiveTick[] {
  if (!payload || typeof payload !== "object") return [];
  const message = payload as Record<string, unknown>;
  if (message.data && typeof message.data === "object") return readPayload(message.data);
  const id = typeof message.s === "string" ? idBySymbol.get(message.s) : undefined;
  if (!id) return [];

  if (message.e === "trade") {
    const price = asNumber(message.p);
    const tradedAt = asEpochSec(message.T);
    if (price == null || price <= 0 || tradedAt == null) return [];
    return [{
      id,
      price,
      tradedAt,
      change24h: null,
      high24h: null,
      low24h: null,
      volume24h: null,
      priceFromTrade: true,
    }];
  }

  if (message.e !== "24hrMiniTicker") return [];
  const price = asNumber(message.c);
  const open = asNumber(message.o);
  const tradedAt = asEpochSec(message.E);
  if (price == null || price <= 0 || tradedAt == null) return [];
  return [{
    id,
    price,
    tradedAt,
    change24h: open != null && open > 0 ? ((price - open) / open) * 100 : null,
    high24h: asNumber(message.h),
    low24h: asNumber(message.l),
    volume24h: asNumber(message.q),
    priceFromTrade: false,
  }];
}

export function subscribeTicker(onTicks: (ticks: LiveTick[]) => void): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer = 0;
  let frame = 0;
  const pending = new Map<string, LiveTick>();

  function flush() {
    frame = 0;
    if (pending.size === 0) return;
    onTicks([...pending.values()]);
    pending.clear();
  }

  function queue(tick: LiveTick) {
    const existing = pending.get(tick.id);
    if (existing?.priceFromTrade && !tick.priceFromTrade && existing.tradedAt >= tick.tradedAt) {
      pending.set(tick.id, {
        ...tick,
        price: existing.price,
        tradedAt: existing.tradedAt,
        priceFromTrade: true,
      });
    } else if (existing && tick.priceFromTrade) {
      pending.set(tick.id, {
        ...existing,
        price: tick.price,
        tradedAt: tick.tradedAt,
        priceFromTrade: true,
      });
    } else {
      pending.set(tick.id, tick);
    }
    if (frame === 0) frame = window.requestAnimationFrame(flush);
  }

  function connect() {
    if (closed) return;
    const next = new WebSocket(STREAM_URL);
    socket = next;

    next.addEventListener("open", () => {
      attempt = 0;
      const params = COINS.flatMap((coin) => {
        const symbol = `${coin.symbol.toLowerCase()}usdt`;
        return [`${symbol}@trade`, `${symbol}@miniTicker`];
      });
      next.send(JSON.stringify({ method: "SUBSCRIBE", params, id: 1 }));
    });

    next.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      for (const tick of readPayload(payload)) queue(tick);
    });

    next.addEventListener("close", () => {
      if (closed || socket !== next) return;
      const delay = Math.min(10_000, 1000 * 2 ** attempt);
      attempt += 1;
      retryTimer = window.setTimeout(connect, delay);
    });
  }

  connect();

  return () => {
    closed = true;
    window.clearTimeout(retryTimer);
    if (frame) window.cancelAnimationFrame(frame);
    socket?.close();
  };
}
