/**
 * ARScene — Core AR component integrating MindAR + Three.js + CSS3DRenderer.
 *
 * This component:
 * 1. Initializes MindAR image tracking with the compiled .mind target file.
 * 2. Sets up dual renderers (WebGL for AR, CSS3D for HTML overlays).
 * 3. Attaches anchors for each target image.
 * 4. Fires callbacks on target found/lost events for data fetching.
 *
 * IMPORTANT: This component must only run on the client side (no SSR).
 * It uses dynamic imports for MindAR and Three.js CSS3D modules.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MARKER_MAPPINGS } from "@/lib/constants";

interface ARSceneProps {
  /** Called when a target marker is found */
  onTargetFound: (targetIndex: number, ticker: string) => void;
  /** Called when a target marker is lost */
  onTargetLost: (targetIndex: number) => void;
}

export default function ARScene({ onTargetFound, onTargetLost }: ARSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindarRef = useRef<unknown>(null);
  const [status, setStatus] = useState<"initializing" | "ready" | "error">("initializing");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const onTargetFoundRef = useRef(onTargetFound);
  const onTargetLostRef = useRef(onTargetLost);
  
  useEffect(() => {
    onTargetFoundRef.current = onTargetFound;
    onTargetLostRef.current = onTargetLost;
  }, [onTargetFound, onTargetLost]);

  useEffect(() => {
    if (!containerRef.current) return;

    let isCleanedUp = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mindarInstance: any = null;

    const initAR = async () => {
      try {
        // Dynamic imports to avoid SSR issues
        const { MindARThree } = await import(
          "mind-ar/dist/mindar-image-three.prod.js"
        );
        const { CSS3DRenderer, CSS3DObject } = await import(
          "three/addons/renderers/CSS3DRenderer.js"
        );

        if (isCleanedUp) return;

        // Initialize MindAR
        mindarInstance = new MindARThree({
          container: containerRef.current!,
          imageTargetSrc: "/targets.mind",
          maxTrack: 1,               // Track one image at a time for performance
          uiLoading: "no",           // We handle our own loading UI
          uiScanning: "no",          // We handle our own scanning UI
          uiError: "no",
        });

        mindarRef.current = mindarInstance;

        const { renderer, scene, camera } = mindarInstance;

        // Make the WebGL background transparent so camera feed shows through
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Setup CSS3DRenderer for the spatial UI
        const cssRenderer = new CSS3DRenderer();
        cssRenderer.setSize(window.innerWidth, window.innerHeight);
        cssRenderer.domElement.style.position = "absolute";
        cssRenderer.domElement.style.top = "0";
        cssRenderer.domElement.style.pointerEvents = "none"; // Let clicks pass through to WebGL if needed
        containerRef.current!.appendChild(cssRenderer.domElement);

        const cssScene = new THREE.Scene();

        // Setup a container div for the dashboard that page.tsx can render into via portal
        const dashboardDiv = document.createElement("div");
        dashboardDiv.id = "spatial-ui-root";
        dashboardDiv.style.pointerEvents = "auto"; // Enable interaction on the dashboard itself
        
        const cssObject = new CSS3DObject(dashboardDiv);
        // Scale down CSS3D object to fit the AR world (pixels to Three.js units)
        cssObject.scale.set(0.002, 0.002, 0.002); 
        cssScene.add(cssObject);

        // Add anchors for each target and set up event listeners
        for (const mapping of MARKER_MAPPINGS) {
          const anchor = mindarInstance.addAnchor(mapping.targetIndex);

          // Attach the CSS object to the first anchor for testing (or you'd create multiple)
          // For dynamic tracking, we re-parent the cssObject to the active anchor
          
          anchor.onTargetFound = () => {
            console.log(`[AlphaLens] Target FOUND: ${mapping.ticker} (index ${mapping.targetIndex})`);
            // Move the dashboard to this anchor
            anchor.group.add(cssObject);
            onTargetFoundRef.current(mapping.targetIndex, mapping.ticker);
          };

          anchor.onTargetLost = () => {
            console.log(`[AlphaLens] Target LOST: ${mapping.ticker} (index ${mapping.targetIndex})`);
            onTargetLostRef.current(mapping.targetIndex);
          };
        }

        // Handle resize
        const onWindowResize = () => {
          cssRenderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener("resize", onWindowResize);

        // Start the AR engine
        await mindarInstance.start();

        if (isCleanedUp) {
          mindarInstance.stop();
          window.removeEventListener("resize", onWindowResize);
          return;
        }

        setStatus("ready");

        // Render loop
        renderer.setAnimationLoop(() => {
          renderer.render(scene, camera);
          cssRenderer.render(cssScene, camera);
        });
      } catch (err) {
        console.error("[AlphaLens] AR initialization error:", err);
        if (!isCleanedUp) {
          setStatus("error");
          setErrorMessage(
            err instanceof Error ? err.message : "Failed to initialize AR"
          );
        }
      }
    };

    initAR();

    return () => {
      isCleanedUp = true;
      if (mindarInstance) {
        try {
          mindarInstance.stop();
        } catch {
          // Cleanup errors are expected during hot reload
        }
      }
    };
  }, []);

  return (
    <>
      {/* AR camera container */}
      <div
        ref={containerRef}
        className="ar-container"
        id="ar-container"
        style={{
          width: "100vw",
          height: "100vh",
          position: "fixed",
          top: 0,
          left: 0,
        }}
      />

      {/* Status overlays */}
      {status === "initializing" && (
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

      {status === "ready" && (
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
      )}

      {status === "error" && (
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
          <button
            onClick={() => window.location.reload()}
            className="glass-card-sm"
            style={{
              marginTop: "24px",
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#60a5fa",
              cursor: "pointer",
              background: "rgba(59,130,246,0.1)",
              border: "1px solid rgba(59,130,246,0.3)",
              borderRadius: "12px",
            }}
          >
            Retry
          </button>
        </div>
      )}
    </>
  );
}
