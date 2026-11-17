"use client";

import { useEffect, useRef } from "react";
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
import type { RangeId } from "@/lib/coins";
import { pricePrecision } from "@/lib/format";
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

const UP = "#0b7a43";
const DOWN = "#d2332a";

function volumeColor(candle: Candle): string {
  return candle.close >= candle.open ? "rgba(11,122,67,0.38)" : "rgba(210,51,42,0.38)";
}

function paintSeries(
  chart: IChartApi,
  series: SeriesRefs,
  candles: Candle[],
  fitKey: string,
  fitKeyRef: { current: string },
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
      color: volumeColor(candle),
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
  const fitKeyRef = useRef("");
  const seriesKeyRef = useRef("");

  const precision = pricePrecision(candles.at(-1)?.close ?? 1);

  useEffect(() => {
    hoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    formatRef.current = formatPrice;
    chartRef.current?.applyOptions({
      localization: { priceFormatter: (price: number) => formatRef.current(price) },
    });
  }, [formatPrice]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const chart = createChart(element, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#6b6b6b",
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(22,22,22,0.06)" },
      },
      rightPriceScale: { borderVisible: false },
      leftPriceScale: { visible: false },
      timeScale: { borderVisible: false, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(22,22,22,0.35)",
          labelBackgroundColor: "#161616",
        },
        horzLine: {
          color: "rgba(22,22,22,0.35)",
          labelBackgroundColor: "#161616",
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
    const seriesKey = `${mode}:${positive ? "up" : "down"}:${precision}:${showVolume ? "vol" : "flat"}`;
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
          upColor: UP,
          downColor: DOWN,
          borderVisible: false,
          wickUpColor: UP,
          wickDownColor: DOWN,
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
        const line = positive ? UP : DOWN;
        next.area = chart.addSeries(AreaSeries, {
          lineColor: line,
          topColor: positive ? "rgba(11,122,67,0.28)" : "rgba(210,51,42,0.2)",
          bottomColor: "rgba(255,255,255,0)",
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
      timeScale: {
        timeVisible: range === "1D" || range === "7D",
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
      (candle) => hoverRef.current(candle),
    );
  }, [candles, fitId, mode, positive, precision, range, showVolume]);

  return <div ref={containerRef} className="h-full min-h-[240px] w-full overflow-hidden md:min-h-[280px]" />;
}
