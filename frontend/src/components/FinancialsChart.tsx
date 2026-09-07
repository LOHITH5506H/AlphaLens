"use client";

import React from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { FinancialBreakdown } from "@/types";
import { formatLargeNumber } from "@/lib/constants";

interface FinancialsChartProps {
  financials: FinancialBreakdown[];
  currency?: string;
}

export default function FinancialsChart({ financials, currency = "USD" }: FinancialsChartProps) {
  if (!financials || financials.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        No financial data available.
      </div>
    );
  }

  // Format data for Recharts
  const data = financials.map((f) => ({
    name: f.quarter,
    Revenue: f.revenue || 0,
    GrossProfit: f.gross_profit || 0,
    OperatingIncome: f.operating_income || 0,
    NetIncome: f.net_income || 0,
    OperatingMargin: f.operating_margin ? f.operating_margin * 100 : 0, // Convert to %
  }));

  return (
    <div className="w-full h-full flex flex-col">
      <div className="text-[10px] font-bold text-slate-400 mb-1 pl-2">QUARTERLY FINANCIALS (LAST 4Q)</div>
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 41, 59, 0.5)" vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickMargin={8} />
            <YAxis 
              yAxisId="left" 
              stroke="#64748b" 
              fontSize={10} 
              tickFormatter={(val) => formatLargeNumber(val, currency)}
              width={60}
            />
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              stroke="#38bdf8" 
              fontSize={10} 
              tickFormatter={(val) => `${val.toFixed(0)}%`}
              width={40}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
              itemStyle={{ fontSize: "12px" }}
              formatter={(value: any, name: any) => {
                if (name === "OperatingMargin") return [`${value.toFixed(2)}%`, "Margin"];
                return [formatLargeNumber(value, currency), name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: "10px" }} />
            
            <Bar yAxisId="left" dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
            <Bar yAxisId="left" dataKey="GrossProfit" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
            <Bar yAxisId="left" dataKey="OperatingIncome" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
            
            <Line 
              yAxisId="right" 
              type="monotone" 
              dataKey="OperatingMargin" 
              stroke="#38bdf8" 
              strokeWidth={2} 
              dot={{ r: 3, fill: "#0f172a", strokeWidth: 2 }} 
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
