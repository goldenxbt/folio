"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COINS, getCoin, type RangeId } from "@/lib/coins";
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
import type { ChartMode } from "@/lib/layout";
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

const RANGES: RangeId[] = ["1D", "7D", "1M", "3M", "1Y"];

type ChartPanelProps = {
  id: string;
  coinId: string;
  versusId: string | null;
  range: RangeId;
  mode: ChartMode;
  active: boolean;
  canClose: boolean;
  showSelected: boolean;
  quote: Quote | null;
  versusQuote: Quote | null;
  onActivate: () => void;
  onClose: () => void;
  onRange: (range: RangeId) => void;
  onMode: (mode: ChartMode) => void;
  onVersus: (versusId: string | null) => void;
};

type CandleState = {
  key: string;
  candles: Candle[] | null;
  source: MarketSource | null;
  interval: string;
  loading: boolean;
  error: string | null;
};

function withLiveClose(candles: Candle[], price: number | null): Candle[] {
  if (price == null || candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  if (last.close <= 0) return candles;
  if (Math.abs(price - last.close) / last.close > 0.15) return candles;
  const next = candles.slice();
  next[next.length - 1] = {
    ...last,
    close: price,
    high: Math.max(last.high, price),
    low: Math.min(last.low, price),
  };
  return next;
}

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
  range,
  mode,
  active,
  canClose,
  showSelected,
  quote,
  versusQuote,
  onActivate,
  onClose,
  onRange,
  onMode,
  onVersus,
}: ChartPanelProps) {
  const coin = getCoin(coinId);
  const versus = versusId ? getCoin(versusId) : null;
  const [retry, setRetry] = useState(0);
  const [hover, setHover] = useState<Candle | null>(null);
  const requestKey = `${coinId}:${versus?.id ?? "usd"}:${range}:${retry}`;
  const [state, setState] = useState<CandleState>({
    key: "",
    candles: null,
    source: null,
    interval: "",
    loading: true,
    error: null,
  });

  if (state.key !== requestKey) {
    setState({
      key: requestKey,
      candles: null,
      source: null,
      interval: "",
      loading: true,
      error: null,
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    let hasData = false;

    async function load() {
      try {
        const params = new URLSearchParams({ coin: coinId, range });
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
        setState({
          key: requestKey,
          candles,
          source: body.source ?? null,
          interval: typeof body.interval === "string" ? body.interval : "",
          loading: false,
          error: null,
        });
      } catch {
        if (controller.signal.aborted || hasData) return;
        setState({
          key: requestKey,
          candles: null,
          source: null,
          interval: "",
          loading: false,
          error: versus
            ? "Couldn’t load candles for this pair."
            : "Couldn’t load candles for this market.",
        });
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [coinId, range, requestKey, versus]);

  const livePrice =
    versus && quote?.price != null && versusQuote?.price != null && versusQuote.price > 0
      ? quote.price / versusQuote.price
      : versus
        ? null
        : (quote?.price ?? null);
  const candles = useMemo(
    () => (state.candles ? withLiveClose(state.candles, livePrice) : null),
    [livePrice, state.candles],
  );
  const move = rangeMove(candles);
  const extremes = rangeExtremes(candles);
  const price = livePrice ?? candles?.at(-1)?.close ?? null;
  const showTime = range === "1D" || range === "7D";
  const formatValue = versus ? formatRatio : formatUsd;
  const formatSigned = versus ? formatSignedRatio : formatSignedUsd;

  if (!coin) return null;

  const title = versus ? `${coin.symbol}/${versus.symbol}` : coin.name;

  return (
    <section
      id={`chart-${id}`}
      aria-label={`${title} price chart`}
      onClick={onActivate}
      onFocus={onActivate}
      className={cn(
        "flex h-auto min-h-[520px] flex-col border-b border-border bg-background md:h-full md:min-h-0 md:border-r",
        active && "shadow-[inset_0_2px_0_#161616]",
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 md:px-5">
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
                <option value="usd">USD</option>
                {COINS.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.id === coin.id}>
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
              {versus ? `${versus.symbol} per 1 ${coin.symbol} · ${range}` : range}
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
              label={`${range} high`}
              value={extremes ? formatRatio(extremes.high) : "—"}
            />
            <Stat label={`${range} low`} value={extremes ? formatRatio(extremes.low) : "—"} />
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 md:px-5">
        <div role="radiogroup" aria-label={`${coin.name} range`} className="flex gap-4">
          {RANGES.map((item) => (
            <Button
              key={item}
              variant="ghost"
              size="xs"
              role="radio"
              aria-checked={range === item}
              className={cn(
                "h-auto rounded-none px-0 text-sm hover:bg-transparent",
                range === item
                  ? "text-foreground underline decoration-2 underline-offset-[7px]"
                  : "text-muted-foreground",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onRange(item);
              }}
            >
              {item}
            </Button>
          ))}
        </div>
        <div role="radiogroup" aria-label={`${coin.name} chart type`} className="flex gap-4">
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
            range={range}
            showVolume={!versus}
            formatPrice={formatValue}
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
            {state.interval ? `${state.interval} candles` : "Candles"}
            {state.source ? ` · ${SOURCE_NAME[state.source]}` : ""}
          </span>
        )}
        <span className="hidden sm:inline">Scroll to zoom</span>
      </p>
    </section>
  );
}
