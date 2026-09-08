"use client";

import React, { useEffect, useRef } from "react";

interface HandCursorProps {
  coordsRef: React.MutableRefObject<{ x: number; y: number }>;
  isPinching: boolean;
  isVisible: boolean;
}

export default function HandCursor({ coordsRef, isPinching, isVisible }: HandCursorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible) return;
    
    let rafId: number;
    let smoothX = coordsRef.current.x;
    let smoothY = coordsRef.current.y;
    
    const loop = () => {
      const { x, y } = coordsRef.current;
      const lerpFactor = 0.3;
      smoothX = smoothX + (x - smoothX) * lerpFactor;
      smoothY = smoothY + (y - smoothY) * lerpFactor;
      
      if (containerRef.current) {
        containerRef.current.style.transform = `translate(${smoothX * window.innerWidth}px, ${smoothY * window.innerHeight}px)`;
      }
      rafId = requestAnimationFrame(loop);
    };
    
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isVisible, coordsRef]);

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
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <div ref={containerRef} style={{ position: "absolute", top: 0, left: 0 }}>
        <div
          style={{
            position: "absolute",
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
        {!isPinching && (
          <>
            <div style={{ position: "absolute", left: 0, top: "-20px", width: "2px", height: "10px", background: "rgba(255,255,255,0.7)", transform: "translateX(-50%)" }} />
            <div style={{ position: "absolute", left: 0, top: "10px", width: "2px", height: "10px", background: "rgba(255,255,255,0.7)", transform: "translateX(-50%)" }} />
            <div style={{ position: "absolute", left: "-20px", top: 0, width: "10px", height: "2px", background: "rgba(255,255,255,0.7)", transform: "translateY(-50%)" }} />
            <div style={{ position: "absolute", left: "10px", top: 0, width: "10px", height: "2px", background: "rgba(255,255,255,0.7)", transform: "translateY(-50%)" }} />
          </>
        )}
      </div>
    </div>
  );
}
