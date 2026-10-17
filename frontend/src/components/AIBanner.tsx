/**
 * AIBanner — AI-powered deterministic sentiment analysis display.
 * Shows Positive, Neutral, and Negative sentiment scores.
 */

"use client";

import type { AIAnalysis } from "@/types";

interface AIBannerProps {
  analysis: AIAnalysis;
}

export default function AIBanner({ analysis }: AIBannerProps) {
  // Guard against fractional (0-1) vs percentage (0-100) representations
  const rawSum = (analysis.positive || 0) + (analysis.neutral || 0) + (analysis.negative || 0);
  const scale = rawSum > 0 && rawSum <= 1.05 ? 100 : 1;

  const pos = (analysis.positive || 0) * scale;
  const neu = (analysis.neutral || 0) * scale;
  const neg = (analysis.negative || 0) * scale;
  
  // Find dominant sentiment
  let dominant = "Neutral";
  let maxScore = neu;
  let gradient = "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.05))";
  let emoji = "🟡";
  let badgeColor = "text-amber-400 border-amber-500/30 bg-amber-500/10";
  
  if (pos > maxScore) {
    dominant = "Bullish";
    maxScore = pos;
    gradient = "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(52,211,153,0.05))";
    emoji = "🟢";
    badgeColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  }
  if (neg > maxScore) {
    dominant = "Bearish";
    maxScore = neg;
    gradient = "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(248,113,113,0.05))";
    emoji = "🔴";
    badgeColor = "text-rose-400 border-rose-500/30 bg-rose-500/10";
  }

  return (
    <div
      className="ai-banner animate-fade-in-up"
      style={{ background: gradient, animationDelay: "300ms", padding: "14px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)", marginTop: "12px" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <span>✨</span> FINBERT SENTIMENT ANALYSIS
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeColor}`}>
          {emoji} {dominant} ({maxScore.toFixed(1)}%)
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {/* Positive Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px" }}>
          <span style={{ width: "55px", color: "#34d399", fontWeight: 600 }}>Bullish</span>
          <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(pos, 100)}%`, height: "100%", background: "#34d399", borderRadius: "3px", transition: "width 0.8s ease" }} />
          </div>
          <span style={{ width: "38px", textAlign: "right", color: "#cbd5e1", fontFamily: "monospace" }}>{pos.toFixed(1)}%</span>
        </div>
        
        {/* Neutral Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px" }}>
          <span style={{ width: "55px", color: "#fbbf24", fontWeight: 600 }}>Neutral</span>
          <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(neu, 100)}%`, height: "100%", background: "#fbbf24", borderRadius: "3px", transition: "width 0.8s ease" }} />
          </div>
          <span style={{ width: "38px", textAlign: "right", color: "#cbd5e1", fontFamily: "monospace" }}>{neu.toFixed(1)}%</span>
        </div>
        
        {/* Negative Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px" }}>
          <span style={{ width: "55px", color: "#f87171", fontWeight: 600 }}>Bearish</span>
          <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(neg, 100)}%`, height: "100%", background: "#f87171", borderRadius: "3px", transition: "width 0.8s ease" }} />
          </div>
          <span style={{ width: "38px", textAlign: "right", color: "#cbd5e1", fontFamily: "monospace" }}>{neg.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
