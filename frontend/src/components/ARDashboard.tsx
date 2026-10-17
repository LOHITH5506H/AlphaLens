/**
 * ARDashboard — The spatial HTML overlay displayed on tracked markers.
 * 
 * Strict flex-column layout:
 * - Fixed Top Header: Ticker, price, mode tabs, pitch button, collapse
 * - Scrollable Content Body: Technical timing tools or Valuation models,
 *   plus the interactive Catalyst & Scenario Stress-Tester.
 */

"use client";

import React, { useState } from "react";
import type { StockData, AIAnalysis, StockInsights, ScenarioParams } from "@/types";
import { formatPrice } from "@/lib/constants";
import StockStats from "./StockStats";
import LoadingOverlay from "./LoadingOverlay";
import TraderChart from "./TraderChart";
import ValuationBandsChart from "./ValuationBandsChart";
import CatalystScenarioEngine from "./CatalystScenarioEngine";

interface ARDashboardProps {
  stockData: StockData | null;
  aiAnalysis: AIAnalysis | null;
  stockInsights?: StockInsights | null;
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
  scenarioParams: ScenarioParams;
  onScenarioChange: (params: ScenarioParams) => void;
  onApplyCatalystDelta?: (delta: Partial<ScenarioParams>) => void;
  isPitchMode?: boolean;
  onTogglePitchMode?: () => void;
  showLSTMConeInTrader?: boolean;
  onToggleLSTMCone?: () => void;
}

