/**
 * API client for communicating with the AlphaLens FastAPI backend.
 */

import { API_BASE_URL } from "./constants";
import type { StockData, AIAnalysis, VoiceCommandResponse } from "@/types";

/**
 * Fetch stock data for a given ticker.
 */
export async function fetchStockData(ticker: string): Promise<StockData> {
  const res = await fetch(`${API_BASE_URL}/api/stock/${encodeURIComponent(ticker)}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to fetch stock data (${res.status})`);
  }
  return res.json();
}

/**
 * Fetch AI analysis for a given ticker.
 */
export async function fetchAIAnalysis(ticker: string): Promise<AIAnalysis> {
  const res = await fetch(`${API_BASE_URL}/api/analyze/${encodeURIComponent(ticker)}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to fetch AI analysis (${res.status})`);
  }
  return res.json();
}

/**
 * Send a voice command transcript to the backend for processing.
 */
export async function sendVoiceCommand(
  transcript: string,
  ticker: string
): Promise<VoiceCommandResponse> {
  const res = await fetch(`${API_BASE_URL}/api/voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, ticker }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Voice command failed (${res.status})`);
  }
  return res.json();
}
