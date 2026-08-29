/**
 * Hook for fetching LSTM-predicted stock insights from the backend.
 * Returns trajectory predictions, volatility bounds, and sentiment.
 */

"use client";

import { useState, useCallback } from "react";
import type { StockInsights } from "@/types";
import { fetchStockInsights } from "@/lib/api";

interface UseStockInsightsReturn {
  insights: StockInsights | null;
  loading: boolean;
  error: string | null;
  fetch: (ticker: string) => Promise<StockInsights | null>;
  reset: () => void;
}

export function useStockInsights(): UseStockInsightsReturn {
  const [insights, setInsights] = useState<StockInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (ticker: string): Promise<StockInsights | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStockInsights(ticker);
      setInsights(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch stock insights";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setInsights(null);
    setError(null);
    setLoading(false);
  }, []);

  return { insights, loading, error, fetch: fetchData, reset };
}
