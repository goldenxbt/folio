"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTrade, mergeCandles } from "@/lib/candles";
import {
  COINS,
  INTERVALS,
  SPANS,
  getCoin,
  getInterval,
  getSpan,
  intervalShowsClock,
  type IntervalId,
  type SpanId,
} from "@/lib/coins";
import {
  formatBarTime,
  formatCompactUsd,
  formatPercent,
  formatRatio,
  formatSignedRatio,
  formatSignedUsd,
  formatUsd,
  toneClass,
} from "@/lib/format";
import {
  MAX_PANEL_HEIGHT,
  MIN_PANEL_HEIGHT,
  clampPanelHeight,
  marketKey,
  type ChartMode,
} from "@/lib/layout";
import type { Candle, MarketSource, Quote } from "@/lib/types";
import { cn } from "@/lib/utils";

const PriceChart = dynamic(
  () => import("@/components/price-chart").then((mod) => mod.PriceChart),
  {
    ssr: false,
    loading: () => <div className="h-full min-h-0 w-full animate-pulse bg-muted/60" />,
  },
);

const SOURCE_NAME: Record<MarketSource, string> = {
  kraken: "Kraken",
  coinbase: "Coinbase",
  coingecko: "CoinGecko",
};

type ChartPanelProps = {
  id: string;
  coinId: string;
  versusId: string | null;
  interval: IntervalId;
  span: SpanId;
  mode: ChartMode;
  height: number | null;
  fillsScreen: boolean;
  compact: boolean;
  canClose: boolean;
  showSelected: boolean;
  quote: Quote | null;
  versusQuote: Quote | null;
  onActivate: () => void;
  onClose: () => void;
  onInterval: (interval: IntervalId) => void;
  onSpan: (span: SpanId) => void;
  onMode: (mode: ChartMode) => void;
  onPreviewHeight: (height: number | null) => void;
  onHeight: (height: number | null) => void;
  onVersus: (versusId: string | null) => void;
  occupiedKeys: string[];
};

type CandleState = {
  key: string;
  candles: Candle[] | null;
  source: MarketSource | null;
  intervalName: string;
  loading: boolean;
  error: string | null;
  exhausted: boolean;
  loadingOlder: boolean;
};

function rangeExtremes(candles: Candle[] | null): { high: number; low: number } | null {
  if (!candles || candles.length === 0) return null;
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  for (const candle of candles) {
    if (candle.high > high) high = candle.high;
    if (candle.low < low) low = candle.low;
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  return { high, low };
}

function rangeMove(candles: Candle[] | null): { usd: number; percent: number } | null {
  if (!candles || candles.length < 2) return null;
  const start = candles[0].open;
  const end = candles[candles.length - 1].close;
  if (!Number.isFinite(start) || start === 0) return null;
  const usd = end - start;
  return { usd, percent: (usd / start) * 100 };
}

function parseCandles(value: unknown): Candle[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const candles: Candle[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Partial<Candle>;
    const numbers = [row.time, row.open, row.high, row.low, row.close, row.volume];
    if (!numbers.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
      return null;
    }
    candles.push({
      time: row.time as number,
      open: row.open as number,
      high: row.high as number,
      low: row.low as number,
      close: row.close as number,
      volume: row.volume as number,
    });
  }
  return candles;
}

const choiceClass =
  "shrink-0 border-b-2 pb-px text-sm leading-none hover:text-foreground";

function TextChoice({
  checked,
  label,
  onSelect,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className={cn(
        choiceClass,
        checked ? "border-foreground text-foreground" : "border-transparent text-muted-foreground",
      )}
      onClick={(event) => {
        event.stopPropagation();
        const row = event.currentTarget.closest<HTMLElement>("[data-choice-row]");
        if (row) {
          const item = event.currentTarget.getBoundingClientRect();
          const box = row.getBoundingClientRect();
          if (item.left < box.left) row.scrollLeft -= box.left - item.left;
          else if (item.right > box.right) row.scrollLeft += item.right - box.right;
        }
        onSelect();
      }}
    >
      {label}
    </button>
  );
}

const groupLabelClass =
  "shrink-0 border-b-2 border-transparent pb-px text-sm leading-none font-medium tracking-[0.14em] text-muted-foreground uppercase";

function ChoiceRow({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () => {
      const max = node.scrollWidth - node.clientWidth;
      const next = { left: node.scrollLeft > 1, right: max - node.scrollLeft > 1 };
      setEdges((current) =>
        current.left === next.left && current.right === next.right ? current : next,
      );
    };
    measure();
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const onWheel = (event: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("scroll", measure);
      node.removeEventListener("wheel", onWheel);
      observer.disconnect();
    };
  }, []);

  const overflow = edges.left || edges.right;

  function scrollBy(distance: number) {
    scroller.current?.scrollBy({ left: distance, behavior: "smooth" });
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {overflow ? (
        <button
          type="button"
          aria-label="Earlier options"
          disabled={!edges.left}
          className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={(event) => {
            event.stopPropagation();
            scrollBy(-160);
          }}
        >
          <ChevronLeft className="size-3.5" />
        </button>
      ) : null}
      <div
        ref={scroller}
        data-choice-row=""
        className="flex min-w-0 flex-1 items-baseline gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {overflow ? (
        <button
          type="button"
          aria-label="Later options"
          disabled={!edges.right}
          className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={(event) => {
            event.stopPropagation();
            scrollBy(160);
          }}
        >
          <ChevronRight className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tight }: { label: string; value: string; tight?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className={cn("text-sm font-medium tabular-nums", tight ? "mt-0.5" : "mt-1")}>{value}</dd>
    </div>
  );
}

