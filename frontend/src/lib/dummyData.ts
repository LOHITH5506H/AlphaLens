/**
 * dummyData.ts — Realistic dummy financial data for isolated UI testing.
 *
 * All test data is centralized here so it can be cleanly removed
 * once the backend integration is restored.
 */

import type { PricePoint, StockData } from "@/types";

/* =========================================================================
   OHLC Candlestick Data (AAPL-like, 30 trading days)
   ========================================================================= */

export interface OHLCPoint {
  time: string;  // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * 30 days of realistic OHLC data mimicking AAPL price action
 * in the $170–$195 range with natural volatility.
 */
export const DUMMY_OHLC_DATA: OHLCPoint[] = [
  { time: "2026-07-01", open: 171.00, high: 173.50, low: 170.20, close: 172.80 },
  { time: "2026-07-02", open: 172.80, high: 174.90, low: 172.10, close: 174.35 },
  { time: "2026-07-03", open: 174.35, high: 175.60, low: 173.40, close: 173.90 },
  { time: "2026-07-07", open: 173.90, high: 176.20, low: 173.50, close: 175.80 },
  { time: "2026-07-08", open: 175.80, high: 177.40, low: 175.00, close: 176.90 },
  { time: "2026-07-09", open: 176.90, high: 178.10, low: 175.60, close: 175.95 },
  { time: "2026-07-10", open: 175.95, high: 177.30, low: 174.80, close: 177.10 },
  { time: "2026-07-11", open: 177.10, high: 179.50, low: 176.80, close: 179.20 },
  { time: "2026-07-14", open: 179.20, high: 180.40, low: 178.00, close: 178.60 },
  { time: "2026-07-15", open: 178.60, high: 179.80, low: 177.20, close: 179.50 },
  { time: "2026-07-16", open: 179.50, high: 181.90, low: 179.10, close: 181.30 },
  { time: "2026-07-17", open: 181.30, high: 182.70, low: 180.10, close: 180.85 },
  { time: "2026-07-18", open: 180.85, high: 183.20, low: 180.50, close: 182.90 },
  { time: "2026-07-21", open: 182.90, high: 184.10, low: 181.60, close: 183.50 },
  { time: "2026-07-22", open: 183.50, high: 185.40, low: 183.00, close: 185.10 },
  { time: "2026-07-23", open: 185.10, high: 186.30, low: 183.70, close: 184.20 },
  { time: "2026-07-24", open: 184.20, high: 185.80, low: 182.90, close: 185.50 },
  { time: "2026-07-25", open: 185.50, high: 187.40, low: 185.10, close: 186.90 },
  { time: "2026-07-28", open: 186.90, high: 188.60, low: 186.20, close: 188.10 },
  { time: "2026-07-29", open: 188.10, high: 189.30, low: 186.80, close: 187.40 },
  { time: "2026-07-30", open: 187.40, high: 189.90, low: 187.00, close: 189.50 },
  { time: "2026-07-31", open: 189.50, high: 191.20, low: 188.90, close: 190.80 },
  { time: "2026-08-01", open: 190.80, high: 192.40, low: 190.10, close: 191.70 },
  { time: "2026-08-04", open: 191.70, high: 192.90, low: 189.80, close: 190.20 },
  { time: "2026-08-05", open: 190.20, high: 191.50, low: 188.60, close: 189.30 },
  { time: "2026-08-06", open: 189.30, high: 191.80, low: 189.00, close: 191.40 },
  { time: "2026-08-07", open: 191.40, high: 193.60, low: 191.00, close: 193.10 },
  { time: "2026-08-08", open: 193.10, high: 194.80, low: 192.30, close: 194.20 },
  { time: "2026-08-11", open: 194.20, high: 195.90, low: 193.50, close: 193.80 },
  { time: "2026-08-12", open: 193.80, high: 195.40, low: 193.20, close: 194.90 },
];

/* =========================================================================
   Volume Data (matched to OHLC dates)
   ========================================================================= */

export interface VolumePoint {
  time: string;
  value: number;
  color: string;
}

/** Generate volume data with green/red coloring based on OHLC direction. */
export const DUMMY_VOLUME_DATA: VolumePoint[] = DUMMY_OHLC_DATA.map((d) => ({
  time: d.time,
  value: Math.floor(40_000_000 + Math.random() * 45_000_000),
  color: d.close >= d.open
    ? "rgba(16, 185, 129, 0.4)"   // green for up days
    : "rgba(239, 68, 68, 0.35)",   // red for down days
}));

/* =========================================================================
   Area / Line Data (close prices only — for sparklines & legacy compat)
   ========================================================================= */

export interface AreaPoint {
  time: string;
  value: number;
}

/** Close-price-only series for area/line charts. */
export const DUMMY_AREA_DATA: AreaPoint[] = DUMMY_OHLC_DATA.map((d) => ({
  time: d.time,
  value: d.close,
}));

/* =========================================================================
   Legacy PricePoint format (for backward compat with existing interfaces)
   ========================================================================= */

/** Maps OHLC data to the existing PricePoint interface used by ARDashboard. */
export const DUMMY_PRICE_HISTORY: PricePoint[] = DUMMY_OHLC_DATA.map((d) => ({
  date: d.time,
  close: d.close,
}));

/* =========================================================================
   Complete StockData object (for StockStats testing)
   ========================================================================= */

export const DUMMY_STOCK_DATA: StockData = {
  ticker: "AAPL",
  name: "Apple Inc.",
  current_price: 194.90,
  market_cap: 3_020_000_000_000,
  pe_ratio: 32.45,
  eps: 6.01,
  fifty_two_week_high: 199.62,
  fifty_two_week_low: 164.08,
  volume: 54_320_000,
  sector: "Technology",
  price_history: DUMMY_PRICE_HISTORY,
};
