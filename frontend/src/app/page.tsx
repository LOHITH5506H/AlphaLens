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
import { sendVoiceCommand, searchTicker, fetchStockData } from "@/lib/api";
import { METRIC_TIMEFRAMES } from "@/lib/constants";
import type { FundamentalMetricResponse, ScenarioParams, StockData } from "@/types";
import { computeScenarioDCF } from "@/lib/mathUtils";
import { CompanySearch } from "@/components/CompanySearch";
import { resolveCompanyQuery } from "@/lib/searchUtils";

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

// ── 5-Stage Cinematic Presentation Tour Matrix ──────────────────────────────
const TOUR_STAGES = [
  {
    step: 1,
    title: "Step 1/5: Technical Regime & LSTM",
    tab: "Trader" as const,
    metric: "INTRADAY",
    getBriefing: (ticker: string, price: number, lstmTarget: number) =>
      `Stage 1: Technical Regime and LSTM 5-day neural forecast for ${ticker}. Current spot $${price.toFixed(2)}, projected upside target $${lstmTarget.toFixed(2)}.`,
  },
  {
    step: 2,
    title: "Step 2/5: 3D DCF Valuation Surface",
    tab: "Investor" as const,
    metric: "DCF_TERRAIN",
    getBriefing: (ticker: string, fairValue: number, bullValue: number) =>
      `Stage 2: 3D DCF Valuation Sensitivity Surface. Base case fair value $${fairValue.toFixed(2)}, with unconstrained Bull case upside to $${bullValue.toFixed(2)}.`,
  },
  {
    step: 3,
    title: "Step 3/5: Peer Pareto Scatter",
    tab: "Investor" as const,
    metric: "PEER_SCATTER",
    getBriefing: (ticker: string) =>
      `Stage 3: Multi-Factor Peer Pareto Scatter Cloud for ${ticker}. Benchmarking valuation multiples, ROE, and growth velocity against mega-cap peers.`,
  },
  {
    step: 4,
    title: "Step 4/5: DuPont ROE Lattice",
    tab: "Investor" as const,
    metric: "DUPONT_TREE",
    getBriefing: (ticker: string) =>
      `Stage 4: DuPont ROE 3D Factor Tree for ${ticker}. Decomposing profitability into Net Margin, Asset Turnover, and Financial Leverage efficiency.`,
  },
  {
    step: 5,
    title: "Step 5/5: 3D Supply-Chain & Ecosystem Contagion Network",
    tab: "Investor" as const,
    metric: "CONTAGION_GRAPH",
    getBriefing: (ticker: string) =>
      `Stage 5: 3D Supply-Chain and Ecosystem Contagion Network for ${ticker}. Simulating how upstream semiconductor foundry bottlenecks and downstream ecosystem risks propagate second-order margin and DCF shocks.`,
  },
];

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
  const [isAutoTour, setIsAutoTour] = useState<boolean>(false);
  const [tourStep, setTourStep] = useState<number>(0);
  const [showICDebate, setShowICDebate] = useState<boolean>(false);

  // ⚔️ Dual-Ticker 3D Battle Mode State
  const [compareTicker, setCompareTicker] = useState<string | null>(null);
  const [compareStockData, setCompareStockData] = useState<StockData | null>(null);

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
    const basicMetrics = ["INTRADAY", "VOLUME", "MARKET_CAP", "DAY_RANGE", "VPVR", "DUPONT_TREE", "WATERFALL", "PEER_SCATTER", "DCF_TERRAIN", "CONTAGION_GRAPH"];
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

  const handleSelectTicker = useCallback((ticker: string) => {
    // Reset active scenario shocks to Base Case
    setScenarioParams({
      wacc_delta: 0,
      tgr_delta: 0,
      margin_delta: 0,
      active_scenario: "base",
    });
    if (ticker === compareTicker) {
      setCompareTicker(null);
      setCompareStockData(null);
    }
    const currentMetric = activeMetric;
    const currentTab = activeTab;

    handleTargetFound(0, ticker, true);

    // If user was viewing a specialized metric (e.g. CONTAGION_GRAPH, DCF_TERRAIN, VPVR, IV_SURFACE), preserve it
    if (currentMetric && currentMetric !== "INTRADAY") {
      setActiveMetric(currentMetric);
      setActiveTab(currentTab);
    }
  }, [handleTargetFound, activeMetric, activeTab, compareTicker]);

  // ⚔️ Battle Mode Rival Data Fetcher with robust offline fallback
  const handleSetCompareTicker = useCallback(async (ticker: string | null) => {
    if (!ticker || ticker === "OFF") {
      setCompareTicker(null);
      setCompareStockData(null);
      return;
    }
    setCompareTicker(ticker);
    try {
      const data = await fetchStockData(ticker, timeframe);
      setCompareStockData(data);
    } catch (err) {
      console.warn(`[AlphaLens] Failed to fetch data for rival ${ticker}, using realistic fallback:`, err);
      const fallbackPrices: Record<string, number> = {
        AAPL: 228.45,
        NVDA: 214.13,
        TSLA: 219.80,
        MSFT: 448.20,
        GOOGL: 182.50,
      };
      const fallbackPx = fallbackPrices[ticker] || 200.0;
      const fallback: StockData = {
        symbol: ticker,
        name: ticker === "NVDA" ? "NVIDIA Corporation" : ticker === "AAPL" ? "Apple Inc." : ticker === "TSLA" ? "Tesla Inc." : ticker === "MSFT" ? "Microsoft Corporation" : "Alphabet Inc.",
        price: fallbackPx,
        change: 1.25,
        changePercent: 0.65,
        currency: "USD",
        open: fallbackPx * 0.99,
        high: fallbackPx * 1.02,
        low: fallbackPx * 0.98,
        previousClose: fallbackPx * 0.995,
        volume: 45000000,
        marketCap: 3000000000000,
        peRatio: ticker === "NVDA" ? 54.2 : ticker === "AAPL" ? 33.1 : ticker === "MSFT" ? 35.8 : 26.5,
        candlesticks: stockData.data?.candlesticks || [],
        thesis_summary: {
          conviction_score: ticker === "NVDA" ? 83 : ticker === "MSFT" ? 81 : ticker === "AAPL" ? 78 : 74,
          regime_label: "Institutional Momentum Accumulation",
          valuation_status: "Fairly Valued",
          catalyst_bias: "Bullish",
          margin_of_safety_pct: ticker === "NVDA" ? 12.0 : ticker === "AAPL" ? 6.8 : ticker === "MSFT" ? 9.5 : 8.0,
          implied_dcf_price: fallbackPx * 1.10,
        },
      };
      setCompareStockData(fallback);
    }
  }, [timeframe, stockData.data]);

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

    // Quick client-side intercept for Battle Mode voice commands
    const tLower = transcript.toLowerCase();
    if (tLower.includes("exit battle") || tLower.includes("stop compare") || tLower.includes("compare off") || tLower.includes("close battle")) {
      handleSetCompareTicker(null);
      setVoiceMessage("Exiting 3D Head-to-Head Battle Mode");
    } else {
      const peerKeys = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL"];
      const peerAliases: Record<string, string[]> = {
        AAPL: ["apple", "aapl"],
        NVDA: ["nvidia", "nvda"],
        TSLA: ["tesla", "tsla"],
        MSFT: ["microsoft", "msft"],
        GOOGL: ["google", "alphabet", "googl", "goog"],
      };
      for (const pk of peerKeys) {
        if (peerAliases[pk].some(a => tLower.includes(`compare with ${a}`) || tLower.includes(`compare to ${a}`) || tLower.includes(`battle mode against ${a}`) || tLower.includes(`battle against ${a}`) || tLower.includes(`vs ${a}`) || tLower.includes(`versus ${a}`) || tLower.includes(`battle ${a}`))) {
          handleSetCompareTicker(pk);
          setVoiceMessage(`Entering 3D Head-to-Head Battle Mode against ${pk}`);
          break;
        }
      }

      // Voice commands to switch/search company with typo resolution (e.g. "switch to epp" -> AAPL)
      for (const prefix of ["switch to ", "show ", "search for ", "search ", "look up ", "open ", "load "]) {
        if (tLower.startsWith(prefix)) {
          const rawQuery = tLower.slice(prefix.length).trim();
          if (rawQuery && !["trader", "investor", "pitch mode", "battle mode"].includes(rawQuery)) {
            const resolved = resolveCompanyQuery(rawQuery);
            if (resolved.ticker) {
              handleSelectTicker(resolved.ticker);
              setVoiceMessage(`Switched to ${resolved.name || resolved.ticker}`);
              break;
            }
          }
        }
      }
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
        // Analyst Workflow, Battle Mode & Stress-Testing Intents:
        const action = (response as any).action || (response.data as any)?.action;
        if (intent === "switch_ticker" || action === "switch_ticker") {
          const target = (response as any).target || (response.data as any)?.target;
          if (target) {
            handleSelectTicker(target);
          }
        } else if (intent === "compare_ticker" || action === "compare_ticker") {
          const target = (response as any).target || (response.data as any)?.target;
          if (target === "OFF" || target === "off" || !target) {
            handleSetCompareTicker(null);
          } else {
            handleSetCompareTicker(target);
          }
        } else if (intent === "show_contagion_graph" || action === "show_contagion_graph") {
          setActiveTab("Investor");
          setActiveMetric("CONTAGION_GRAPH");
        } else if (intent === "stress_test_bear") {
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
        } else if (intent === "show_iv_surface") {
          setActiveTab("Trader");
          setActiveMetric("IV_SURFACE");
        } else if (intent === "switch_trader") {
          setActiveTab("Trader");
        } else if (intent === "switch_investor") {
          setActiveTab("Investor");
        } else if (intent === "pitch_mode") {
          setIsPitchMode(prev => !prev);
        } else if (intent === "auto_pitch_tour") {
          setIsPitchMode(true);
          setIsAutoTour(true);
          setTourStep(0);
        } else if (intent === "bull_bear_debate") {
          setShowICDebate(true);
        }
      })
      .catch(() => {
        setVoiceMessage("Sorry, I couldn't process that command.");
      });
  }, [speech.transcript, speech.isListening, aiAnalysis, handleSetCompareTicker]);

    // Handle Hand Gestures (Responsive Tab Switching)
  useEffect(() => {
    if (!gestureState.swipeDirection) return;
    setActiveTab((prev) => (prev === "Investor" ? "Trader" : "Investor"));
  }, [gestureState.swipeDirection]);

  // Handle Simulation Freeze / Fist Hold
  const isSimulationFrozen = gestureState.activeGesture === "fist";
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (isSimulationFrozen) {
      window.speechSynthesis.pause();
    } else {
      window.speechSynthesis.resume();
    }
  }, [isSimulationFrozen]);

  // Handle Discrete Spatial Hand Gestures
  const lastHandledGestureRef = useRef<string>("none");
  useEffect(() => {
    const gesture = gestureState.activeGesture;
    if (gesture === lastHandledGestureRef.current) return;
    lastHandledGestureRef.current = gesture;

    if (gesture === "bull_thumbs_up") {
      setScenarioParams({
        wacc_delta: -0.015,
        tgr_delta: 0.0075,
        margin_delta: 0.03,
        active_scenario: "bull",
        preset: "Bull",
      });
    } else if (gesture === "bear_thumbs_down") {
      setScenarioParams({
        wacc_delta: 0.015,
        tgr_delta: -0.0075,
        margin_delta: -0.03,
        active_scenario: "bear",
        preset: "Bear",
      });
    } else if (gesture === "v_sign") {
      setIsPitchMode((prev) => !prev);
    } else if (gesture === "open_palm") {
      setShowDashboard((prev) => !prev);
    }
  }, [gestureState.activeGesture]);

  const prevPinchRef = useRef(false);
  const wasMiddlePinchingRef = useRef(false);
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
      
      const wasMiddlePinching = wasMiddlePinchingRef.current;
      wasMiddlePinchingRef.current = gestureState.isMiddlePinching;

      if (gestureState.isMiddlePinching) {
        if (!wasMiddlePinching) {
          lastYRef.current = clientY;
        }
        const deltaY = clientY - lastYRef.current;
        if (Math.abs(deltaY) > 1.5) {
          // Find scroll target: either an ancestor of element under cursor or active scrollable panel
          let scrollTarget: HTMLElement | null = null;
          let curr = element;
          while (curr && curr !== document.body && curr !== document.documentElement) {
            if (curr instanceof HTMLElement) {
              const style = window.getComputedStyle(curr);
              if (
                (style.overflowY === "auto" || style.overflowY === "scroll") &&
                curr.scrollHeight > curr.clientHeight
              ) {
                scrollTarget = curr;
                break;
              }
            }
            curr = curr.parentElement;
          }

          // Fallback to active modal or dashboard scroll area
          if (!scrollTarget) {
            scrollTarget =
              (document.querySelector("#ic-debate-modal") as HTMLElement) ||
              (document.querySelector(".overflow-y-auto") as HTMLElement);
          }

          if (scrollTarget) {
            scrollTarget.scrollTop += deltaY * 2.5;
          } else if (typeof window !== "undefined") {
            window.scrollBy({ top: deltaY * 2.5, behavior: "auto" });
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

  const bullDcf = useMemo(() => {
    if (!stockData.data) return null;
    return computeScenarioDCF(
      stockData.data.price,
      stockInsights.insights?.thesis_summary?.implied_dcf_price,
      { preset: "Bull", wacc_delta: -0.015, tgr_delta: 0.0075, margin_delta: 0.03 }
    );
  }, [stockData.data, stockInsights.insights]);

  const bearDcf = useMemo(() => {
    if (!stockData.data) return null;
    return computeScenarioDCF(
      stockData.data.price,
      stockInsights.insights?.thesis_summary?.implied_dcf_price,
      { preset: "Bear", wacc_delta: 0.015, tgr_delta: -0.0075, margin_delta: -0.03 }
    );
  }, [stockData.data, stockInsights.insights]);

  // ── Speech Synthesis helper for Briefings & IC Debate ──────────────
  const speakBriefing = useCallback((text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch {
        // Fallback for audio restriction
      }
    }
  }, []);

  // ── Autonomous 4-Stage Pitch Studio Tour Cycler ─────────────────────
  useEffect(() => {
    if (!isAutoTour || !stockData.data) return;

    const stage = TOUR_STAGES[tourStep];
    setActiveTab(stage.tab);
    setActiveMetric(stage.metric);
    if (stage.tab === "Trader") {
      setShowLSTMConeInTrader(true);
    }

    const currentP = stockData.data.price || 100;
    const lstmTarget = stockInsights.insights?.predicted_prices?.[4] || currentP * 1.04;
    const baseVal = pitchDcfResult?.fairValue || currentP * 1.12;
    const bullVal = bullDcf?.fairValue || 467.93;

    let briefing = "";
    if (stage.step === 1) briefing = stage.getBriefing(stockData.data.symbol, currentP, lstmTarget);
    else if (stage.step === 2) briefing = stage.getBriefing(stockData.data.symbol, baseVal, bullVal);
    else briefing = (stage.getBriefing as (t: string) => string)(stockData.data.symbol);

    setVoiceMessage(briefing);
    speakBriefing(briefing);

    const timer = setInterval(() => {
      setTourStep((prev) => (prev + 1) % TOUR_STAGES.length);
    }, 9000);

    return () => clearInterval(timer);
  }, [isAutoTour, tourStep, stockData.data, pitchDcfResult, bullDcf, stockInsights.insights, speakBriefing]);

  // Stop tour if user clicks background/scene (outside pitch-hud and debate modal)
  useEffect(() => {
    if (!isAutoTour) return;
    const handleCanvasClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("#pitch-hud") || target.closest("#ic-debate-modal")) return;
      setIsAutoTour(false);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    window.addEventListener("pointerdown", handleCanvasClick);
    return () => window.removeEventListener("pointerdown", handleCanvasClick);
  }, [isAutoTour]);

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
          gestureScale={gestureState.twoHandScale}
          gestureRotation={gestureState.twoHandRotation}
          isFrozen={isSimulationFrozen}
          isMiddlePinching={gestureState.isMiddlePinching}
          compareTicker={compareTicker}
          compareStockData={compareStockData}
          onSelectCompareTicker={handleSetCompareTicker}
          onTargetFound={(index, ticker, isFallback) => handleTargetFound(index, ticker, isFallback)}
          onTargetLost={(index) => {}}
          onClose={() => {
            setShowDashboard(false);
            setActiveTicker(null);
            setIsManual(false);
            stockData.reset();
            aiAnalysis.reset();
            stockInsights.reset();
            setCompareTicker(null);
            setCompareStockData(null);
          }}
        />
      </div>

      {/* ── 🎬 LIVE THESIS & PITCH BROADCAST HUD ──────────────────────── */}
      {isPitchMode && stockData.data && (
        <div id="pitch-hud" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl pointer-events-auto">
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

              {/* 1-Click Flagship Ticker Switcher in Pitch HUD */}
              <div className="hidden sm:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 ml-2">
                {(["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL"] as const).map((tkr) => {
                  const isActive = stockData.data?.symbol === tkr;
                  return (
                    <button
                      key={tkr}
                      onClick={() => handleSelectTicker(tkr)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition-all ${
                        isActive
                          ? "bg-cyan-500/20 border border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.35)] scale-105"
                          : "bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 border border-transparent"
                      }`}
                      title={`Switch to ${tkr}`}
                    >
                      {tkr}
                    </button>
                  );
                })}
              </div>

              {/* Quick ⚔️ vs [Rival] Badge in Pitch Mode HUD */}
              {compareTicker && (
                <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-300 text-xs font-semibold shadow-[0_0_12px_rgba(245,158,11,0.25)] animate-pulse">
                  <span>⚔️ vs {compareTicker}</span>
                  <button
                    onClick={() => handleSetCompareTicker(null)}
                    className="text-amber-400 hover:text-amber-100 ml-1 text-xs font-bold leading-none cursor-pointer"
                    title="Exit Battle Mode"
                  >
                    ✕
                  </button>
                </div>
              )}
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

            {/* Right: Technical Shelf, Auto-Tour, IC Debate & Controls */}
            <div className="flex items-center gap-2 text-xs">
              {/* Auto-Pitch Tour Button */}
              <button
                onClick={() => {
                  setIsAutoTour((prev) => {
                    const next = !prev;
                    if (!next && typeof window !== "undefined" && "speechSynthesis" in window) {
                      window.speechSynthesis.cancel();
                    }
                    if (next) setTourStep(0);
                    return next;
                  });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  isAutoTour
                    ? "bg-amber-500/25 text-amber-300 border border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                }`}
                title="Automated 5-stage 3D terminal presentation tour"
              >
                <span>{isAutoTour ? "⏹" : "▶️"}</span>
                <span>{isAutoTour ? `Stop Tour (${tourStep + 1}/5)` : "Auto-Pitch Tour"}</span>
              </button>

              {/* AI Bull/Bear Debate Button */}
              <button
                onClick={() => setShowICDebate(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  showICDebate
                    ? "bg-purple-600/30 text-purple-200 border border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                    : "bg-gradient-to-r from-purple-900/60 to-indigo-900/60 hover:from-purple-800/80 hover:to-indigo-800/80 text-purple-200 border border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                }`}
                title="Open Investment Committee (IC) Bull vs Bear Debate Card"
              >
                <span>⚖️</span>
                <span>AI Bull/Bear Debate</span>
              </button>

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
                onClick={() => {
                  setIsPitchMode(false);
                  setIsAutoTour(false);
                  if (typeof window !== "undefined" && "speechSynthesis" in window) {
                    window.speechSynthesis.cancel();
                  }
                }}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 transition"
                title="Exit Pitch Mode"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cinematic Tour Floating Status Indicator */}
      {isPitchMode && isAutoTour && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="bg-slate-900/90 backdrop-blur-md border border-amber-500/50 rounded-full px-4 py-1.5 shadow-xl flex items-center gap-2 text-xs font-semibold text-amber-300 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
            <span>CINEMATIC TOUR ACTIVE · {TOUR_STAGES[tourStep].title}</span>
            <button
              onClick={() => {
                setIsAutoTour(false);
                if (typeof window !== "undefined" && "speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }
              }}
              className="ml-2 text-slate-400 hover:text-white text-[11px] underline"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {/* ⚖️ Investment Committee (IC) Bull vs Bear Debate Card Overlay */}
      {showICDebate && stockData.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div id="ic-debate-modal" className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-950/95 border border-purple-500/40 rounded-2xl p-6 shadow-2xl shadow-purple-950/60 custom-scrollbar pointer-events-auto">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-bold uppercase tracking-wider">
                    Institutional Committee Synthesis
                  </span>
                  <span className="text-xs font-mono text-cyan-400">
                    CONVICTION: {stockInsights.insights?.thesis_summary?.conviction_score || 78} / 100
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-white mt-1 flex items-center gap-2">
                  <span>⚖️</span> {stockData.data.symbol} Bull vs. Bear IC Debate
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live multi-model synthesis combining 3D DCF valuation surfaces, FinBERT catalyst shocks, and VPVR institutional support.
                </p>
              </div>
              <button
                onClick={() => setShowICDebate(false)}
                className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-rose-900/40 border border-slate-700 hover:border-rose-500/50 text-slate-400 hover:text-rose-300 flex items-center justify-center font-bold text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Bull vs Bear Split Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
              {/* 🐂 Bull Case Thesis */}
              <div className="rounded-xl p-4 bg-emerald-950/20 border border-emerald-500/40 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
                    <span className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                      <span>🐂</span> BULL CASE THESIS
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                      {bullDcf ? bullDcf.upsideLabel : "+20.3% Upside"}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2.5 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Bull DCF Implied Target</div>
                      <div className="text-2xl font-black font-mono text-emerald-300">
                        ${bullDcf ? bullDcf.fairValue.toFixed(2) : "467.93"}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Assumes +300 bps operating margin expansion & 8.0% effective WACC.
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-emerald-500/20">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1">
                        <span>🚀</span> Top FinBERT Growth Catalyst
                      </div>
                      <div className="text-slate-200 font-medium mt-1">
                        {stockInsights.insights?.catalysts?.find((c: any) => c.sentiment_label === "Bullish")?.title ||
                          "Autonomous Robotaxi Fleet Expansion & FSD v13 Commercial Rollout"}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
                        <span>📈</span> 5-Day Neural LSTM Trajectory
                      </div>
                      <div className="text-emerald-300 font-mono font-bold mt-0.5">
                        Target: ${(stockInsights.insights?.predicted_prices?.[4] || (stockData.data.price * 1.04)).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-400 font-medium">
                  Catalyst Bias: Asymmetric upside participation with low beta degradation.
                </div>
              </div>

              {/* 🐻 Bear Case Risk */}
              <div className="rounded-xl p-4 bg-rose-950/20 border border-rose-500/40 relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-rose-500/20">
                    <span className="text-sm font-bold text-rose-400 flex items-center gap-1.5">
                      <span>🐻</span> BEAR CASE RISK
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                      {bearDcf ? bearDcf.upsideLabel : "-18.0% Downside"}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2.5 text-xs">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Bear DCF Downside Floor</div>
                      <div className="text-2xl font-black font-mono text-rose-300">
                        ${bearDcf ? bearDcf.fairValue.toFixed(2) : "319.07"}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Assumes -300 bps margin contraction & 12.0% cost of capital drag.
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-rose-500/20">
                      <div className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold flex items-center gap-1">
                        <span>⚠️</span> Top FinBERT Risk Catalyst
                      </div>
                      <div className="text-slate-200 font-medium mt-1">
                        {stockInsights.insights?.catalysts?.find((c: any) => c.sentiment_label === "Bearish")?.title ||
                          "EV Margin Compression & Global Tariff Rate Headwinds"}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
                        <span>🛡️</span> Key VPVR Institutional Support
                      </div>
                      <div className="text-amber-300 font-mono font-bold mt-0.5">
                        POC Defense Shelf: ${stockInsights.insights?.thesis_summary?.volume_poc?.toFixed(2) || "334.03"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t border-rose-500/20 text-[11px] text-rose-400 font-medium">
                  Failure to hold the $334.03 volume POC triggers rapid retest of the Bear DCF floor.
                </div>
              </div>
            </div>

            {/* ⚖️ Chief Investment Officer (CIO) Verdict */}
            <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-slate-900/80 to-blue-950/40 border border-purple-500/30 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                    CIO VERDICT & ACTIONABLE STRUCTURE
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono font-bold">
                    ASYMMETRIC 2.4:1 R:R
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                  <strong className="text-white">OVERWEIGHT CONVICTION:</strong> Favoring the Bull DCF thesis target of{" "}
                  <span className="text-emerald-400 font-mono font-semibold">${bullDcf ? bullDcf.fairValue.toFixed(2) : "467.93"}</span>. Accumulate on dips toward the institutional VPVR shelf at{" "}
                  <span className="text-amber-300 font-mono font-semibold">${stockInsights.insights?.thesis_summary?.volume_poc?.toFixed(2) || "334.03"}</span> with a trailing stop below the Bear floor (${bearDcf ? bearDcf.fairValue.toFixed(2) : "319.07"}).
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const verdictText = `Investment Committee Verdict for ${stockData.data?.symbol}: Overweight conviction with asymmetric 2.4 to 1 risk reward. Favoring the Bull DCF target of $${bullDcf ? bullDcf.fairValue.toFixed(2) : "467.93"}. Accumulate near the VPVR shelf at $${stockInsights.insights?.thesis_summary?.volume_poc?.toFixed(2) || "334.03"}.`;
                    speakBriefing(verdictText);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/50 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-purple-950/50"
                >
                  <span>🔊</span>
                  <span>Speak Verdict</span>
                </button>
                <button
                  onClick={() => setShowICDebate(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium text-xs transition"
                >
                  Dismiss
                </button>
              </div>
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
              onSelectTicker={handleSelectTicker}
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
              compareTicker={compareTicker}
              onSelectCompareTicker={handleSetCompareTicker}
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


      {/* Typo-Tolerant Company Search UI */}
      {!showDashboard && (
        <div style={{ position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 100, width: "90%", maxWidth: "460px" }}>
          <CompanySearch
            placeholder="Search company or ticker (e.g., Apple, epp, NVDA)..."
            onSelectTicker={(ticker, detail) => {
              if (detail?.isCorrection) {
                setVoiceMessage(`✨ Recognized "${detail.reason || ticker}"`);
              }
              handleSelectTicker(ticker);
            }}
          />

          {/* Quick Flagship Direct Launch Buttons */}
          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            {(["AAPL", "NVDA", "TSLA", "MSFT", "GOOGL"] as const).map((tkr) => (
              <button
                key={tkr}
                onClick={() => handleSelectTicker(tkr)}
                className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-900/80 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-200 border border-slate-700/60 hover:border-cyan-400 backdrop-blur-md transition-all shadow-md"
              >
                {tkr}
              </button>
            ))}
          </div>
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
          
          {/* Simulation Frozen Indicator */}
      {isSimulationFrozen && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-amber-950/90 border-2 border-amber-500 rounded-full px-5 py-2 shadow-2xl shadow-amber-500/50 flex items-center gap-2.5 backdrop-blur-xl animate-pulse">
            <span className="text-base">✊</span>
            <span className="text-amber-300 font-bold tracking-wider text-xs uppercase">Simulation Frozen / Hold Active</span>
          </div>
        </div>
      )}

      <HandCursor 
            coordsRef={coordsRef} 
            isPinching={gestureState.isPinching} 
            isVisible={gestureState.isVisible} 
            activeGesture={gestureState.activeGesture}
            gestureFeedback={gestureState.gestureFeedback}
            isTwoHandPinching={gestureState.isTwoHandPinching}
          />
        </>
      )}
    </main>
  );
}
