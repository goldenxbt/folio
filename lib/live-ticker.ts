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
const coinById = new Map(COINS.map((coin) => [coin.id, coin]));
const idBySymbol = new Map(COINS.map((coin) => [`${coin.symbol}USDT`, coin.id]));

function streamNames(coinIds: readonly string[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const id of coinIds) {
    const coin = coinById.get(id);
    if (!coin) continue;
    const symbol = `${coin.symbol.toLowerCase()}usdt`;
    for (const stream of [`${symbol}@trade`, `${symbol}@miniTicker`]) {
      if (seen.has(stream)) continue;
      seen.add(stream);
      names.push(stream);
    }
  }
  return names;
}

function sameStreams(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const seen = new Set(left);
  return right.every((name) => seen.has(name));
}

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

export function subscribeTicker(onTicks: (ticks: LiveTick[]) => void): {
  setCoins: (coinIds: readonly string[]) => void;
  close: () => void;
} {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer = 0;
  let frame = 0;
  let requestId = 1;
  let desired: string[] = [];
  let active = new Set<string>();
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

  function send(method: "SUBSCRIBE" | "UNSUBSCRIBE", params: string[]) {
    if (params.length === 0 || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ method, params, id: requestId }));
    requestId += 1;
  }

  function sync() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const wanted = new Set(desired);
    const remove = [...active].filter((name) => !wanted.has(name));
    const add = desired.filter((name) => !active.has(name));
    send("UNSUBSCRIBE", remove);
    send("SUBSCRIBE", add);
    active = wanted;
  }

  function connect() {
    if (closed || desired.length === 0) return;
    const next = new WebSocket(STREAM_URL);
    socket = next;

    next.addEventListener("open", () => {
      if (closed || socket !== next) return;
      attempt = 0;
      active = new Set();
      if (desired.length === 0) return;
      sync();
    });

    next.addEventListener("message", (event) => {
      if (closed || socket !== next || typeof event.data !== "string") return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      for (const tick of readPayload(payload)) queue(tick);
    });

    next.addEventListener("close", () => {
      if (socket !== next) return;
      active = new Set();
      socket = null;
      if (closed || desired.length === 0) return;
      const delay = Math.min(10_000, 1000 * 2 ** attempt);
      attempt += 1;
      retryTimer = window.setTimeout(connect, delay);
    });
  }

  function setCoins(coinIds: readonly string[]) {
    const next = streamNames(coinIds);
    if (sameStreams(desired, next)) return;
    desired = next;
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      if (desired.length === 0) return;
      connect();
      return;
    }
    sync();
  }

  return {
    setCoins,
    close() {
      closed = true;
      window.clearTimeout(retryTimer);
      if (frame) window.cancelAnimationFrame(frame);
      socket?.close();
    },
  };
}
