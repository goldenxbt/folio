"use client";

import { useMemo, useState } from "react";
import { PanelLeft, PanelLeftClose, Plus } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RATIO_PRESETS, filterCoins, getCoin } from "@/lib/coins";
import { formatPercent, formatStamp, formatUsd, toneClass } from "@/lib/format";
import type { MarketSource, Quote } from "@/lib/types";
import { cn } from "@/lib/utils";

type MarketListProps = {
  quotes: Quote[] | null;
  updatedAt: number | null;
  source: MarketSource | null;
  error: string | null;
  live: boolean;
  activeCoinId: string | null;
  activeVersusId: string | null;
  chartCount: number;
  maxCharts: number;
  canAdd: boolean;
  openUsdIds: string[];
  onSelect: (coinId: string) => void;
  onSelectPair: (baseId: string, quoteId: string) => void;
  onOpen: (coinId: string) => void;
  onAdd: () => void;
  open: boolean;
  onToggle: () => void;
  onRetry: () => void;
};

const SOURCE_NAME: Record<MarketSource, string> = {
  coingecko: "CoinGecko",
  kraken: "Kraken",
  coinbase: "Coinbase",
  binance: "Binance",
};

function useOrderedCoins(quotes: Quote[] | null, query: string) {
  return useMemo(() => {
    const quoteById = new Map((quotes ?? []).map((quote) => [quote.id, quote]));
    const coins = filterCoins(query).toSorted((a, b) => {
      const left = quoteById.get(a.id)?.rank ?? Number.POSITIVE_INFINITY;
      const right = quoteById.get(b.id)?.rank ?? Number.POSITIVE_INFINITY;
      return left - right;
    });
    return { coins, quoteById };
  }, [quotes, query]);
}

function RatioPresets({
  activeCoinId,
  activeVersusId,
  onSelectPair,
}: {
  activeCoinId: string | null;
  activeVersusId: string | null;
  onSelectPair: (baseId: string, quoteId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RATIO_PRESETS.map((preset) => {
        const base = getCoin(preset.baseId);
        const quote = getCoin(preset.quoteId);
        if (!base || !quote) return null;
        const selected = activeCoinId === preset.baseId && activeVersusId === preset.quoteId;
        return (
          <Button
            key={`${preset.baseId}-${preset.quoteId}`}
            size="xs"
            variant={selected ? "default" : "outline"}
            aria-pressed={selected}
            onClick={() => onSelectPair(preset.baseId, preset.quoteId)}
          >
            {base.symbol}/{quote.symbol}
          </Button>
        );
      })}
    </div>
  );
}

