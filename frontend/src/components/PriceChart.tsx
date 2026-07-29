/**
 * PriceChart — 1-month sparkline area chart using Recharts.
 * Designed for compact display inside the AR dashboard.
 */

"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PricePoint } from "@/types";

interface PriceChartProps {
  data: PricePoint[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(10, 14, 26, 0.95)",
        border: "1px solid rgba(59, 130, 246, 0.3)",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
        color: "#e2e8f0",
      }}
    >
      <div style={{ color: "#94a3b8", marginBottom: "2px" }}>
        {formatDate(label || "")}
      </div>
      <div style={{ fontWeight: 700, color: "#60a5fa" }}>
        ${payload[0].value.toFixed(2)}
      </div>
    </div>
  );
}

export default function PriceChart({ data }: PriceChartProps) {
  if (!data.length) {
    return (
      <div className="chart-container">
        <div className="chart-title">1-Month Price Trend</div>
        <div style={{ textAlign: "center", padding: "20px 0", color: "#64748b", fontSize: "12px" }}>
          No price history available
        </div>
      </div>
    );
  }

  // Determine trend direction for color
  const firstPrice = data[0].close;
  const lastPrice = data[data.length - 1].close;
  const isPositive = lastPrice >= firstPrice;
  const trendColor = isPositive ? "#10b981" : "#ef4444";
  const gradientId = `priceGradient-${isPositive ? "up" : "down"}`;

  return (
    <div className="chart-container">
      <div className="chart-title">1-Month Price Trend</div>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trendColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: "#64748b", fontSize: 9 }}
            axisLine={{ stroke: "rgba(59,130,246,0.1)" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={["dataMin - 2", "dataMax + 2"]}
            tick={{ fill: "#64748b", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="close"
            stroke={trendColor}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{
              r: 4,
              stroke: trendColor,
              strokeWidth: 2,
              fill: "#0a0e1a",
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
