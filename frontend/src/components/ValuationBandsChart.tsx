"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ValuationMultiplePoint } from "@/types";

interface ValuationBandsChartProps {
  valuationHistory: ValuationMultiplePoint[];
}

export default function ValuationBandsChart({ valuationHistory }: ValuationBandsChartProps) {
  if (!valuationHistory || valuationHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm p-4 text-center border border-slate-700/50 rounded-lg bg-slate-800/30">
        <span className="text-xl mb-2">📊</span>
        <span>Valuation data unavailable.</span>
        <span className="text-xs text-slate-600 mt-1">Earnings may be negative or not reported.</span>
      </div>
    );
  }

  // Calculate Median P/E for the band reference (if multiple points exist)
  const validPEs = valuationHistory.map(v => v.trailing_pe).filter(pe => pe !== null && pe !== undefined) as number[];
  
  if (validPEs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm p-4 text-center border border-slate-700/50 rounded-lg bg-slate-800/30">
        <span className="text-xl mb-2">📊</span>
        <span>N/A — Negative Earnings</span>
        <span className="text-xs text-slate-600 mt-1">Trailing P/E ratio is undefined.</span>
      </div>
    );
  }

  const sortedPEs = [...validPEs].sort((a, b) => a - b);
  const medianPE = sortedPEs[Math.floor(sortedPEs.length / 2)];
  const currentPE = validPEs[validPEs.length - 1];

  let valuationStatus = "FAIR VALUE";
  let statusColor = "text-blue-400 border-blue-500/30 bg-blue-500/10";

  if (currentPE < medianPE * 0.85) {
    valuationStatus = "UNDERVALUED";
    statusColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  } else if (currentPE > medianPE * 1.15) {
    valuationStatus = "EXTENDED";
    statusColor = "text-amber-400 border-amber-500/30 bg-amber-500/10";
  }

  const data = valuationHistory.map(v => ({
    name: v.date.substring(5), // Show MM-DD
    PE: v.trailing_pe,
    Median: medianPE,
  }));

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-2 px-2">
        <div className="text-[10px] font-bold text-slate-400">VALUATION BANDS (P/E)</div>
        <div className={`text-[9px] font-bold px-2 py-0.5 rounded border ${statusColor}`}>
          {valuationStatus}
        </div>
      </div>
      
      <div className="flex-1 min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 41, 59, 0.5)" vertical={false} />
            <XAxis dataKey="name" stroke="#64748b" fontSize={9} tickMargin={5} />
            <YAxis 
              stroke="#64748b" 
              fontSize={9} 
              domain={['auto', 'auto']}
              tickFormatter={(val) => `${val.toFixed(1)}x`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
              itemStyle={{ fontSize: "12px" }}
              labelStyle={{ color: "#94a3b8", marginBottom: "4px" }}
              formatter={(value: any, name: any) => [`${value.toFixed(2)}x`, name === "pe" ? "Trailing P/E" : "Median Band"]}
            />
            <Line 
              type="monotone" 
              dataKey="PE" 
              stroke="#8b5cf6" 
              strokeWidth={2} 
              dot={false}
              activeDot={{ r: 4, fill: "#8b5cf6" }} 
            />
            <Line 
              type="stepAfter" 
              dataKey="Median" 
              stroke="#64748b" 
              strokeWidth={1} 
              strokeDasharray="4 4"
              dot={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="px-2 mt-1 flex justify-between text-[10px] text-slate-500">
        <span>Current: {currentPE.toFixed(1)}x</span>
        <span>Median: {medianPE.toFixed(1)}x</span>
      </div>
    </div>
  );
}
