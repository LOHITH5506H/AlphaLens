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
  // We expect positive, neutral, negative in percentage (0-100)
  
  // Find dominant sentiment
  let dominant = "Neutral";
  let maxScore = analysis.neutral;
  let gradient = "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.05))";
  let emoji = "🟡";
  
  if (analysis.positive > maxScore) {
    dominant = "Positive";
    maxScore = analysis.positive;
    gradient = "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(52,211,153,0.05))";
    emoji = "🟢";
  }
  if (analysis.negative > maxScore) {
    dominant = "Negative";
    maxScore = analysis.negative;
    gradient = "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(248,113,113,0.05))";
    emoji = "🔴";
  }

  return (
    <div
      className="ai-banner animate-fade-in-up"
      style={{ background: gradient, animationDelay: "300ms", padding: "16px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", marginTop: "16px" }}
    >
      <div className="ai-label" style={{ fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", fontWeight: "bold" }}>
        ✨ NLP Sentiment Analysis
      </div>
      
      <div className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <span className="ai-recommendation" style={{ fontSize: "18px", fontWeight: "bold", color: "#f8fafc" }}>
          {emoji} {dominant} ({maxScore.toFixed(1)}%)
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {/* Positive Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
          <span style={{ width: "60px", color: "#34d399", fontWeight: 600 }}>Positive</span>
          <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${analysis.positive}%`, height: "100%", background: "#34d399", borderRadius: "3px", transition: "width 0.8s ease" }} />
          </div>
          <span style={{ width: "40px", textAlign: "right", color: "#cbd5e1" }}>{analysis.positive.toFixed(1)}%</span>
        </div>
        
        {/* Neutral Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
          <span style={{ width: "60px", color: "#fbbf24", fontWeight: 600 }}>Neutral</span>
          <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${analysis.neutral}%`, height: "100%", background: "#fbbf24", borderRadius: "3px", transition: "width 0.8s ease" }} />
          </div>
          <span style={{ width: "40px", textAlign: "right", color: "#cbd5e1" }}>{analysis.neutral.toFixed(1)}%</span>
        </div>
        
        {/* Negative Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
          <span style={{ width: "60px", color: "#f87171", fontWeight: 600 }}>Negative</span>
          <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ width: `${analysis.negative}%`, height: "100%", background: "#f87171", borderRadius: "3px", transition: "width 0.8s ease" }} />
          </div>
          <span style={{ width: "40px", textAlign: "right", color: "#cbd5e1" }}>{analysis.negative.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