export default function ARDashboard({
  stockData,
  aiAnalysis,
  stockInsights,
  stockLoading,
  aiLoading,
  error,
  highlightedStats,
  voiceMessage,
  activeTab,
  activeMetric = "INTRADAY",
  activeIndicators,
  onTabChange,
  onSelectMetric,
  onToggleIndicator,
  scenarioParams,
  onScenarioChange,
  isPitchMode = false,
  onTogglePitchMode,
  showLSTMConeInTrader = false,
  onToggleLSTMCone,
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

  // Aggregate catalysts from stockData or stockInsights
  const catalysts = stockData.catalysts || stockInsights?.catalysts || [];
  const thesisSummary = stockData.thesis_summary || stockInsights?.thesis_summary || null;

  return (
    <div
      className={`ar-dashboard animate-fade-in-up flex flex-col pointer-events-auto transition-all duration-300 ${
        isCollapsed
          ? "w-16 h-16 rounded-full justify-center items-center overflow-hidden p-0"
          : "h-full max-h-[calc(100vh-6.5rem)] w-[370px] overflow-hidden p-0 border border-slate-700/60 shadow-2xl rounded-2xl bg-slate-950/90 backdrop-blur-xl"
      }`}
    >
      {isCollapsed ? (
        <button
          onClick={() => setIsCollapsed(false)}
          className="w-full h-full text-2xl hover:scale-110 transition-transform flex items-center justify-center bg-slate-900 border border-cyan-500/40 text-cyan-400 rounded-full"
        >
          📊
        </button>
      ) : (
        <>
          {/* ═════════════════════════════════════════════════════════════════
              FIXED TOP HEADER (Edge-to-edge rounded glass, seamless with container)
              ═════════════════════════════════════════════════════════════════ */}
          <div className="shrink-0 z-20 rounded-t-2xl bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/80 p-3.5 flex flex-col gap-2.5">
            {/* Top Row: Title, Broadcast Pitch Button, Collapse */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span className="text-cyan-400 text-xs">◈</span>
                <span className="text-[10px] text-slate-300 font-extrabold tracking-widest uppercase">
                  ALPHALENS TERMINAL
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {onTogglePitchMode && (
                  <button
                    onClick={onTogglePitchMode}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-all ${
                      isPitchMode
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                        : "bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white"
                    }`}
                    title="Toggle Presentation / Pitch Studio HUD"
                  >
                    🎬 {isPitchMode ? "Pitch HUD On" : "Pitch Mode"}
                  </button>
                )}
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors text-xs"
                >
                  —
                </button>
              </div>
            </div>

            {/* Mode Switcher Tabs (Framed for Analyst Workflow) */}
            <div className="flex bg-[#0f172a] p-1 rounded-xl border border-slate-700/60">
              <button
                onClick={() => onTabChange("Trader")}
                className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 ${
                  activeTab === "Trader"
                    ? "bg-blue-600/25 text-blue-400 border border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <span>⚡</span>
                <span>Timing & Technicals</span>
              </button>
              <button
                onClick={() => onTabChange("Investor")}
                className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 ${
                  activeTab === "Investor"
                    ? "bg-cyan-600/25 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <span>🏛️</span>
                <span>Valuation & Thesis</span>
              </button>
            </div>

            {/* Header (Company info, Ticker badge, and Live Price) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-lg">
                  {stockData.symbol === "AAPL" ? "🍎" : stockData.symbol === "TSLA" ? "⚡" : stockData.symbol === "NVDA" ? "🟢" : "🏢"}
                </div>
                <div>
                  <div className="text-sm font-bold text-white leading-tight">
                    {stockData.name || stockData.symbol}
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 tracking-wider">
                    {stockData.symbol} · {currency}
                  </span>
                </div>
              </div>

              {/* Price Row */}
              <div className="text-right">
                <div className="text-base font-bold font-mono text-white">
                  {formatPrice(stockData.price, currency)}
                </div>
                {priceChange !== null && (
                  <div className={`text-[11px] font-mono font-semibold flex items-center justify-end gap-0.5 ${
                    priceChange >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}>
                    <span>{priceChange >= 0 ? "▲" : "▼"}</span>
                    <span>{formatPrice(Math.abs(priceChange), currency)}</span>
                    {priceChangePercent !== null && (
                      <span>({priceChangePercent >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%)</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {voiceMessage && (
              <div className="glass-card-sm animate-slide-in-right px-2.5 py-1.5 text-xs text-cyan-300 rounded-lg bg-cyan-950/40 border border-cyan-500/30 flex items-center gap-1.5">
                <span>🤖</span>
                <span className="truncate">{voiceMessage}</span>
              </div>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════════
              SCROLLABLE CONTENT BODY (Strict flex clipping, pr-1)
              ═════════════════════════════════════════════════════════════════ */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 space-y-3.5 custom-scrollbar">
            {/* ── 1. TIMING & TECHNICALS TAB ── */}
            {activeTab === "Trader" && (
              <div className="flex flex-col gap-3">
                {/* Technical Indicator & 3D Overlay Controls FIRST */}
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    {["sma", "bollinger", "macd"].map((ind) => (
                      <button
                        key={ind}
                        onClick={() => onToggleIndicator?.(ind)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
                          activeIndicators?.[ind]
                            ? "bg-blue-500/25 text-blue-300 border-blue-500/60"
                            : "bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800"
                        }`}
                      >
                        {ind.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1">
                    {/* VPVR Wall 3D Toggle */}
                    <button
                      onClick={() => onSelectMetric?.(activeMetric === "VPVR" ? "INTRADAY" : "VPVR")}
                      className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
                        activeMetric === "VPVR"
                          ? "bg-cyan-500/25 text-cyan-300 border-cyan-500/60 shadow-[0_0_10px_rgba(6,182,212,0.25)]"
                          : "bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800"
                      }`}
                    >
                      3D VPVR Shelves
                    </button>

                    {/* LSTM Cone Overlay Toggle (Prominently Highlighted) */}
                    {onToggleLSTMCone && (
                      <button
                        onClick={onToggleLSTMCone}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
                          showLSTMConeInTrader
                            ? "bg-purple-500/25 text-purple-300 border-purple-500/60 shadow-[0_0_10px_rgba(168,85,247,0.25)]"
                            : "bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800"
                        }`}
                      >
                        ✨ AI LSTM 5D Cone
                      </button>
                    )}
                  </div>
                </div>

                {/* 2D Interactive Timing Chart */}
                <div className="glass-card-sm p-2 border border-slate-700/60 rounded-xl bg-slate-900/60 shadow-inner min-h-[250px] relative overflow-hidden">
                  {stockData.candlesticks && stockData.candlesticks.length > 0 ? (
                    <TraderChart
                      candlesticks={stockData.candlesticks}
                      technicals={stockData.technicals}
                      volumeProfile={stockData.volume_profile}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-48 text-slate-500 text-xs">
                      Candlestick data unavailable.
                    </div>
                  )}
                </div>

                {/* Catalyst & Momentum Shock Engine (Tailored for Trader Mode) */}
                <CatalystScenarioEngine
                  catalysts={catalysts}
                  thesisSummary={thesisSummary}
                  scenarioParams={scenarioParams}
                  onScenarioChange={onScenarioChange}
                  currentPrice={stockData.price}
                  activeMode="Trader"
                />
              </div>
            )}

            {/* ── 2. VALUATION & THESIS LAB TAB ── */}
            {activeTab === "Investor" && (
              <div className="flex flex-col gap-3">
                {/* 3D Advanced Valuation Models FIRST */}
                <div className="glass-card-sm p-3 border border-slate-700/60 rounded-xl bg-slate-900/60 shadow-inner">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
                      3D SPATIAL VALUATION MODELS
                    </span>
                    {activeMetric && activeMetric !== "INTRADAY" && activeMetric !== "MARKET_CAP" && activeMetric !== "DAY_RANGE" && activeMetric !== "VOLUME" && (
                      <button
                        onClick={() => onSelectMetric?.("INTRADAY")}
                        className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        ← Back to Overview
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "DCF_TERRAIN", label: "DCF Terrain", desc: "WACC vs Growth Surface", icon: "🏔️" },
                      { id: "PEER_SCATTER", label: "Peer Scatter", desc: "P/E vs ROE vs Growth", icon: "🌌" },
                      { id: "DUPONT_TREE", label: "DuPont Tree", desc: "ROE 3-Factor Lattice", icon: "🌳" },
                      { id: "WATERFALL", label: "Rev-to-FCF", desc: "Margin Step-Down", icon: "📊" },
                    ].map((model) => (
                      <button
                        key={model.id}
                        onClick={() => onSelectMetric?.(model.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          activeMetric === model.id
                            ? "bg-cyan-950/60 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                            : "bg-slate-800/40 border-slate-700/60 text-slate-300 hover:border-slate-500 hover:bg-slate-800/80"
                        }`}
                      >
                        <div className="text-sm font-bold flex items-center gap-1.5">
                          <span>{model.icon}</span>
                          <span>{model.label}</span>
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5">
                          {model.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Catalyst & Scenario Stress-Test Engine Directly Below 3D Models */}
                <CatalystScenarioEngine
                  catalysts={catalysts}
                  thesisSummary={thesisSummary}
                  scenarioParams={scenarioParams}
                  onScenarioChange={onScenarioChange}
                  currentPrice={stockData.price}
                  activeMode="Investor"
                />

                {/* 11 Fundamental Financial Multiple Selectors */}
                <div className="glass-card-sm p-3 border border-slate-700/60 rounded-xl bg-slate-900/60 shadow-inner">
                  <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
                    FUNDAMENTAL RATIOS (HISTORICAL 3D)
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "PE_RATIO", label: "P/E Ratio" },
                      { id: "PB_RATIO", label: "P/B Ratio" },
                      { id: "PEG_RATIO", label: "PEG Ratio" },
                      { id: "DIVIDEND_YIELD", label: "Div Yield" },
                      { id: "ROE", label: "ROE" },
                      { id: "ROA", label: "ROA" },
                      { id: "NET_MARGIN", label: "Net Margin" },
                      { id: "FCF", label: "Free Cash Flow" },
                      { id: "DEBT_EQUITY", label: "D/E Ratio" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => onSelectMetric?.(m.id)}
                        className={`py-1.5 px-2 text-[10px] font-semibold rounded-lg border text-center transition-all ${
                          activeMetric === m.id
                            ? "bg-cyan-900/50 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                            : "bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2D Valuation Band Preview (if history exists) */}
                {stockData.valuation_history && stockData.valuation_history.length > 0 && (
                  <div className="glass-card-sm p-2 border border-slate-700/60 rounded-xl bg-slate-900/60 shadow-inner h-44">
                    <ValuationBandsChart valuationHistory={stockData.valuation_history} />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
