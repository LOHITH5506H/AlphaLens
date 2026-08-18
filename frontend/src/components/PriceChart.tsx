/**
 * PriceChart — Professional candlestick + volume chart using TradingView lightweight-charts.
 * 
 * Replaces the previous Recharts area chart with a proper financial
 * candlestick visualization. Designed for compact display inside the AR dashboard.
 * 
 * Features:
 * - Candlestick series with green/red coloring
 * - Volume histogram overlay at the bottom
 * - Transparent background for AR overlay compositing
 * - Auto-resize via ResizeObserver
 * - Falls back to dummy data when no data is provided
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

  // Determine if we should use dummy data
  const useDummy = !data || data.length === 0;

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

    if (useDummy) {
      // === CANDLESTICK MODE (dummy OHLC data) ===
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
    } else {
      // === AREA MODE (live PricePoint[] data from backend) ===
      const firstPrice = data[0].close;
      const lastPrice = data[data.length - 1].close;
      const isPositive = lastPrice >= firstPrice;
      const lineColor = isPositive ? "#10b981" : "#ef4444";
      const topColor = isPositive
        ? "rgba(16, 185, 129, 0.3)"
        : "rgba(239, 68, 68, 0.25)";

      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor,
        topColor,
        bottomColor: "transparent",
        lineWidth: 2,
        crosshairMarkerBackgroundColor: "#0a0e1a",
        crosshairMarkerBorderColor: lineColor,
        crosshairMarkerBorderWidth: 2,
        crosshairMarkerRadius: 4,
      });

      areaSeries.setData(
        data.map((p) => ({ time: p.date, value: p.close }))
      );
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

  return (
    <div className="chart-container">
      <div className="chart-title">
        {useDummy ? "1-Month Price Trend (Demo)" : "1-Month Price Trend"}
      </div>
      <div
        ref={chartContainerRef}
        className="lw-chart-container"
      />
    </div>
  );
}
