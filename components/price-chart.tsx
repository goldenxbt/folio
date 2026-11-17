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
import { rangeShowsClock, type RangeId } from "@/lib/coins";
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
  range: RangeId;
  showVolume: boolean;
  formatPrice: (value: number) => string;
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

function paintSeries(
  chart: IChartApi,
  series: SeriesRefs,
  candles: Candle[],
  fitKey: string,
  fitKeyRef: { current: string },
  colors: Palette,
  onHover: (candle: Candle | null) => void,
) {
  if (candles.length === 0) return;

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

  if (fitKeyRef.current !== fitKey) {
    chart.timeScale().fitContent();
    fitKeyRef.current = fitKey;
    onHover(null);
  }
}

export function PriceChart({
  candles,
  mode,
  positive,
  fitId,
  range,
  showVolume,
  formatPrice,
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

  const precision = pricePrecision(candles.at(-1)?.close ?? 1);

  useEffect(() => {
    hoverRef.current = onHover;
  }, [onHover]);

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
      timeScale: { borderVisible: false, secondsVisible: false },
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

    chartRef.current = chart;
    const widthRef = { current: 0 };
    const observer = new ResizeObserver(() => {
      const width = element.clientWidth;
      if (width === 0 || Math.abs(width - widthRef.current) < 16) return;
      widthRef.current = width;
      chart.timeScale().fitContent();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = { candle: null, area: null, volume: null };
      seriesKeyRef.current = "";
      fitKeyRef.current = "";
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    candlesRef.current = candles;
    const colors = palette(theme);
    const seriesKey = `${theme}:${mode}:${positive ? "up" : "down"}:${precision}:${showVolume ? "vol" : "flat"}`;
    if (seriesKeyRef.current !== seriesKey) {
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
        timeVisible: rangeShowsClock(range),
        secondsVisible: false,
        borderVisible: false,
      },
    });
    paintSeries(
      chart,
      seriesRef.current,
      candles,
      `${fitId}:${range}:${mode}`,
      fitKeyRef,
      colors,
      (candle) => hoverRef.current(candle),
    );
  }, [candles, fitId, mode, positive, precision, range, showVolume, theme]);

  return (
    <div ref={containerRef} className="h-full min-h-[240px] w-full overflow-hidden bg-background md:min-h-[280px]" />
  );
}
