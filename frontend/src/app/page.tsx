/**
 * AlphaLens — Main Page
 *
 * Orchestrates the AR experience:
 * 1. AIScanner handles camera and Gemini Vision logo detection
 * 2. Search UI for manual company name entry
 * 3. ARDashboard displays financial data as an overlay
 * 4. VoiceButton enables voice commands
 */

"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef, useEffect } from "react";

import VoiceButton from "@/components/VoiceButton";
import { useStockData } from "@/hooks/useStockData";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
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

export default function HomePage() {
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedStats, setHighlightedStats] = useState<string[] | undefined>(undefined);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [isManual, setIsManual] = useState(false);

  const stockData = useStockData();
  const aiAnalysis = useAIAnalysis();
  const speech = useSpeech();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTickerRef = useRef(activeTicker);
  useEffect(() => {
    activeTickerRef.current = activeTicker;
  }, [activeTicker]);

  // ----- Target events (from AI Scanner or Manual Search) -----
  const handleTargetFound = useCallback(
    (targetIndex: number, ticker: string, manualTrigger = false) => {
      setActiveTicker(ticker);
      setShowDashboard(true);
      setHighlightedStats(undefined);
      setVoiceMessage(null);
      setIsManual(manualTrigger);

      stockData.fetch(ticker).then((data) => {
        if (data) {
          const text = `${data.name} (${data.ticker}) is currently trading at $${data.current_price}. It has a market cap of $${data.market_cap} and a PE ratio of ${data.pe_ratio}.`;
          aiAnalysis.fetch(text);
        }
      });
    },
    [stockData, aiAnalysis]
  );

  // ----- Manual Search (Company Name -> Ticker) -----
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

  // ----- Voice command processing -----
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
            const text = `${data.name} (${data.ticker}) is currently trading at $${data.current_price}. It has a market cap of $${data.market_cap} and a PE ratio of ${data.pe_ratio}.`;
            aiAnalysis.fetch(text);
          }
        }
      })
      .catch(() => {
        setVoiceMessage("Sorry, I couldn't process that command.");
      });
  }, [speech.transcript, speech.isListening, aiAnalysis]);

  return (
    <main style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden", background: "#0a0e1a" }}>
      {/* AR Engine (Continuous Tracking + 3D Visualizations) */}
      <ARScene
        stockData={stockData.data}
        aiAnalysis={aiAnalysis.analysis}
        aiError={aiAnalysis.error}
        isManualMode={isManual}
        onTargetFound={(index, ticker, isFallback) => handleTargetFound(index, ticker, isFallback)}
        onTargetLost={(index) => {
          // If we lose tracking, we can optionally hide the 2D dashboard
          // but we leave it for now in case the user wants to read it.
          // The 3D elements will automatically vanish when marker is lost anyway.
        }}
      />

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

      {/* AR Dashboard Overlay is entirely removed to force 3D Visualizations */}

      {isManual && showDashboard && (
        <div style={{ position: "absolute", bottom: "16px", left: "16px", right: "16px", zIndex: 100, display: "flex", justifyContent: "center" }}>
          <button 
            onClick={() => { setShowDashboard(false); setActiveTicker(null); }}
            style={{ padding: "12px 24px", background: "rgba(56, 189, 248, 0.2)", border: "1px solid rgba(56, 189, 248, 0.4)", borderRadius: "16px", color: "#38bdf8", fontWeight: "bold", cursor: "pointer", backdropFilter: "blur(8px)" }}
          >
            Close 3D View
          </button>
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
