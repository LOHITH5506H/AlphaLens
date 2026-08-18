/**
 * ARDashboard — The spatial HTML overlay displayed on tracked markers.
 * 
 * This component renders the complete financial dashboard that gets
 * wrapped in a CSS3DObject and attached to MindAR anchors.
 * It can also be rendered in the fixed overlay as a fallback.
 */

"use client";

import type { StockData, AIAnalysis } from "@/types";
import { formatPrice } from "@/lib/constants";
import { DUMMY_STOCK_DATA } from "@/lib/dummyData";
import StockStats from "./StockStats";
import PriceChart from "./PriceChart";
import AIBanner from "./AIBanner";
import LoadingOverlay from "./LoadingOverlay";

interface ARDashboardProps {
  stockData: StockData | null;
  aiAnalysis: AIAnalysis | null;
  stockLoading: boolean;
  aiLoading: boolean;
  error: string | null;
  highlightedStats?: string[];
  voiceMessage?: string | null;
}

export default function ARDashboard({
  stockData,
  aiAnalysis,
  stockLoading,
  aiLoading,
  error,
  highlightedStats,
  voiceMessage,
}: ARDashboardProps) {
  // Loading state
  if (stockLoading && !stockData) {
    return <LoadingOverlay />;
  }

  // Error state
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

  // Detect demo mode (no live data, will use dummy fallback)
  const isDemoMode = !stockData.current_price && stockData.price_history.length === 0;

  // Calculate price change
  const priceChange =
    stockData.price_history.length >= 2
      ? stockData.current_price! - stockData.price_history[stockData.price_history.length - 2].close
      : null;
  const priceChangePercent =
    priceChange !== null && stockData.price_history.length >= 2
      ? (priceChange / stockData.price_history[stockData.price_history.length - 2].close) * 100
      : null;

  return (
    <div className="ar-dashboard animate-fade-in-up">
      {/* Demo mode indicator */}
      {isDemoMode && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "6px 14px",
            marginBottom: "12px",
            borderRadius: "8px",
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.2)",
          }}
        >
          <span style={{ fontSize: "10px" }}>⚡</span>
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "#f59e0b",
              textTransform: "uppercase" as const,
            }}
          >
            Demo Mode — Dummy Data
          </span>
        </div>
      )}

      {/* Header */}
      <div className="ar-dashboard-header">
        <div className="logo">
          {stockData.ticker === "AAPL"
            ? "🍎"
            : stockData.ticker === "TSLA"
            ? "⚡"
            : "🏭"}
        </div>
        <div style={{ flex: 1 }}>
          <div className="company-name">{stockData.name}</div>
          <span className="ticker-badge">{stockData.ticker}</span>
          {stockData.sector && (
            <span
              style={{
                fontSize: "10px",
                color: "#64748b",
                marginLeft: "8px",
              }}
            >
              {stockData.sector}
            </span>
          )}
        </div>
      </div>

      {/* Live Price */}
      <div className="price-row">
        <span className="price">{formatPrice(stockData.current_price)}</span>
        {priceChange !== null && (
          <span className={`change ${priceChange >= 0 ? "up" : "down"}`}>
            {priceChange >= 0 ? "▲" : "▼"} {formatPrice(Math.abs(priceChange))}
            {priceChangePercent !== null && (
              <span style={{ marginLeft: "4px" }}>
                ({priceChangePercent >= 0 ? "+" : ""}
                {priceChangePercent.toFixed(2)}%)
              </span>
            )}
          </span>
        )}
      </div>

      {/* Voice response message */}
      {voiceMessage && (
        <div
          className="glass-card-sm animate-slide-in-right"
          style={{
            padding: "10px 14px",
            marginBottom: "14px",
            fontSize: "12px",
            color: "#60a5fa",
            lineHeight: 1.5,
          }}
        >
          🤖 {voiceMessage}
        </div>
      )}

      {/* Stats Grid */}
      <StockStats data={stockData} highlightedStats={highlightedStats} />

      {/* Price Chart */}
      <PriceChart data={stockData.price_history} />

      {/* AI Recommendation */}
      {aiLoading && !aiAnalysis && (
        <div
          className="ai-banner badge-hold animate-fade-in-up"
          style={{ textAlign: "center", padding: "16px" }}
        >
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>
            ✨ Analyzing with AI...
          </div>
          <div
            className="skeleton"
            style={{ width: "60%", height: "14px", margin: "10px auto 0" }}
          />
        </div>
      )}
      {aiAnalysis && <AIBanner analysis={aiAnalysis} />}
    </div>
  );
}
