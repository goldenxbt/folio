"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { getInterval, getSpan, intervalShowsClock, type IntervalId, type SpanId } from "@/lib/coins";
import { pricePrecision } from "@/lib/format";
import {
  applyTheme,
  emptyThemeSnapshot,
  readThemeSnapshot,
  subscribeTheme,
  type Theme,
} from "@/lib/theme";
import type { Candle } from "@/lib/types";

type PriceChartProps = {
  candles: Candle[];
  mode: "candle" | "line";
  positive: boolean;
  fitId: string;
  interval: IntervalId;
  span: SpanId;
  showVolume: boolean;
  formatPrice: (value: number) => string;
  historyDone: boolean;
  onNeedHistory: () => void;
  onHover: (candle: Candle | null) => void;
};

type SeriesRefs = {
  candle: ISeriesApi<"Candlestick"> | null;
  area: ISeriesApi<"Area"> | null;
  volume: ISeriesApi<"Histogram"> | null;
};

type Palette = {
  background: string;
  text: string;
  grid: string;
  crosshair: string;
  label: string;
  up: string;
  down: string;
};

function toRgb(color: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "rgb(0, 0, 0)";
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (alpha < 255) return `rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(3)})`;
  return `rgb(${red}, ${green}, ${blue})`;
}

function readCss(variable: string, property: "color" | "backgroundColor"): string {
  const probe = document.createElement("span");
  probe.style[property] = `var(${variable})`;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe)[property];
  probe.remove();
  return toRgb(value);
}

function withAlpha(color: string, alpha: number): string {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return color;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}

function palette(theme: Theme): Palette {
  applyTheme(theme);
  const dark = theme === "dark";
  return {
    background: readCss("--background", "backgroundColor"),
    text: readCss("--muted-foreground", "color"),
    up: readCss("--up", "color"),
    down: readCss("--down", "color"),
    grid: dark ? "rgba(255,255,255,0.08)" : "rgba(22,22,22,0.06)",
    crosshair: dark ? "rgba(255,255,255,0.35)" : "rgba(22,22,22,0.35)",
    label: dark ? "#2c2c2c" : "#161616",
  };
}

function volumeColor(candle: Candle, colors: Palette): string {
  return withAlpha(candle.close >= candle.open ? colors.up : colors.down, 0.38);
}

function setSeriesData(series: SeriesRefs, candles: Candle[], colors: Palette) {
  series.candle?.setData(
    candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })),
  );
  series.area?.setData(
    candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      value: candle.close,
    })),
  );
  series.volume?.setData(
    candles.map((candle) => ({
      time: candle.time as UTCTimestamp,
      value: candle.volume,
      color: volumeColor(candle, colors),
    })),
  );
}

function showLoadedSpan(
  chart: IChartApi,
  candles: Candle[],
  span: SpanId,
  interval: IntervalId,
  adjusting: { current: boolean },
) {
  const windowSec = getSpan(span)?.windowSec;
  const step = getInterval(interval)?.seconds ?? 60;
  if (!windowSec || candles.length === 0) return;
  const width = chart.timeScale().width();
  if (width < 32) return;
  const spanBars = Math.max(10, Math.round(windowSec / step));
  const wanted = Math.min(spanBars, Math.max(candles.length, 10));
  const spacing = Math.min(14, Math.max(0.02, width / wanted));
  const visibleBars = width / spacing;
  const lastIndex = candles.length - 1;
  adjusting.current = true;
  chart.timeScale().applyOptions({ barSpacing: spacing, rightOffset: 2 });
  chart.timeScale().setVisibleLogicalRange({
    from: lastIndex + 2 - visibleBars,
    to: lastIndex + 2,
  });
  adjusting.current = false;
}

