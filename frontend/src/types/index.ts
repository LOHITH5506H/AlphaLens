/**
 * TypeScript interfaces for AlphaLens.
 * These mirror the backend Pydantic schemas for type safety.
 */

export interface PricePoint {
  date: string;
  close: number;
}

export interface CandlePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number | null;
}

export interface TechnicalIndicators {
  rsi_14?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  macd_hist?: number | null;
  vwap?: number | null;
}

export interface FinancialBreakdown {
  quarter: string;
  revenue?: number | null;
  gross_profit?: number | null;
  operating_income?: number | null;
  net_income?: number | null;
  operating_margin?: number | null;
}

export interface ValuationMultiplePoint {
  date: string;
  price: number;
  trailing_pe?: number | null;
  forward_pe?: number | null;
  ev_to_ebitda?: number | null;
}

export interface VolumeProfileBin {
  price_level: number;
  volume: number;
}

export interface NewsCatalyst {
  title: string;
  publisher?: string | null;
  published_at?: string | null;
  sentiment_label: "Bullish" | "Neutral" | "Bearish" | string;
  confidence_pct: number;
  impact_category: "Growth Catalyst" | "Margin Pressure" | "Margin Expansion" | "Valuation / Rate Risk" | "Technical Momentum" | string;
  scenario_delta: {
    wacc_delta?: number;
    tgr_delta?: number;
    margin_delta?: number;
    lstm_drift?: number;
  };
}

export interface ThesisConvictionSummary {
  conviction_score: number;
  regime_label: string;
  valuation_status: string;
  catalyst_bias: string;
  key_support_poc?: number | null;
  volume_poc?: number | null;
  implied_dcf_price?: number | null;
  fair_value_estimate?: number | null;
  margin_of_safety_pct?: number | null;
}

export interface ScenarioParams {
  wacc_delta: number;    // e.g. -0.01 (-1%)
  tgr_delta: number;     // e.g. +0.005 (+0.5%)
  margin_delta: number;  // e.g. +0.02 (+2%)
  lstm_drift?: number;   // e.g. +0.03 (+3%)
  preset?: "Bull" | "Base" | "Bear" | "Custom";
  active_scenario?: "bull" | "base" | "bear" | "custom" | string;
  activeCatalystTitle?: string | null;
}

/**
 * Matches the backend StockData Pydantic schema (models/schemas.py).
 * The backend sends: symbol, price, change, changePercent, high, low, open, etc.
 */
export interface StockData {
  symbol: string;
  name?: string | null;
  price: number;
  change: number;
  changePercent?: number | null;
  high?: number | null;
  low?: number | null;
  open?: number | null;
  previousClose?: number | null;
  volume?: number | null;
  marketCap?: number | null;
  peRatio?: number | null;
  currency: string;
  history?: Array<Record<string, any>> | null;
  candlesticks?: CandlePoint[] | null;
  technicals?: TechnicalIndicators | null;
  financials?: FinancialBreakdown[] | null;
  valuation_history?: ValuationMultiplePoint[] | null;
  volume_profile?: VolumeProfileBin[] | null;
  sentiment?: any | null;
  analysis?: any | null;
  catalysts?: NewsCatalyst[] | null;
  thesis_summary?: ThesisConvictionSummary | null;
}

/**
 * AI Sentiment Analysis result.
 * 
 * The backend sentiment service returns flat { positive, neutral, negative } scores.
 * We also support the structured { label, score, probabilities } format
 * for forward compatibility and richer 3D visualization.
 */
export interface AIAnalysis {
  // Flat probability scores (current backend format, scaled 0-100)
  positive: number;
  neutral: number;
  negative: number;
  // Structured format (derived on the frontend or future backend upgrade)
  label?: string;
  score?: number;
  probabilities?: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export interface VoiceCommandResponse {
  intent: string;
  message: string;
  data: Record<string, unknown> | null;
}

/** Maps a MindAR target index to its ticker symbol and display name. */
export interface MarkerMapping {
  targetIndex: number;
  ticker: string;
  name: string;
  logo: string; // emoji or icon identifier
}

/**
 * LSTM-predicted stock insights from /api/stock-insights endpoint.
 * Contains 5-day trajectory, volatility corridor, fundamentals, catalysts, and thesis summary.
 */
export interface StockInsights {
  ticker: string;
  current_price: number;
  pe_ratio: number | null;
  market_cap: number | null;
  profit_margins: number | null;
  debt_to_equity: number | null;
  predicted_prices: number[];       // 5 future predicted dollar prices
  volatility_upper: number[];       // 5 upper boundary dollar values
  volatility_lower: number[];       // 5 lower boundary dollar values
  sentiment_score: number;          // [-1.0 to 1.0] from local FinBERT
  sentiment_label: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  prediction_dates: string[];       // ISO date strings
  headline_count?: number;
  catalysts?: NewsCatalyst[] | null;
  thesis_summary?: ThesisConvictionSummary | null;
}

export interface MetricDataSeries {
  name: string;
  values: number[];
  color: string;
}

export interface FundamentalMetricResponse {
  template_type: "comparative_bar" | "component_terrain" | "risk_corridor";
  x_labels: string[];
  y_labels: string[];
  z_labels: string[];
  data: MetricDataSeries[];
}

export type VisualizationType =
  | "waterfall"
  | "dcf_terrain"
  | "peer_scatter"
  | "dupont"
  | "vpvr"
  | "ema_ribbon"
  | "iv_surface"
  | "monte_carlo"
  | "contagion_graph";

export interface VisualizationPayload {
  type: string;
  axes: Record<string, string>;
  dimensions: Record<string, any>;
  error?: string | null;
}

export interface SearchSuggestion {
  symbol: string;
  name: string;
  exchange?: string;
  sector?: string;
  score?: number;
  matchReason?: string;
  isCorrection?: boolean;
}

export interface SearchResult {
  ticker: string;
  name?: string;
  query: string;
  isCorrection?: boolean;
  matchReason?: string;
  suggestions?: SearchSuggestion[];
}

