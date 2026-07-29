/**
 * Hook for fetching AI analysis from the backend.
 */

"use client";

import { useState, useCallback } from "react";
import type { AIAnalysis } from "@/types";
import { fetchAIAnalysis } from "@/lib/api";

interface UseAIAnalysisReturn {
  analysis: AIAnalysis | null;
  loading: boolean;
  error: string | null;
  fetch: (ticker: string) => Promise<AIAnalysis | null>;
  reset: () => void;
}

export function useAIAnalysis(): UseAIAnalysisReturn {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (ticker: string): Promise<AIAnalysis | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAIAnalysis(ticker);
      setAnalysis(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI analysis unavailable";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setAnalysis(null);
    setError(null);
    setLoading(false);
  }, []);

  return { analysis, loading, error, fetch: fetchData, reset };
}