export function ChartPanel({
  id,
  coinId,
  versusId,
  interval,
  span,
  mode,
  height,
  fillsScreen,
  compact,
  canClose,
  showSelected,
  quote,
  versusQuote,
  onActivate,
  onClose,
  onInterval,
  onSpan,
  onMode,
  onPreviewHeight,
  onHeight,
  onVersus,
  occupiedKeys,
}: ChartPanelProps) {
  const coin = getCoin(coinId);
  const versus = versusId ? getCoin(versusId) : null;
  const intervalSpec = getInterval(interval);
  const spanSpec = getSpan(span);
  const [retry, setRetry] = useState(0);
  const [hover, setHover] = useState<Candle | null>(null);
  const requestKey = `${coinId}:${versus?.id ?? "usd"}:${interval}:${retry}`;
  const [state, setState] = useState<CandleState>({
    key: "",
    candles: null,
    source: null,
    intervalName: "",
    loading: true,
    error: null,
    exhausted: false,
    loadingOlder: false,
  });
  const olderRef = useRef<AbortController | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const dragOrigin = useRef<{ y: number; height: number } | null>(null);

  if (state.key !== requestKey) {
    setState({
      key: requestKey,
      candles: null,
      source: null,
      intervalName: "",
      loading: true,
      error: null,
      exhausted: false,
      loadingOlder: false,
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    let hasData = false;

    async function load(replace: boolean) {
      try {
        const params = new URLSearchParams({ coin: coinId, interval, span });
        if (versus?.id) params.set("versus", versus.id);
        const response = await fetch(`/api/candles?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("unavailable");
        const body = (await response.json()) as {
          candles?: unknown;
          source?: MarketSource;
          interval?: string;
        };
        if (controller.signal.aborted) return;
        const candles = parseCandles(body.candles);
        if (!candles) throw new Error("invalid");
        hasData = true;
        setState((current) => {
          if (current.key !== requestKey) return current;
          return {
            ...current,
            candles: replace || !current.candles ? candles : mergeCandles(current.candles, candles),
            source: body.source ?? current.source,
            intervalName: typeof body.interval === "string" ? body.interval : current.intervalName,
            loading: false,
            error: null,
          };
        });
      } catch {
        if (controller.signal.aborted || hasData) return;
        setState((current) => {
          if (current.key !== requestKey || current.candles) return current;
          return {
            ...current,
            loading: false,
            error: versus
              ? "Couldn’t load candles for this pair."
              : "Couldn’t load candles for this market.",
          };
        });
      }
    }

    void load(false);
    const timer = window.setInterval(() => void load(false), 20_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      olderRef.current?.abort();
      olderRef.current = null;
    };
  }, [coinId, interval, requestKey, span, versus]);

  const loadOlder = useMemo(() => {
    return () => {
      const loaded = state.candles;
      const first = loaded?.[0];
      if (!loaded || !first || state.exhausted || state.loadingOlder || olderRef.current) return;
      if (loaded.length >= 12_000) return;
      const controller = new AbortController();
      olderRef.current = controller;
      setState((current) => ({ ...current, loadingOlder: true }));

      const params = new URLSearchParams({
        coin: coinId,
        interval,
        before: String(first.time),
      });
      if (versus?.id) params.set("versus", versus.id);

      void fetch(`/api/candles?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("unavailable");
          const body = (await response.json()) as { candles?: unknown };
          const older = parseCandles(body.candles) ?? [];
          if (controller.signal.aborted) return;
          setState((current) => {
            if (current.key !== requestKey || !current.candles) return current;
            const earliest = current.candles[0]?.time ?? first.time;
            const fresh = older.filter((candle) => candle.time < earliest);
            if (fresh.length === 0) {
              return { ...current, exhausted: true, loadingOlder: false };
            }
            return {
              ...current,
              candles: mergeCandles(fresh, current.candles),
              loadingOlder: false,
            };
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setState((current) =>
            current.key === requestKey ? { ...current, loadingOlder: false } : current,
          );
        })
        .finally(() => {
          if (olderRef.current === controller) olderRef.current = null;
        });
    };
  }, [coinId, interval, requestKey, state.candles, state.exhausted, state.loadingOlder, versus]);

  const livePrice =
    versus && quote?.price != null && versusQuote?.price != null && versusQuote.price > 0
      ? quote.price / versusQuote.price
      : versus
        ? null
        : (quote?.price ?? null);
  const tradeAt = Math.max(quote?.tradedAt ?? 0, versusQuote?.tradedAt ?? 0);
  const candles = useMemo(() => {
    if (!state.candles || livePrice == null || !intervalSpec) return state.candles;
    const stamp = tradeAt > 0 ? tradeAt : (state.candles.at(-1)?.time ?? 0);
    return applyTrade(state.candles, livePrice, stamp, intervalSpec.seconds);
  }, [intervalSpec, livePrice, state.candles, tradeAt]);
  const visibleCandles = useMemo(() => {
    if (!candles || !spanSpec) return candles;
    const end = candles[candles.length - 1]?.time;
    if (end == null) return candles;
    const sliced = candles.filter((candle) => candle.time >= end - spanSpec.windowSec);
    return sliced.length >= 2 ? sliced : candles;
  }, [candles, spanSpec]);
  const move = rangeMove(visibleCandles);
  const extremes = rangeExtremes(visibleCandles);
  const price = livePrice ?? candles?.at(-1)?.close ?? null;
  const showTime = intervalShowsClock(interval);
  const formatValue = versus ? formatRatio : formatUsd;
  const formatSigned = versus ? formatSignedRatio : formatSignedUsd;

  if (!coin) return null;

  const title = versus ? `${coin.symbol}/${versus.symbol}` : coin.name;
  const occupied = new Set(occupiedKeys);
  const resolved = height;
  const statistics = versus ? (
    <>
      <Stat
        tight={compact}
        label={`${spanSpec?.label ?? span} high`}
        value={extremes ? formatRatio(extremes.high) : "—"}
      />
      <Stat
        tight={compact}
        label={`${spanSpec?.label ?? span} low`}
        value={extremes ? formatRatio(extremes.low) : "—"}
      />
      <Stat
        tight={compact}
        label={coin.symbol}
        value={quote?.price == null ? "—" : formatUsd(quote.price)}
      />
      <Stat
        tight={compact}
        label={versus.symbol}
        value={versusQuote?.price == null ? "—" : formatUsd(versusQuote.price)}
      />
    </>
  ) : (
    <>
      <Stat tight={compact} label="24h high" value={quote?.high24h == null ? "—" : formatUsd(quote.high24h)} />
      <Stat tight={compact} label="24h low" value={quote?.low24h == null ? "—" : formatUsd(quote.low24h)} />
      <Stat
        tight={compact}
        label="Volume"
        value={quote?.volume24h == null ? "—" : formatCompactUsd(quote.volume24h)}
      />
      <Stat
        tight={compact}
        label="Mkt cap"
        value={quote?.marketCap == null ? "—" : formatCompactUsd(quote.marketCap)}
      />
    </>
  );

  function resizeFrom(clientY: number) {
    const origin = dragOrigin.current;
    if (!origin) return null;
    return clampPanelHeight(origin.height + clientY - origin.y);
  }

  return (
    <section
      ref={sectionRef}
      id={`chart-${id}`}
      aria-label={`${title} price chart`}
      onClick={onActivate}
      onFocus={onActivate}
      style={resolved != null ? { height: resolved } : undefined}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border-b border-border bg-background md:border-r",
        resolved == null && (fillsScreen ? "h-dvh md:h-full" : "h-[50dvh]"),
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-start justify-between gap-3 px-4 md:px-5",
          compact ? "pt-3" : "pt-4",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className={cn("truncate font-semibold tracking-tight", compact ? "text-lg" : "text-xl")}>
              {title}
            </h2>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              Priced in
              <select
                aria-label={`Price ${coin.symbol} in`}
                value={versus?.id ?? "usd"}
                className="h-7 rounded-md border border-input bg-background px-1.5 text-sm text-foreground"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  const next = event.target.value;
                  onVersus(next === "usd" || next === coin.id ? null : next);
                }}
              >
                <option value="usd" disabled={occupied.has(marketKey(coin.id, null))}>
                  USD
                </option>
                {COINS.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={item.id === coin.id || occupied.has(marketKey(coin.id, item.id))}
                  >
                    {item.symbol}
                  </option>
                ))}
              </select>
            </label>
            {showSelected ? (
              <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                Selected
              </span>
            ) : null}
          </div>
          <div className={cn("@container flex gap-4", compact ? "mt-1.5 items-center justify-between" : "mt-2 flex-col")}>
            <div className="min-w-0">
              <p
                className={cn(
                  "leading-none font-medium tracking-tight tabular-nums",
                  compact ? "text-[1.75rem]" : "text-[2rem] md:text-[2.5rem]",
                )}
              >
                {price == null ? "—" : formatValue(price)}
              </p>
              <p className={cn("text-sm tabular-nums", compact ? "mt-1.5" : "mt-2", toneClass(move?.percent))}>
                {move ? (
                  <>
                    {formatPercent(move.percent)}
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    {formatSigned(move.usd)}
                  </>
                ) : (
                  "Waiting for the first candles"
                )}
                <span className="ml-2 text-muted-foreground">
                  {versus
                    ? `${versus.symbol} per 1 ${coin.symbol} · ${spanSpec?.label ?? span}`
                    : (spanSpec?.label ?? span)}
                </span>
              </p>
            </div>
            {compact ? (
              <dl className="grid max-w-[60%] shrink-0 grid-cols-2 gap-x-3 gap-y-1.5 text-right @[28rem]:grid-cols-4">
                {statistics}
              </dl>
            ) : null}
          </div>
        </div>
        {canClose ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Close ${coin.name} chart`}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            <X />
          </Button>
        ) : null}
      </div>

      {compact ? null : (
        <dl className="mt-4 grid shrink-0 grid-cols-2 gap-x-4 gap-y-3 px-4 sm:grid-cols-4 md:px-5">
          {statistics}
        </dl>
      )}

      <div
        className={cn(
          "flex shrink-0 min-w-0 items-center gap-3 px-4 md:px-5",
          compact ? "mt-2" : "mt-4",
        )}
      >
        <ChoiceRow>
          <span className={groupLabelClass}>Candle</span>
          <div
            role="radiogroup"
            aria-label={`${coin.name} candle size`}
            className="flex shrink-0 items-baseline gap-3"
          >
            {INTERVALS.map((item) => (
              <TextChoice
                key={item.id}
                checked={interval === item.id}
                label={item.label}
                onSelect={() => onInterval(item.id)}
              />
            ))}
          </div>
          <div aria-hidden="true" className="h-3.5 w-px shrink-0 self-center bg-border" />
          <span className={groupLabelClass}>Span</span>
          <div
            role="radiogroup"
            aria-label={`${coin.name} chart span`}
            className="flex shrink-0 items-baseline gap-3"
          >
            {SPANS.map((item) => (
              <TextChoice
                key={item.id}
                checked={span === item.id}
                label={item.label}
                onSelect={() => onSpan(item.id)}
              />
            ))}
          </div>
        </ChoiceRow>
        <div role="radiogroup" aria-label={`${coin.name} chart type`} className="ml-auto flex shrink-0 gap-4">
          {(
            [
              ["candle", "Candle"],
              ["line", "Line"],
            ] as const
          ).map(([value, label]) => (
            <TextChoice
              key={value}
              checked={mode === value}
              label={label}
              onSelect={() => onMode(value)}
            />
          ))}
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 px-2", compact ? "mt-2" : "mt-3")}>
        {state.loading ? (
          <div
            role="status"
            className="flex h-full items-center justify-center text-sm text-muted-foreground"
          >
            Loading {title} candles
          </div>
        ) : state.error || !candles ? (
          <div
            role="alert"
            className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <p className="text-sm text-foreground">{state.error ?? "No candles returned."}</p>
            <Button
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                setRetry((count) => count + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <PriceChart
            candles={candles}
            mode={mode}
            positive={(move?.percent ?? 0) >= 0}
            fitId={`${coinId}:${versus?.id ?? "usd"}`}
            interval={interval}
            span={span}
            showVolume={!versus}
            formatPrice={formatValue}
            historyDone={state.exhausted}
            onNeedHistory={loadOlder}
            onHover={setHover}
          />
        )}
      </div>

      <p className="flex min-h-8 shrink-0 items-center justify-between gap-3 px-4 py-2 text-xs text-muted-foreground tabular-nums md:px-5">
        {hover ? (
          <span>
            {formatBarTime(hover.time, showTime)}
            <span className="mx-2">O {formatValue(hover.open)}</span>
            <span className="mr-2">H {formatValue(hover.high)}</span>
            <span className="mr-2">L {formatValue(hover.low)}</span>
            <span>C {formatValue(hover.close)}</span>
          </span>
        ) : (
          <span>
            {state.loadingOlder
              ? "Loading older candles"
              : state.exhausted
                ? "No older candles"
                : `${state.intervalName || "Candles"} candles`}
            {state.source && !state.loadingOlder ? ` · ${SOURCE_NAME[state.source]}` : ""}
          </span>
        )}
        <span className="hidden sm:inline">Scroll to zoom</span>
      </p>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize ${title}`}
        aria-valuemin={MIN_PANEL_HEIGHT}
        aria-valuemax={MAX_PANEL_HEIGHT}
        aria-valuenow={resolved ?? undefined}
        tabIndex={0}
        title="Drag to resize. Double-click to fit."
        className="flex h-3 shrink-0 cursor-row-resize touch-none items-center justify-center"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const current =
            resolved ??
            event.currentTarget.parentElement?.getBoundingClientRect().height ??
            MIN_PANEL_HEIGHT;
          dragOrigin.current = { y: event.clientY, height: current };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const next = resizeFrom(event.clientY);
          if (next == null) return;
          onPreviewHeight(next);
        }}
        onPointerUp={(event) => {
          const origin = dragOrigin.current;
          if (!origin) return;
          const next = resizeFrom(event.clientY);
          dragOrigin.current = null;
          if (next == null || Math.abs(next - origin.height) < 2) {
            onPreviewHeight(null);
            return;
          }
          onHeight(next);
        }}
        onPointerCancel={() => {
          dragOrigin.current = null;
          onPreviewHeight(null);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragOrigin.current = null;
          onHeight(null);
        }}
        onKeyDown={(event) => {
          const current = resolved ?? sectionRef.current?.getBoundingClientRect().height ?? 0;
          if (current <= 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onHeight(clampPanelHeight(current + 24));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            onHeight(clampPanelHeight(current - 24));
          } else if (event.key === "Home") {
            event.preventDefault();
            onHeight(null);
          }
        }}
      >
        <span className="h-1 w-8 rounded-full bg-border" />
      </div>
    </section>
  );
}
