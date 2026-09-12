"use client";

import React, { useEffect, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries, LineSeries } from "lightweight-charts";
import type { CandlePoint, TechnicalIndicators, VolumeProfileBin } from "@/types";

interface TraderChartProps {
  candlesticks: CandlePoint[];
  technicals?: TechnicalIndicators | null;
  volumeProfile?: VolumeProfileBin[] | null;
}

/**
 * lightweight-charts expects either "yyyy-mm-dd" strings (daily) or
 * Unix timestamps in seconds (intraday). Our backend sends
 * "2026-09-03 13:30" for 15m/1h candles, which we must convert.
 */
function parseTime(dateStr: string): string | number {
  if (dateStr.includes(" ")) {
    // Intraday: convert to Unix timestamp (seconds)
    return Math.floor(new Date(dateStr).getTime() / 1000);
  }
  // Daily: pass through as yyyy-mm-dd string
  return dateStr;
}

export default function TraderChart({ candlesticks, technicals, volumeProfile }: TraderChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndicator, setActiveIndicator] = useState<"RSI" | "MACD" | "VPVR">("VPVR");
  
  // Refs to hold chart and series instances for cleanup
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || candlesticks.length === 0) return;

    // 1. Create Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "rgba(30, 41, 59, 0.5)" },
        horzLines: { color: "rgba(30, 41, 59, 0.5)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: "rgba(30, 41, 59, 0.5)",
      },
      timeScale: {
        borderColor: "rgba(30, 41, 59, 0.5)",
        timeVisible: true,
      },
      autoSize: true, // Automatically handles resize within its container
    });
    chartRef.current = chart;

    // 2. Add Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });
    candleSeries.setData(
      candlesticks.map((c) => ({
        time: parseTime(c.date) as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    // 3. Add VWAP Line
    const vwapSeries = chart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
      crosshairMarkerVisible: false,
    });
    vwapSeries.setData(
      candlesticks
        .filter((c) => c.vwap !== null && c.vwap !== undefined)
        .map((c) => ({
          time: parseTime(c.date) as any,
          value: c.vwap!,
        }))
    );

    // 4. Add Volume Histogram (Overlaid at bottom)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(100, 116, 139, 0.3)",
      priceFormat: { type: "volume" },
      priceScaleId: "", // Overlay
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8, // Push to bottom 20%
        bottom: 0,
      },
    });
    volumeSeries.setData(
      candlesticks.map((c) => ({
        time: parseTime(c.date) as any,
        value: c.volume,
        color: c.close >= c.open ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)",
      }))
    );

    chart.timeScale().fitContent();

    // 5. ResizeObserver Cleanup
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) {
        return;
      }
      const newRect = entries[0].contentRect;
      chart.applyOptions({ width: newRect.width, height: newRect.height });
    });
    resizeObserver.observe(chartContainerRef.current);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candlesticks]); // Removed activeIndicator so chart doesn't unmount on toggle

  // VPVR HTML Overlay Logic
  const renderVPVR = () => {
    if (activeIndicator !== "VPVR" || !volumeProfile || volumeProfile.length === 0) return null;

    // Find max volume to scale bars, and identify PoC (Point of Control)
    let maxVol = 0;
    let pocIndex = -1;
    volumeProfile.forEach((bin, idx) => {
      if (bin.volume > maxVol) {
        maxVol = bin.volume;
        pocIndex = idx;
      }
    });

    return (
      <div className="absolute right-12 top-0 bottom-[20%] w-32 flex flex-col justify-between pointer-events-none opacity-60 z-10 py-2">
        {[...volumeProfile].reverse().map((bin, idx) => {
          const isPoC = volumeProfile.length - 1 - idx === pocIndex;
          const widthPct = (bin.volume / maxVol) * 100;
          return (
            <div key={idx} className="w-full flex justify-end items-center h-full my-[1px]">
              <div 
                style={{ width: `${widthPct}%`, height: '100%' }} 
                className={`transition-all duration-500 ${isPoC ? 'bg-amber-500 opacity-80' : 'bg-blue-500 opacity-30'}`}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* Indicator Pill Toggle */}
      <div className="flex justify-center mb-2 z-20 absolute top-2 left-1/2 -translate-x-1/2">
        <div className="bg-[#1e293b] bg-opacity-80 backdrop-blur-md rounded-full p-1 flex border border-slate-700 shadow-xl">
          {(["RSI", "MACD", "VPVR"] as const).map((ind) => (
            <button
              key={ind}
              onClick={() => setActiveIndicator(ind)}
              className={`px-3 py-1 text-[10px] font-bold rounded-full transition-colors ${
                activeIndicator === ind
                  ? "bg-blue-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {ind}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chart Container */}
      <div className="relative flex-1 w-full min-h-[250px]">
        {/* Isolated div for lightweight-charts to prevent React DOM conflicts */}
        <div ref={chartContainerRef} className="absolute inset-0" />
        
        {/* HTML Overlays */}
        {renderVPVR()}
      </div>

      {activeIndicator === "RSI" && technicals?.rsi_14 !== undefined && (
        <div className="absolute bottom-16 left-2 text-[10px] font-mono text-fuchsia-400 bg-slate-900 bg-opacity-80 px-2 py-1 rounded border border-slate-700">
          RSI(14): {technicals.rsi_14?.toFixed(2)}
        </div>
      )}
      {activeIndicator === "MACD" && technicals?.macd !== undefined && (
        <div className="absolute bottom-16 left-2 text-[10px] font-mono text-cyan-400 bg-slate-900 bg-opacity-80 px-2 py-1 rounded border border-slate-700">
          MACD: {technicals.macd?.toFixed(2)} | Sig: {technicals.macd_signal?.toFixed(2)} | Hist: {technicals.macd_hist?.toFixed(2)}
        </div>
      )}
    </div>
  );
}
