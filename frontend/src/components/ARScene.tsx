"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Center, OrbitControls, PerspectiveCamera } from "@react-three/drei";

import { MARKER_MAPPINGS } from "@/lib/constants";
import { recognizeLogo } from "@/lib/api";
import type { StockData, AIAnalysis } from "@/types";
import Stock3DVisuals from "./Stock3DVisuals";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface ARSceneProps {
  stockData: StockData | null;
  aiAnalysis?: AIAnalysis | null;
  aiError?: string | null;
  onTargetFound: (targetIndex: number, ticker: string, isFallback?: boolean) => void;
  onTargetLost: (targetIndex: number) => void;
  isManualMode?: boolean;
  onClose?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTracker — Bridges MindAR computer vision ↔ R3F scene graph
// ─────────────────────────────────────────────────────────────────────────────

const ARTracker = ({ mindarInstance, anchors, stockData, aiAnalysis }: any) => {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!mindarInstance) return;

    // Sync AR Camera Projection from MindAR's engine
    camera.projectionMatrix.copy(mindarInstance.camera.projectionMatrix);
    camera.projectionMatrixInverse.copy(mindarInstance.camera.projectionMatrixInverse);

    // Sync Anchor Pose
    if (anchors.length > 0 && groupRef.current) {
      const activeAnchor = anchors.find((a: any) => a.mapping.ticker === stockData?.symbol);

      if (activeAnchor && activeAnchor.anchor.group.visible) {
        groupRef.current.visible = true;
        groupRef.current.matrix.copy(activeAnchor.anchor.group.matrix);
      } else {
        groupRef.current.visible = true;
      }
    }
  });

  if (!stockData) return null;

  return (
    <group ref={groupRef} matrixAutoUpdate={false} visible={true}>
      <group rotation={[Math.PI / 2, 0, 0]} scale={[1.2, 1.2, 1.2]}>
        <Stock3DVisuals data={stockData} aiAnalysis={aiAnalysis} />
      </group>
    </group>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Glassmorphic Button Component — Reusable styled button
// ─────────────────────────────────────────────────────────────────────────────

function GlassButton({
  children,
  onClick,
  style,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 18px",
        borderRadius: "14px",
        background: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(148, 163, 184, 0.15)",
        color: "#f1f5f9",
        fontSize: "13px",
        fontWeight: 600,
        cursor: disabled ? "wait" : "pointer",
        transition: "all 0.2s ease",
        letterSpacing: "0.02em",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ARScene
// ─────────────────────────────────────────────────────────────────────────────

export default function ARScene({
  stockData,
  aiAnalysis,
  aiError,
  onTargetFound,
  onTargetLost,
  isManualMode,
  onClose,
}: ARSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindarRef = useRef<any>(null);
  const [anchors, setAnchors] = useState<any[]>([]);
  const [status, setStatus] = useState<"initializing" | "ready" | "error">("initializing");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // ── Camera/Theme Toggle ──────────────────────────────────────────────────
  const [showArBackground, setShowArBackground] = useState(true);

  const onTargetFoundRef = useRef(onTargetFound);
  const onTargetLostRef = useRef(onTargetLost);

  useEffect(() => {
    onTargetFoundRef.current = onTargetFound;
    onTargetLostRef.current = onTargetLost;
  }, [onTargetFound, onTargetLost]);

  useEffect(() => {
    if (!containerRef.current) return;

    let isCleanedUp = false;
    let mindarInstance: any = null;

    const initAR = async () => {
      try {
        const { MindARThree } = await import("mind-ar/dist/mindar-image-three.prod.js");
        const domContainer = document.querySelector("#mindar-container") as HTMLElement;
        if (isCleanedUp || !domContainer) return;

        mindarInstance = new MindARThree({
          container: domContainer,
          imageTargetSrc: "/targets.mind",
          maxTrack: 1,
          uiLoading: "no",
          uiScanning: "no",
          uiError: "no",
        });

        // Hide MindAR's native canvas — we use R3F's <Canvas> exclusively
        if (mindarInstance.renderer?.domElement) {
          mindarInstance.renderer.domElement.style.display = "none";
        }
        mindarRef.current = mindarInstance;

        const newAnchors: any[] = [];
        for (const mapping of MARKER_MAPPINGS) {
          const anchor = mindarInstance.addAnchor(mapping.targetIndex);
          newAnchors.push({ mapping, anchor });

          anchor.onTargetFound = () => {
            onTargetFoundRef.current(mapping.targetIndex, mapping.ticker);
          };
          anchor.onTargetLost = () => {
            onTargetLostRef.current(mapping.targetIndex);
          };
        }
        setAnchors(newAnchors);

        await mindarInstance.start();
        if (isCleanedUp) {
          mindarInstance.stop();
          return;
        }

        // Keep MindAR's engine ticking for anchor matrix updates
        mindarInstance.renderer.setAnimationLoop(() => {
          mindarInstance.renderer.render(mindarInstance.scene, mindarInstance.camera);
        });

        setStatus("ready");
      } catch (err) {
        console.error("[AlphaLens] AR init error:", err);
        if (!isCleanedUp) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Failed to initialize AR");
        }
      }
    };

    initAR();

    return () => {
      isCleanedUp = true;
      if (mindarInstance) {
        try {
          mindarInstance.stop();
        } catch { }
      }
    };
  }, []);

  const handleManualScan = async () => {
    if (!containerRef.current || isScanning) return;
    const video = containerRef.current.querySelector('video');
    if (!video) {
      setScanMessage("Camera not found");
      return;
    }

    setIsScanning(true);
    setScanMessage("Analyzing with Gemini Vision...");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Image = canvas.toDataURL("image/jpeg", 0.8);

      const ticker = await recognizeLogo(base64Image);

      if (ticker === "NONE") {
        setScanMessage("No logo detected. Please try again.");
      } else {
        setScanMessage(`Detected: ${ticker}`);
        onTargetFoundRef.current(0, ticker, true);
      }
    } catch (err) {
      setScanMessage("Error analyzing image.");
    } finally {
      setIsScanning(false);
      setTimeout(() => setScanMessage(null), 3000);
    }
  };

  // ── Determine background based on toggle state ─────────────────────────
  const canvasBackground = (() => {
    if (isManualMode) {
      // Manual mode: respect the toggle
      return showArBackground
        ? "transparent"
        : "radial-gradient(circle at center, #1e293b 0%, #0a0f1a 100%)";
    }
    // AR mode: always transparent to show camera
    return "transparent";
  })();

  return (
    <>
      {/* MindAR video feed container — visible when AR background is on */}
      <div
        id="mindar-container"
        ref={containerRef}
        style={{
          width: "100vw",
          height: "100vh",
          position: "absolute",
          zIndex: 10,
          top: 0,
          left: 0,
          // In manual mode, hide camera when dark theme is selected
          opacity: isManualMode ? (showArBackground ? 1 : 0) : 1,
          transition: "opacity 0.4s ease",
        }}
      />

      {status === "ready" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            zIndex: 20,
            background: canvasBackground,
            transition: "background 0.5s ease",
          }}
        >
          <Canvas
            gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
            dpr={[1, 2]}
            style={{ pointerEvents: "auto" }}
          >
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
            <pointLight position={[-3, 3, 4]} intensity={0.4} color="#60a5fa" />

            <Environment preset="city" />

            {isManualMode && stockData ? (
              <>
                <PerspectiveCamera makeDefault position={[0, 0, 3.5]} fov={50} />
                <OrbitControls
                  enablePan={false}
                  maxPolarAngle={Math.PI / 1.5}
                  minPolarAngle={Math.PI / 4}
                  enableDamping
                  dampingFactor={0.05}
                />
                <Center>
                  <Stock3DVisuals data={stockData} aiAnalysis={aiAnalysis} />
                </Center>
              </>
            ) : (
              <ARTracker
                mindarInstance={mindarRef.current}
                anchors={anchors}
                stockData={stockData}
                aiAnalysis={aiAnalysis}
              />
            )}
          </Canvas>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          FLOATING UI CONTROLS (over the canvas)
          ═══════════════════════════════════════════════════════════════════ */}

      {/* Theme Toggle — Top right, only visible in manual mode with data */}
      {status === "ready" && isManualMode && stockData && (
        <div
          style={{
            position: "fixed",
            top: "16px",
            right: "16px",
            zIndex: 110,
          }}
        >
          <GlassButton
            onClick={() => setShowArBackground((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span style={{ fontSize: "15px" }}>
              {showArBackground ? "🌙" : "📷"}
            </span>
            <span>
              {showArBackground ? "Studio" : "Camera"}
            </span>
          </GlassButton>
        </div>
      )}

      {/* Close Button — Bottom center, manual mode only */}
      {isManualMode && stockData && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 110,
          }}
        >
          <GlassButton
            onClick={() => {
              if (onClose) onClose();
            }}
            style={{
              padding: "12px 28px",
              fontSize: "14px",
              color: "#60a5fa",
              border: "1px solid rgba(96, 165, 250, 0.25)",
            }}
          >
            ✕ Close 3D View
          </GlassButton>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          STATUS OVERLAYS
          ═══════════════════════════════════════════════════════════════════ */}

      {/* Initializing */}
      {status === "initializing" && !isManualMode && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            background: "rgba(10, 14, 26, 0.95)",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "3px solid rgba(59,130,246,0.2)",
              borderTop: "3px solid #3b82f6",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: "20px",
            }}
          />
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", marginBottom: "8px" }}>
            Initializing Camera
          </div>
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>
            Please allow camera access when prompted
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* AR mode scanning UI */}
      {status === "ready" && !isManualMode && (
        <>
          <div
            className="animate-fade-in-up"
            style={{
              position: "fixed",
              top: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 60,
              pointerEvents: "none",
            }}
          >
            <div
              className="glass-card-sm"
              style={{
                padding: "8px 16px",
                fontSize: "12px",
                color: "#94a3b8",
                textAlign: "center",
              }}
            >
              📷 Point camera at a company logo
            </div>
          </div>
          <div
            style={{
              position: "fixed",
              bottom: "32px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            {scanMessage && (
              <div
                style={{
                  background: "rgba(0,0,0,0.8)",
                  padding: "8px 16px",
                  borderRadius: "12px",
                  color: "#fff",
                  fontSize: "14px",
                  backdropFilter: "blur(4px)",
                }}
              >
                {scanMessage}
              </div>
            )}
            <GlassButton
              onClick={handleManualScan}
              disabled={isScanning}
              style={{
                padding: "14px 28px",
                fontSize: "15px",
                background: isScanning
                  ? "rgba(100, 116, 139, 0.5)"
                  : "rgba(59, 130, 246, 0.4)",
                border: "1px solid rgba(59, 130, 246, 0.4)",
              }}
            >
              {isScanning ? "Scanning..." : "🔍 Analyze Logo"}
            </GlassButton>
          </div>
        </>
      )}

      {/* Error state */}
      {status === "error" && !isManualMode && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            background: "rgba(10, 14, 26, 0.95)",
            padding: "32px",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📵</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#f87171", marginBottom: "12px" }}>
            Camera Error
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "#94a3b8",
              textAlign: "center",
              maxWidth: "320px",
              lineHeight: 1.6,
            }}
          >
            {errorMessage || "Could not access the camera. Please ensure camera permissions are granted and try again."}
          </div>
          <GlassButton
            onClick={() => window.location.reload()}
            style={{
              marginTop: "24px",
              color: "#60a5fa",
              border: "1px solid rgba(59, 130, 246, 0.3)",
            }}
          >
            Retry
          </GlassButton>
        </div>
      )}
    </>
  );
}