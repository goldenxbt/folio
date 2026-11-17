"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PanelLeft, Plus } from "lucide-react";
import { ChartPanel } from "@/components/chart-panel";
import { MarketSidebar, MarketStrip } from "@/components/market-sidebar";
import { Button } from "@/components/ui/button";
import { COINS, getCoin } from "@/lib/coins";
import {
  MAX_CHARTS,
  marketKey,
  emptyLayoutSnapshot,
  parseStoredLayout,
  readLayoutSnapshot,
  subscribeLayout,
  writeLayout,
  type ChartMode,
  type Layout,
} from "@/lib/layout";
import { subscribeTicker, type LiveTick } from "@/lib/live-ticker";
import type { MarketSource, Quote, QuotesResponse } from "@/lib/types";

const QUOTE_REFRESH_MS = 60_000;

function chartButtonLabel(coinId: string, versusId: string | null): string {
  const coin = getCoin(coinId);
  const versus = versusId ? getCoin(versusId) : null;
  if (!coin) return "Chart";
  return versus ? `${coin.symbol}/${versus.symbol}` : coin.symbol;
}

function ChartJumpButtons({
  charts,
  activeId,
  onJump,
}: {
  charts: Layout["charts"];
  activeId: string;
  onJump: (id: string) => void;
}) {
  return (
    <div className="ml-auto flex min-w-0 justify-end gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {charts.map((chart) => {
        const label = chartButtonLabel(chart.coinId, chart.versusId);
        const selected = chart.id === activeId;
        return (
          <Button
            key={chart.id}
            variant={selected ? "default" : "outline"}
            size="sm"
            className="shrink-0"
            aria-pressed={selected}
            aria-label={`Scroll to ${label}`}
            onClick={() => onJump(chart.id)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}

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
  const [live, setLive] = useState(false);
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [ticks, setTicks] = useState<Map<string, LiveTick>>(() => new Map());
  const chartListRef = useRef<HTMLDivElement>(null);
  const tickerRef = useRef<ReturnType<typeof subscribeTicker> | null>(null);
  const openCoinIdsRef = useRef<readonly string[]>([]);

  const openCoinKey = useMemo(() => {
    const ids = new Set<string>();
    for (const chart of layout.charts) {
      ids.add(chart.coinId);
      if (chart.versusId) ids.add(chart.versusId);
    }
    return [...ids].sort().join(",");
  }, [layout.charts]);

  useEffect(() => {
    const controller = new AbortController();
    let hasData = false;

    async function load() {
      try {
        const response = await fetch("/api/quotes", {
          signal: controller.signal,
          cache: "no-store",
        });
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
    const timer = window.setInterval(() => void load(), QUOTE_REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [quoteRetry]);

  const openCoinIds = useMemo(
    () => (openCoinKey ? openCoinKey.split(",") : []),
    [openCoinKey],
  );

  useEffect(() => {
    openCoinIdsRef.current = openCoinIds;
    tickerRef.current?.setCoins(openCoinIds);
  }, [openCoinIds]);

  useEffect(() => {
    let staleTimer = 0;
    const ticker = subscribeTicker((incoming) => {
      const allowed = openCoinIdsRef.current;
      setTicks((current) => {
        const next = new Map<string, LiveTick>();
        for (const [id, tick] of current) {
          if (allowed.includes(id)) next.set(id, tick);
        }
        let changed = next.size !== current.size;
        for (const tick of incoming) {
          if (!allowed.includes(tick.id)) continue;
          const previous = next.get(tick.id);
          if (
            previous &&
            previous.price === tick.price &&
            previous.tradedAt === tick.tradedAt &&
            previous.priceFromTrade === tick.priceFromTrade
          ) {
            continue;
          }
          next.set(tick.id, tick);
          changed = true;
        }
        return changed ? next : current;
      });
      if (!incoming.some((tick) => allowed.includes(tick.id))) return;
      setLive(true);
      window.clearTimeout(staleTimer);
      staleTimer = window.setTimeout(() => setLive(false), 15_000);
    });
    tickerRef.current = ticker;
    ticker.setCoins(openCoinIdsRef.current);
    return () => {
      window.clearTimeout(staleTimer);
      ticker.close();
      if (tickerRef.current === ticker) tickerRef.current = null;
    };
  }, []);

  const quoteById = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const quote of quotes ?? []) map.set(quote.id, quote);
    return map;
  }, [quotes]);

  const active = layout.charts.find((chart) => chart.id === layout.activeId) ?? layout.charts[0];

  function update(next: Layout) {
    writeLayout(next);
  }

  function findOpen(coinId: string, versusId: string | null, exceptId?: string) {
    return layout.charts.find(
      (chart) => chart.id !== exceptId && chart.coinId === coinId && chart.versusId === versusId,
    );
  }

  function focusChart(id: string) {
    if (layout.activeId !== id) update({ ...layout, activeId: id });
    reveal(id);
  }

  function selectCoin(coinId: string) {
    const current = layout.charts.find((chart) => chart.id === layout.activeId);
    if (!current) return;
    const versusId = current.versusId === coinId ? null : current.versusId;
    const other = findOpen(coinId, versusId, current.id);
    if (other) {
      focusChart(other.id);
      return;
    }
    if (current.coinId === coinId && current.versusId === versusId) {
      focusChart(current.id);
      return;
    }
    update({
      ...layout,
      charts: layout.charts.map((chart) =>
        chart.id === current.id ? { ...chart, coinId, versusId } : chart,
      ),
    });
    reveal(current.id);
  }

  function selectPair(coinId: string, versusId: string) {
    if (coinId === versusId) return;
    const current = layout.charts.find((chart) => chart.id === layout.activeId);
    if (!current) return;
    const other = findOpen(coinId, versusId, current.id);
    if (other) {
      focusChart(other.id);
      return;
    }
    if (current.coinId === coinId && current.versusId === versusId) {
      focusChart(current.id);
      return;
    }
    update({
      ...layout,
      charts: layout.charts.map((chart) =>
        chart.id === current.id ? { ...chart, coinId, versusId } : chart,
      ),
    });
    reveal(current.id);
  }

  function openCoin(coinId: string) {
    const existing = findOpen(coinId, null);
    if (existing) {
      focusChart(existing.id);
      return;
    }
    if (layout.charts.length >= MAX_CHARTS) return;
    const id = crypto.randomUUID();
    update({
      ...layout,
      charts: [
        ...layout.charts,
        { id, coinId, interval: "1m", span: "1H", mode: "candle", versusId: null },
      ],
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

  function jumpToChart(id: string) {
    if (layout.activeId !== id) update({ ...layout, activeId: id });
    requestAnimationFrame(() => {
      const list = chartListRef.current;
      const chart = document.getElementById(`chart-${id}`);
      if (!list || !chart) return;
      const top = chart.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      list.scrollTo({ top, behavior: "smooth" });
    });
  }

  const openUsdIds = layout.charts
    .filter((chart) => chart.versusId === null)
    .map((chart) => chart.coinId);
  const canAdd =
    layout.charts.length < MAX_CHARTS &&
    COINS.some((coin) => !openUsdIds.includes(coin.id));

  function addChart() {
    const nextCoin = COINS.find((coin) => !openUsdIds.includes(coin.id))?.id;
    if (!nextCoin) return;
    openCoin(nextCoin);
  }

  function closeChart(id: string) {
    if (layout.charts.length === 1) return;
    const charts = layout.charts.filter((chart) => chart.id !== id);
    update({
      ...layout,
      charts,
      activeId: layout.activeId === id ? charts[0].id : layout.activeId,
    });
  }

  function patchChart(
    id: string,
    patch: Partial<Pick<Layout["charts"][number], "interval" | "span" | "mode" | "versusId">>,
  ) {
    const latest = parseStoredLayout(readLayoutSnapshot());
    update({
      ...latest,
      activeId: id,
      charts: latest.charts.map((chart) => (chart.id === id ? { ...chart, ...patch } : chart)),
    });
  }

  function setPanelHeight(panelHeight: number | null) {
    const latest = parseStoredLayout(readLayoutSnapshot());
    update({ ...latest, panelHeight });
  }

  function setMode(id: string, mode: ChartMode) {
    patchChart(id, { mode });
  }

  function setVersus(id: string, versusId: string | null) {
    const current = layout.charts.find((chart) => chart.id === id);
    if (!current || current.versusId === versusId) return;
    const other = findOpen(current.coinId, versusId, id);
    if (other) {
      focusChart(other.id);
      return;
    }
    patchChart(id, { versusId });
  }

  function setSidebar(open: boolean) {
    update({ ...layout, sidebarOpen: open });
  }

  return (
    <div className="flex h-dvh flex-col bg-background md:flex-row">
      <aside
        className={[
          "hidden h-dvh shrink-0 overflow-hidden border-r border-border bg-sidebar md:block",
          layout.sidebarOpen ? "w-[320px]" : "w-11",
        ].join(" ")}
      >
        <div className="h-full w-[320px]">
          <MarketSidebar
            quotes={quotes}
            updatedAt={updatedAt}
            source={source}
            error={quoteError}
            live={live}
            activeCoinId={active?.coinId ?? null}
            activeVersusId={active?.versusId ?? null}
            chartCount={layout.charts.length}
            maxCharts={MAX_CHARTS}
            canAdd={canAdd}
            openUsdIds={openUsdIds}
            onSelect={selectCoin}
            onSelectPair={selectPair}
            onOpen={openCoin}
            onAdd={addChart}
            open={layout.sidebarOpen}
            onToggle={() => setSidebar(!layout.sidebarOpen)}
            onRetry={() => setQuoteRetry((count) => count + 1)}
          />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="md:hidden">
          {layout.sidebarOpen ? (
            <MarketStrip
              quotes={quotes}
              activeCoinId={active?.coinId ?? null}
              activeVersusId={active?.versusId ?? null}
              onSelect={selectCoin}
              onSelectPair={selectPair}
              onHide={() => setSidebar(false)}
            />
          ) : null}
          {layout.sidebarOpen ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
                <p className="text-xs text-muted-foreground">
                  {layout.charts.length} of {MAX_CHARTS} charts
                </p>
                <Button size="sm" onClick={addChart} disabled={!canAdd}>
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
            </>
          ) : null}
        </div>

        {layout.sidebarOpen ? null : (
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 md:hidden">
            <Button
              variant="outline"
              size="icon-sm"
              className="shrink-0"
              aria-label="Show markets"
              aria-expanded={false}
              aria-controls="market-sidebar"
              onClick={() => setSidebar(true)}
            >
              <PanelLeft />
            </Button>
            <ChartJumpButtons
              charts={layout.charts}
              activeId={layout.activeId}
              onJump={jumpToChart}
            />
          </div>
        )}

        <div
          ref={chartListRef}
          className={[
            "grid min-h-0 flex-1 content-start items-start overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            layout.charts.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
            layout.charts.length <= 2 ? "md:grid-rows-1" : "",
          ].join(" ")}
        >
          {layout.charts.map((chart) => (
            <ChartPanel
              key={chart.id}
              id={chart.id}
              coinId={chart.coinId}
              versusId={chart.versusId}
              interval={chart.interval}
              span={chart.span}
              mode={chart.mode}
              height={previewHeight ?? layout.panelHeight}
              fillsScreen={layout.charts.length <= 2}
              compact={layout.charts.length >= 3}
              canClose={layout.charts.length > 1}
              showSelected={layout.charts.length > 1 && chart.id === layout.activeId}
              quote={quoteById.get(chart.coinId) ?? null}
              versusQuote={chart.versusId ? (quoteById.get(chart.versusId) ?? null) : null}
              tick={ticks.get(chart.coinId) ?? null}
              versusTick={chart.versusId ? (ticks.get(chart.versusId) ?? null) : null}
              onActivate={() => update({ ...layout, activeId: chart.id })}
              onClose={() => closeChart(chart.id)}
              onInterval={(interval) => patchChart(chart.id, { interval })}
              onSpan={(span) => patchChart(chart.id, { span })}
              onMode={(mode) => setMode(chart.id, mode)}
              onPreviewHeight={setPreviewHeight}
              onHeight={(height) => {
                setPreviewHeight(null);
                setPanelHeight(height);
              }}
              occupiedKeys={layout.charts
                .filter((slot) => slot.id !== chart.id)
                .map((slot) => marketKey(slot.coinId, slot.versusId))}
              onVersus={(versusId) => setVersus(chart.id, versusId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
