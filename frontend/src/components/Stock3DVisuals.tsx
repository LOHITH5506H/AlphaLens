"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Text, Float, Line } from "@react-three/drei";
import type { StockData, AIAnalysis, StockInsights } from "@/types";

interface Stock3DVisualsProps {
  data: StockData;
  aiAnalysis?: AIAnalysis | null;
  stockInsights?: StockInsights | null;
  activeTab?: "OVERVIEW" | "RIBBON" | "AI" | "PREDICT" | "OPTIONS";
  onPinchStateChange?: (isPinching: boolean) => void;
}

// ── 1. Sci-Fi Gyroscopic Rotating HUD Ring ─────────────────────────────────
function GyroRing({ radius, tube, speed, axis = "z", color = "#00f0ff", opacity = 0.4 }: any) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      if (axis === "z") meshRef.current.rotation.z += delta * speed;
      if (axis === "y") meshRef.current.rotation.y += delta * speed;
      if (axis === "x") meshRef.current.rotation.x += delta * speed;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[radius, tube, 16, 64]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        wireframe
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ── 2. Ambient Cyber Particle Dust ─────────────────────────────────────────
function HolographicParticles({ count = 80 }) {
  const points = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      p[i] = (Math.random() - 0.5) * 8;
      p[i + 1] = (Math.random() - 0.5) * 6;
      p[i + 2] = (Math.random() - 0.5) * 3;
    }
    return p;
  }, [count]);

  const pointsRef = useRef<THREE.Points>(null);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[points, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        color="#00f0ff"
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ── 3. Trajectory Particle Trail ───────────────────────────────────────────
function TrajectoryParticles({ curve, color }: { curve: THREE.CatmullRomCurve3; color: string }) {
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = 40;

  const positions = useMemo(() => new Float32Array(particleCount * 3), []);

  useFrame(({ clock }) => {
    if (!particlesRef.current) return;
    const t = clock.getElapsedTime();
    const geo = particlesRef.current.geometry;
    const posAttr = geo.getAttribute("position");

    for (let i = 0; i < particleCount; i++) {
      const offset = (t * 0.15 + i / particleCount) % 1.0;
      const point = curve.getPoint(offset);
      // Add subtle noise for organic feel
      const noise = Math.sin(t * 3 + i * 0.7) * 0.015;
      posAttr.setXYZ(i, point.x + noise, point.y + noise, point.z + noise * 0.5);
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={particleCount}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color={color}
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ── 4. PREDICT Tab — Trajectory Line + Volatility Corridor ─────────────────
function PredictionVisuals({ insights }: { insights: StockInsights }) {
  const {
    predicted_prices,
    volatility_upper,
    volatility_lower,
    sentiment_score,
    sentiment_label,
    current_price,
    pe_ratio,
    market_cap,
    profit_margins,
    prediction_dates,
  } = insights;

  // Price delta for the card
  const priceDelta = predicted_prices[4] - current_price;
  const priceDeltaPct = (priceDelta / current_price) * 100;

  // ── Color palette based on trajectory ──────────────────────────────────
  const sentimentColor = useMemo(() => {
    if (priceDeltaPct >= 0.5) return "#10B981"; // Emerald green (positive)
    if (priceDeltaPct <= -0.5) return "#EF4444"; // Ruby red (negative)
    return "#06B6D4"; // Cyan (neutral)
  }, [priceDeltaPct]);

  const sentimentColorAlt = useMemo(() => {
    if (priceDeltaPct >= 0.5) return "#34D399";
    if (priceDeltaPct <= -0.5) return "#F87171";
    return "#22D3EE";
  }, [priceDeltaPct]);

  // ── Map prices to 3D coordinates ──────────────────────────────────────
  // X-axis: time (0 to ~1.2 units), Y-axis: price deviation, Z-axis: depth
  const W = 3.6; // total width
  const allPrices = [current_price, ...predicted_prices];
  const allUpper = [current_price, ...volatility_upper];
  const allLower = [current_price, ...volatility_lower];

  const priceMin = Math.min(...allLower);
  const priceMax = Math.max(...allUpper);
  const priceRange = Math.max(priceMax - priceMin, 0.01);
  const priceMid = (priceMax + priceMin) / 2;

  const mapY = (price: number) => ((price - priceMid) / priceRange) * 1.4;
  const mapX = (i: number) => -W / 2 + (i / 5) * W;

  // ── CatmullRomCurve3 through 6 points (current + 5 predicted) ────────
  const { trajectoryCurve, trajectoryPoints, upperPoints, lowerPoints } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const upper: THREE.Vector3[] = [];
    const lower: THREE.Vector3[] = [];

    for (let i = 0; i <= 5; i++) {
      const x = mapX(i);
      const z = 0.05;
      pts.push(new THREE.Vector3(x, mapY(allPrices[i]), z));
      upper.push(new THREE.Vector3(x, mapY(allUpper[i]), z));
      lower.push(new THREE.Vector3(x, mapY(allLower[i]), z));
    }

    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
    return { trajectoryCurve: curve, trajectoryPoints: pts, upperPoints: upper, lowerPoints: lower };
  }, [predicted_prices, volatility_upper, volatility_lower, current_price]);

  // Tube geometry for volatility corridor
  const tubeRadius = useMemo(() => {
    // Dynamic radius based on average volatility spread
    const avgSpread = predicted_prices.reduce((sum, p, i) => {
      return sum + (volatility_upper[i] - volatility_lower[i]);
    }, 0) / predicted_prices.length;
    return Math.max(0.015, Math.min(0.08, (avgSpread / priceRange) * 0.4));
  }, [predicted_prices, volatility_upper, volatility_lower, priceRange]);

  // Smoothly interpolated line points
  const curveLinePoints = useMemo(() => {
    return trajectoryCurve.getPoints(64).map(
      (p) => [p.x, p.y, p.z] as [number, number, number]
    );
  }, [trajectoryCurve]);

  // Secondary echo lines for upper/lower bounds
  const upperLinePoints = useMemo(() => {
    const c = new THREE.CatmullRomCurve3(upperPoints, false, "catmullrom", 0.5);
    return c.getPoints(48).map((p) => [p.x, p.y, p.z] as [number, number, number]);
  }, [upperPoints]);

  const lowerLinePoints = useMemo(() => {
    const c = new THREE.CatmullRomCurve3(lowerPoints, false, "catmullrom", 0.5);
    return c.getPoints(48).map((p) => [p.x, p.y, p.z] as [number, number, number]);
  }, [lowerPoints]);

  // Format market cap
  const fmtMarketCap = useMemo(() => {
    if (!market_cap) return "N/A";
    if (market_cap >= 1e12) return `$${(market_cap / 1e12).toFixed(1)}T`;
    if (market_cap >= 1e9) return `$${(market_cap / 1e9).toFixed(1)}B`;
    if (market_cap >= 1e6) return `$${(market_cap / 1e6).toFixed(1)}M`;
    return `$${market_cap.toLocaleString()}`;
  }, [market_cap]);

  return (
    <group position={[0, -0.2, 0.1]}>
      {/* Section header */}
      <Text position={[-1.7, 1.0, 0]} fontSize={0.16} color={sentimentColor} anchorX="left">
        ◈ LSTM_TRAJECTORY_FORECAST
      </Text>

      {/* ── Volatility Corridor (frosted glass tube) ───────────────────── */}
      <mesh>
        <tubeGeometry args={[trajectoryCurve, 64, tubeRadius, 16, false]} />
        <meshPhysicalMaterial
          color={sentimentColor}
          transmission={0.88}
          roughness={0.12}
          metalness={0.05}
          transparent
          opacity={0.6}
          ior={1.45}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* ── Main trajectory spline (neon glow) ─────────────────────────── */}
      <Line
        points={curveLinePoints}
        color={sentimentColor}
        lineWidth={4}
        transparent
        opacity={1}
      />

      {/* ── Secondary glow echo ────────────────────────────────────────── */}
      <Line
        points={curveLinePoints}
        color={sentimentColorAlt}
        lineWidth={1.5}
        transparent
        opacity={0.5}
      />

      {/* ── Upper/Lower volatility bound lines ─────────────────────────── */}
      <Line
        points={upperLinePoints}
        color={sentimentColor}
        lineWidth={1}
        transparent
        opacity={0.3}
      />
      <Line
        points={lowerLinePoints}
        color={sentimentColor}
        lineWidth={1}
        transparent
        opacity={0.3}
      />

      {/* ── Particle trail along trajectory ────────────────────────────── */}
      <TrajectoryParticles curve={trajectoryCurve} color={sentimentColor} />

      {/* ── Price keypoints at each predicted day ──────────────────────── */}
      {/* Current price anchor */}
      <group position={[mapX(0), mapY(current_price), 0.05]}>
        <mesh>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <Text position={[0, 0.15, 0]} fontSize={0.1} color="#ffffff" anchorX="center">
          NOW
        </Text>
        <Text position={[0, -0.12, 0]} fontSize={0.09} color="#94a3b8" anchorX="center">
          {`$${current_price.toFixed(2)}`}
        </Text>
      </group>

      {/* Predicted price nodes */}
      {predicted_prices.map((price, i) => {
        const x = mapX(i + 1);
        const y = mapY(price);
        const dateLabel = prediction_dates[i]
          ? prediction_dates[i].slice(5) // MM-DD
          : `D+${i + 1}`;
        return (
          <group key={i} position={[x, y, 0.05]}>
            {/* Compact Glowing keypoint */}
            <mesh>
              <sphereGeometry args={[0.025, 16, 16]} />
              <meshBasicMaterial
                color={sentimentColor}
                transparent
                opacity={1}
              />
            </mesh>
            {/* Price label */}
            <Text position={[0, 0.1, 0]} fontSize={0.08} color="#ffffff" anchorX="center">
              {`$${price.toFixed(2)}`}
            </Text>
            {/* Date label */}
            <Text position={[0, -0.09, 0]} fontSize={0.06} color="#94a3b8" anchorX="center">
              {dateLabel}
            </Text>
          </group>
        );
      })}

      {/* ── Floating Fundamental Cards ─────────────────────────────────── */}
      {/* Left card: Valuation HUD */}
      <group position={[-1.8, -0.85, 0.15]}>
        <mesh>
          <planeGeometry args={[1.2, 0.55]} />
          <meshBasicMaterial
            color="#0a192f"
            transparent
            opacity={0.7}
          />
        </mesh>
        {/* Border */}
        <Line
          points={[
            [-0.6, 0.275, 0.01], [0.6, 0.275, 0.01],
            [0.6, -0.275, 0.01], [-0.6, -0.275, 0.01],
            [-0.6, 0.275, 0.01],
          ]}
          color={sentimentColor}
          lineWidth={1}
          transparent
          opacity={0.4}
        />
        <Text position={[0, 0.17, 0.02]} fontSize={0.08} color={sentimentColor} anchorX="center">
          ◈ VALUATION
        </Text>
        <Text position={[-0.5, 0.02, 0.02]} fontSize={0.08} color="#94a3b8" anchorX="left">
          {`P/E:     ${pe_ratio?.toFixed(1) ?? "N/A"}`}
        </Text>
        <Text position={[-0.5, -0.12, 0.02]} fontSize={0.08} color="#94a3b8" anchorX="left">
          {`Mkt Cap: ${fmtMarketCap}`}
        </Text>
        <Text position={[-0.5, -0.22, 0.02]} fontSize={0.07} color="#64748b" anchorX="left">
          {`Margin:  ${profit_margins ? (profit_margins * 100).toFixed(1) + "%" : "N/A"}`}
        </Text>
      </group>

      {/* Right card: 5D Target Prediction */}
      <group position={[1.8, -0.85, 0.15]}>
        <mesh>
          <planeGeometry args={[1.2, 0.55]} />
          <meshBasicMaterial
            color="#0a192f"
            transparent
            opacity={0.7}
          />
        </mesh>
        <Line
          points={[
            [-0.6, 0.275, 0.01], [0.6, 0.275, 0.01],
            [0.6, -0.275, 0.01], [-0.6, -0.275, 0.01],
            [-0.6, 0.275, 0.01],
          ]}
          color={sentimentColor}
          lineWidth={1}
          transparent
          opacity={0.4}
        />
        <Text position={[0, 0.17, 0.02]} fontSize={0.08} color={sentimentColor} anchorX="center">
          ◈ 5D TARGET PREDICTION
        </Text>
        <Text position={[-0.5, 0.02, 0.02]} fontSize={0.10} color={
          priceDelta >= 0 ? "#10B981" : "#EF4444"
        } anchorX="left">
          {`$${predicted_prices[4].toFixed(2)} (${priceDelta >= 0 ? "+" : ""}${priceDeltaPct.toFixed(2)}%)`}
        </Text>
        <Text position={[-0.5, -0.12, 0.02]} fontSize={0.08} color="#94a3b8" anchorX="left">
          {`Signal:  ${sentiment_label}`}
        </Text>
        <Text position={[-0.5, -0.22, 0.02]} fontSize={0.07} color="#64748b" anchorX="left">
          {`AI Score: ${(sentiment_score).toFixed(0)}%`}
        </Text>
      </group>
    </group>
  );
}

// ── 5. OPTIONS Tab — Volatility Surface & Implied Chain ───────────────────
function OptionsVisuals({ price, color, onPinchStateChange }: { price: number, color: string, onPinchStateChange?: (p: boolean) => void }) {
  const geoRef = useRef<THREE.PlaneGeometry>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const strikes = useMemo(() => {
    const arr = [];
    for (let i = -3; i <= 3; i++) {
      arr.push(Math.round(price * (1 + i * 0.025)));
    }
    return arr;
  }, [price]);

  useEffect(() => {
    if (geoRef.current) {
      const pos = geoRef.current.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        // Volatility Smile and Term Structure simulation
        const smile = (x * x) * 0.15;
        const z = smile + Math.sin(x * 6 + y * 4) * 0.05;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
      geoRef.current.computeVertexNormals();
    }
  }, []);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.z = clock.elapsedTime * 0.1;
      meshRef.current.rotation.x = -Math.PI / 2.5 + Math.sin(clock.elapsedTime * 0.5) * 0.1;
    }
  });

  return (
    <group position={[0, -0.2, 0.1]}>
      <Text position={[-1.7, 1.0, 0]} fontSize={0.16} color={color} anchorX="left">
        ◈ DERIVATIVES_MATRIX // VOLATILITY_SURFACE
      </Text>

      {/* Volatility Surface 3D Mesh */}
      <group position={[-0.8, -0.3, -0.2]}>
        <mesh ref={meshRef}>
          <planeGeometry ref={geoRef} args={[2.5, 2.5, 32, 32]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.4} blending={THREE.AdditiveBlending} />
        </mesh>
        <Text position={[0, 1.4, 0]} fontSize={0.1} color={color} anchorX="center">IMPLIED VOLATILITY (30D)</Text>
      </group>

      {/* Call / Put Chain Data */}
      <group position={[1.2, 0, 0]}>
        <Text position={[0, 0.7, 0]} fontSize={0.12} color="#ffffff" anchorX="center">LIQUIDITY_CHAIN</Text>
        <Text position={[-0.6, 0.5, 0]} fontSize={0.09} color="#10B981" anchorX="center">CALLS</Text>
        <Text position={[0, 0.5, 0]} fontSize={0.09} color="#94a3b8" anchorX="center">STRIKE</Text>
        <Text position={[0.6, 0.5, 0]} fontSize={0.09} color="#EF4444" anchorX="center">PUTS</Text>

        {strikes.map((strike, i) => {
          const isATM = i === 3;
          const y = 0.3 - i * 0.16;
          // Deterministic pseudo-random volume
          const callVol = isATM ? 15420 : Math.floor((Math.sin(strike) * 0.5 + 0.5) * 5000 + 500);
          const putVol = isATM ? 12300 : Math.floor((Math.cos(strike) * 0.5 + 0.5) * 5000 + 500);
          
          return (
            <group key={strike} position={[0, y, 0]}>
              <mesh 
                position={[-0.6, 0, 0]}
                onPointerDown={() => onPinchStateChange?.(true)}
                onPointerUp={() => onPinchStateChange?.(false)}
                onPointerOut={() => onPinchStateChange?.(false)}
              >
                <boxGeometry args={[0.35, 0.12, 0.05]} />
                <meshBasicMaterial color="#10B981" transparent opacity={0.2} />
              </mesh>
              <Text position={[-0.6, 0, 0.03]} fontSize={0.08} color="#10B981" anchorX="center" anchorY="middle">{callVol.toLocaleString()}</Text>

              <Text position={[0, 0, 0]} fontSize={0.1} color={isATM ? "#ffffff" : "#64748b"} anchorX="center" anchorY="middle">
                ${strike}
              </Text>
              
              <mesh 
                position={[0.6, 0, 0]}
                onPointerDown={() => onPinchStateChange?.(true)}
                onPointerUp={() => onPinchStateChange?.(false)}
                onPointerOut={() => onPinchStateChange?.(false)}
              >
                <boxGeometry args={[0.35, 0.12, 0.05]} />
                <meshBasicMaterial color="#EF4444" transparent opacity={0.2} />
              </mesh>
              <Text position={[0.6, 0, 0.03]} fontSize={0.08} color="#EF4444" anchorX="center" anchorY="middle">{putVol.toLocaleString()}</Text>
            </group>
          );
        })}
      </group>
    </group>
  );
}

