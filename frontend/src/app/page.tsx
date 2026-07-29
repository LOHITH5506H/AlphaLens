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
import ARDashboard from "@/components/ARDashboard";
import VoiceButton from "@/components/VoiceButton";
import { useStockData } from "@/hooks/useStockData";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { useSpeech } from "@/hooks/useSpeech";
import { sendVoiceCommand, searchTicker } from "@/lib/api";

// Dynamically import AIScanner with SSR disabled (needs browser APIs)
const AIScanner = dynamic(() => import("@/components/AIScanner"), {
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
          AlphaLens Scanner
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

      stockData.fetch(ticker);
      aiAnalysis.fetch(ticker);
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
          aiAnalysis.fetch(activeTickerRef.current);
        }
      })
      .catch(() => {
        setVoiceMessage("Sorry, I couldn't process that command.");
      });
  }, [speech.transcript, speech.isListening, aiAnalysis]);

  return (
    <main style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden", background: "#0a0e1a" }}>
      {/* AI Vision Camera Scanner */}
      {!showDashboard && (
        <AIScanner
          onTargetFound={(index, ticker) => handleTargetFound(index, ticker, false)}
        />
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

      {/* Dashboard overlay */}
      {showDashboard && (
        <div
          className="ar-overlay"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            zIndex: 90,
            pointerEvents: "none"
          }}
        >
          <div style={{ maxHeight: "90vh", overflowY: "auto", pointerEvents: "auto", width: "100%", maxWidth: "400px", borderRadius: "24px", position: "relative" }}>
            <button 
              onClick={() => { setShowDashboard(false); setActiveTicker(null); setIsManual(false); }}
              style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(30, 41, 59, 0.9)", border: "1px solid rgba(148, 163, 184, 0.2)", color: "#94a3b8", width: "32px", height: "32px", borderRadius: "50%", fontSize: "16px", cursor: "pointer", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center" }}
            >✕</button>
            
            <ARDashboard
              stockData={stockData.data}
              aiAnalysis={aiAnalysis.analysis}
              stockLoading={stockData.loading || isSearching}
              aiLoading={aiAnalysis.loading}
              error={stockData.error || (voiceMessage?.includes("not found") ? voiceMessage : null)}
              highlightedStats={highlightedStats}
              voiceMessage={voiceMessage?.includes("not found") ? null : voiceMessage}
            />
          </div>
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
