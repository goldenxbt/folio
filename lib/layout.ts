import { getCoin, getInterval, getSpan, legacyRange, type IntervalId, type SpanId } from "@/lib/coins";

export const MAX_CHARTS = 4;
export const LAYOUT_KEY = "folio-layout-v1";
export const MIN_PANEL_HEIGHT = 320;
export const MAX_PANEL_HEIGHT = 2400;

export type ChartMode = "candle" | "line";

export type ChartSlot = {
  id: string;
  coinId: string;
  interval: IntervalId;
  span: SpanId;
  mode: ChartMode;
  versusId: string | null;
};

export function clampPanelHeight(height: number): number {
  return Math.round(Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, height)));
}

export type Layout = {
  charts: ChartSlot[];
  activeId: string;
  sidebarOpen: boolean;
  panelHeight: number | null;
};

export function marketKey(coinId: string, versusId: string | null): string {
  return `${coinId}:${versusId ?? "usd"}`;
}

export function defaultLayout(): Layout {
  return {
    charts: [
      {
        id: "btc",
        coinId: "bitcoin",
        interval: "1m",
        span: "1H",
        mode: "candle",
        versusId: null,
      },
    ],
    activeId: "btc",
    sidebarOpen: true,
    panelHeight: null,
  };
}

export function sanitizeLayout(value: unknown): Layout {
  const fallback = defaultLayout();
  if (!value || typeof value !== "object") return fallback;

  const raw = value as {
    charts?: unknown;
    activeId?: unknown;
    sidebarOpen?: unknown;
    panelHeight?: unknown;
  };
  if (!Array.isArray(raw.charts)) return fallback;

  const charts: ChartSlot[] = [];
  const seen = new Set<string>();
  let legacyHeight: number | null = null;
  for (const item of raw.charts) {
    if (!item || typeof item !== "object") continue;
    const slot = item as Partial<ChartSlot> & { range?: unknown; height?: unknown };
    if (typeof slot.id !== "string" || slot.id.length > 80) continue;
    if (typeof slot.coinId !== "string" || !getCoin(slot.coinId)) continue;
    const view = readWindow(slot);
    if (!view) continue;
    if (slot.mode !== "candle" && slot.mode !== "line") continue;
    const versusId =
      typeof slot.versusId === "string" &&
      slot.versusId !== slot.coinId &&
      getCoin(slot.versusId)
        ? slot.versusId
        : null;
    const key = marketKey(slot.coinId, versusId);
    if (seen.has(key)) continue;
    seen.add(key);
    if (legacyHeight == null) legacyHeight = readHeight(slot.height);
    charts.push({
      id: slot.id,
      coinId: slot.coinId,
      interval: view.interval,
      span: view.span,
      mode: slot.mode,
      versusId,
    });
    if (charts.length === MAX_CHARTS) break;
  }

  if (charts.length === 0) return fallback;
  if (
    charts.length === 1 &&
    charts[0].id === "btc" &&
    charts[0].coinId === "bitcoin" &&
    charts[0].interval === "15m" &&
    charts[0].span === "1D" &&
    charts[0].mode === "candle" &&
    charts[0].versusId === null
  ) {
    charts[0] = { ...charts[0], interval: "1m", span: "1H" };
  }
  const activeId = charts.some((chart) => chart.id === raw.activeId)
    ? (raw.activeId as string)
    : charts[0].id;
  return {
    charts,
    activeId,
    sidebarOpen: raw.sidebarOpen !== false,
    panelHeight: readHeight(raw.panelHeight) ?? legacyHeight,
  };
}

function readHeight(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < MIN_PANEL_HEIGHT || value > MAX_PANEL_HEIGHT) return null;
  return Math.round(value);
}

function readWindow(slot: { interval?: unknown; span?: unknown; range?: unknown }): {
  interval: IntervalId;
  span: SpanId;
} | null {
  if (typeof slot.interval === "string" && typeof slot.span === "string") {
    const interval = getInterval(slot.interval);
    const span = getSpan(slot.span);
    if (interval && span) return { interval: interval.id, span: span.id };
  }
  if (typeof slot.range === "string") return legacyRange(slot.range);
  return null;
}

const LAYOUT_EVENT = "folio-layout";

let cachedLayout = "";

export function subscribeLayout(onStoreChange: () => void): () => void {
  window.addEventListener(LAYOUT_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(LAYOUT_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function readLayoutSnapshot(): string {
  const next = localStorage.getItem(LAYOUT_KEY) ?? "";
  if (next !== cachedLayout) cachedLayout = next;
  return cachedLayout;
}

export function emptyLayoutSnapshot(): string {
  return "";
}

export function parseStoredLayout(raw: string): Layout {
  if (!raw) return defaultLayout();
  try {
    return sanitizeLayout(JSON.parse(raw));
  } catch {
    return defaultLayout();
  }
}

export function writeLayout(layout: Layout) {
  const raw = JSON.stringify(layout);
  localStorage.setItem(LAYOUT_KEY, raw);
  cachedLayout = raw;
  window.dispatchEvent(new Event(LAYOUT_EVENT));
}
