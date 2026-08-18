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
import { recognizeLogo } from "@/lib/api";
import type { StockData, AIAnalysis } from "@/types";

interface ARSceneProps {
  stockData: StockData | null;
  aiAnalysis?: AIAnalysis | null;
  aiError?: string | null;
  /** Called when a target marker is found */
  onTargetFound: (targetIndex: number, ticker: string, isFallback?: boolean) => void;
  /** Called when a target marker is lost */
  onTargetLost: (targetIndex: number) => void;
  isManualMode?: boolean;
}

export default function ARScene({ stockData, aiAnalysis, aiError, onTargetFound, onTargetLost, isManualMode }: ARSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindarRef = useRef<unknown>(null);
  const anchorsRef = useRef<{ mapping: any, anchor: any }[]>([]);
  const [status, setStatus] = useState<"initializing" | "ready" | "error">("initializing");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const onTargetFoundRef = useRef(onTargetFound);
  const onTargetLostRef = useRef(onTargetLost);

  // Hologram Interactivity Refs
  const animatedObjectsRef = useRef<{update: (time: number) => void}[]>([]);
  const interactiveObjectsRef = useRef<THREE.Object3D[]>([]);
  const raycaster = useRef(new THREE.Raycaster()).current;
  const mouse = useRef(new THREE.Vector2()).current;

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

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
        dirLight.position.set(0, 5, 5);
        scene.add(dirLight);

        // Add anchors for each target and set up event listeners
        anchorsRef.current = [];
        for (const mapping of MARKER_MAPPINGS) {
          const anchor = mindarInstance.addAnchor(mapping.targetIndex);
          anchorsRef.current.push({ mapping, anchor });

          anchor.onTargetFound = () => {
            console.log(`[AlphaLens] Target detected! Ticker: ${mapping.ticker}`);
            onTargetFoundRef.current(mapping.targetIndex, mapping.ticker);
          };

          anchor.onTargetLost = () => {
            console.log(`[AlphaLens] Target LOST: ${mapping.ticker} (index ${mapping.targetIndex})`);
            onTargetLostRef.current(mapping.targetIndex);
          };
        }

        // Handle resize
        const onWindowResize = () => {
          // window resize handled automatically by mind-ar usually
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
        renderer.setAnimationLoop((time: number) => {
          // Update hologram animations
          animatedObjectsRef.current.forEach(obj => {
            if (obj.update) obj.update(time);
          });
          renderer.render(scene, camera);
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

  // Set up WebGL Raycaster for Interactivity
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onClick = (event: MouseEvent | TouchEvent) => {
      if (!mindarRef.current) return;
      const { camera } = mindarRef.current as any;
      
      let clientX, clientY;
      if ('touches' in event && (event as TouchEvent).touches.length > 0) {
        clientX = (event as TouchEvent).touches[0].clientX;
        clientY = (event as TouchEvent).touches[0].clientY;
      } else {
        clientX = (event as MouseEvent).clientX;
        clientY = (event as MouseEvent).clientY;
      }

      const rect = container.getBoundingClientRect();
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // Check intersections with our interactive objects
      const intersects = raycaster.intersectObjects(interactiveObjectsRef.current, true);
      
      if (intersects.length > 0) {
        const object = intersects[0].object;
        if (object.userData && object.userData.onClick) {
          object.userData.onClick();
        }
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("touchstart", onClick);

    return () => {
      container.removeEventListener("click", onClick);
      container.removeEventListener("touchstart", onClick);
    };
  }, [raycaster, mouse]);

  const handleManualScan = async () => {
    if (!containerRef.current || isScanning) return;

    // Find the video element injected by MindAR
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
        onTargetFoundRef.current(0, ticker, true); // true = isFallback
      }
    } catch (err) {
      console.error("Manual scan error", err);
      setScanMessage("Error analyzing image.");
    } finally {
      setIsScanning(false);
      setTimeout(() => setScanMessage(null), 3000);
    }
  };

  // Update 3D Visuals when stockData or aiAnalysis changes
  useEffect(() => {
    if (!stockData) return;

    // If manual mode, do not attach to an AR marker because it's not physically in view (which hides the mesh).
    const targetAnchorObj = isManualMode ? undefined : anchorsRef.current.find(a => a.mapping.ticker === stockData.ticker);
    
    if (!mindarRef.current) return;
    const { camera, scene } = mindarRef.current as any;
    
    // Crucial: The camera must be in the scene for its children to render!
    scene.add(camera);

    const targetParent = targetAnchorObj ? targetAnchorObj.anchor.group : scene;

    // Remove old visual group if any
    if (targetParent.userData.visualGroup) {
      targetParent.remove(targetParent.userData.visualGroup);
    }

    // Reset interactives and animations
    interactiveObjectsRef.current = [];
    animatedObjectsRef.current = [];

    const visualGroup = new THREE.Group();

    // 1. Holographic 3D Header
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // High-res futuristic background
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, "rgba(10, 14, 26, 0.95)");
      grad.addColorStop(1, "rgba(15, 23, 42, 0.7)");
      ctx.fillStyle = grad;
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 30;
      ctx.roundRect(40, 40, 944, 432, 64);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Ticker
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 90px sans-serif";
      ctx.fillText(stockData.ticker, 80, 160);

      // Price
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 130px sans-serif";
      const priceText = stockData.current_price !== null ? `$${stockData.current_price.toFixed(2)}` : "Price N/A";
      ctx.fillText(priceText, 80, 310);

      // AI Sentiment
      if (aiAnalysis) {
        ctx.fillStyle = aiAnalysis.recommendation === "Buy" ? "#00E676" : aiAnalysis.recommendation === "Sell" ? "#FF5252" : "#F59E0B";
        ctx.font = "bold 60px sans-serif";
        ctx.fillText(`AI: ${aiAnalysis.recommendation} (${aiAnalysis.sentiment_score}/100)`, 80, 430);
      } else if (aiError) {
        ctx.fillStyle = "#FF5252";
        ctx.font = "bold 40px sans-serif";
        ctx.fillText(`⚠️ AI Unavailable (Rate Limit Exceeded)`, 80, 430);
      } else {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "bold 50px sans-serif";
        ctx.fillText("✨ AI Analysis Loading...", 80, 430);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    const planeGeo = new THREE.PlaneGeometry(1.2, 0.6);
    const planeMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 1, side: THREE.DoubleSide });
    const headerMesh = new THREE.Mesh(planeGeo, planeMat);
    headerMesh.position.set(0, 1.2, 0); // Hover high above the marker
    
    // Floating animation for header
    animatedObjectsRef.current.push({
      update: (time: number) => {
        headerMesh.position.y = 1.2 + Math.sin(time * 0.002) * 0.04;
      }
    });

    visualGroup.add(headerMesh);

    // 2. Holographic 3D Bar Chart
    const prices = stockData.price_history.map((p) => p.close);
    if (prices.length > 0) {
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice || 1;

      const chartGroup = new THREE.Group();
      chartGroup.position.set(0, 0, 0); // Bottom of the chart

      const numBars = Math.min(prices.length, 30); // show last 30 days max for clarity
      const recentPrices = prices.slice(-numBars);
      const recentHistory = stockData.price_history.slice(-numBars);
      
      const barWidth = 0.025;
      const spacing = 0.015;
      const startX = -((numBars * (barWidth + spacing)) / 2);

      // Interactive Tooltip Sprite
      const tooltipCanvas = document.createElement("canvas");
      tooltipCanvas.width = 512;
      tooltipCanvas.height = 256;
      const tCtx = tooltipCanvas.getContext("2d")!;
      const tooltipTexture = new THREE.CanvasTexture(tooltipCanvas);
      const tooltipMat = new THREE.SpriteMaterial({ map: tooltipTexture, transparent: true, opacity: 0 });
      const tooltipSprite = new THREE.Sprite(tooltipMat);
      tooltipSprite.scale.set(0.5, 0.25, 1);
      chartGroup.add(tooltipSprite);

      const updateTooltip = (date: string, price: number, xPos: number, height: number) => {
        tCtx.clearRect(0, 0, 512, 256);
        
        // Tooltip Background
        tCtx.fillStyle = "rgba(10, 14, 26, 0.9)";
        tCtx.strokeStyle = "#38bdf8";
        tCtx.lineWidth = 4;
        tCtx.roundRect(10, 10, 492, 236, 32);
        tCtx.fill();
        tCtx.stroke();
        
        // Tooltip Text
        tCtx.fillStyle = "#ffffff";
        tCtx.font = "bold 70px sans-serif";
        tCtx.fillText(`$${price.toFixed(2)}`, 50, 110);
        tCtx.fillStyle = "#94a3b8";
        tCtx.font = "40px sans-serif";
        tCtx.fillText(new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), 50, 190);
        
        tooltipTexture.needsUpdate = true;
        
        // Position exactly above the tapped bar
        tooltipSprite.position.set(xPos, height + 0.3, 0.1);
        tooltipMat.opacity = 1.0;
      };

      recentPrices.forEach((price, index) => {
        const isPositive = index === 0 || price >= recentPrices[index - 1];
        const height = ((price - minPrice) / priceRange) * 0.5 + 0.05; // Base height 0.05
        
        // Glowing Cylinders
        const geometry = new THREE.CylinderGeometry(barWidth/2, barWidth/2, height, 16);
        const material = new THREE.MeshStandardMaterial({
          color: isPositive ? 0x00E676 : 0xFF5252,
          emissive: isPositive ? 0x00E676 : 0xFF5252,
          emissiveIntensity: 0.5,
          transparent: true,
          opacity: 0.9,
          roughness: 0.2,
          metalness: 0.8
        });
        const mesh = new THREE.Mesh(geometry, material);
        const xPos = startX + index * (barWidth + spacing);
        mesh.position.set(xPos, height / 2, 0);
        
        const delay = index * 30; // ms
        const startTime = performance.now() + delay;

        // Setup Interactivity
        mesh.userData = {
          onClick: () => updateTooltip(recentHistory[index].date, price, xPos, height)
        };
        interactiveObjectsRef.current.push(mesh);
        chartGroup.add(mesh);
        
        // Glowing Pulse Node on top of the bar
        const nodeGeo = new THREE.SphereGeometry(barWidth * 1.2, 16, 16);
        const nodeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
        const node = new THREE.Mesh(nodeGeo, nodeMat);
        node.position.set(xPos, height, 0);
        node.userData = mesh.userData;
        interactiveObjectsRef.current.push(node);
        chartGroup.add(node);
        
        // Pulse animation for nodes
        animatedObjectsRef.current.push({
          update: (time: number) => {
            if (time > startTime) {
              nodeMat.opacity = 0.3 + Math.sin(time * 0.005 + index) * 0.2;
            }
          }
        });
      });
      
      // Auto-fade tooltip over time
      animatedObjectsRef.current.push({
        update: () => {
          if (tooltipMat.opacity > 0) tooltipMat.opacity -= 0.005;
        }
      });

      visualGroup.add(chartGroup);
    }

    if (targetAnchorObj) {
      // MindAR tracked images exist on the XY plane. Z points toward the camera.
      // So we rotate the visual group 90 degrees around X to make it stand up physically from the card!
      visualGroup.rotation.x = Math.PI / 2;
      visualGroup.scale.set(1.5, 1.5, 1.5);
    } else {
      // Fallback mode: attach to scene, pushed far away in Z axis of the camera to avoid near-plane clipping
      // We manually update position/rotation in the render loop to avoid WebXR/MindAR camera child culling issues
      visualGroup.scale.set(50, 50, 50); // Massive scale
      animatedObjectsRef.current.push({
        update: () => {
          visualGroup.quaternion.copy(camera.quaternion);
          visualGroup.position.copy(camera.position);
          visualGroup.translateZ(-150); // Push it far into the scene where we know WebGL renders
          visualGroup.translateY(-20); // Drop it slightly so it centers better
        }
      });
    }
    
    targetParent.add(visualGroup);
    targetParent.userData.visualGroup = visualGroup;

  }, [stockData, aiAnalysis, aiError]);


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
          position: "absolute",
          zIndex: 10,
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
              <div style={{ background: "rgba(0,0,0,0.8)", padding: "8px 16px", borderRadius: "12px", color: "#fff", fontSize: "14px", backdropFilter: "blur(4px)" }}>
                {scanMessage}
              </div>
            )}
            <button
              onClick={handleManualScan}
              disabled={isScanning}
              style={{
                padding: "16px 32px",
                borderRadius: "32px",
                background: isScanning ? "#64748b" : "#3b82f6",
                color: "#fff",
                border: "2px solid rgba(255,255,255,0.2)",
                fontWeight: "bold",
                fontSize: "16px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                cursor: isScanning ? "wait" : "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {isScanning ? "Scanning..." : "Analyze Logo"}
            </button>
          </div>
        </>
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
