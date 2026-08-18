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
 * Search for a company name and get its ticker symbol.
 */
export async function searchTicker(query: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/search/${encodeURIComponent(query)}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to search company (${res.status})`);
  }
  const data = await res.json();
  return data.ticker;
}

/**
 * Send an image to Gemini Vision to recognize a company logo.
 */
export async function recognizeLogo(base64Image: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/recognize_logo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `Failed to recognize logo (${res.status})`);
  }
  const data = await res.json();
  return data.ticker;
}

/**
 * Fetch AI sentiment analysis for a given text summary.
 */
export async function fetchAIAnalysis(text: string): Promise<AIAnalysis> {
  const res = await fetch(`${API_BASE_URL}/api/analyze-sentiment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
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
