"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { filterCoins } from "@/lib/coins";
import { formatPercent, formatStamp, formatUsd, toneClass } from "@/lib/format";
import type { MarketSource, Quote } from "@/lib/types";
import { cn } from "@/lib/utils";

type MarketListProps = {
  quotes: Quote[] | null;
  updatedAt: number | null;
  source: MarketSource | null;
  error: string | null;
  activeCoinId: string | null;
  chartCount: number;
  maxCharts: number;
  onSelect: (coinId: string) => void;
  onOpen: (coinId: string) => void;
  onAdd: () => void;
  onRetry: () => void;
};

const SOURCE_NAME: Record<MarketSource, string> = {
  coingecko: "CoinGecko",
  kraken: "Kraken",
  coinbase: "Coinbase",
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

export function MarketSidebar({
  quotes,
  updatedAt,
  source,
  error,
  activeCoinId,
  chartCount,
  maxCharts,
  onSelect,
  onOpen,
  onAdd,
  onRetry,
}: MarketListProps) {
  const [query, setQuery] = useState("");
  const { coins, quoteById } = useOrderedCoins(quotes, query);
  const atMax = chartCount >= maxCharts;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 pt-5 pb-3">
        <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground">MARKETS</p>
        <h1 className="mt-1 text-[1.7rem] leading-none font-semibold tracking-tight">Folio</h1>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">
          USD price charts for the major coins. Click a market to fill the selected chart.
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
                    title="Open in a new chart"
                    aria-label={`Open ${coin.name} in a new chart`}
                    disabled={atMax}
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
        <Button className="w-full" onClick={onAdd} disabled={atMax}>
          <Plus />
          Add chart
        </Button>
        <p className="text-xs text-muted-foreground">
          {chartCount} of {maxCharts} charts. Plus opens another, up to four side by side.
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
            {updatedAt ? `Updated ${formatStamp(updatedAt)}` : "Loading quotes"}
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
  );
}

export function MarketStrip({
  quotes,
  activeCoinId,
  onSelect,
}: {
  quotes: Quote[] | null;
  activeCoinId: string | null;
  onSelect: (coinId: string) => void;
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
    </div>
  );
}
