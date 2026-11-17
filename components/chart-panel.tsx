"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
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
import { marketKey, type ChartMode } from "@/lib/layout";
import type { Candle, MarketSource, Quote } from "@/lib/types";
import { cn } from "@/lib/utils";

const PriceChart = dynamic(
  () => import("@/components/price-chart").then((mod) => mod.PriceChart),
  {
    ssr: false,
    loading: () => <div className="h-full min-h-[280px] w-full animate-pulse bg-muted/60" />,
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
  active: boolean;
  canClose: boolean;
  showSelected: boolean;
  marketsInset: boolean;
  quote: Quote | null;
  versusQuote: Quote | null;
  onActivate: () => void;
  onClose: () => void;
  onInterval: (interval: IntervalId) => void;
  onSpan: (span: SpanId) => void;
  onMode: (mode: ChartMode) => void;
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
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
  active,
  canClose,
  showSelected,
  marketsInset,
  quote,
  versusQuote,
  onActivate,
  onClose,
  onInterval,
  onSpan,
  onMode,
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

  return (
    <section
      id={`chart-${id}`}
      aria-label={`${title} price chart`}
      onClick={onActivate}
      onFocus={onActivate}
      className={cn(
        "flex h-auto min-h-[580px] flex-col border-b border-border bg-background md:h-full md:min-h-0 md:border-r",
        active && "shadow-[inset_0_2px_0_var(--foreground)]",
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-3 px-4 pt-4 md:px-5",
          marketsInset && "md:pl-14",
        )}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="truncate text-xl font-semibold tracking-tight">{title}</h2>
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
          <p className="mt-2 text-[2rem] leading-none font-medium tracking-tight tabular-nums md:text-[2.5rem]">
            {price == null ? "—" : formatValue(price)}
          </p>
          <p className={cn("mt-2 text-sm tabular-nums", toneClass(move?.percent))}>
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

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 px-4 sm:grid-cols-4 md:px-5">
        {versus ? (
          <>
            <Stat
              label={`${spanSpec?.label ?? span} high`}
              value={extremes ? formatRatio(extremes.high) : "—"}
            />
            <Stat
              label={`${spanSpec?.label ?? span} low`}
              value={extremes ? formatRatio(extremes.low) : "—"}
            />
            <Stat
              label={coin.symbol}
              value={quote?.price == null ? "—" : formatUsd(quote.price)}
            />
            <Stat
              label={versus.symbol}
              value={versusQuote?.price == null ? "—" : formatUsd(versusQuote.price)}
            />
          </>
        ) : (
          <>
            <Stat label="24h high" value={quote?.high24h == null ? "—" : formatUsd(quote.high24h)} />
            <Stat label="24h low" value={quote?.low24h == null ? "—" : formatUsd(quote.low24h)} />
            <Stat
              label="Volume"
              value={quote?.volume24h == null ? "—" : formatCompactUsd(quote.volume24h)}
            />
            <Stat
              label="Mkt cap"
              value={quote?.marketCap == null ? "—" : formatCompactUsd(quote.marketCap)}
            />
          </>
        )}
      </dl>

      <div className="mt-4 flex min-w-0 items-center gap-4 px-4 md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
          <span className="shrink-0 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Candle
          </span>
          <div
            role="radiogroup"
            aria-label={`${coin.name} candle size`}
            className="flex shrink-0 gap-3"
          >
            {INTERVALS.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                size="xs"
                role="radio"
                aria-checked={interval === item.id}
                className={cn(
                  "h-auto shrink-0 rounded-none px-0 text-sm hover:bg-transparent",
                  interval === item.id
                    ? "text-foreground underline decoration-2 underline-offset-[7px]"
                    : "text-muted-foreground",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onInterval(item.id);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <span aria-hidden="true" className="shrink-0 px-0.5 text-muted-foreground">
            |
          </span>
          <span className="shrink-0 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Span
          </span>
          <div
            role="radiogroup"
            aria-label={`${coin.name} chart span`}
            className="flex shrink-0 gap-3"
          >
            {SPANS.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                size="xs"
                role="radio"
                aria-checked={span === item.id}
                className={cn(
                  "h-auto shrink-0 rounded-none px-0 text-sm hover:bg-transparent",
                  span === item.id
                    ? "text-foreground underline decoration-2 underline-offset-[7px]"
                    : "text-muted-foreground",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onSpan(item.id);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        <div role="radiogroup" aria-label={`${coin.name} chart type`} className="flex shrink-0 gap-4">
          {(
            [
              ["candle", "Candle"],
              ["line", "Line"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant="ghost"
              size="xs"
              role="radio"
              aria-checked={mode === value}
              className={cn(
                "h-auto rounded-none px-0 text-sm hover:bg-transparent",
                mode === value
                  ? "text-foreground underline decoration-2 underline-offset-[7px]"
                  : "text-muted-foreground",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onMode(value);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-3 min-h-[280px] flex-1 px-2">
        {state.loading ? (
          <div
            role="status"
            className="flex h-full min-h-[280px] items-center justify-center text-sm text-muted-foreground"
          >
            Loading {title} candles
          </div>
        ) : state.error || !candles ? (
          <div
            role="alert"
            className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center"
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

      <p className="flex min-h-8 items-center justify-between gap-3 px-4 py-2 text-xs text-muted-foreground tabular-nums md:px-5">
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
    </section>
  );
}