function updateTail(series: SeriesRefs, candles: Candle[], fromIndex: number, colors: Palette) {
  for (let index = fromIndex; index < candles.length; index += 1) {
    const candle = candles[index];
    const time = candle.time as UTCTimestamp;
    series.candle?.update({
      time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
    series.area?.update({ time, value: candle.close });
    series.volume?.update({
      time,
      value: candle.volume,
      color: volumeColor(candle, colors),
    });
  }
}

export function PriceChart({
  candles,
  mode,
  positive,
  fitId,
  interval,
  span,
  showVolume,
  formatPrice,
  historyDone,
  onNeedHistory,
  onHover,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<SeriesRefs>({ candle: null, area: null, volume: null });
  const candlesRef = useRef<Candle[]>(candles);
  const hoverRef = useRef(onHover);
  const formatRef = useRef(formatPrice);
  const theme = useSyncExternalStore(subscribeTheme, readThemeSnapshot, emptyThemeSnapshot);
  const themeRef = useRef(theme);
  const fitKeyRef = useRef("");
  const seriesKeyRef = useRef("");
  const previousRef = useRef<Candle[]>([]);
  const historyRef = useRef(onNeedHistory);
  const historyDoneRef = useRef(historyDone);
  const adjustingRef = useRef(false);
  const chainRef = useRef(0);
  const spanRef = useRef(span);
  const intervalRef = useRef(interval);
  const requestHistoryRef = useRef(() => {});

  const precision = pricePrecision(candles.at(-1)?.close ?? 1);

  useEffect(() => {
    hoverRef.current = onHover;
    historyRef.current = onNeedHistory;
    historyDoneRef.current = historyDone;
    spanRef.current = span;
    intervalRef.current = interval;
  }, [historyDone, interval, onHover, onNeedHistory, span]);

  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  useEffect(() => {
    formatRef.current = formatPrice;
    chartRef.current?.applyOptions({
      localization: { priceFormatter: (price: number) => formatRef.current(price) },
    });
  }, [formatPrice]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const colors = palette(themeRef.current);
    const chart = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: { borderVisible: false },
      leftPriceScale: { visible: false },
      timeScale: { borderVisible: false, secondsVisible: false, minBarSpacing: 0.02, rightOffset: 2 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: colors.crosshair,
          labelBackgroundColor: colors.label,
        },
        horzLine: {
          color: colors.crosshair,
          labelBackgroundColor: colors.label,
        },
      },
      localization: {
        priceFormatter: (price: number) => formatRef.current(price),
      },
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.point || typeof param.time !== "number") {
        hoverRef.current(null);
        return;
      }
      const match = candlesRef.current.find((candle) => candle.time === param.time);
      hoverRef.current(match ?? null);
    });

    const requestHistory = () => {
      if (historyDoneRef.current || chainRef.current >= 30) return;
      const range = chart.timeScale().getVisibleLogicalRange();
      const active = seriesRef.current.candle ?? seriesRef.current.area;
      if (!range || !active) return;
      const info = active.barsInLogicalRange(range);
      if (!info) return;
      const candles = candlesRef.current;
      const windowSec = getSpan(spanRef.current)?.windowSec ?? 0;
      const step = getInterval(intervalRef.current)?.seconds ?? 60;
      const first = candles[0]?.time;
      const last = candles.at(-1)?.time;
      const spanNeedsData = first != null && last != null && first > last - windowSec + step;
      if (info.barsBefore >= 50 && !spanNeedsData) return;
      chainRef.current += 1;
      historyRef.current();
    };

    let lastFrom = Number.NaN;
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || adjustingRef.current) return;
      const delta = Number.isNaN(lastFrom) ? 0 : Math.abs(range.from - lastFrom);
      lastFrom = range.from;
      if (delta < 2) return;
      chainRef.current = 0;
      requestHistory();
    });

    requestHistoryRef.current = requestHistory;
    chartRef.current = chart;
    const widthRef = { current: 0 };
    const observer = new ResizeObserver(() => {
      const width = element.clientWidth;
      if (width === 0 || Math.abs(width - widthRef.current) < 16) return;
      widthRef.current = width;
      showLoadedSpan(chart, candlesRef.current, spanRef.current, intervalRef.current, adjustingRef);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = { candle: null, area: null, volume: null };
      seriesKeyRef.current = "";
      fitKeyRef.current = "";
      previousRef.current = [];
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    candlesRef.current = candles;
    const colors = palette(theme);
    const seriesKey = `${theme}:${mode}:${positive ? "up" : "down"}:${precision}:${showVolume ? "vol" : "flat"}`;
    let seriesReset = false;
    if (seriesKeyRef.current !== seriesKey) {
      seriesReset = true;
      const previous = seriesRef.current;
      if (previous.candle) chart.removeSeries(previous.candle);
      if (previous.area) chart.removeSeries(previous.area);
      if (previous.volume) chart.removeSeries(previous.volume);

      const priceFormat = {
        type: "price" as const,
        precision,
        minMove: 10 ** -precision,
      };
      const next: SeriesRefs = { candle: null, area: null, volume: null };

      if (mode === "candle") {
        next.candle = chart.addSeries(CandlestickSeries, {
          upColor: colors.up,
          downColor: colors.down,
          borderVisible: false,
          wickUpColor: colors.up,
          wickDownColor: colors.down,
          priceFormat,
        });
        if (showVolume) {
          next.volume = chart.addSeries(HistogramSeries, {
            priceFormat: { type: "volume" },
            priceScaleId: "volume",
            priceLineVisible: false,
            lastValueVisible: false,
          });
          chart.priceScale("volume").applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
          });
        }
        chart.priceScale("right").applyOptions({
          scaleMargins: { top: 0.08, bottom: showVolume ? 0.22 : 0.06 },
        });
      } else {
        const line = positive ? colors.up : colors.down;
        next.area = chart.addSeries(AreaSeries, {
          lineColor: line,
          topColor: withAlpha(line, positive ? 0.28 : 0.2),
          bottomColor: withAlpha(colors.background, 0),
          lineWidth: 2 as const,
          priceFormat,
          priceLineVisible: true,
        });
        chart.priceScale("right").applyOptions({
          scaleMargins: { top: 0.08, bottom: 0.06 },
        });
      }

      seriesRef.current = next;
      seriesKeyRef.current = seriesKey;
    }

    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
      },
      grid: { horzLines: { color: colors.grid } },
      crosshair: {
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.label },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.label },
      },
      timeScale: {
        timeVisible: intervalShowsClock(interval),
        secondsVisible: false,
        borderVisible: false,
        shiftVisibleRangeOnNewBar: true,
      },
    });

    const previous = previousRef.current;
    const fitKey = `${fitId}:${interval}:${span}:${mode}`;
    const fitChanged = fitKeyRef.current !== fitKey;
    const first = candles[0]?.time;
    const last = candles[candles.length - 1]?.time;
    const prevFirst = previous[0]?.time;
    const prevLast = previous[previous.length - 1]?.time;
    const prepended =
      !seriesReset &&
      !fitChanged &&
      previous.length > 0 &&
      candles.length > previous.length &&
      first != null &&
      prevFirst != null &&
      first < prevFirst &&
      last === prevLast;
    const tail =
      !seriesReset &&
      !fitChanged &&
      !prepended &&
      previous.length > 0 &&
      first === prevFirst &&
      candles.length >= previous.length &&
      candles.length - previous.length <= 2;

    const showSpan = () => {
      showLoadedSpan(chart, candles, span, interval, adjustingRef);
    };

    if (candles.length === 0) {
      previousRef.current = candles;
      return;
    }

    if (fitChanged) {
      setSeriesData(seriesRef.current, candles, colors);
      showSpan();
      fitKeyRef.current = fitKey;
      chainRef.current = 0;
      hoverRef.current(null);
      window.requestAnimationFrame(() => requestHistoryRef.current());
    } else if (prepended) {
      const visible = chart.timeScale().getVisibleLogicalRange();
      setSeriesData(seriesRef.current, candles, colors);
      const added = candles.length - previous.length;
      if (visible) {
        adjustingRef.current = true;
        chart.timeScale().setVisibleLogicalRange({
          from: visible.from + added,
          to: visible.to + added,
        });
        adjustingRef.current = false;
      }
      window.requestAnimationFrame(() => requestHistoryRef.current());
    } else if (tail) {
      updateTail(seriesRef.current, candles, Math.max(0, previous.length - 1), colors);
    } else {
      const visible = chart.timeScale().getVisibleLogicalRange();
      setSeriesData(seriesRef.current, candles, colors);
      if (visible && previous.length > 0) {
        adjustingRef.current = true;
        chart.timeScale().setVisibleLogicalRange(visible);
        adjustingRef.current = false;
      }
    }

    previousRef.current = candles;
  }, [candles, fitId, interval, mode, positive, precision, showVolume, span, theme]);

  return (
    <div ref={containerRef} className="h-full min-h-0 w-full overflow-hidden bg-background" />
  );
}
