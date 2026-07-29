/**
 * TypeScript interfaces for AlphaLens.
 * These mirror the backend Pydantic schemas for type safety.
 */

export interface PricePoint {
  date: string;
  close: number;
}

export interface StockData {
  ticker: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  eps: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  volume: number | null;
  sector: string | null;
  price_history: PricePoint[];
}

export interface AIAnalysis {
  sentiment_score: number;
  recommendation: "Buy" | "Hold" | "Sell";
  explanation: string;
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
