"use client";

import { useEffect, useRef, useState } from "react";
import { recognizeLogo } from "@/lib/api";

interface AIScannerProps {
  onTargetFound: (targetIndex: number, ticker: string, isManual?: boolean) => void;
}

export default function AIScanner({ onTargetFound }: AIScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState<string>("📷 Point at a company logo");

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        currentStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Failed to access camera", err);
        setMessage("⚠️ Camera access denied or unavailable.");
      }
    }

    startCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleScan = async () => {
    if (!videoRef.current || isScanning) return;
    
    setIsScanning(true);
    setMessage("✨ Analyzing with Gemini Vision...");

    try {
      // Draw video frame to canvas to get base64 image
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");
      
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64Image = canvas.toDataURL("image/jpeg", 0.8);

      const ticker = await recognizeLogo(base64Image);

      if (ticker === "NONE") {
        setMessage("❌ No logo detected. Try adjusting angle or lighting.");
      } else {
        setMessage(`✅ Detected: ${ticker}`);
        onTargetFound(0, ticker, false); // Pass to main app (false = AR triggered)
      }
    } catch (err) {
      console.error("Scan error", err);
      setMessage("⚠️ Error analyzing image. Try again.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#000", zIndex: 0 }}>
      {/* Video Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Viewfinder UI */}
      <div 
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "250px",
          height: "250px",
          border: "2px dashed rgba(255,255,255,0.5)",
          borderRadius: "24px",
          pointerEvents: "none",
          boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4)" // Darken surroundings
        }}
      />

      {/* Controls */}
      <div 
        style={{
          position: "absolute",
          bottom: "100px",
          left: "0",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "16px",
          zIndex: 50
        }}
      >
        <div style={{ background: "rgba(0,0,0,0.6)", padding: "8px 16px", borderRadius: "16px", color: "white", fontSize: "14px", backdropFilter: "blur(4px)" }}>
          {message}
        </div>
        
        <button
          onClick={handleScan}
          disabled={isScanning || !stream}
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            backgroundColor: isScanning ? "#94a3b8" : "white",
            border: "4px solid rgba(255,255,255,0.3)",
            backgroundClip: "padding-box",
            cursor: isScanning || !stream ? "wait" : "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            transition: "transform 0.1s"
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.95)"}
          onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
        />
      </div>
    </div>
  );
}
