import type { LiveTick } from "@/lib/live-ticker";
import { COINS, getCoin } from "@/lib/coins";

const STREAM_URL = "wss://data-stream.binance.vision/ws";
const HUB_VERSION = 1;
const idBySymbol = new Map(COINS.map((coin) => [`${coin.symbol}USDT`, coin.id]));

type Sink = {
  ids: ReadonlySet<string>;
  onTicks: (ticks: LiveTick[]) => void;
  pending: Map<string, LiveTick>;
  timer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
};

type Hub = {
  version: number;
  refs: Map<string, number>;
  sinks: Set<Sink>;
  socket: WebSocket | null;
  active: Set<string>;
  attempt: number;
  retry: ReturnType<typeof setTimeout> | null;
  nextId: number;
};

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

function streamsFor(hub: Hub): string[] {
  const params: string[] = [];
  for (const [id, count] of hub.refs) {
    if (count <= 0) continue;
    const coin = getCoin(id);
    if (!coin) continue;
    const symbol = `${coin.symbol.toLowerCase()}usdt`;
    params.push(`${symbol}@trade`, `${symbol}@miniTicker`);
  }
  params.sort();
  return params;
}

function send(hub: Hub, method: "SUBSCRIBE" | "UNSUBSCRIBE", params: string[]) {
  const socket = hub.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN || params.length === 0) return;
  socket.send(JSON.stringify({ method, params, id: hub.nextId }));
  hub.nextId += 1;
}

function applyDiff(hub: Hub, wanted: string[]) {
  const want = new Set(wanted);
  const add = wanted.filter((stream) => !hub.active.has(stream));
  const remove = [...hub.active].filter((stream) => !want.has(stream));
  send(hub, "SUBSCRIBE", add);
  send(hub, "UNSUBSCRIBE", remove);
  for (const stream of add) hub.active.add(stream);
  for (const stream of remove) hub.active.delete(stream);
}

function shutdown(hub: Hub) {
  if (hub.retry) {
    clearTimeout(hub.retry);
    hub.retry = null;
  }
  hub.active.clear();
  const socket = hub.socket;
  hub.socket = null;
  if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
}

function scheduleRetry(hub: Hub) {
  if (hub.retry) return;
  const delay = Math.min(10_000, 1000 * 2 ** hub.attempt);
  hub.attempt += 1;
  hub.retry = setTimeout(() => {
    hub.retry = null;
    if (hub.refs.size === 0) return;
    connect(hub);
  }, delay);
}

function connect(hub: Hub) {
  if (hub.socket && hub.socket.readyState !== WebSocket.CLOSED) return;
  let next: WebSocket;
  try {
    next = new WebSocket(STREAM_URL);
  } catch {
    scheduleRetry(hub);
    return;
  }
  hub.socket = next;
  hub.active.clear();

  next.addEventListener("open", () => {
    if (hub.socket !== next) return;
    hub.attempt = 0;
    applyDiff(hub, streamsFor(hub));
  });

  next.addEventListener("message", (event) => {
    if (hub.socket !== next || typeof event.data !== "string") return;
    let payload: unknown;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    publishPayload(hub, payload);
  });

  next.addEventListener("close", () => {
    if (hub.socket !== next) return;
    hub.socket = null;
    hub.active.clear();
    if (hub.refs.size === 0) return;
    scheduleRetry(hub);
  });
}

function sync(hub: Hub) {
  const wanted = streamsFor(hub);
  if (wanted.length === 0) {
    shutdown(hub);
    return;
  }
  if (!hub.socket || hub.socket.readyState === WebSocket.CLOSED) {
    connect(hub);
    return;
  }
  if (hub.socket.readyState !== WebSocket.OPEN) return;
  applyDiff(hub, wanted);
}

function publish(hub: Hub, tick: LiveTick) {
  for (const sink of hub.sinks) {
    if (sink.closed || !sink.ids.has(tick.id)) continue;
    sink.pending.set(tick.id, mergeTick(sink.pending.get(tick.id), tick));
    if (sink.timer != null) continue;
    sink.timer = setTimeout(() => {
      sink.timer = null;
      if (sink.closed || sink.pending.size === 0) return;
      const ticks = [...sink.pending.values()];
      sink.pending.clear();
      sink.onTicks(ticks);
    }, 50);
  }
}

function publishPayload(hub: Hub, payload: unknown) {
  if (Array.isArray(payload)) {
    for (const item of payload) publishPayload(hub, item);
    return;
  }
  for (const tick of readPayload(payload)) publish(hub, tick);
}

function createHub(): Hub {
  return {
    version: HUB_VERSION,
    refs: new Map(),
    sinks: new Set(),
    socket: null,
    active: new Set(),
    attempt: 0,
    retry: null,
    nextId: 1,
  };
}

function getHub(): Hub {
  const slot = globalThis as { __folioBinance?: Hub };
  const current = slot.__folioBinance;
  if (current?.version === HUB_VERSION) return current;
  if (current) shutdown(current);
  const created = createHub();
  slot.__folioBinance = created;
  return created;
}

function retain(hub: Hub, id: string) {
  hub.refs.set(id, (hub.refs.get(id) ?? 0) + 1);
}

function release(hub: Hub, id: string) {
  const next = (hub.refs.get(id) ?? 0) - 1;
  if (next <= 0) hub.refs.delete(id);
  else hub.refs.set(id, next);
}

export function watchTicks(ids: readonly string[], onTicks: (ticks: LiveTick[]) => void): () => void {
  const hub = getHub();
  const sink: Sink = {
    ids: new Set(ids),
    onTicks,
    pending: new Map(),
    timer: null,
    closed: false,
  };
  hub.sinks.add(sink);
  for (const id of sink.ids) retain(hub, id);
  sync(hub);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    sink.closed = true;
    if (sink.timer) clearTimeout(sink.timer);
    hub.sinks.delete(sink);
    for (const id of sink.ids) release(hub, id);
    sync(hub);
  };
}
