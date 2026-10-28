"use client";

import React, { useEffect, useRef } from "react";
import type { HandTrackingCoords } from "@/hooks/useHandTracking";

interface HandCursorProps {
  coordsRef: React.MutableRefObject<HandTrackingCoords>;
  isPinching: boolean;
  isVisible: boolean;
  activeGesture?: string;
  gestureFeedback?: string | null;
  isTwoHandPinching?: boolean;
}

export default function HandCursor({
  coordsRef,
  isPinching,
  isVisible,
  activeGesture = "none",
  gestureFeedback = null,
  isTwoHandPinching = false,
}: HandCursorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const secondaryContainerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);

  useEffect(() => {
    if (!isVisible) return;

    let rafId: number;
    let smoothX1 = coordsRef.current.x;
    let smoothY1 = coordsRef.current.y;
    let smoothX2 = coordsRef.current.x2 ?? smoothX1;
    let smoothY2 = coordsRef.current.y2 ?? smoothY1;

    const loop = () => {
      const { x, y, x2, y2, hasSecondHand } = coordsRef.current;
      const lerp = 0.35;

      smoothX1 += (x - smoothX1) * lerp;
      smoothY1 += (y - smoothY1) * lerp;

      const px1 = smoothX1 * window.innerWidth;
      const py1 = smoothY1 * window.innerHeight;

      if (containerRef.current) {
        containerRef.current.style.transform = `translate(${px1}px, ${py1}px)`;
      }

      if (hasSecondHand && x2 !== undefined && y2 !== undefined) {
        smoothX2 += (x2 - smoothX2) * lerp;
        smoothY2 += (y2 - smoothY2) * lerp;
        const px2 = smoothX2 * window.innerWidth;
        const py2 = smoothY2 * window.innerHeight;

        if (secondaryContainerRef.current) {
          secondaryContainerRef.current.style.display = "block";
          secondaryContainerRef.current.style.transform = `translate(${px2}px, ${py2}px)`;
        }

        if (lineRef.current) {
          lineRef.current.setAttribute("x1", String(px1));
          lineRef.current.setAttribute("y1", String(py1));
          lineRef.current.setAttribute("x2", String(px2));
          lineRef.current.setAttribute("y2", String(py2));
          lineRef.current.style.display = isTwoHandPinching ? "block" : "none";
        }
      } else {
        if (secondaryContainerRef.current) {
          secondaryContainerRef.current.style.display = "none";
        }
        if (lineRef.current) {
          lineRef.current.style.display = "none";
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isVisible, coordsRef, isTwoHandPinching]);

  if (!isVisible) return null;

  // Active gesture badge details
  const getBadgeConfig = () => {
    switch (activeGesture) {
      case "bull_thumbs_up":
        return { label: "🚀 BULL CATALYST", color: "#10b981", bg: "rgba(16, 185, 129, 0.2)" };
      case "bear_thumbs_down":
        return { label: "⚠️ BEAR STRESS", color: "#ef4444", bg: "rgba(239, 68, 68, 0.2)" };
      case "v_sign":
        return { label: "🎬 PITCH STUDIO", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.2)" };
      case "open_palm":
        return { label: "✋ HUD TOGGLE", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.2)" };
      case "fist":
        return { label: "✊ FREEZE", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.2)" };
      case "two_finger_point":
        return { label: "🎯 3D RETICLE", color: "#06b6d4", bg: "rgba(6, 182, 212, 0.2)" };
      case "two_hand_manipulation":
        return { label: "🔍 3D SCALE & ROTATE", color: "#ec4899", bg: "rgba(236, 72, 153, 0.2)" };
      case "middle_pinch":
        return { label: "↕ SCROLL", color: "#a855f7", bg: "rgba(168, 85, 247, 0.2)" };
      case "pinch":
        return { label: "● PINCH CLICK", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.2)" };
      default:
        return null;
    }
  };

  const badge = getBadgeConfig();
  const cursorColor = isPinching ? "rgba(56, 189, 248, 0.95)" : "rgba(255, 255, 255, 0.65)";
  const cursorSize = isPinching ? 16 : 22;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      {/* SVG Connecting beam for two-handed manipulation */}
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <line
          ref={lineRef}
          x1="0"
          y1="0"
          x2="0"
          y2="0"
          stroke="#38bdf8"
          strokeWidth="2.5"
          strokeDasharray="6,4"
          style={{ display: "none", filter: "drop-shadow(0 0 8px rgba(56,189,248,0.8))" }}
        />
      </svg>

      {/* Floating Center Notification for Gestures */}
      {gestureFeedback && (
        <div
          style={{
            position: "fixed",
            top: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(15, 23, 42, 0.92)",
            border: "1px solid rgba(56, 189, 248, 0.5)",
            backdropFilter: "blur(12px)",
            padding: "8px 20px",
            borderRadius: "9999px",
            color: "#ffffff",
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "0.03em",
            boxShadow: "0 8px 32px rgba(56, 189, 248, 0.25)",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#38bdf8", boxShadow: "0 0 10px #38bdf8" }} />
          {gestureFeedback}
        </div>
      )}

      {/* Primary Hand Cursor */}
      <div ref={containerRef} style={{ position: "absolute", top: 0, left: 0 }}>
        {/* Reticle Dot */}
        <div
          style={{
            position: "absolute",
            width: `${cursorSize}px`,
            height: `${cursorSize}px`,
            borderRadius: "50%",
            background: cursorColor,
            border: `2px solid ${isPinching ? "#38bdf8" : "#ffffff"}`,
            transform: "translate(-50%, -50%)",
            transition: "width 0.12s ease, height 0.12s ease, background 0.12s ease",
            boxShadow: isPinching ? "0 0 20px rgba(56, 189, 248, 0.9)" : "0 0 8px rgba(0,0,0,0.4)",
          }}
        />

        {/* Outer Crosshair brackets when hovering */}
        {!isPinching && (
          <>
            <div style={{ position: "absolute", left: 0, top: "-18px", width: "2px", height: "8px", background: "rgba(255,255,255,0.7)", transform: "translateX(-50%)" }} />
            <div style={{ position: "absolute", left: 0, top: "10px", width: "2px", height: "8px", background: "rgba(255,255,255,0.7)", transform: "translateX(-50%)" }} />
            <div style={{ position: "absolute", left: "-18px", top: 0, width: "8px", height: "2px", background: "rgba(255,255,255,0.7)", transform: "translateY(-50%)" }} />
            <div style={{ position: "absolute", left: "10px", top: 0, width: "8px", height: "2px", background: "rgba(255,255,255,0.7)", transform: "translateY(-50%)" }} />
          </>
        )}

        {/* Gesture State Badge */}
        {badge && (
          <div
            style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              padding: "3px 8px",
              borderRadius: "6px",
              background: badge.bg,
              border: `1px solid ${badge.color}`,
              color: badge.color,
              fontSize: "10px",
              fontFamily: "ui-monospace, monospace",
              fontWeight: 700,
              whiteSpace: "nowrap",
              backdropFilter: "blur(6px)",
              boxShadow: `0 0 10px ${badge.color}44`,
            }}
          >
            {badge.label}
          </div>
        )}
      </div>

      {/* Secondary Hand Cursor (for two-handed gestures) */}
      <div
        ref={secondaryContainerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: `${cursorSize}px`,
            height: `${cursorSize}px`,
            borderRadius: "50%",
            background: isTwoHandPinching ? "rgba(236, 72, 153, 0.9)" : "rgba(255, 255, 255, 0.5)",
            border: `2px solid ${isTwoHandPinching ? "#ec4899" : "#ffffff"}`,
            transform: "translate(-50%, -50%)",
            boxShadow: isTwoHandPinching ? "0 0 18px rgba(236, 72, 153, 0.9)" : "0 0 6px rgba(0,0,0,0.3)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "16px",
            padding: "2px 6px",
            borderRadius: "4px",
            background: "rgba(236, 72, 153, 0.2)",
            border: "1px solid #ec4899",
            color: "#f472b6",
            fontSize: "9px",
            fontFamily: "ui-monospace, monospace",
            fontWeight: 700,
          }}
        >
          HAND 2
        </div>
      </div>
    </div>
  );
}