export function MarketSidebar({
  quotes,
  updatedAt,
  source,
  error,
  live,
  activeCoinId,
  activeVersusId,
  chartCount,
  maxCharts,
  canAdd,
  openUsdIds,
  onSelect,
  onSelectPair,
  onOpen,
  onAdd,
  open,
  onToggle,
  onRetry,
}: MarketListProps) {
  const [query, setQuery] = useState("");
  const { coins, quoteById } = useOrderedCoins(quotes, query);
  const openUsd = new Set(openUsdIds);

  return (
    <div id="market-sidebar" className="flex h-full min-h-0 flex-col">
      <div className="px-2 pt-2.5">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={open ? "Hide markets" : "Show markets"}
            aria-expanded={open}
            aria-controls="market-sidebar"
            onClick={onToggle}
          >
            <PanelLeft />
          </Button>
          <div inert={open ? undefined : true}>
            <ThemeToggle />
          </div>
        </div>
      </div>
      <div className={open ? "flex min-h-0 flex-1 flex-col" : "hidden"} inert={open ? undefined : true}>
        <div className="px-4 pt-2 pb-3">
          <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground">MARKETS</p>
          <h1 className="mt-1 text-[1.7rem] leading-none font-semibold tracking-tight">Folio</h1>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            USD charts, or one coin priced in another. Click a market to change the base.
          </p>
        </div>

      <div className="px-4 pb-3">
        <label htmlFor="market-search" className="sr-only">
          Search markets
        </label>
        <Input
          id="market-search"
          value={query}
          placeholder="Search Bitcoin, SOL, DOGE"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="flex items-center justify-between px-4 pb-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        <span>Market</span>
        <span className="pr-10">24h</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {coins.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No market matches that.</p>
        ) : (
          <ul>
            {coins.map((coin) => {
              const quote = quoteById.get(coin.id);
              const selected = coin.id === activeCoinId;
              const alreadyOpen = openUsd.has(coin.id);
              const plusLabel = alreadyOpen
                ? `${coin.name} is already open`
                : canAdd
                  ? `Open ${coin.name} in a new chart`
                  : "Four charts are already open";
              return (
                <li
                  key={coin.id}
                  className={cn(
                    "flex items-stretch border-l-2",
                    selected ? "border-foreground bg-muted" : "border-transparent",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left outline-none focus-visible:bg-muted"
                    aria-pressed={selected}
                    onClick={() => onSelect(coin.id)}
                  >
                    <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {quote?.rank ?? ""}
                    </span>
                    <span className="w-12 shrink-0 text-sm font-semibold">{coin.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {coin.name}
                    </span>
                    <span className="text-right">
                      <span className="block text-sm tabular-nums">
                        {quote?.price == null ? "—" : formatUsd(quote.price)}
                      </span>
                      <span className={cn("block text-xs tabular-nums", toneClass(quote?.change24h))}>
                        {quote?.change24h == null ? "—" : formatPercent(quote.change24h)}
                      </span>
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="mr-2 self-center"
                    title={plusLabel}
                    aria-label={plusLabel}
                    disabled={alreadyOpen || !canAdd}
                    onClick={() => onOpen(coin.id)}
                  >
                    <Plus />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>

      <div className="space-y-3 border-t border-border px-4 py-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Ratios
          </p>
          <div className="mt-2">
            <RatioPresets
              activeCoinId={activeCoinId}
              activeVersusId={activeVersusId}
              onSelectPair={onSelectPair}
            />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
            ETH/HYPE is how much HYPE one ETH buys. The quote menu on a chart can pair any two.
          </p>
        </div>
        <Button className="w-full" onClick={onAdd} disabled={!canAdd}>
          <Plus />
          Add chart
        </Button>
        <p className="text-xs text-muted-foreground">
          {chartCount} of {maxCharts} charts. A coin or a pair can only be open once.
        </p>
        {error ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-down">{error}</p>
            <Button variant="outline" size="xs" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="text-[11px] leading-4 text-muted-foreground">
            {live ? "Live" : updatedAt ? `Updated ${formatStamp(updatedAt)}` : "Loading quotes"}
            {source ? ` · ${SOURCE_NAME[source]}` : ""}
          </p>
        )}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-block text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Charts by TradingView
        </a>
      </div>
      </div>
    </div>
  );
}

export function MarketStrip({
  quotes,
  activeCoinId,
  activeVersusId,
  onSelect,
  onSelectPair,
  onHide,
}: {
  quotes: Quote[] | null;
  activeCoinId: string | null;
  activeVersusId: string | null;
  onSelect: (coinId: string) => void;
  onSelectPair: (baseId: string, quoteId: string) => void;
  onHide: () => void;
}) {
  const [query, setQuery] = useState("");
  const { coins, quoteById } = useOrderedCoins(quotes, query);

  return (
    <div className="border-b border-border bg-background">
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground">MARKETS</p>
          <h1 className="text-lg font-semibold tracking-tight">Folio</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button variant="outline" size="sm" aria-expanded={true} onClick={onHide}>
            <PanelLeftClose />
            Hide
          </Button>
        </div>
      </div>
      <div className="px-4 py-3">
        <label htmlFor="market-search-mobile" className="sr-only">
          Search markets
        </label>
        <Input
          id="market-search-mobile"
          value={query}
          placeholder="Search Bitcoin, SOL, DOGE"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {coins.length === 0 ? (
          <p className="text-sm text-muted-foreground">No market matches that.</p>
        ) : (
          coins.map((coin) => {
            const quote = quoteById.get(coin.id);
            const selected = coin.id === activeCoinId;
            return (
              <button
                key={coin.id}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(coin.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-left text-sm",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background",
                )}
              >
                <span className="font-semibold">{coin.symbol}</span>
                <span className={cn("ml-2 tabular-nums", selected ? "" : toneClass(quote?.change24h))}>
                  {quote?.change24h == null ? "—" : formatPercent(quote.change24h)}
                </span>
              </button>
            );
          })
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto px-4 pb-3">
        <RatioPresets
          activeCoinId={activeCoinId}
          activeVersusId={activeVersusId}
          onSelectPair={onSelectPair}
        />
      </div>
    </div>
  );
}
