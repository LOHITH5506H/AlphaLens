"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";

import VoiceButton from "@/components/VoiceButton";
import ARDashboard from "@/components/ARDashboard";
import { useStockData } from "@/hooks/useStockData";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { useStockInsights } from "@/hooks/useStockInsights";
import { useSpeech } from "@/hooks/useSpeech";
import { useHandTracking } from "@/hooks/useHandTracking";
import HandCursor from "@/components/HandCursor";
import { sendVoiceCommand, searchTicker } from "@/lib/api";
import { METRIC_TIMEFRAMES } from "@/lib/constants";
import type { FundamentalMetricResponse } from "@/types";

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
  
  const [activeTab, setActiveTab] = useState<"Trader" | "Investor">("Investor");
  const [activeMetric, setActiveMetric] = useState<string>("INTRADAY");
  const [timeframe, setTimeframe] = useState<string>("1Yr");
  const [activeIndicators, setActiveIndicators] = useState<Record<string, boolean>>({
    sma: false,
    bollinger: false,
    macd: false
  });
  const [selectedMetricData, setSelectedMetricData] = useState<FundamentalMetricResponse | null>(null);
  const [isPinching, setIsPinching] = useState(false);
  const [isHandTrackingEnabled, setIsHandTrackingEnabled] = useState(false);

  const stockData = useStockData();
  const aiAnalysis = useAIAnalysis();
  const stockInsights = useStockInsights();
  const speech = useSpeech();
  const { gestureState, coordsRef } = useHandTracking(isHandTrackingEnabled);

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
      setActiveTab("Investor"); // Reset tab on new ticker
      setActiveMetric("INTRADAY");

      stockData.fetch(ticker, timeframe).then((data) => {
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

      stockData.fetch(ticker, timeframe);
      stockInsights.fetch(ticker);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [activeTicker, stockData, stockInsights, timeframe]);

  useEffect(() => {
    if (activeTicker) {
      stockData.fetch(activeTicker, timeframe);
    }
  }, [timeframe]);

  useEffect(() => {
    if (!activeTicker) return;
    const basicMetrics = ["INTRADAY", "VOLUME", "MARKET_CAP", "DAY_RANGE", "VPVR", "DUPONT_TREE", "WATERFALL", "PEER_SCATTER", "DCF_TERRAIN"];
    if (basicMetrics.includes(activeMetric)) {
      setSelectedMetricData(null);
      return;
    }
    fetch(`http://localhost:8000/api/stock/${activeTicker}/metric/${activeMetric}?timeframe=${timeframe}`)
      .then(r => r.json())
      .then(data => {
        if (!data.detail) setSelectedMetricData(data);
      })
      .catch(e => console.error("Error fetching metric:", e));
  }, [activeTicker, activeMetric, timeframe]);

  useEffect(() => {
    const validTimeframes = METRIC_TIMEFRAMES[activeMetric || 'INTRADAY'] || [];
    if (validTimeframes.length > 0 && !validTimeframes.includes(timeframe)) {
        setTimeframe(validTimeframes[0]); 
    }
  }, [activeMetric, timeframe]);

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

  // Handle Hand Gestures
  const tabs: ("Trader" | "Investor")[] = ["Trader", "Investor"];
  
  useEffect(() => {
    if (gestureState.swipeDirection === "left") {
      setActiveTab((prev) => {
        const idx = tabs.indexOf(prev);
        return tabs[Math.min(idx + 1, tabs.length - 1)];
      });
    } else if (gestureState.swipeDirection === "right") {
      setActiveTab((prev) => {
        const idx = tabs.indexOf(prev);
        return tabs[Math.max(idx - 1, 0)];
      });
    }
  }, [gestureState.swipeDirection]);

  const prevPinchRef = useRef(false);
  const lastElementRef = useRef<Element | null>(null);
  const lastYRef = useRef(0);

  // Patch Pointer Capture to prevent React/R3F crashes when using fake pointer IDs
  useEffect(() => {
    if (typeof window === "undefined") return;
    const originalSet = Element.prototype.setPointerCapture;
    const originalRelease = Element.prototype.releasePointerCapture;
    
    Element.prototype.setPointerCapture = function(pointerId) {
      try { originalSet.call(this, pointerId); } catch(e) {}
    };
    Element.prototype.releasePointerCapture = function(pointerId) {
      try { originalRelease.call(this, pointerId); } catch(e) {}
    };

    return () => {
      Element.prototype.setPointerCapture = originalSet;
      Element.prototype.releasePointerCapture = originalRelease;
    };
  }, []);

  // Handle continuous pointermove outside of React state
  useEffect(() => {
    if (!gestureState.isVisible) return;
    
    let rafId: number;
    
    const loop = () => {
      const clientX = coordsRef.current.x * window.innerWidth;
      const clientY = coordsRef.current.y * window.innerHeight;
      
      const element = document.elementFromPoint(clientX, clientY);
      
      if (gestureState.isMiddlePinching) {
        const deltaY = clientY - lastYRef.current;
        if (Math.abs(deltaY) > 2) {
          if (element) {
            const wheelEvent = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX, clientY, deltaY: deltaY * 3 });
            element.dispatchEvent(wheelEvent);
          }
          lastYRef.current = clientY;
        }
      } else {
        lastYRef.current = clientY;
        if (element) {
          const moveEvent = new PointerEvent("pointermove", {
            bubbles: true, cancelable: true, clientX, clientY, pointerId: 99, pointerType: "mouse",
            buttons: prevPinchRef.current ? 1 : 0
          });
          element.dispatchEvent(moveEvent);
        }
      }
      
      rafId = requestAnimationFrame(loop);
    };
    
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [gestureState.isVisible, gestureState.isMiddlePinching, coordsRef]);

  // Handle discrete pointerdown/up and AR state sync
  useEffect(() => {
    if (gestureState.isVisible) {
      setIsPinching(gestureState.isPinching);
    }

    if (!gestureState.isVisible) {
      prevPinchRef.current = false;
      return;
    }

    const clientX = coordsRef.current.x * window.innerWidth;
    const clientY = coordsRef.current.y * window.innerHeight;
    const element = document.elementFromPoint(clientX, clientY);

    const isJustPinched = gestureState.isPinching && !prevPinchRef.current;
    const isJustReleased = !gestureState.isPinching && prevPinchRef.current;
    
    if (element && !gestureState.isMiddlePinching) {
      if (isJustPinched) {
        const downEvent = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX, clientY, pointerId: 99, pointerType: "mouse", buttons: 1 });
        element.dispatchEvent(downEvent);
        lastElementRef.current = element;
      }
      if (isJustReleased) {
        const target = lastElementRef.current || element;
        const upEvent = new PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX, clientY, pointerId: 99, pointerType: "mouse", buttons: 0 });
        target.dispatchEvent(upEvent);
        if (target instanceof HTMLElement) target.click();
        lastElementRef.current = null;
      }
    } else if (isJustReleased && lastElementRef.current) {
        const upEvent = new PointerEvent("pointerup", { bubbles: true, cancelable: true, clientX, clientY, pointerId: 99, pointerType: "mouse", buttons: 0 });
        lastElementRef.current.dispatchEvent(upEvent);
        lastElementRef.current = null;
    }

    prevPinchRef.current = gestureState.isPinching;
  }, [gestureState.isPinching, gestureState.isMiddlePinching, gestureState.isVisible, coordsRef]);

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
          activeMetric={activeMetric}
          selectedMetricData={selectedMetricData}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          activeIndicators={activeIndicators}
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
              activeMetric={activeMetric}
              activeIndicators={activeIndicators}
              onTabChange={setActiveTab}
              onSelectMetric={setActiveMetric}
              onToggleIndicator={(indicator: string) => {
                setActiveIndicators(prev => ({...prev, [indicator]: !prev[indicator]}));
              }}
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
        <>
          <VoiceButton
            isListening={speech.isListening}
            isSupported={speech.isSupported}
            transcript={speech.transcript}
            onStart={speech.startListening}
            onStop={speech.stopListening}
          />
          {/* Hand Tracking Toggle */}
          <button
            onClick={() => setIsHandTrackingEnabled(!isHandTrackingEnabled)}
            style={{
              position: "fixed",
              bottom: "24px",
              left: "24px",
              zIndex: 110,
              padding: "12px 16px",
              borderRadius: "24px",
              background: isHandTrackingEnabled ? "rgba(56, 189, 248, 0.4)" : "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${isHandTrackingEnabled ? "rgba(56, 189, 248, 0.6)" : "rgba(148, 163, 184, 0.15)"}`,
              color: "#f1f5f9",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: isHandTrackingEnabled ? "0 0 15px rgba(56,189,248,0.4)" : "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            <span style={{ fontSize: "18px" }}>{isHandTrackingEnabled ? "✋" : "🤚"}</span>
            <span>{isHandTrackingEnabled ? "Gestures On" : "Gestures Off"}</span>
          </button>
          
          <HandCursor 
            coordsRef={coordsRef} 
            isPinching={gestureState.isPinching} 
            isVisible={gestureState.isVisible} 
          />
        </>
      )}
    </main>
  );
}
