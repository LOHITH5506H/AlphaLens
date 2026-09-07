"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";

import VoiceButton from "@/components/VoiceButton";
import ARDashboard from "@/components/ARDashboard";
import { useStockData } from "@/hooks/useStockData";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { useStockInsights } from "@/hooks/useStockInsights";
import { useSpeech } from "@/hooks/useSpeech";
import { sendVoiceCommand, searchTicker } from "@/lib/api";

// Dynamically import ARScene with SSR disabled (needs browser APIs)
const ARScene = dynamic(() => import("@/components/ARScene"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0e1a",
        zIndex: 100,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📷</div>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>
          AlphaLens AR Engine
        </div>
        <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "6px" }}>
          Initializing camera...
        </div>
      </div>
    </div>
  ),
});

const INTENT_TO_STATS: Record<string, string[]> = {
  show_pe: ["pe"],
  show_eps: ["eps"],
  show_market_cap: ["market_cap"],
  show_volume: ["volume"],
  show_price: [],
  show_chart: [],
  show_all: [],
};

const REFRESH_INTERVAL_MS = 60_000;

export default function HomePage() {
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedStats, setHighlightedStats] = useState<string[] | undefined>(undefined);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [isManual, setIsManual] = useState(false);
  
  const [activeTab, setActiveTab] = useState<"Overview" | "Trader" | "Investor">("Overview");
  const [isPinching, setIsPinching] = useState(false);

  const stockData = useStockData();
  const aiAnalysis = useAIAnalysis();
  const stockInsights = useStockInsights();
  const speech = useSpeech();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTickerRef = useRef(activeTicker);
  useEffect(() => {
    activeTickerRef.current = activeTicker;
  }, [activeTicker]);

  const handleTargetFound = useCallback(
    (targetIndex: number, ticker: string, manualTrigger = false) => {
      setActiveTicker(ticker);
      setShowDashboard(true);
      setHighlightedStats(undefined);
      setVoiceMessage(null);
      setIsManual(manualTrigger);
      setActiveTab("Overview"); // Reset tab on new ticker

      stockData.fetch(ticker).then((data) => {
        if (data) {
          const text = `${data.name ?? data.symbol} (${data.symbol}) is currently trading at $${data.price}. It has a market cap of $${data.marketCap ?? 'N/A'} and a PE ratio of ${data.peRatio ?? 'N/A'}.`;
          aiAnalysis.fetch(text);
        }
      });

      stockInsights.fetch(ticker);
    },
    [stockData, aiAnalysis, stockInsights]
  );

  useEffect(() => {
    if (!activeTicker) return;

    const intervalId = setInterval(() => {
      const ticker = activeTickerRef.current;
      if (!ticker) return;

      stockData.fetch(ticker);
      stockInsights.fetch(ticker);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [activeTicker, stockData, stockInsights]);

  const handleManualScan = useCallback(async (query: string) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    setIsSearching(true);
    setVoiceMessage(null);
    try {
      const ticker = await searchTicker(cleanQuery);
      handleTargetFound(0, ticker, true);
    } catch (err) {
      setVoiceMessage(err instanceof Error ? err.message : "Company not found");
      setShowDashboard(true);
      setActiveTicker(null);
      setIsManual(true);
    } finally {
      setIsSearching(false);
      setSearchInput("");
    }
  }, [handleTargetFound]);

  const prevTranscript = useRef("");
  useEffect(() => {
    const transcript = speech.transcript;
    if (!transcript || transcript === prevTranscript.current || speech.isListening) {
      return;
    }
    prevTranscript.current = transcript;

    if (!activeTickerRef.current) {
      setVoiceMessage("Please scan a logo or search for a company first.");
      return;
    }

    sendVoiceCommand(transcript, activeTickerRef.current)
      .then((response) => {
        setVoiceMessage(response.message);
        if (response.intent in INTENT_TO_STATS) {
          const stats = INTENT_TO_STATS[response.intent];
          setHighlightedStats(stats.length > 0 ? stats : undefined);
        }
        if (response.intent === "ai_analysis" && activeTickerRef.current) {
          if (stockData.data) {
            const data = stockData.data;
            const text = `${data.name ?? data.symbol} (${data.symbol}) is currently trading at $${data.price}. It has a market cap of $${data.marketCap ?? 'N/A'} and a PE ratio of ${data.peRatio ?? 'N/A'}.`;
            aiAnalysis.fetch(text);
          }
        }
      })
      .catch(() => {
        setVoiceMessage("Sorry, I couldn't process that command.");
      });
  }, [speech.transcript, speech.isListening, aiAnalysis]);

  // Derived data for HUD
  const price = stockData.data?.price ?? 0;
  const change = stockData.data?.change ?? 0;
  const changePercent = stockData.data?.changePercent ?? 0;
  const isPositive = change >= 0;
  const volume = stockData.data?.volume ?? 0;
  const high = stockData.data?.high ?? 0;
  const low = stockData.data?.low ?? 0;

  const finbertScore = stockInsights.insights?.sentiment_score ?? null;
  const aiConf = finbertScore !== null ? Math.abs(finbertScore) : (aiAnalysis.analysis?.score ?? 0.5) * 100;


  return (
    <main className="relative w-full h-screen overflow-hidden bg-slate-950">
      {/* AR Engine (Continuous Tracking + 3D Visualizations) */}
      <div className="absolute inset-0 z-0">
        <ARScene
          stockData={stockData.data}
          aiAnalysis={aiAnalysis.analysis}
          aiError={aiAnalysis.error}
          stockInsights={stockInsights.insights}
          isManualMode={isManual}
          activeTab={activeTab}
          onPinchStateChange={setIsPinching}
          onTargetFound={(index, ticker, isFallback) => handleTargetFound(index, ticker, isFallback)}
          onTargetLost={(index) => {}}
          onClose={() => {
            setShowDashboard(false);
            setActiveTicker(null);
            setIsManual(false);
            stockData.reset();
            aiAnalysis.reset();
            stockInsights.reset();
          }}
        />
      </div>

      {/* 2D HUD OVERLAY - Centralized Dashboard */}
      {showDashboard && activeTicker && stockData.data && (
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-start justify-center p-6 md:p-12">
          {/* We position ARDashboard on the left side of the screen, or center on mobile */}
          <div className="pointer-events-auto h-full flex items-center">
            <ARDashboard 
              stockData={stockData.data}
              aiAnalysis={aiAnalysis.analysis}
              stockLoading={stockData.loading}
              aiLoading={aiAnalysis.loading}
              error={stockData.error || aiAnalysis.error}
              highlightedStats={highlightedStats}
              voiceMessage={voiceMessage}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>
        </div>
      )}


      {/* Manual Search UI */}
      {!showDashboard && (
        <div style={{ position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 100, width: "90%", maxWidth: "400px" }}>
          <form 
            onSubmit={(e) => { e.preventDefault(); handleManualScan(searchInput); }}
            style={{ display: "flex", gap: "8px", background: "rgba(10, 14, 26, 0.7)", padding: "8px", borderRadius: "24px", backdropFilter: "blur(12px)", border: "1px solid rgba(56, 189, 248, 0.3)" }}
          >
            <input 
              type="text" 
              placeholder="Search company (e.g., Apple)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ flex: 1, background: "transparent", border: "none", color: "white", padding: "8px 16px", fontSize: "14px", outline: "none" }}
            />
            <button 
              type="submit"
              disabled={isSearching}
              style={{ background: "#38bdf8", color: "white", border: "none", borderRadius: "16px", padding: "0 16px", fontSize: "14px", fontWeight: "bold", cursor: isSearching ? "wait" : "pointer" }}
            >
              {isSearching ? "..." : "Search"}
            </button>
          </form>
        </div>
      )}

      {mounted && (
        <VoiceButton
          isListening={speech.isListening}
          isSupported={speech.isSupported}
          transcript={speech.transcript}
          onStart={speech.startListening}
          onStop={speech.stopListening}
        />
      )}
    </main>
  );
}
