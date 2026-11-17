import { COINS } from "@/lib/coins";

export type LiveTick = {
  id: string;
  price: number;
  change24h: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
};

const STREAM_URL = "wss://ws.kraken.com/v2";
const idBySymbol = new Map(COINS.map((coin) => [`${coin.symbol}/USD`, coin.id]));

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readTicks(payload: unknown): LiveTick[] {
  if (!payload || typeof payload !== "object") return [];
  const message = payload as { channel?: unknown; data?: unknown };
  if (message.channel !== "ticker" || !Array.isArray(message.data)) return [];

  const ticks: LiveTick[] = [];
  for (const item of message.data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.symbol === "string" ? idBySymbol.get(row.symbol) : undefined;
    const price = asNumber(row.last);
    if (!id || price == null || price <= 0) continue;
    const volume = asNumber(row.volume);
    ticks.push({
      id,
      price,
      change24h: asNumber(row.change_pct),
      high24h: asNumber(row.high),
      low24h: asNumber(row.low),
      volume24h: volume == null ? null : volume * price,
    });
  }
  return ticks;
}

export function subscribeTicker(onTicks: (ticks: LiveTick[]) => void): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer = 0;
  let flushTimer = 0;
  const pending = new Map<string, LiveTick>();

  function flush() {
    flushTimer = 0;
    if (pending.size === 0) return;
    onTicks([...pending.values()]);
    pending.clear();
  }

  function connect() {
    if (closed) return;
    const next = new WebSocket(STREAM_URL);
    socket = next;

    next.addEventListener("open", () => {
      attempt = 0;
      next.send(
        JSON.stringify({
          method: "subscribe",
          params: {
            channel: "ticker",
            symbol: COINS.map((coin) => `${coin.symbol}/USD`),
          },
        }),
      );
    });

    next.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      for (const tick of readTicks(payload)) pending.set(tick.id, tick);
      if (pending.size > 0 && flushTimer === 0) {
        flushTimer = window.setTimeout(flush, 250);
      }
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
    window.clearTimeout(flushTimer);
    socket?.close();
  };
}
