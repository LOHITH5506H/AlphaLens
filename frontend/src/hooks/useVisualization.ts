import { useState, useEffect } from "react";
import { fetchVisualizationData } from "../lib/api";
import type { VisualizationPayload } from "../types";

export function useVisualization(ticker: string | null, type: string | null, peers: string = "") {
  const [data, setData] = useState<VisualizationPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker || !type) {
      setData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchVisualizationData(ticker, type, peers)
      .then((result) => {
        if (isMounted) {
          if (result.error) {
            setError(result.error);
            setData(null);
          } else {
            setData(result);
            setError(null);
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to fetch visualization");
          setData(null);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [ticker, type, peers]);

  return { data, loading, error };
}