// ── 6. Main Holographic Dashboard Component ────────────────────────────────
export default function Stock3DVisuals({ data, aiAnalysis, stockInsights, activeTab = "OVERVIEW", onPinchStateChange }: Stock3DVisualsProps) {
  const coreRef = useRef<THREE.Group>(null);
  const mainGroupRef = useRef<THREE.Group>(null);

  // Safe data fallbacks
  const symbol = data?.symbol || "TSLA";
  const price = data?.price ?? 0;
  const change = data?.change ?? 0;
  const changePercent = data?.changePercent ?? 0;
  const isPositive = change >= 0;

  const open = data?.open ?? price;
  const high = data?.high ?? price * 1.02;
  const low = data?.low ?? price * 0.98;
  const volume = data?.volume ?? 2500000;

  // ── FinBERT-driven sentiment for the AI Neural Core ───────────────────
  // Use stockInsights (FinBERT ticker-specific) as primary source,
  // fall back to generic aiAnalysis only if insights unavailable
  const finbertScore = stockInsights?.sentiment_score ?? null;
  const finbertLabel = stockInsights?.sentiment_label ?? null;

  const sentimentDisplay = useMemo(() => {
    if (finbertLabel && finbertScore !== null) {
      // FinBERT data available — use it
      return {
        score: Math.abs(finbertScore),  // Treat as percentage 0-100
        label: finbertLabel,
        color: finbertLabel === "BULLISH" ? "#10B981"
             : finbertLabel === "BEARISH" ? "#EF4444"
             : "#06B6D4",
        colorAlt: finbertLabel === "BULLISH" ? "#34D399"
                : finbertLabel === "BEARISH" ? "#F87171"
                : "#22D3EE",
      };
    }
    // Fallback to generic aiAnalysis
    const score = (aiAnalysis?.score ?? 0.5) * 100;
    const label = (aiAnalysis?.label ?? "NEUTRAL").toUpperCase();
    return {
      score,
      label,
      color: label === "POSITIVE" || label === "BULLISH" ? "#10B981"
           : label === "NEGATIVE" || label === "BEARISH" ? "#EF4444"
           : "#06B6D4",
      colorAlt: label === "POSITIVE" || label === "BULLISH" ? "#34D399"
              : label === "NEGATIVE" || label === "BEARISH" ? "#F87171"
              : "#22D3EE",
    };
  }, [finbertScore, finbertLabel, aiAnalysis]);

  // Sci-Fi Color Spectrum (for non-AI elements: ribbon, header, etc.)
  const holoColor = isPositive ? "#00f0ff" : "#ff0055";
  const holoColorAlt = isPositive ? "#00ff88" : "#ff4400";

  // ── Data-driven 3D Ribbon from real OHLC history ──────────────────────
  // Uses actual OHLC data to compute points for CatmullRomCurve3 ribbon
  const { ribbonPoints } = useMemo(() => {
    const history = data?.history as Array<Record<string, any>> | null | undefined;
    const width = 3.6;

    if (history && history.length >= 5) {
      // Real OHLC data available — compute smooth ribbon
      const pts: THREE.Vector3[] = [];

      // Find price range across all history for Y mapping
      let histHigh = -Infinity;
      let histLow = Infinity;
      for (const h of history) {
        const hh = h.high ?? h.close ?? 0;
        const hl = h.low ?? h.close ?? 0;
        if (hh > histHigh) histHigh = hh;
        if (hl < histLow) histLow = hl;
      }
      const histRange = Math.max(histHigh - histLow, 0.01);

      for (let i = 0; i < history.length; i++) {
        const progress = i / (history.length - 1);
        const x = -1.8 + progress * width;
        const closePrice = history[i].close ?? 0;
        const y = -0.3 + ((closePrice - histLow) / histRange) * 1.2;
        // Z-depth: use intraday range (high-low) to create volumetric depth
        const dayRange = ((history[i].high ?? closePrice) - (history[i].low ?? closePrice));
        const z = (dayRange / histRange) * 0.4;

        pts.push(new THREE.Vector3(x, y, z));
      }
      
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
      const smoothPts = curve.getPoints(64);
      return { ribbonPoints: smoothPts.map((p) => [p.x, p.y, p.z] as [number, number, number]) };
    }

    // Fallback: synthesize from open/high/low/close
    const count = 16;
    const pts: THREE.Vector3[] = [];
    const range = Math.max(high - low, 0.01);

    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const x = -1.8 + progress * width;
      const wave = Math.sin(progress * Math.PI * 2.5) * 0.4 + Math.cos(progress * Math.PI * 4) * 0.2;
      const val = open + (price - open) * progress + wave * (high - low) * 0.3;
      const y = -0.3 + ((val - low) / range) * 1.2;
      const z = Math.sin(progress * Math.PI) * 0.25;

      pts.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
    const smoothPts = curve.getPoints(64);
    return { ribbonPoints: smoothPts.map((p) => [p.x, p.y, p.z] as [number, number, number]) };
  }, [data?.history, open, price, high, low]);

  // ── Dispose old Three.js geometries/materials on data change ──────────
  // Prevents memory leaks when auto-refresh updates the OHLC arrays
  const dataKey = `${symbol}_${price}_${data?.history?.length ?? 0}`;

  useEffect(() => {
    // Return a cleanup function to properly dispose materials and geometries on unmount or refresh
    return () => {
      if (mainGroupRef.current) {
        mainGroupRef.current.traverse((child: any) => {
          if (child.isMesh || child.isLine || child.isPoints) {
            if (child.geometry) {
              child.geometry.dispose();
            }
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m: any) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
    };
  }, [dataKey]);

  // Dynamic Pulsing Animation for the AI Core
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * 3) * 0.08;
      coreRef.current.scale.set(pulse, pulse, pulse);
      coreRef.current.rotation.y = t * 0.5;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.08} floatIntensity={0.2}>
      <group ref={mainGroupRef}>
        <HolographicParticles count={100} />

        {/* ── 4. Main Holographic Content Zone ── */}

        {/* VIEW A & B: 3D Volumetric Sparkline Ribbon */}
        {(activeTab === "OVERVIEW" || activeTab === "RIBBON") && (
          <group position={[activeTab === "OVERVIEW" ? -1.6 : 0, -0.2, 0.1]}>
            <Text position={[-1.7, 1.0, 0]} fontSize={0.16} color={holoColor} anchorX="left">
              ◈ INTRADAY_VOLUMETRIC_TRAJECTORY
            </Text>

            {/* Glowing 3D Line */}
            <Line points={ribbonPoints} color={holoColor} lineWidth={4} transparent opacity={1} />

            {/* Secondary Neon Depth Echo Line */}
            <Line
              points={ribbonPoints.map(([x, y, z]) => [x, y - 0.1, z - 0.15])}
              color={holoColorAlt}
              lineWidth={1.5}
              transparent
              opacity={0.4}
            />

            {/* 3D Vertical Data Pillars (Candlestick Extrusions) */}
            {[
              { label: "OPEN", val: open, x: -1.4 },
              { label: "HIGH", val: high, x: -0.5 },
              { label: "LOW", val: low, x: 0.5 },
              { label: "LIVE", val: price, x: 1.4 },
            ].map((col, i) => {
              const h = Math.max(((col.val - low) / (high - low || 1)) * 1.1, 0.15);
              return (
                <group key={i} position={[col.x, -0.6 + h / 2, 0]}>
                  <mesh>
                    <cylinderGeometry args={[0.04, 0.04, h, 16]} />
                    <meshBasicMaterial
                      color={holoColor}
                      wireframe
                      transparent
                      opacity={0.8}
                      blending={THREE.AdditiveBlending}
                    />
                  </mesh>
                  <Text position={[0, -h / 2 - 0.18, 0]} fontSize={0.12} color="#94a3b8">
                    {col.label}
                  </Text>
                  <Text position={[0, h / 2 + 0.14, 0]} fontSize={0.11} color="#ffffff">
                    {`$${col.val.toFixed(1)}`}
                  </Text>
                </group>
              );
            })}
          </group>
        )}

        {/* VIEW A & C: Jarvis Holographic AI Neural Core */}
        {/* Now driven by FinBERT stockInsights data */}
        {(activeTab === "OVERVIEW" || activeTab === "AI") && (
          <group position={[activeTab === "OVERVIEW" ? 1.8 : 0, -0.2, 0.2]}>
            <Text position={[0, 1.1, 0]} fontSize={0.16} color={sentimentDisplay.color} anchorX="center">
              ◈ FINBERT_NEURAL_SYNAPSE
            </Text>

            {/* Pulsing Energy Core — color driven by FinBERT sentiment */}
            <group ref={coreRef} position={[0, 0.2, 0]}>
              <mesh>
                <icosahedronGeometry args={[0.55, 1]} />
                <meshBasicMaterial
                  color={sentimentDisplay.color}
                  wireframe
                  transparent
                  opacity={0.65}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
              <mesh>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshBasicMaterial
                  color="#ffffff"
                  transparent
                  opacity={0.4}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            </group>

            {/* Orbital Gyroscopic HUD Rings — colored by FinBERT */}
            <group position={[0, 0.2, 0]}>
              <GyroRing radius={0.85} tube={0.015} speed={0.8} axis="z" color={sentimentDisplay.color} opacity={0.7} />
              <GyroRing radius={1.05} tube={0.01} speed={-0.6} axis="y" color={sentimentDisplay.colorAlt} opacity={0.5} />
              <GyroRing radius={1.2} tube={0.008} speed={0.4} axis="x" color="#ffffff" opacity={0.3} />
            </group>

            {/* Score & Sentiment Classification — exact format requested */}
            <Text position={[0, -0.85, 0]} fontSize={0.24} color="#ffffff" anchorX="center" anchorY="middle">
              {`${sentimentDisplay.score.toFixed(0)}% [${sentimentDisplay.label}]`}
            </Text>
          </group>
        )}

        {/* VIEW D: PREDICT — LSTM Trajectory + Volatility Corridor */}
        {activeTab === "PREDICT" && stockInsights && (
          <PredictionVisuals insights={stockInsights} />
        )}

        {/* VIEW E: OPTIONS — Volatility Surface & Derivatives Matrix */}
        {activeTab === "OPTIONS" && (
          <OptionsVisuals price={price} color={holoColor} onPinchStateChange={onPinchStateChange} />
        )}

      </group>
    </Float>

  );
}