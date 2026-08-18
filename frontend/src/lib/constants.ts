/**
 * Constants and configuration for AlphaLens.
 */

import type { MarkerMapping } from "@/types";

/** Backend API base URL. Change this for production. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 
  (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:8000` : "http://localhost:8000");

/**
 * Mapping from MindAR target indices to stock tickers.
 * 
 * The order here must match the order of images used when compiling
 * the targets.mind file via the MindAR Image Target Compiler.
 * 
 * Target 0 = first image uploaded, Target 1 = second, etc.
 */
export const MARKER_MAPPINGS: MarkerMapping[] = [
  { targetIndex: 0, ticker: "AAPL", name: "Apple Inc.", logo: "🍎" },
  { targetIndex: 1, ticker: "TSLA", name: "Tesla, Inc.", logo: "⚡" },
  { targetIndex: 2, ticker: "RELIANCE.NS", name: "Reliance Industries", logo: "🏭" },
];

/**
 * Get the marker mapping for a given target index.
 */
export function getMarkerByIndex(index: number): MarkerMapping | undefined {
  return MARKER_MAPPINGS.find((m) => m.targetIndex === index);
}

/**
 * Format large numbers for display (e.g., market cap).
 * 1,234,567,890 → "$1.23B"
 */
export function formatLargeNumber(num: number | null): string {
  if (num === null || num === undefined) return "N/A";
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

/**
 * Format a price value.
 */
export function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return "N/A";
  return `$${price.toFixed(2)}`;
}

/**
 * Format volume numbers.
 */
export function formatVolume(vol: number | null): string {
  if (vol === null || vol === undefined) return "N/A";
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
  return vol.toLocaleString();
}
