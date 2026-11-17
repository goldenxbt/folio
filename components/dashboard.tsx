"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Plus } from "lucide-react";
import { ChartPanel } from "@/components/chart-panel";
import { MarketSidebar, MarketStrip } from "@/components/market-sidebar";
import { Button } from "@/components/ui/button";
import { COINS } from "@/lib/coins";
import {
  MAX_CHARTS,
  emptyLayoutSnapshot,
  parseStoredLayout,
  readLayoutSnapshot,
  subscribeLayout,
  writeLayout,
  type ChartMode,
  type Layout,
} from "@/lib/layout";
import type { MarketSource, Quote, QuotesResponse } from "@/lib/types";

export function Dashboard() {
  const storedLayout = useSyncExternalStore(
    subscribeLayout,
    readLayoutSnapshot,
    emptyLayoutSnapshot,
  );
  const layout = useMemo(() => parseStoredLayout(storedLayout), [storedLayout]);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [source, setSource] = useState<MarketSource | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteRetry, setQuoteRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let hasData = false;

    async function load() {
      try {
        const response = await fetch("/api/quotes", { signal: controller.signal });
        if (!response.ok) throw new Error("unavailable");
        const body = (await response.json()) as Partial<QuotesResponse>;
        if (controller.signal.aborted) return;
        if (!Array.isArray(body.quotes)) throw new Error("invalid");
        hasData = true;
        setQuotes(body.quotes);
        setUpdatedAt(typeof body.updatedAt === "number" ? body.updatedAt : Date.now());
        setSource(body.source ?? null);
        setQuoteError(null);
      } catch {
        if (controller.signal.aborted || hasData) return;
        setQuoteError("Quotes are unavailable.");
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [quoteRetry]);

  const quoteById = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const quote of quotes ?? []) map.set(quote.id, quote);
    return map;
  }, [quotes]);

  const active = layout.charts.find((chart) => chart.id === layout.activeId) ?? layout.charts[0];

  function update(next: Layout) {
    writeLayout(next);
  }

  function selectCoin(coinId: string) {
    update({
      ...layout,
      charts: layout.charts.map((chart) =>
        chart.id === layout.activeId ? { ...chart, coinId } : chart,
      ),
    });
    reveal(layout.activeId);
  }

  function openCoin(coinId: string) {
    if (layout.charts.length >= MAX_CHARTS) return;
    const id = crypto.randomUUID();
    update({
      charts: [...layout.charts, { id, coinId, range: "1D", mode: "candle" }],
      activeId: id,
    });
    reveal(id);
  }

  function reveal(id: string) {
    requestAnimationFrame(() => {
      document.getElementById(`chart-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }

  function addChart() {
    const used = new Set(layout.charts.map((chart) => chart.coinId));
    const nextCoin = COINS.find((coin) => !used.has(coin.id))?.id ?? "bitcoin";
    openCoin(nextCoin);
  }

  function closeChart(id: string) {
    if (layout.charts.length === 1) return;
    const charts = layout.charts.filter((chart) => chart.id !== id);
    update({
      charts,
      activeId: layout.activeId === id ? charts[0].id : layout.activeId,
    });
  }

  function patchChart(
    id: string,
    patch: Partial<Pick<Layout["charts"][number], "range" | "mode">>,
  ) {
    update({
      ...layout,
      activeId: id,
      charts: layout.charts.map((chart) => (chart.id === id ? { ...chart, ...patch } : chart)),
    });
  }

  function setMode(id: string, mode: ChartMode) {
    patchChart(id, { mode });
  }

  return (
    <div className="flex h-dvh flex-col bg-background md:flex-row">
      <aside className="hidden h-dvh w-[320px] shrink-0 border-r border-border bg-sidebar md:block">
        <MarketSidebar
          quotes={quotes}
          updatedAt={updatedAt}
          source={source}
          error={quoteError}
          activeCoinId={active?.coinId ?? null}
          chartCount={layout.charts.length}
          maxCharts={MAX_CHARTS}
          onSelect={selectCoin}
          onOpen={openCoin}
          onAdd={addChart}
          onRetry={() => setQuoteRetry((count) => count + 1)}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="md:hidden">
          <MarketStrip
            quotes={quotes}
            activeCoinId={active?.coinId ?? null}
            onSelect={selectCoin}
          />
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
            <p className="text-xs text-muted-foreground">
              {layout.charts.length} of {MAX_CHARTS} charts
            </p>
            <Button size="sm" onClick={addChart} disabled={layout.charts.length >= MAX_CHARTS}>
              <Plus />
              Add chart
            </Button>
          </div>
          <p className="px-4 pb-2 text-[11px] text-muted-foreground">
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Charts by TradingView
            </a>
          </p>
        </div>

        <div
          className={
            layout.charts.length > 1
              ? "grid min-h-0 flex-1 grid-cols-1 overflow-auto md:grid-cols-2 md:auto-rows-[minmax(680px,1fr)]"
              : "grid min-h-0 flex-1 grid-cols-1 grid-rows-1"
          }
        >
          {layout.charts.map((chart) => (
            <ChartPanel
              key={chart.id}
              id={chart.id}
              coinId={chart.coinId}
              range={chart.range}
              mode={chart.mode}
              active={chart.id === layout.activeId}
              canClose={layout.charts.length > 1}
              showSelected={layout.charts.length > 1 && chart.id === layout.activeId}
              quote={quoteById.get(chart.coinId) ?? null}
              onActivate={() => update({ ...layout, activeId: chart.id })}
              onClose={() => closeChart(chart.id)}
              onRange={(range) => patchChart(chart.id, { range })}
              onMode={(mode) => setMode(chart.id, mode)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
