/**
 * TypeScript interfaces for AlphaLens.
 * These mirror the backend Pydantic schemas for type safety.
 */

export interface PricePoint {
  date: string;
  close: number;
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
  history?: Array<Record<string, any>> | null;
  sentiment?: any | null;
  analysis?: any | null;
}

/**
 * AI Sentiment Analysis result.
 * 
 * The backend sentiment service returns flat { positive, neutral, negative } scores.
 * We also support the structured { label, score, probabilities } format
 * for forward compatibility and richer 3D visualization.
 */
export interface AIAnalysis {
  // Flat probability scores (current backend format)
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
 * Contains 5-day trajectory, volatility corridor, fundamentals, and sentiment.
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
}
