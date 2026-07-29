/**
 * Hook for fetching stock data from the backend.
 */

"use client";

import { useState, useCallback } from "react";
import type { StockData } from "@/types";
import { fetchStockData } from "@/lib/api";

interface UseStockDataReturn {
  data: StockData | null;
  loading: boolean;
  error: string | null;
  fetch: (ticker: string) => Promise<StockData | null>;
  reset: () => void;
}

export function useStockData(): UseStockDataReturn {
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (ticker: string): Promise<StockData | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStockData(ticker);
      setData(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch stock data";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, fetch: fetchData, reset };
}
