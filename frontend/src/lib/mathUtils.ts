import type { ScenarioParams } from "@/types";

export interface ScenarioDCFResult {
  fairValue: number;
  upsidePct: number;
  upsideLabel: string;
  isUndervalued: boolean;
  isFairlyValued: boolean;
  isOvervalued: boolean;
  statusColor: string; // Tailwind color class, e.g. text-emerald-400
  statusHex: string;   // Hex color for Three.js, e.g. #10b981
  bgBadgeColor: string;
  dynamicConviction: number;
  regimeSummary: string;
}

/**
 * Single Source of Truth for DCF Fair Value across AlphaLens.
 * Used by CatalystScenarioEngine (sidebar), DCFTerrain (3D canvas), and Pitch Studio HUD.
 */
export function computeScenarioDCF(
  currentPrice: number,
  baseFairValue?: number | null,
  scenarioParams?: ScenarioParams,
  catalystScore: number = 0
): ScenarioDCFResult {
  const safeCurrent = Math.max(1, currentPrice || 100);
  // Default base fair value anchors at +12% premium for institutional baseline if unprovided
  const safeBase = baseFairValue && baseFairValue > 0 ? baseFairValue : safeCurrent * 1.12;

  const waccDelta = scenarioParams?.wacc_delta ?? 0;
  const tgrDelta = scenarioParams?.tgr_delta ?? 0;
  const marginDelta = scenarioParams?.margin_delta ?? 0;

  // Standard 2-stage DCF Sensitivity Elasticity
  // Baseline: WACC = 10.5%, Terminal Growth = 2.5%
  const origWacc = 0.105;
  const origGrowth = 0.025;
  const effWacc = Math.max(0.04, origWacc + waccDelta);
  const effGrowth = Math.max(0.005, origGrowth + tgrDelta);

  const waccFactor = (1 + origWacc) / (1 + effWacc);
  const growthFactor = (origWacc - origGrowth) / Math.max(0.008, effWacc - effGrowth);
  const marginFactor = 1 + marginDelta * 1.8;

  const morphedPrice = safeBase * Math.pow(waccFactor, 2.2) * Math.pow(growthFactor, 0.45) * marginFactor;
  const fairValue = Math.max(0.1, Number(morphedPrice.toFixed(2)));

  const upsidePct = ((fairValue - safeCurrent) / safeCurrent) * 100;
  const absUpside = Math.abs(upsidePct);

  const isUndervalued = upsidePct > 5.0;
  const isFairlyValued = absUpside <= 5.0;
  const isOvervalued = upsidePct < -5.0;

  let upsideLabel: string;
  if (upsidePct >= 0) {
    upsideLabel = `+${upsidePct.toFixed(1)}% Upside`;
  } else {
    upsideLabel = `${upsidePct.toFixed(1)}% Downside`;
  }

  let statusColor = "text-amber-400";
  let statusHex = "#f59e0b";
  let bgBadgeColor = "bg-amber-500/20 text-amber-300 border-amber-500/40";

  if (isUndervalued) {
    statusColor = "text-emerald-400";
    statusHex = "#10b981";
    bgBadgeColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  } else if (isOvervalued) {
    statusColor = "text-rose-400";
    statusHex = "#ef4444";
    bgBadgeColor = "bg-rose-500/20 text-rose-300 border-rose-500/40";
  }

  // Dynamic composite conviction score (0 - 100)
  // Re-evaluates based on active scenario delta & margin of safety
  const baseScore = 60 + (upsidePct * 0.7) + (catalystScore * 0.25) + ((scenarioParams?.lstm_drift ?? 0) * 150);
  const dynamicConviction = Math.min(95, Math.max(15, Math.round(baseScore)));

  let regimeSummary: string;
  if (scenarioParams?.active_scenario === "bull" || scenarioParams?.preset === "Bull") {
    regimeSummary = `Bullish Expansion Shock | Implied Fair Value: $${fairValue.toFixed(2)} (${upsideLabel}) | Target: Growth Acceleration`;
  } else if (scenarioParams?.active_scenario === "bear" || scenarioParams?.preset === "Bear") {
    regimeSummary = `Bearish Contraction Shock | Implied Fair Value: $${fairValue.toFixed(2)} (${upsideLabel}) | Target: Margin Compression`;
  } else if (isUndervalued) {
    regimeSummary = `Valuation Asymmetry Active | Spot: $${safeCurrent.toFixed(2)} vs DCF: $${fairValue.toFixed(2)} (${upsideLabel})`;
  } else if (isOvervalued) {
    regimeSummary = `Premium Valuation Warning | Spot: $${safeCurrent.toFixed(2)} vs DCF: $${fairValue.toFixed(2)} (${upsideLabel})`;
  } else {
    regimeSummary = `Fairly Valued Regime (±5%) | Base DCF: $${fairValue.toFixed(2)} | Institutional Volume Support`;
  }

  return {
    fairValue,
    upsidePct,
    upsideLabel,
    isUndervalued,
    isFairlyValued,
    isOvervalued,
    statusColor,
    statusHex,
    bgBadgeColor,
    dynamicConviction,
    regimeSummary,
  };
}
