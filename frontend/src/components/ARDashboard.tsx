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
import ValuationBandsChart from "./ValuationBandsChart";

interface ARDashboardProps {
  stockData: StockData | null;
  aiAnalysis: AIAnalysis | null;
  stockLoading: boolean;
  aiLoading: boolean;
  error: string | null;
  highlightedStats?: string[];
  voiceMessage?: string | null;
  activeTab: "Trader" | "Investor";
  activeMetric?: string;
  onTabChange: (tab: "Trader" | "Investor") => void;
  onSelectMetric?: (metric: string) => void;
  activeIndicators?: Record<string, boolean>;
  onToggleIndicator?: (indicator: string) => void;
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
  activeMetric,
  activeIndicators,
  onTabChange,
  onSelectMetric,
  onToggleIndicator,
}: ARDashboardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    <div className={`ar-dashboard animate-fade-in-up flex flex-col pointer-events-auto transition-all duration-300 ${isCollapsed ? 'w-16 h-16 rounded-full justify-center items-center overflow-hidden p-0' : ''}`} style={{ maxHeight: '85vh', width: isCollapsed ? '64px' : '350px', resize: isCollapsed ? 'none' : 'both', overflow: isCollapsed ? 'hidden' : 'auto' }}>
      
      {isCollapsed ? (
        <button onClick={() => setIsCollapsed(false)} className="w-full h-full text-2xl hover:scale-110 transition-transform">
          📊
        </button>
      ) : (
        <>
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs text-slate-400 font-bold tracking-widest">DASHBOARD</div>
            <button onClick={() => setIsCollapsed(true)} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors">
              —
            </button>
          </div>

          {/* Tab Toggle Header */}
          <div className="flex bg-[#0f172a] bg-opacity-80 p-1 rounded-xl mb-3 border border-slate-700/50 sticky top-0 z-50 backdrop-blur-md">
            {(["Trader", "Investor"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all duration-300 ${
              activeTab === tab
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
            }`}
          >
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

      {/* ── OVERVIEW REMOVED ── */}

      {/* ── TRADER TAB ── */}
      {activeTab === "Trader" && (
        <div className="flex-col gap-3 flex flex-1 min-h-[300px]">
          <div className="flex gap-2 mb-1 overflow-x-auto pb-1">
            {["sma", "bollinger", "macd"].map(ind => (
              <button 
                key={ind}
                onClick={() => onToggleIndicator?.(ind)}
                className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                  activeIndicators?.[ind] 
                    ? "bg-blue-500/20 text-blue-400 border-blue-500/50" 
                    : "bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50"
                }`}
              >
                {ind.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mb-1 overflow-x-auto pb-1">
            {[
              { id: "VPVR", label: "VPVR" },
            ].map(viz => (
              <button 
                key={viz.id}
                onClick={() => onSelectMetric?.(activeMetric === viz.id ? "INTRADAY" : viz.id)}
                className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                  activeMetric === viz.id
                    ? "bg-blue-500/20 text-blue-400 border-blue-500/50"
                    : "bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-700/50"
                }`}
              >
                {viz.label}
              </button>
            ))}
          </div>
          <div className="glass-card-sm flex-1 p-2 border border-slate-700/50 rounded-xl bg-slate-900/50 shadow-inner relative overflow-hidden">
            {stockData.candlesticks && stockData.candlesticks.length > 0 ? (
              <TraderChart 
                candlesticks={stockData.candlesticks} 
                technicals={stockData.technicals} 
                volumeProfile={stockData.volume_profile} 
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-xs">
                Candlestick data unavailable.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── INVESTOR TAB ── */}
      {activeTab === "Investor" && (
        <div className="flex-col gap-3 flex flex-1">
          <div className="glass-card-sm p-3 border border-slate-700/50 rounded-xl bg-slate-900/50 shadow-inner">
            <div className="text-xs font-bold text-slate-400 mb-3">FUNDAMENTAL METRICS (3D)</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "PE_RATIO", label: "P/E Ratio", color: "bg-blue-500/10 text-blue-400" },
                { id: "PB_RATIO", label: "P/B Ratio", color: "bg-indigo-500/10 text-indigo-400" },
                { id: "PEG_RATIO", label: "PEG Ratio", color: "bg-purple-500/10 text-purple-400" },
                { id: "DIVIDEND_YIELD", label: "Div Yield", color: "bg-emerald-500/10 text-emerald-400" },
                { id: "ROE", label: "ROE", color: "bg-amber-500/10 text-amber-400" },
                { id: "ROA", label: "ROA", color: "bg-yellow-500/10 text-yellow-400" },
                { id: "EBITDA_MARGIN", label: "EBITDA Mgn", color: "bg-orange-500/10 text-orange-400" },
                { id: "NET_MARGIN", label: "Net Margin", color: "bg-rose-500/10 text-rose-400" },
                { id: "FCF", label: "Free Cash Flow", color: "bg-green-500/10 text-green-400" },
                { id: "DEBT_EQUITY", label: "D/E Ratio", color: "bg-red-500/10 text-red-400" },
                { id: "NET_INTEREST_MARGIN", label: "NIM", color: "bg-cyan-500/10 text-cyan-400" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => onSelectMetric?.(m.id)}
                  className={`p-2 text-xs font-semibold rounded-lg border border-slate-700/50 hover:border-slate-500 transition-colors ${m.color}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card-sm p-3 border border-slate-700/50 rounded-xl bg-slate-900/50 shadow-inner">
            <h3 className="text-xs font-semibold text-slate-400 mb-3 tracking-wider">
                ADVANCED MODELS (3D)
            </h3>
            <div className="grid grid-cols-2 gap-2">
                <button 
                    onClick={() => onSelectMetric?.('DUPONT_TREE')} 
                    className={`p-2 rounded border text-sm transition-all ${
                        activeMetric === 'DUPONT_TREE' 
                        ? 'bg-cyan-900/40 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
                        : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-cyan-500/50'
                    }`}
                >
                    DuPont Tree
                </button>
                
                <button 
                    onClick={() => onSelectMetric?.('WATERFALL')} 
                    className={`p-2 rounded border text-sm transition-all ${
                        activeMetric === 'WATERFALL' 
                        ? 'bg-cyan-900/40 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
                        : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-cyan-500/50'
                    }`}
                >
                    Rev-to-FCF
                </button>
                
                <button 
                    onClick={() => onSelectMetric?.('PEER_SCATTER')} 
                    className={`p-2 rounded border text-sm transition-all ${
                        activeMetric === 'PEER_SCATTER' 
                        ? 'bg-cyan-900/40 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
                        : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-cyan-500/50'
                    }`}
                >
                    Peer Scatter
                </button>

                <button 
                    onClick={() => onSelectMetric?.('DCF_TERRAIN')} 
                    className={`p-2 rounded border text-sm transition-all ${
                        activeMetric === 'DCF_TERRAIN' 
                        ? 'bg-cyan-900/40 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]' 
                        : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-cyan-500/50'
                    }`}
                >
                    DCF Terrain
                </button>
            </div>
          </div>
          
          {aiLoading && !aiAnalysis && (
            <div className="ai-banner badge-hold animate-fade-in-up text-center p-4">
              <div className="text-xs text-slate-400">✨ Analyzing with AI...</div>
              <div className="skeleton w-3/5 h-3.5 mx-auto mt-2" />
            </div>
          )}
          {aiAnalysis && <AIBanner analysis={aiAnalysis} />}
        </div>
      )}

        </>
      )}
    </div>
  );
}
