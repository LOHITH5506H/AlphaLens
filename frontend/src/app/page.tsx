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
import type { FundamentalMetricResponse, ScenarioParams } from "@/types";
import { computeScenarioDCF } from "@/lib/mathUtils";

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
    sma: true,
    bollinger: false,
    macd: false
  });
  const [selectedMetricData, setSelectedMetricData] = useState<FundamentalMetricResponse | null>(null);
  const [metricLoading, setMetricLoading] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [isHandTrackingEnabled, setIsHandTrackingEnabled] = useState(false);

  // ── Analyst Catalyst & Stress-Testing Scenario State ─────────────────
  const [scenarioParams, setScenarioParams] = useState<ScenarioParams>({
    wacc_delta: 0,
    tgr_delta: 0,
    margin_delta: 0,
    active_scenario: "base",
  });
  const [isPitchMode, setIsPitchMode] = useState<boolean>(false);
  const [showLSTMConeInTrader, setShowLSTMConeInTrader] = useState<boolean>(true);

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
      setMetricLoading(false);
      return;
    }
    setSelectedMetricData(null);
    setMetricLoading(true);
    fetch(`http://localhost:8000/api/stock/${activeTicker}/metric/${activeMetric}?timeframe=${timeframe}`)
      .then(r => r.json())
      .then(data => {
        if (!data.detail) setSelectedMetricData(data);
      })
      .catch(e => console.error("Error fetching metric:", e))
      .finally(() => setMetricLoading(false));
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
        const intent = response.intent;
        if (intent in INTENT_TO_STATS) {
          const stats = INTENT_TO_STATS[intent];
          setHighlightedStats(stats.length > 0 ? stats : undefined);
        }
        if (intent === "ai_analysis" && activeTickerRef.current) {
          if (stockData.data) {
            const data = stockData.data;
            const text = `${data.name ?? data.symbol} (${data.symbol}) is currently trading at $${data.price}. It has a market cap of $${data.marketCap ?? 'N/A'} and a PE ratio of ${data.peRatio ?? 'N/A'}.`;
            aiAnalysis.fetch(text);
          }
        }
        // Analyst Workflow & Stress-Testing Intents:
        if (intent === "stress_test_bear") {
          setScenarioParams({
            wacc_delta: 0.015,
            tgr_delta: -0.01,
            margin_delta: -0.02,
            active_scenario: "bear",
          });
        } else if (intent === "stress_test_bull") {
          setScenarioParams({
            wacc_delta: -0.01,
            tgr_delta: 0.015,
            margin_delta: 0.02,
            active_scenario: "bull",
          });
        } else if (intent === "stress_test_base") {
          setScenarioParams({
            wacc_delta: 0,
            tgr_delta: 0,
            margin_delta: 0,
            active_scenario: "base",
          });
        } else if (intent === "show_dcf") {
          setActiveTab("Investor");
          setActiveMetric("DCF_TERRAIN");
        } else if (intent === "show_peers") {
          setActiveTab("Investor");
          setActiveMetric("PEER_SCATTER");
        } else if (intent === "show_dupont") {
          setActiveTab("Investor");
          setActiveMetric("DUPONT_TREE");
        } else if (intent === "show_vpvr") {
          setActiveTab("Trader");
          setActiveMetric("VPVR");
        } else if (intent === "switch_trader") {
          setActiveTab("Trader");
        } else if (intent === "switch_investor") {
          setActiveTab("Investor");
        } else if (intent === "pitch_mode") {
          setIsPitchMode(prev => !prev);
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

  const pitchDcfResult = useMemo(() => {
    if (!stockData.data) return null;
    return computeScenarioDCF(
      stockData.data.price,
      stockInsights.insights?.thesis_summary?.implied_dcf_price,
      scenarioParams,
      stockInsights.insights?.thesis_summary?.conviction_score || 0
    );
  }, [stockData.data, stockInsights.insights, scenarioParams]);

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
          stockLoading={stockData.loading || metricLoading}
          activeTab={activeTab}
          activeMetric={activeMetric}
          selectedMetricData={selectedMetricData}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          activeIndicators={activeIndicators}
          onPinchStateChange={setIsPinching}
          scenarioParams={scenarioParams}
          showLSTMConeInTrader={showLSTMConeInTrader}
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

      {/* ── 🎬 LIVE THESIS & PITCH BROADCAST HUD ──────────────────────── */}
      {isPitchMode && stockData.data && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl pointer-events-auto">
          <div className="bg-slate-950/90 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-3.5 shadow-2xl shadow-cyan-950/50 flex flex-wrap items-center justify-between gap-4">
            {/* Left: Ticker & Live Pulse */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-semibold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                PITCH STUDIO
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold tracking-tight text-white">{stockData.data.symbol}</span>
                  <span className="text-xs text-slate-400 hidden sm:inline">{stockData.data.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-200">${stockData.data.price?.toFixed(2)}</span>
                  <span className={stockData.data.change && stockData.data.change >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {stockData.data.change && stockData.data.change >= 0 ? "+" : ""}{stockData.data.changePercent?.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Middle: Valuation & DCF Thesis (Aligned 100% with mathUtils & DCF Terrain) */}
            <div className="hidden md:flex items-center gap-6 border-x border-slate-800/80 px-6 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Implied DCF Fair Value</div>
                <div className={`text-sm font-bold font-mono ${pitchDcfResult?.statusColor || "text-cyan-400"}`}>
                  ${pitchDcfResult ? pitchDcfResult.fairValue.toFixed(2) : "---"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Margin of Safety</div>
                <div className={`text-sm font-bold font-mono ${pitchDcfResult?.statusColor || "text-cyan-400"}`}>
                  {pitchDcfResult ? pitchDcfResult.upsideLabel : "---"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Active Stress Scenario</div>
                <div className={`text-xs font-semibold px-2 py-0.5 rounded border ${pitchDcfResult?.bgBadgeColor || "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"}`}>
                  {(scenarioParams.active_scenario || scenarioParams.preset || "base").toUpperCase()} CASE
                </div>
              </div>
            </div>

            {/* Right: Technical Shelf & Mode Fast Switcher */}
            <div className="flex items-center gap-2 text-xs">
              {stockInsights.insights?.thesis_summary?.volume_poc && (
                <div className="hidden lg:block text-right pr-2">
                  <div className="text-[10px] text-slate-400">VPVR Volume POC</div>
                  <div className="font-semibold text-amber-300">${stockInsights.insights.thesis_summary.volume_poc.toFixed(2)}</div>
                </div>
              )}
              <button 
                onClick={() => {
                  const nextTab = activeTab === "Trader" ? "Investor" : "Trader";
                  setActiveTab(nextTab);
                  if (nextTab === "Trader") setActiveMetric("VPVR");
                  else setActiveMetric("DCF_TERRAIN");
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition"
              >
                {activeTab === "Trader" ? "🏛️ Valuation" : "⚡ Trader"}
              </button>
              <button 
                onClick={() => setIsPitchMode(false)}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 transition"
                title="Exit Pitch Mode"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2D HUD OVERLAY - Centralized Dashboard */}
      {showDashboard && activeTicker && stockData.data && !isPitchMode && (
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
              onTabChange={(tab) => {
                setActiveTab(tab);
                if (tab === "Trader") {
                  setActiveMetric("VPVR");
                } else if (tab === "Investor") {
                  setActiveMetric("DCF_TERRAIN");
                }
              }}
              onSelectMetric={(metric: string) => {
                setActiveMetric(prev => prev === metric ? "INTRADAY" : metric);
              }}
              onToggleIndicator={(indicator: string) => {
                setActiveIndicators(prev => ({...prev, [indicator]: !prev[indicator]}));
              }}
              stockInsights={stockInsights.insights}
              scenarioParams={scenarioParams}
              onScenarioChange={setScenarioParams}
              onApplyCatalystDelta={(delta: Partial<ScenarioParams>) => setScenarioParams(prev => ({ ...prev, ...delta }))}
              isPitchMode={isPitchMode}
              onTogglePitchMode={() => setIsPitchMode(prev => !prev)}
              showLSTMConeInTrader={showLSTMConeInTrader}
              onToggleLSTMCone={() => setShowLSTMConeInTrader(prev => !prev)}
            />
          </div>
        </div>
      )}

      {/* Full-viewport Loading Overlay — Suppresses premature 3D render */}
      {((stockData.loading && !stockData.data) || metricLoading) && showDashboard && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300 pointer-events-none">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-3 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
            <div className="text-sm font-semibold text-cyan-400 tracking-widest uppercase">
              {metricLoading ? "Loading metric data..." : "Fetching spatial market intelligence..."}
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
        <>
          <VoiceButton
            isListening={speech.isListening}
            isSupported={speech.isSupported}
            transcript={speech.transcript}
            onStart={speech.startListening}
            onStop={speech.stopListening}
          />
          {/* Hand Tracking Toggle — Top right next to Camera button */}
          <button
            onClick={() => setIsHandTrackingEnabled(!isHandTrackingEnabled)}
            style={{
              position: "fixed",
              top: "16px",
              right: "135px",
              zIndex: 110,
              padding: "9px 15px",
              borderRadius: "20px",
              background: isHandTrackingEnabled ? "rgba(56, 189, 248, 0.35)" : "rgba(15, 23, 42, 0.75)",
              backdropFilter: "blur(12px)",
              border: `1px solid ${isHandTrackingEnabled ? "rgba(56, 189, 248, 0.6)" : "rgba(148, 163, 184, 0.2)"}`,
              color: "#f1f5f9",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: isHandTrackingEnabled ? "0 0 15px rgba(56,189,248,0.4)" : "0 4px 12px rgba(0,0,0,0.3)",
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ fontSize: "16px" }}>{isHandTrackingEnabled ? "✋" : "🤚"}</span>
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
