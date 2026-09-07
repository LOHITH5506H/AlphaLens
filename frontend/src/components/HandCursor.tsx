"use client";

import React, { useEffect, useState } from "react";

interface HandCursorProps {
  x: number;
  y: number;
  isPinching: boolean;
  isVisible: boolean;
}

export default function HandCursor({ x, y, isPinching, isVisible }: HandCursorProps) {
  // Add a slight smoothing/lerp to make it feel natural
  const [smoothX, setSmoothX] = useState(x);
  const [smoothY, setSmoothY] = useState(y);

  useEffect(() => {
    // Simple low-pass filter for smoothing
    const lerpFactor = 0.3;
    setSmoothX((prev) => prev + (x - prev) * lerpFactor);
    setSmoothY((prev) => prev + (y - prev) * lerpFactor);
  }, [x, y]);

  if (!isVisible) return null;

  const cursorSize = isPinching ? 16 : 24;
  const cursorColor = isPinching ? "rgba(56, 189, 248, 0.9)" : "rgba(255, 255, 255, 0.5)";
  const borderSize = isPinching ? "2px" : "1px";
  const borderColor = isPinching ? "#38bdf8" : "#ffffff";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${smoothX * 100}%`,
          top: `${smoothY * 100}%`,
          width: `${cursorSize}px`,
          height: `${cursorSize}px`,
          borderRadius: "50%",
          background: cursorColor,
          border: `${borderSize} solid ${borderColor}`,
          transform: "translate(-50%, -50%)",
          transition: "width 0.15s ease, height 0.15s ease, background 0.15s ease",
          boxShadow: isPinching ? "0 0 15px rgba(56, 189, 248, 0.8)" : "0 0 5px rgba(0,0,0,0.3)",
        }}
      />
      {/* Target reticle styling */}
      {!isPinching && (
        <>
          <div
            style={{
              position: "absolute",
              left: `${smoothX * 100}%`,
              top: `calc(${smoothY * 100}% - 20px)`,
              width: "2px",
              height: "10px",
              background: "rgba(255,255,255,0.7)",
              transform: "translateX(-50%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${smoothX * 100}%`,
              top: `calc(${smoothY * 100}% + 10px)`,
              width: "2px",
              height: "10px",
              background: "rgba(255,255,255,0.7)",
              transform: "translateX(-50%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `calc(${smoothX * 100}% - 20px)`,
              top: `${smoothY * 100}%`,
              width: "10px",
              height: "2px",
              background: "rgba(255,255,255,0.7)",
              transform: "translateY(-50%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `calc(${smoothX * 100}% + 10px)`,
              top: `${smoothY * 100}%`,
              width: "10px",
              height: "2px",
              background: "rgba(255,255,255,0.7)",
              transform: "translateY(-50%)",
            }}
          />
        </>
      )}
    </div>
  );
}
