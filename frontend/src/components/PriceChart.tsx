/**
 * PriceChart — Professional candlestick + volume chart using TradingView lightweight-charts.
 * 
 * Renders real OHLC candlestick data when available from the backend.
 * Falls back to dummy data only when no history is provided.
 * 
 * Features:
 * - Candlestick series with green/red coloring
 * - Volume histogram overlay at the bottom
 * - Transparent background for AR overlay compositing
 * - Auto-resize via ResizeObserver
 */

"use client";

import { useRef, useEffect } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  AreaSeries,
  HistogramSeries,
} from "lightweight-charts";
import type { IChartApi } from "lightweight-charts";
import type { PricePoint } from "@/types";
import {
  DUMMY_OHLC_DATA,
  DUMMY_VOLUME_DATA,
} from "@/lib/dummyData";

interface PriceChartProps {
  data: PricePoint[];
}

export default function PriceChart({ data }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Check if data has real OHLC fields (from backend history)
  const hasOHLC = data && data.length > 0 && (data[0] as any).open !== undefined && (data[0] as any).high !== undefined && (data[0] as any).low !== undefined && (data[0] as any).close !== undefined;
  const useDummy = !data || data.length === 0 || !hasOHLC;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create the chart instance
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(59, 130, 246, 0.06)" },
        horzLines: { color: "rgba(59, 130, 246, 0.06)" },
      },
      crosshair: {
        vertLine: {
          color: "rgba(59, 130, 246, 0.3)",
          labelBackgroundColor: "#1e2847",
        },
        horzLine: {
          color: "rgba(59, 130, 246, 0.3)",
          labelBackgroundColor: "#1e2847",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(59, 130, 246, 0.1)",
        scaleMargins: {
          top: 0.1,
          bottom: 0.25, // Leave room for volume
        },
      },
      timeScale: {
        borderColor: "rgba(59, 130, 246, 0.1)",
        timeVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: false },
      handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
      width: chartContainerRef.current.clientWidth,
      height: 160,
    });

    chartRef.current = chart;

    if (!useDummy) {
      // === CANDLESTICK MODE (real OHLC data from backend) ===
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#10b981",
        wickDownColor: "rgba(239, 68, 68, 0.6)",
        wickUpColor: "rgba(16, 185, 129, 0.6)",
      });
      
      const ohlcData = data.map((d: any) => ({
        time: d.date || d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      candleSeries.setData(ohlcData);

      // Volume histogram at the bottom
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      
      const volumeData = data.map((d: any) => ({
        time: d.date || d.time,
        value: d.volume || 0,
        color: (d.close ?? 0) >= (d.open ?? 0)
          ? "rgba(16, 185, 129, 0.4)"
          : "rgba(239, 68, 68, 0.35)",
      }));
      volumeSeries.setData(volumeData);
    } else {
      // === CANDLESTICK MODE (dummy OHLC data fallback) ===
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#10b981",
        wickDownColor: "rgba(239, 68, 68, 0.6)",
        wickUpColor: "rgba(16, 185, 129, 0.6)",
      });
      candleSeries.setData(DUMMY_OHLC_DATA);

      // Volume histogram at the bottom
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeSeries.setData(DUMMY_VOLUME_DATA);
    }

    // Fit all data into view
    chart.timeScale().fitContent();

    // Resize observer for responsiveness
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          chart.applyOptions({ width });
        }
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, useDummy]);

  // Determine chart title based on data source
  const chartTitle = useDummy
    ? "1-Month Price Trend (Demo)"
    : "1-Month Price Trend";

  return (
    <div className="chart-container">
      <div className="chart-title">
        {chartTitle}
      </div>
      <div
        ref={chartContainerRef}
        className="lw-chart-container"
      />
    </div>
  );
}
