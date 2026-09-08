/**
 * ARDashboard — The spatial HTML overlay displayed on tracked markers.
 * 
 * This component renders the complete financial dashboard that gets
 * wrapped in a CSS3DObject and attached to MindAR anchors.
 * It can also be rendered in the fixed overlay as a fallback.
 */

"use client";

import React, { useState } from "react";
import type { StockData, AIAnalysis } from "@/types";
import { formatPrice } from "@/lib/constants";
import StockStats from "./StockStats";
import PriceChart from "./PriceChart";
import AIBanner from "./AIBanner";
import LoadingOverlay from "./LoadingOverlay";
import TraderChart from "./TraderChart";
import FinancialsChart from "./FinancialsChart";
import ValuationBandsChart from "./ValuationBandsChart";

interface ARDashboardProps {
  stockData: StockData | null;
  aiAnalysis: AIAnalysis | null;
  stockLoading: boolean;
  aiLoading: boolean;
  error: string | null;
  highlightedStats?: string[];
  voiceMessage?: string | null;
  activeTab: "Overview" | "Trader" | "Investor";
  onTabChange: (tab: "Overview" | "Trader" | "Investor") => void;
}

export default function ARDashboard({
  stockData,
  aiAnalysis,
  stockLoading,
  aiLoading,
  error,
  highlightedStats,
  voiceMessage,
  activeTab,
  onTabChange,
}: ARDashboardProps) {

  if (stockLoading && !stockData) {
    return <LoadingOverlay />;
  }

  if (error && !stockData) {
    return (
      <div className="ar-dashboard animate-fade-in-up">
        <div style={{ textAlign: "center", padding: "24px 16px" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚠️</div>
          <div style={{ fontSize: "14px", color: "#f87171", marginBottom: "8px", fontWeight: 600 }}>
            Data Unavailable
          </div>
          <div style={{ fontSize: "12px", color: "#94a3b8", lineHeight: 1.5 }}>
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!stockData) return null;

  const isDemoMode = !stockData.price;
  const priceChange = stockData.change ?? null;
  const priceChangePercent = stockData.changePercent ?? null;
  const currency = stockData.currency || "USD";

  return (
    <div className="ar-dashboard animate-fade-in-up flex flex-col pointer-events-auto" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
      
      {/* Tab Toggle Header */}
      <div className="flex bg-[#0f172a] bg-opacity-80 p-1 rounded-xl mb-3 border border-slate-700/50 sticky top-0 z-50 backdrop-blur-md">
        {(["Overview", "Trader", "Investor"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all duration-300 ${
              activeTab === tab
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
            }`}
          >
            {tab === "Overview" && "📊 "}
            {tab === "Trader" && "📈 "}
            {tab === "Investor" && "🏢 "}
            {tab}
          </button>
        ))}
      </div>

      {isDemoMode && (
        <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <span className="text-[10px]">⚡</span>
          <span className="text-[9px] font-bold tracking-widest text-amber-500 uppercase">
            Demo Mode — Dummy Data
          </span>
        </div>
      )}

      {/* Header (Always Visible) */}
      <div className="ar-dashboard-header">
        <div className="logo">
          {stockData.symbol === "AAPL" ? "🍎" : stockData.symbol === "TSLA" ? "⚡" : "🏭"}
        </div>
        <div className="flex-1">
          <div className="company-name">{stockData.name}</div>
          <span className="ticker-badge">{stockData.symbol}</span>
        </div>
      </div>

      {/* Live Price (Always Visible) */}
      <div className="price-row mb-3">
        <span className="price">{formatPrice(stockData.price, currency)}</span>
        {priceChange !== null && (
          <span className={`change ${priceChange >= 0 ? "up" : "down"}`}>
            {priceChange >= 0 ? "▲" : "▼"} {formatPrice(Math.abs(priceChange), currency)}
            {priceChangePercent !== null && (
              <span className="ml-1">
                ({priceChangePercent >= 0 ? "+" : ""}
                {priceChangePercent.toFixed(2)}%)
              </span>
            )}
          </span>
        )}
      </div>

      {voiceMessage && (
        <div className="glass-card-sm animate-slide-in-right px-3 py-2 mb-3 text-xs text-blue-400 leading-relaxed">
          🤖 {voiceMessage}
        </div>
      )}

      {/* ── OVERVIEW TAB ── */}
      <div className={`flex-col gap-3 transition-opacity duration-300 ${activeTab === "Overview" ? "flex" : "hidden"}`}>
        <StockStats data={stockData} highlightedStats={highlightedStats} />
        {/* Removed legacy 2D PriceChart */}
        
        {aiLoading && !aiAnalysis && (
          <div className="ai-banner badge-hold animate-fade-in-up text-center p-4">
            <div className="text-xs text-slate-400">✨ Analyzing with AI...</div>
            <div className="skeleton w-3/5 h-3.5 mx-auto mt-2" />
          </div>
        )}
        {aiAnalysis && <AIBanner analysis={aiAnalysis} />}
      </div>

      {/* ── TRADER TAB ── */}
      {activeTab === "Trader" && (
        <div className="flex-col gap-3 flex flex-1 min-h-[300px]">
          <div className="glass-card-sm flex-1 p-2 border border-slate-700/50 rounded-xl bg-slate-900/50 shadow-inner relative overflow-hidden">
             <div className="flex items-center justify-center h-full text-slate-500 text-xs text-center p-4">
                Legacy 2D charting removed.
                <br />
                Please view the 3D visualizations in the AR environment.
             </div>
          </div>
        </div>
      )}

      {/* ── INVESTOR TAB ── */}
      {activeTab === "Investor" && (
        <div className="flex-col gap-3 flex flex-1">
          <div className="glass-card-sm h-[220px] p-2 border border-slate-700/50 rounded-xl bg-slate-900/50 shadow-inner flex items-center justify-center text-slate-500 text-xs">
            Financials (Legacy 2D Chart Removed)
          </div>
          <div className="glass-card-sm h-[200px] p-2 border border-slate-700/50 rounded-xl bg-slate-900/50 shadow-inner flex items-center justify-center text-slate-500 text-xs">
            Valuation Bands (Legacy 2D Chart Removed)
          </div>
        </div>
      )}

    </div>
  );
}
