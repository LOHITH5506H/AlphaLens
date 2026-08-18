/**
 * StockStats — Grid of key financial metrics with mini sparkline charts.
 * 
 * Designed for use inside the AR dashboard panel. Now includes
 * lightweight-charts sparklines in each stat card and falls back
 * to dummy data when the backend isn't connected.
 */

"use client";

import { useRef, useEffect } from "react";
import { createChart, ColorType, AreaSeries } from "lightweight-charts";
import type { StockData } from "@/types";
import { formatLargeNumber, formatPrice, formatVolume } from "@/lib/constants";
import { DUMMY_STOCK_DATA, DUMMY_AREA_DATA } from "@/lib/dummyData";

interface StockStatsProps {
  data: StockData;
  /** Optional: highlight only specific stats (for voice command filtering) */
  highlightedStats?: string[];
}

interface StatItem {
  key: string;
  label: string;
  value: string;
}

/** Mini sparkline rendered with lightweight-charts inside each stat card. */
function MiniSparkline({ color }: { color: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "transparent",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: false },
      handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
      width: containerRef.current.clientWidth,
      height: 32,
    });

    // Use last 10 data points for the sparkline
    const sparkData = DUMMY_AREA_DATA.slice(-10);

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: color.replace(")", ", 0.2)").replace("rgb", "rgba"),
      bottomColor: "transparent",
      lineWidth: 1,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(sparkData);
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [color]);

  return <div ref={containerRef} className="sparkline-container" />;
}

export default function StockStats({ data, highlightedStats }: StockStatsProps) {
  // Fall back to dummy data if values are all null
  const effectiveData =
    data.current_price === null &&
    data.pe_ratio === null &&
    data.eps === null
      ? DUMMY_STOCK_DATA
      : data;

  const isDummy = effectiveData === DUMMY_STOCK_DATA;

  const stats: StatItem[] = [
    { key: "pe", label: "P/E Ratio", value: effectiveData.pe_ratio?.toFixed(2) ?? "N/A" },
    { key: "eps", label: "EPS", value: effectiveData.eps ? `$${effectiveData.eps.toFixed(2)}` : "N/A" },
    {
      key: "market_cap",
      label: "Market Cap",
      value: formatLargeNumber(effectiveData.market_cap),
    },
    { key: "volume", label: "Volume", value: formatVolume(effectiveData.volume) },
    {
      key: "52w_high",
      label: "52W High",
      value: formatPrice(effectiveData.fifty_two_week_high),
    },
    {
      key: "52w_low",
      label: "52W Low",
      value: formatPrice(effectiveData.fifty_two_week_low),
    },
  ];

  // If voice command requested specific stats, filter to only those
  const displayed = highlightedStats?.length
    ? stats.filter((s) => highlightedStats.includes(s.key))
    : stats;

  // Sparkline colors per stat key
  const sparkColors: Record<string, string> = {
    pe: "rgb(96, 165, 250)",       // blue
    eps: "rgb(52, 211, 153)",      // green
    market_cap: "rgb(251, 191, 36)", // amber
    volume: "rgb(168, 85, 247)",   // purple
    "52w_high": "rgb(16, 185, 129)", // emerald
    "52w_low": "rgb(239, 68, 68)",   // red
  };

  return (
    <div className="stats-grid">
      {isDummy && (
        <div className="stats-demo-badge">DEMO DATA</div>
      )}
      {displayed.map((stat, i) => (
        <div
          key={stat.key}
          className="stat-card animate-fade-in-up"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="label">{stat.label}</div>
          <div className="value">{stat.value}</div>
          <MiniSparkline color={sparkColors[stat.key] || "rgb(96, 165, 250)"} />
        </div>
      ))}
    </div>
  );
}
