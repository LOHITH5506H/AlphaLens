"use client";

import React, { useState } from "react";
import type { NewsCatalyst, ThesisConvictionSummary, ScenarioParams } from "@/types";
import { computeScenarioDCF } from "@/lib/mathUtils";

interface CatalystScenarioEngineProps {
  catalysts?: NewsCatalyst[] | null;
  thesisSummary?: ThesisConvictionSummary | null;
  scenarioParams: ScenarioParams;
  onScenarioChange: (params: ScenarioParams) => void;
  currentPrice: number;
  activeMode?: "Trader" | "Investor";
}

export default function CatalystScenarioEngine({
  catalysts = [],
  thesisSummary,
  scenarioParams,
  onScenarioChange,
  currentPrice,
  activeMode = "Investor",
}: CatalystScenarioEngineProps) {
  const [showTraderValuationSliders, setShowTraderValuationSliders] = useState(false);

  // Compute unified dynamic DCF valuation, margin of safety, and conviction score
  const dcfResult = computeScenarioDCF(
    currentPrice,
    thesisSummary?.implied_dcf_price,
    scenarioParams,
    thesisSummary?.conviction_score || 0
  );

  // Preset handlers
  const handleApplyPreset = (preset: "Bull" | "Base" | "Bear") => {
    if (preset === "Bull") {
      onScenarioChange({
        wacc_delta: -0.010, // -1.0% discount rate
        tgr_delta: 0.010,   // +1.0% terminal growth
        margin_delta: 0.020, // +2.0% margin expansion
        lstm_drift: 0.035,   // +3.5% LSTM drift
        preset: "Bull",
        active_scenario: "bull",
        activeCatalystTitle: null,
      });
    } else if (preset === "Bear") {
      onScenarioChange({
        wacc_delta: 0.015,   // +1.5% discount rate
        tgr_delta: -0.010,  // -1.0% terminal growth
        margin_delta: -0.025, // -2.5% margin contraction
        lstm_drift: -0.040,  // -4.0% LSTM drift
        preset: "Bear",
        active_scenario: "bear",
        activeCatalystTitle: null,
      });
    } else {
      // Base Case
      onScenarioChange({
        wacc_delta: 0.0,
        tgr_delta: 0.0,
        margin_delta: 0.0,
        lstm_drift: 0.0,
        preset: "Base",
        active_scenario: "base",
        activeCatalystTitle: null,
      });
    }
  };

  const handleSliderChange = (key: keyof ScenarioParams, value: number) => {
    onScenarioChange({
      ...scenarioParams,
      [key]: value,
      preset: "Custom",
      active_scenario: "custom",
      activeCatalystTitle: null,
    });
  };

  const handleCatalystClick = (cat: NewsCatalyst) => {
    const delta = cat.scenario_delta || {};
    const isAlreadyActive = scenarioParams.activeCatalystTitle === cat.title;

    if (isAlreadyActive) {
      handleApplyPreset("Base");
    } else {
      const isBull = cat.sentiment_label === "Bullish";
      const isBear = cat.sentiment_label === "Bearish";
      onScenarioChange({
        wacc_delta: delta.wacc_delta ?? (isBull ? -0.008 : isBear ? 0.012 : 0),
        tgr_delta: delta.tgr_delta ?? (isBull ? 0.008 : isBear ? -0.008 : 0),
        margin_delta: delta.margin_delta ?? (isBull ? 0.015 : isBear ? -0.018 : 0),
        lstm_drift: delta.lstm_drift ?? (isBull ? 0.03 : isBear ? -0.03 : 0),
        preset: "Custom",
        active_scenario: isBull ? "bull" : isBear ? "bear" : "custom",
        activeCatalystTitle: cat.title,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* ── 1. Unified Conviction & Regime Readout ─────────────────────── */}
      <div className="glass-card-sm p-3 rounded-xl border border-cyan-500/30 bg-slate-900/70 shadow-[0_0_15px_rgba(6,182,212,0.12)]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="text-[10px] font-bold tracking-widest text-cyan-400 uppercase">
              THESIS CONVICTION
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-white px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40">
            {dcfResult.dynamicConviction} / 100
          </span>
        </div>

        <div className="text-[11px] font-medium text-slate-200 leading-snug mb-1.5">
          {dcfResult.regimeSummary}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-800">
          <span className="flex items-center gap-1">
            Target DCF: 
            <strong className={`${dcfResult.statusColor} font-mono font-bold`}>
              ${dcfResult.fairValue.toFixed(2)}
            </strong>
            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${dcfResult.bgBadgeColor}`}>
              {dcfResult.upsideLabel}
            </span>
          </span>
          <span>POC Shelf: <strong className="text-amber-400 font-mono">${(thesisSummary?.key_support_poc ?? currentPrice * 0.98).toFixed(2)}</strong></span>
        </div>
      </div>

      {/* ── 2. Scenario Stress-Testing Presets ─────────────────────────── */}
      <div className="glass-card-sm p-3 rounded-xl border border-slate-700/50 bg-slate-900/60 shadow-inner">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            {activeMode === "Trader" ? "⚡ TIMING & MOMENTUM SHOCK" : "3D MODEL STRESS-TEST"}
          </span>
          {scenarioParams.preset !== "Base" && (
            <button
              onClick={() => handleApplyPreset("Base")}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 font-medium underline transition-colors"
            >
              Reset to Base
            </button>
          )}
        </div>

        {/* Preset Buttons */}
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          <button
            onClick={() => handleApplyPreset("Bull")}
            className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${
              scenarioParams.preset === "Bull"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                : "bg-slate-800/40 text-slate-400 border-slate-700/50 hover:bg-slate-800"
            }`}
          >
            🐂 {activeMode === "Trader" ? "Bull Drift" : "Bull Case"}
          </button>
          <button
            onClick={() => handleApplyPreset("Base")}
            className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${
              scenarioParams.preset === "Base"
                ? "bg-blue-500/20 text-blue-300 border-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.25)]"
                : "bg-slate-800/40 text-slate-400 border-slate-700/50 hover:bg-slate-800"
            }`}
          >
            ⚖️ Base Case
          </button>
          <button
            onClick={() => handleApplyPreset("Bear")}
            className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${
              scenarioParams.preset === "Bear"
                ? "bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.25)]"
                : "bg-slate-800/40 text-slate-400 border-slate-700/50 hover:bg-slate-800"
            }`}
          >
            🐻 {activeMode === "Trader" ? "Bear Drift" : "Bear Case"}
          </button>
        </div>

        {/* If in Trader mode, sliders are placed in a neat expandable accordion so technicals stay visible */}
        {activeMode === "Trader" ? (
          <div>
            <button
              onClick={() => setShowTraderValuationSliders(!showTraderValuationSliders)}
              className="text-[10px] text-cyan-400/90 hover:text-cyan-300 font-semibold flex items-center justify-between w-full py-1 border-t border-slate-800 mt-1"
            >
              <span>⚙️ {showTraderValuationSliders ? "Hide" : "Fine-Tune"} Valuation Sensitivity Sliders</span>
              <span>{showTraderValuationSliders ? "▲" : "▼"}</span>
            </button>
            {showTraderValuationSliders && (
              <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-800/80 mt-1">
                {/* WACC Slider */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1 font-mono">
                    <span className="text-slate-400">Discount Rate (WACC):</span>
                    <span className={scenarioParams.wacc_delta > 0 ? "text-rose-400" : scenarioParams.wacc_delta < 0 ? "text-emerald-400" : "text-slate-300"}>
                      {scenarioParams.wacc_delta >= 0 ? `+${(scenarioParams.wacc_delta * 100).toFixed(1)}%` : `${(scenarioParams.wacc_delta * 100).toFixed(1)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-0.02}
                    max={0.02}
                    step={0.002}
                    value={scenarioParams.wacc_delta}
                    onChange={(e) => handleSliderChange("wacc_delta", parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                {/* Terminal Growth Rate Slider */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1 font-mono">
                    <span className="text-slate-400">Terminal Growth Rate:</span>
                    <span className={scenarioParams.tgr_delta > 0 ? "text-emerald-400" : scenarioParams.tgr_delta < 0 ? "text-rose-400" : "text-slate-300"}>
                      {scenarioParams.tgr_delta >= 0 ? `+${(scenarioParams.tgr_delta * 100).toFixed(1)}%` : `${(scenarioParams.tgr_delta * 100).toFixed(1)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-0.02}
                    max={0.02}
                    step={0.002}
                    value={scenarioParams.tgr_delta}
                    onChange={(e) => handleSliderChange("tgr_delta", parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                {/* Operating Margin Delta Slider */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1 font-mono">
                    <span className="text-slate-400">Operating Margin Shift:</span>
                    <span className={scenarioParams.margin_delta > 0 ? "text-emerald-400" : scenarioParams.margin_delta < 0 ? "text-rose-400" : "text-slate-300"}>
                      {scenarioParams.margin_delta >= 0 ? `+${(scenarioParams.margin_delta * 100).toFixed(1)}%` : `${(scenarioParams.margin_delta * 100).toFixed(1)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-0.03}
                    max={0.03}
                    step={0.005}
                    value={scenarioParams.margin_delta}
                    onChange={(e) => handleSliderChange("margin_delta", parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Investor Mode: Direct interactive sliders */
          <div className="flex flex-col gap-2.5 pt-1">
            {/* WACC Slider */}
            <div>
              <div className="flex justify-between text-[10px] mb-1 font-mono">
                <span className="text-slate-400">Discount Rate (WACC):</span>
                <span className={scenarioParams.wacc_delta > 0 ? "text-rose-400" : scenarioParams.wacc_delta < 0 ? "text-emerald-400" : "text-slate-300"}>
                  {scenarioParams.wacc_delta >= 0 ? `+${(scenarioParams.wacc_delta * 100).toFixed(1)}%` : `${(scenarioParams.wacc_delta * 100).toFixed(1)}%`}
                </span>
              </div>
              <input
                type="range"
                min={-0.02}
                max={0.02}
                step={0.002}
                value={scenarioParams.wacc_delta}
                onChange={(e) => handleSliderChange("wacc_delta", parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Terminal Growth Rate Slider */}
            <div>
              <div className="flex justify-between text-[10px] mb-1 font-mono">
                <span className="text-slate-400">Terminal Growth Rate:</span>
                <span className={scenarioParams.tgr_delta > 0 ? "text-emerald-400" : scenarioParams.tgr_delta < 0 ? "text-rose-400" : "text-slate-300"}>
                  {scenarioParams.tgr_delta >= 0 ? `+${(scenarioParams.tgr_delta * 100).toFixed(1)}%` : `${(scenarioParams.tgr_delta * 100).toFixed(1)}%`}
                </span>
              </div>
              <input
                type="range"
                min={-0.02}
                max={0.02}
                step={0.002}
                value={scenarioParams.tgr_delta}
                onChange={(e) => handleSliderChange("tgr_delta", parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            {/* Operating Margin Delta Slider */}
            <div>
              <div className="flex justify-between text-[10px] mb-1 font-mono">
                <span className="text-slate-400">Operating Margin Shift:</span>
                <span className={scenarioParams.margin_delta > 0 ? "text-emerald-400" : scenarioParams.margin_delta < 0 ? "text-rose-400" : "text-slate-300"}>
                  {scenarioParams.margin_delta >= 0 ? `+${(scenarioParams.margin_delta * 100).toFixed(1)}%` : `${(scenarioParams.margin_delta * 100).toFixed(1)}%`}
                </span>
              </div>
              <input
                type="range"
                min={-0.03}
                max={0.03}
                step={0.005}
                value={scenarioParams.margin_delta}
                onChange={(e) => handleSliderChange("margin_delta", parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Live Catalyst Attribution Feed ─────────────────────────── */}
      <div className="glass-card-sm p-3 rounded-xl border border-slate-700/50 bg-slate-900/60 shadow-inner">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            LIVE CATALYSTS & ATTRIBUTION
          </span>
          <span className="text-[9px] text-cyan-400 font-mono">1-Click 3D Shock</span>
        </div>

        <div className="flex flex-col gap-2">
          {catalysts && catalysts.length > 0 ? (
            catalysts.map((cat, idx) => {
              const isActive = scenarioParams.activeCatalystTitle === cat.title;
              const isBull = cat.sentiment_label === "Bullish";
              const isBear = cat.sentiment_label === "Bearish";

              return (
                <div
                  key={idx}
                  onClick={() => handleCatalystClick(cat)}
                  className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                    isActive
                      ? "bg-cyan-950/50 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                      : "bg-slate-800/40 border-slate-700/50 hover:border-slate-500 hover:bg-slate-800/70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                      isBull
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : isBear
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    }`}>
                      {cat.sentiment_label} ({cat.confidence_pct.toFixed(0)}%)
                    </span>
                    <span className="text-[9px] font-medium text-slate-400">
                      {cat.impact_category}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-slate-100 leading-snug mb-1">
                    {cat.title}
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-slate-400">
                    <span>{cat.publisher || "Financial Wire"}</span>
                    <span>{cat.published_at || "Recent"}</span>
                  </div>

                  {isActive && (
                    <div className="mt-1.5 pt-1 border-t border-cyan-500/30 text-[9px] text-cyan-300 font-mono flex items-center justify-between">
                      <span>⚡ Active 3D Shock Loaded</span>
                      <span>Click to toggle off</span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-4 text-xs text-slate-500">
              No live catalysts detected.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
