"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";

import VoiceButton from "@/components/VoiceButton";
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
  
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "RIBBON" | "AI" | "PREDICT" | "OPTIONS">("OVERVIEW");
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
      setActiveTab("OVERVIEW"); // Reset tab on new ticker

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

  const tabs: Array<"OVERVIEW" | "RIBBON" | "AI" | "PREDICT" | "OPTIONS"> = [
    "OVERVIEW",
    "RIBBON",
    "AI",
    ...(stockInsights.insights ? ["PREDICT" as const] : []),
    "OPTIONS"
  ];

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

      {/* 2D HUD OVERLAY */}
      {showDashboard && activeTicker && stockData.data && (
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 pb-24 md:p-12 md:pb-12">
          
          {/* Top Header */}
          <div className="flex justify-between items-start w-full">
            <div className="flex flex-col bg-slate-900/60 backdrop-blur-md border border-slate-700/50 p-4 rounded-2xl shadow-xl">
              <span className="text-4xl font-bold text-white mb-1">{activeTicker}</span>
              <span className="text-xs text-cyan-400 font-mono uppercase tracking-widest">// QUANT_STREAM: LIVE</span>
            </div>
            <div className="flex flex-col items-end bg-slate-900/60 backdrop-blur-md border border-slate-700/50 p-4 rounded-2xl shadow-xl">
              <span className="text-4xl font-bold text-white mb-1">${price.toFixed(2)}</span>
              <span className={`text-sm font-bold tracking-wide ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                {isPositive ? "▲ +" : "▼ "}{change.toFixed(2)} ({changePercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* Pinch Indicator (Only shows when on OPTIONS tab and pinching) */}
          {activeTab === "OPTIONS" && (
            <div className="absolute top-32 right-12">
              <div className={`flex items-center gap-2 bg-black/60 border ${isPinching ? 'border-orange-500 text-orange-500 shadow-[0_0_12px_#f97316]' : 'border-slate-700 text-slate-400'} rounded-lg px-3 py-1.5 text-xs font-mono backdrop-blur-md transition-all duration-200`}>
                <span className={`w-2 h-2 rounded-full ${isPinching ? 'bg-orange-500 shadow-[0_0_8px_#f97316]' : 'bg-slate-700'}`} />
                {isPinching ? "PINCH DETECTED" : "HAND TRACKING"}
              </div>
            </div>
          )}

          {/* Middle: Navigation Tabs */}
          <div className="w-full flex justify-center">
            <div className="flex gap-2 p-1.5 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl pointer-events-auto">
              {tabs.map((tab) => {
                const isActive = activeTab === tab;
                const highlightColor = tab === "PREDICT" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" : "bg-cyan-500/20 text-cyan-400 border-cyan-500/50";
                
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold tracking-wider transition-all duration-300 border ${
                      isActive 
                        ? highlightColor
                        : "bg-transparent text-slate-400 border-transparent hover:text-white hover:bg-slate-800"
                    }`}
                  >
                    {tab}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Bottom Footer */}
          <div className="w-full flex justify-center mt-auto">
            <div className="flex items-center gap-8 bg-slate-900/60 backdrop-blur-md border border-slate-700/50 px-6 py-3 rounded-full shadow-lg font-mono text-xs">
              <span className="text-slate-400">
                VOL: <span className="text-white">{(volume / 1000000).toFixed(2)}M</span>
              </span>
              <div className="w-px h-4 bg-slate-700" />
              <span className="text-slate-400">
                RANGE: <span className="text-white">${low.toFixed(1)} - ${high.toFixed(1)}</span>
              </span>
              <div className="w-px h-4 bg-slate-700" />
              <span className="text-slate-400">
                AI_CONF: <span className="text-emerald-400">{aiConf.toFixed(0)}%</span>
              </span>
            </div>
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
