/**
 * AIBanner — AI-powered Buy/Hold/Sell recommendation display.
 * Shows confidence score, recommendation, and explanation.
 */

"use client";

import type { AIAnalysis } from "@/types";

interface AIBannerProps {
  analysis: AIAnalysis;
}

function getRecommendationStyle(rec: string) {
  switch (rec) {
    case "Buy":
      return {
        className: "badge-buy",
        emoji: "🟢",
        gradient: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(52,211,153,0.05))",
      };
    case "Sell":
      return {
        className: "badge-sell",
        emoji: "🔴",
        gradient: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(248,113,113,0.05))",
      };
    default:
      return {
        className: "badge-hold",
        emoji: "🟡",
        gradient: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.05))",
      };
  }
}

function getScoreColor(score: number): string {
  if (score >= 70) return "#34d399";
  if (score >= 40) return "#fbbf24";
  return "#f87171";
}

export default function AIBanner({ analysis }: AIBannerProps) {
  const style = getRecommendationStyle(analysis.recommendation);
  const scoreColor = getScoreColor(analysis.sentiment_score);

  return (
    <div
      className={`ai-banner ${style.className} animate-fade-in-up`}
      style={{ background: style.gradient, animationDelay: "300ms" }}
    >
      <div className="ai-label">
        ✨ AI Analysis
      </div>
      <div className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span className="ai-recommendation">
          {style.emoji} {analysis.recommendation}
        </span>
      </div>
      <div className="ai-score" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span>Confidence:</span>
        {/* Mini progress bar */}
        <div
          style={{
            flex: 1,
            height: "6px",
            background: "rgba(255,255,255,0.1)",
            borderRadius: "3px",
            overflow: "hidden",
            maxWidth: "120px",
          }}
        >
          <div
            style={{
              width: `${analysis.sentiment_score}%`,
              height: "100%",
              background: scoreColor,
              borderRadius: "3px",
              transition: "width 0.8s ease",
            }}
          />
        </div>
        <span style={{ color: scoreColor, fontWeight: 700 }}>
          {analysis.sentiment_score}%
        </span>
      </div>
      <div className="ai-explanation">{analysis.explanation}</div>
    </div>
  );
}
