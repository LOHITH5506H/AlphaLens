/**
 * AlphaLens — Main Page
 *
 * Orchestrates the AR experience:
 * 1. ARScene handles camera and marker tracking
 * 2. ARDashboard displays financial data as an overlay
 * 3. VoiceButton enables voice commands
 *
 * Data flow: ARScene fires targetFound → fetch stock data + AI analysis → render dashboard
 */

"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import ARDashboard from "@/components/ARDashboard";
import VoiceButton from "@/components/VoiceButton";
import { useStockData } from "@/hooks/useStockData";
import { useAIAnalysis } from "@/hooks/useAIAnalysis";
import { useSpeech } from "@/hooks/useSpeech";
import { getMarkerByIndex } from "@/lib/constants";
import { sendVoiceCommand } from "@/lib/api";

// Dynamically import ARScene with SSR disabled (MindAR requires browser APIs)
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
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔭</div>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#f1f5f9" }}>
          AlphaLens
        </div>
        <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "6px" }}>
          Loading AR engine...
        </div>
      </div>
    </div>
  ),
});

/** Voice intent → highlighted stat keys mapping */
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
  const [highlightedStats, setHighlightedStats] = useState<string[] | undefined>(undefined);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);

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

  // ----- AR target events -----

  const handleTargetFound = useCallback(
    (targetIndex: number, ticker: string) => {
      const marker = getMarkerByIndex(targetIndex);
      if (!marker) return;

      setActiveTicker(ticker);
      setShowDashboard(true);
      setHighlightedStats(undefined);
      setVoiceMessage(null);

      // Fetch stock data
      stockData.fetch(ticker);

      // Fetch AI analysis (runs in parallel, takes longer)
      aiAnalysis.fetch(ticker);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleTargetLost = useCallback(() => {
    // Keep dashboard visible for a few seconds after target lost
    // so user can still read the data
    setTimeout(() => {
      setShowDashboard(false);
      setActiveTicker(null);
    }, 3000);
  }, []);

  // ----- Voice command processing -----

  const prevTranscript = useRef("");

  useEffect(() => {
    const transcript = speech.transcript;

    // Only process when we have a new non-empty final transcript
    // and the user has stopped speaking
    if (
      !transcript ||
      transcript === prevTranscript.current ||
      speech.isListening
    ) {
      return;
    }

    prevTranscript.current = transcript;

    if (!activeTickerRef.current) {
      setVoiceMessage("Point your camera at a logo first, then try again.");
      return;
    }

    // Send to backend for AI-powered intent parsing
    sendVoiceCommand(transcript, activeTickerRef.current)
      .then((response) => {
        setVoiceMessage(response.message);

        // Map intent to highlighted stats
        if (response.intent in INTENT_TO_STATS) {
          const stats = INTENT_TO_STATS[response.intent];
          setHighlightedStats(stats.length > 0 ? stats : undefined);
        }

        // If AI analysis requested, re-fetch
        if (response.intent === "ai_analysis" && activeTickerRef.current) {
          aiAnalysis.fetch(activeTickerRef.current);
        }
      })
      .catch(() => {
        setVoiceMessage("Sorry, I couldn't process that command.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.transcript, speech.isListening]);

  return (
    <main style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {/* AR Camera + Tracking */}
      <ARScene
        onTargetFound={handleTargetFound}
        onTargetLost={handleTargetLost}
      />

      {/* Dashboard overlay (spatial or fixed fallback) */}
      {showDashboard && (() => {
        const DashboardContent = (
          <div style={{ pointerEvents: "auto", transformOrigin: "center center" }}>
            <ARDashboard
              stockData={stockData.data}
              aiAnalysis={aiAnalysis.analysis}
              stockLoading={stockData.loading}
              aiLoading={aiAnalysis.loading}
              error={stockData.error}
              highlightedStats={highlightedStats}
              voiceMessage={voiceMessage}
            />
          </div>
        );

        // Try to render spatially inside the AR Scene's CSS3D object if it exists
        const spatialRoot = typeof document !== "undefined" ? document.getElementById("spatial-ui-root") : null;

        if (spatialRoot) {
          return createPortal(DashboardContent, spatialRoot);
        }

        // Fallback: render as a standard screen overlay
        return (
          <div
            className="ar-overlay"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
          >
            <div style={{ maxHeight: "90vh", overflowY: "auto", pointerEvents: "auto" }}>
              {DashboardContent}
            </div>
          </div>
        );
      })()}

      {/* Voice button (always visible) */}
      {mounted && (
        <VoiceButton
          isListening={speech.isListening}
          isSupported={speech.isSupported}
          transcript={speech.transcript}
          onStart={speech.startListening}
          onStop={speech.stopListening}
        />
      )}

      {/* Branding watermark */}
      <div
        style={{
          position: "fixed",
          bottom: "16px",
          left: "16px",
          zIndex: 60,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            color: "rgba(148, 163, 184, 0.5)",
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}
        >
          ALPHALENS
        </div>
      </div>
    </main>
  );
}
