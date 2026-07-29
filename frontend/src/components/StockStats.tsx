/**
 * StockStats — Grid of key financial metrics.
 * Designed for use inside the AR dashboard panel.
 */

"use client";

import type { StockData } from "@/types";
import { formatLargeNumber, formatPrice, formatVolume } from "@/lib/constants";

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

export default function StockStats({ data, highlightedStats }: StockStatsProps) {
  const stats: StatItem[] = [
    { key: "pe", label: "P/E Ratio", value: data.pe_ratio?.toFixed(2) ?? "N/A" },
    { key: "eps", label: "EPS", value: data.eps ? `$${data.eps.toFixed(2)}` : "N/A" },
    {
      key: "market_cap",
      label: "Market Cap",
      value: formatLargeNumber(data.market_cap),
    },
    { key: "volume", label: "Volume", value: formatVolume(data.volume) },
    {
      key: "52w_high",
      label: "52W High",
      value: formatPrice(data.fifty_two_week_high),
    },
    {
      key: "52w_low",
      label: "52W Low",
      value: formatPrice(data.fifty_two_week_low),
    },
  ];

  // If voice command requested specific stats, filter to only those
  const displayed = highlightedStats?.length
    ? stats.filter((s) => highlightedStats.includes(s.key))
    : stats;

  return (
    <div className="stats-grid">
      {displayed.map((stat, i) => (
        <div
          key={stat.key}
          className="stat-card animate-fade-in-up"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="label">{stat.label}</div>
          <div className="value">{stat.value}</div>
        </div>
      ))}
    </div>
  );
}
