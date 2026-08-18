"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Center, OrbitControls, PerspectiveCamera } from "@react-three/drei";

import { MARKER_MAPPINGS } from "@/lib/constants";
import { recognizeLogo } from "@/lib/api";
import type { StockData, AIAnalysis } from "@/types";
import Stock3DVisuals from "./Stock3DVisuals";

interface ARSceneProps {
  stockData: StockData | null;
  aiAnalysis?: AIAnalysis | null;
  aiError?: string | null;
  onTargetFound: (targetIndex: number, ticker: string, isFallback?: boolean) => void;
  onTargetLost: (targetIndex: number) => void;
  isManualMode?: boolean;
}

/**
 * ARTracker acts as an ingenious bridge between MindAR's computer vision and R3F's scene graph.
 * It strictly syncs the WebGL projection matrix and anchor transformations seamlessly into React.
 */
const ARTracker = ({ mindarInstance, anchors, stockData, aiAnalysis }: any) => {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!mindarInstance) return;

    // 1. Sync AR Camera Projection directly from MindAR's engine
    camera.projectionMatrix.copy(mindarInstance.camera.projectionMatrix);
    camera.projectionMatrixInverse.copy(mindarInstance.camera.projectionMatrixInverse);

    // 2. Sync Anchor Pose
    if (anchors.length > 0 && groupRef.current) {
      const activeAnchor = anchors.find((a: any) => a.mapping.ticker === stockData?.ticker);
      
      if (activeAnchor && activeAnchor.anchor.group.visible) {
        groupRef.current.visible = true;
        // Apply the anchor matrix, while matrixAutoUpdate=false on the group ensures R3F doesn't overwrite it
        groupRef.current.matrix.copy(activeAnchor.anchor.group.matrix);
      } else {
        groupRef.current.visible = false;
      }
    }
  });

  if (!stockData) return null;

  return (
    <group ref={groupRef} matrixAutoUpdate={false} visible={false}>
      <group rotation={[Math.PI / 2, 0, 0]} scale={[1.2, 1.2, 1.2]}>
          <Stock3DVisuals data={stockData} aiAnalysis={aiAnalysis} />
      </group>
    </group>
  );
};

export default function ARScene({ stockData, aiAnalysis, aiError, onTargetFound, onTargetLost, isManualMode }: ARSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindarRef = useRef<any>(null);
  const [anchors, setAnchors] = useState<any[]>([]);
  const [status, setStatus] = useState<"initializing" | "ready" | "error">("initializing");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

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
        const domContainer = document.querySelector("#mindar-container");
        if (isCleanedUp || !domContainer) return;

        mindarInstance = new MindARThree({
          container: domContainer,
          imageTargetSrc: "/targets.mind",
          maxTrack: 1,
          uiLoading: "no",
          uiScanning: "no",
          uiError: "no",
        });

        // CRITICAL HACK: Hide MindAR's native canvas to strictly use React Three Fiber's <Canvas>
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

        // Keep MindAR's internal engine ticking so anchor matrices continue to update asynchronously
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
        } catch {}
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

  return (
    <>
      {/* MindAR handles the video feed behind the scenes dynamically (only visible in AR mode) */}
      <div
        id="mindar-container"
        ref={containerRef}
        style={{ 
          width: "100vw", height: "100vh", position: "absolute", zIndex: 10, top: 0, left: 0,
          opacity: isManualMode ? 0 : 1 // Hide video feed during manual mode presentation
        }}
      />

      {status === "ready" && (
        <div style={{ 
          position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 20,
          // Beautiful dark gradient for manual mode to make the glassmorphism pop
          background: isManualMode ? "radial-gradient(circle at center, #1e293b 0%, #0a0f1a 100%)" : "transparent"
        }}>
          <Canvas
            gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
            dpr={[1, 2]}
            // Enable pointer events on R3F canvas to allow 3D interactions
            style={{ pointerEvents: "auto" }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow />
            
            {/* Advanced HDRI Environment Map */}
            <Environment preset="city" />

            {isManualMode && stockData ? (
              <>
                {/* 
                  Manual Mode Presentation: 
                  - We explicitly inject a new camera so we don't inherit MindAR's camera matrix.
                  - OrbitControls allow the user to drag and spin the 3D chart in this mode.
                */}
                <PerspectiveCamera makeDefault position={[0, 0, 4]} fov={50} />
                <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 1.5} minPolarAngle={Math.PI / 4} />
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

      {/* Legacy UI Overlays - ONLY SHOW WHEN NOT IN MANUAL MODE */}
      {status === "initializing" && !isManualMode && (
        <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 60, background: "rgba(10, 14, 26, 0.95)" }}>
          <div style={{ width: "48px", height: "48px", border: "3px solid rgba(59,130,246,0.2)", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: "20px" }} />
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", marginBottom: "8px" }}>Initializing Camera</div>
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>Please allow camera access when prompted</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {status === "ready" && !isManualMode && (
        <>
          <div className="animate-fade-in-up" style={{ position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 60, pointerEvents: "none" }}>
            <div className="glass-card-sm" style={{ padding: "8px 16px", fontSize: "12px", color: "#94a3b8", textAlign: "center" }}>
              📷 Point camera at a company logo
            </div>
          </div>
          <div style={{ position: "fixed", bottom: "32px", left: "50%", transform: "translateX(-50%)", zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            {scanMessage && (
              <div style={{ background: "rgba(0,0,0,0.8)", padding: "8px 16px", borderRadius: "12px", color: "#fff", fontSize: "14px", backdropFilter: "blur(4px)" }}>
                {scanMessage}
              </div>
            )}
            <button onClick={handleManualScan} disabled={isScanning} style={{ padding: "16px 32px", borderRadius: "32px", background: isScanning ? "#64748b" : "#3b82f6", color: "#fff", border: "2px solid rgba(255,255,255,0.2)", fontWeight: "bold", fontSize: "16px", boxShadow: "0 4px 16px rgba(0,0,0,0.5)", cursor: isScanning ? "wait" : "pointer", transition: "all 0.2s ease" }}>
              {isScanning ? "Scanning..." : "Analyze Logo"}
            </button>
          </div>
        </>
      )}

      {status === "error" && !isManualMode && (
        <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 60, background: "rgba(10, 14, 26, 0.95)", padding: "32px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📵</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#f87171", marginBottom: "12px" }}>Camera Error</div>
          <div style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", maxWidth: "320px", lineHeight: 1.6 }}>
            {errorMessage || "Could not access the camera. Please ensure camera permissions are granted and try again."}
          </div>
          <button onClick={() => window.location.reload()} className="glass-card-sm" style={{ marginTop: "24px", padding: "10px 24px", fontSize: "14px", fontWeight: 600, color: "#60a5fa", cursor: "pointer", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "12px" }}>
            Retry
          </button>
        </div>
      )}
    </>
  );
}
