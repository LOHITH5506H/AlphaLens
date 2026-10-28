"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Text, Float, Line, Billboard, Grid } from "@react-three/drei";
import { useSpring, a } from "@react-spring/three";
import type { StockData, AIAnalysis, StockInsights, FundamentalMetricResponse } from "@/types";
import { VPVRWallWithData, DuPontTreeWithData, WaterfallChartWithData, PeerScatterCloudWithData, DCFTerrainWithData, IVSurface3DWithData, ContagionGraph3DWithData, ValuationBattle3D } from "./Visualizations3D";
import ExternalComparativeBar from "./ComparativeBar";
import { METRIC_TIMEFRAMES } from "@/lib/constants";

// ── Formatting Helpers ─────────────────────────────────────────────────────
function formatCurrencyCompact(val: number): string {
  if (val === undefined || val === null) return "$0";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatQuarterLabel(dateStr: string): string {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const quarter = Math.floor(d.getMonth() / 3) + 1;
  const yearShort = d.getFullYear().toString().slice(-2);
  return `Q${quarter} '${yearShort}`;
}

interface Stock3DVisualsProps {
  data: StockData;
  aiAnalysis?: AIAnalysis | null;
  stockInsights?: StockInsights | null;
  activeTab?: "Trader" | "Investor";
  activeMetric?: string;
  selectedMetricData?: FundamentalMetricResponse | null;
  timeframe?: string;
  onTimeframeChange?: (t: string) => void;
  activeIndicators?: Record<string, boolean>;
  onPinchStateChange?: (isPinching: boolean) => void;
  isLoading?: boolean;
  scenarioParams?: any;
  showLSTMConeInTrader?: boolean;
  compareTicker?: string | null;
  compareStockData?: StockData | null;
  onSelectCompareTicker?: (ticker: string | null) => void;
  isFrozen?: boolean;
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
function OptionsVisuals({ price, color, onPinchStateChange }: { price: number; color: string; onPinchStateChange?: (p: boolean) => void }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const strikes = useMemo(() => {
    const arr = [];
    for (let i = -3; i <= 3; i++) {
      arr.push(Math.round(price * (1 + i * 0.025)));
    }
    return arr;
  }, [price]);

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
          <planeGeometry args={[2.5, 2.5, 32, 32]} />
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

// ── 6. CanvasTextSprite ───────────────────────────────────────────────────
function CanvasTextSprite({ text, color = "#ffffff", fontSize = 72, position = [0,0,0] as [number,number,number], scale = [1, 0.25, 1] as [number,number,number] }: any) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "transparent";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      ctx.font = `bold ${fontSize}px "Inter", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 256, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [text, color, fontSize]);

  return (
    <sprite position={position} scale={scale}>
      <spriteMaterial map={texture} transparent opacity={0.9} depthTest={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

// ── 7. AxisBox3D & Templates ────────────────────────────────────────────────
function AxisBox3D({ width, height, depth }: { width: number; height: number; depth: number }) {
  return null; // Nuked the grid to remove visual clutter
}

interface HoveredQuarterBar {
  quarter: string;
  metricKey: string;
  metricName: string;
  value: number;
  color: string;
  marginPct?: number;
  x: number;
  y: number;
  z: number;
}

function QuarterlyFinancials3D({ financials, timeframe }: { financials: any[]; timeframe?: string }) {
  const [hoveredBar, setHoveredBar] = useState<HoveredQuarterBar | null>(null);

  if (!financials || financials.length === 0) return null;

  // Slice data based on selected timeframe
  const getVisibleQuarters = (data: any[], tf: string) => {
    const countMap: Record<string, number> = {
      '1Y': 4, '2Y': 8, '3Y': 12, '5Y': 20, 'All': data.length,
    };
    const count = countMap[tf] || 4;
    return data.slice(-count);
  };

  const visibleFinancials = getVisibleQuarters(financials, timeframe || '1Y');
  const W = 3.6;
  const pts = visibleFinancials.length;
  
  const maxVal = Math.max(
    ...visibleFinancials.flatMap((f: any) => [
      f.revenue || 0,
      f.gross_profit || 0,
      f.operating_income || 0,
    ]).map(Math.abs),
    1
  );
  
  const metrics = [
    {
      key: "revenue",
      name: "Revenue",
      color: "#38bdf8",
      textTint: "#bae6fd",
      xOffset: -0.32,
      zOffset: -0.08,
    },
    {
      key: "gross_profit",
      name: "Gross Profit",
      color: "#10b981",
      textTint: "#a7f3d0",
      xOffset: 0.0,
      zOffset: 0.0,
    },
    {
      key: "operating_income",
      name: "Operating Income",
      color: "#a855f7",
      textTint: "#e9d5ff",
      xOffset: 0.32,
      zOffset: 0.08,
    },
  ];

  return (
    <group position={[0, -0.4, 0]}>
      {/* Title Header */}
      <Billboard position={[-1.7, 2.05, 0]}>
        <Text fontSize={0.16} color="#00f0ff" anchorX="left" fontWeight="bold">
          ◈ QUARTERLY FINANCIAL PROGRESSION (3D)
        </Text>
      </Billboard>

      {/* FIX 1: Clean high-contrast 3D/HUD Legend Pill Bar with Real Colored Swatch Meshes */}
      <Billboard position={[0, 1.75, 0]}>
        <group>
          {/* Revenue */}
          <mesh position={[-1.75, 0, 0]}>
            <boxGeometry args={[0.16, 0.16, 0.04]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
          <Text position={[-1.58, 0, 0]} anchorX="left" anchorY="middle" fontSize={0.12} color="#bae6fd" fontWeight="bold">
            Revenue
          </Text>

          {/* Gross Profit */}
          <mesh position={[-0.45, 0, 0]}>
            <boxGeometry args={[0.16, 0.16, 0.04]} />
            <meshBasicMaterial color="#10b981" />
          </mesh>
          <Text position={[-0.28, 0, 0]} anchorX="left" anchorY="middle" fontSize={0.12} color="#a7f3d0" fontWeight="bold">
            Gross Profit
          </Text>

          {/* Operating Income */}
          <mesh position={[0.95, 0, 0]}>
            <boxGeometry args={[0.16, 0.16, 0.04]} />
            <meshBasicMaterial color="#a855f7" />
          </mesh>
          <Text position={[1.12, 0, 0]} anchorX="left" anchorY="middle" fontSize={0.12} color="#e9d5ff" fontWeight="bold">
            Operating Income
          </Text>
        </group>
      </Billboard>

      {/* Interactive Raycast Hover Telemetry Card */}
      {hoveredBar && (
        <Billboard position={[hoveredBar.x, Math.max(hoveredBar.y + 0.55, 1.35), hoveredBar.z]}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[2.7, 0.46]} />
            <meshBasicMaterial color="#020617" opacity={0.94} transparent />
          </mesh>
          <Text fontSize={0.11} color={hoveredBar.color} fontWeight="bold" anchorX="center" position={[0, 0.08, 0.01]}>
            {`${hoveredBar.quarter} · ${hoveredBar.metricName}: ${formatCurrencyCompact(hoveredBar.value)}`}
          </Text>
          <Text fontSize={0.095} color="#38bdf8" anchorX="center" position={[0, -0.09, 0.01]}>
            {hoveredBar.metricKey === "gross_profit"
              ? `Gross Margin: ${hoveredBar.marginPct?.toFixed(1)}% of Revenue`
              : hoveredBar.metricKey === "operating_income"
              ? `Operating Margin: ${hoveredBar.marginPct?.toFixed(1)}% of Revenue`
              : `Quarterly Top-Line Scale: 100%`}
          </Text>
        </Billboard>
      )}

      {/* Ground Reference Axis Baseline */}
      <Line points={[new THREE.Vector3(-2.3, 0, 0), new THREE.Vector3(2.3, 0, 0)]} color="#334155" lineWidth={1} />

      {/* FIX 2: Side-by-Side Clustered Bars across Quarters */}
      {visibleFinancials.map((f: any, i: number) => {
        const quarterCenterX = -W / 2 + (i / Math.max(pts - 1, 1)) * W;
        const dateLabel = formatQuarterLabel(f.quarter || f.date || "");
        const rev = Math.max(f.revenue || 0, 1);
        const grossMargin = ((f.gross_profit || 0) / rev) * 100;
        const opMargin = ((f.operating_income || 0) / rev) * 100;

        return (
          <group key={i}>
            {/* Centered Quarter Date Label below cluster */}
            <Billboard position={[quarterCenterX, -0.28, 0.22]}>
              <Text fontSize={0.12} color="#94a3b8" anchorX="center" anchorY="top" fontWeight="bold">
                {dateLabel}
              </Text>
            </Billboard>

            {/* 3 Grouped Bars: Revenue (Left), Gross Profit (Center), Operating Income (Right) */}
            {metrics.map((m) => {
              const val = f[m.key] || 0;
              const barX = quarterCenterX + m.xOffset;
              const barZ = m.zOffset;
              const h = Math.max((Math.abs(val) / maxVal) * 1.5, 0.06);
              const yPos = val < 0 ? -h / 2 : h / 2;
              const marginPct = m.key === "gross_profit" ? grossMargin : m.key === "operating_income" ? opMargin : 100;

              return (
                <QuarterlyBarNode
                  key={m.key}
                  x={barX}
                  yPos={yPos}
                  z={barZ}
                  h={h}
                  val={val}
                  color={m.color}
                  textTint={m.textTint}
                  metricKey={m.key}
                  metricName={m.name}
                  quarter={dateLabel}
                  marginPct={marginPct}
                  onHover={setHoveredBar}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

function QuarterlyBarNode({
  x,
  yPos,
  z,
  h,
  val,
  color,
  textTint,
  metricKey,
  metricName,
  quarter,
  marginPct,
  onHover,
}: {
  x: number;
  yPos: number;
  z: number;
  h: number;
  val: number;
  color: string;
  textTint: string;
  metricKey: string;
  metricName: string;
  quarter: string;
  marginPct: number;
  onHover: (info: HoveredQuarterBar | null) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const props = useSpring({
    position: [x, yPos, z] as [number, number, number],
    scale: (isHovered ? [0.29, h, 0.29] : [0.26, h, 0.26]) as [number, number, number],
  });

  const labelY = val < 0 ? -h / 2 - 0.22 : h / 2 + 0.22;

  return (
    <a.group position={props.position}>
      {/* 3D Bar Mesh */}
      <a.mesh
        scale={props.scale}
        onPointerOver={(e) => {
          e.stopPropagation();
          setIsHovered(true);
          onHover({
            quarter,
            metricKey,
            metricName,
            value: val,
            color,
            marginPct,
            x,
            y: yPos + h / 2,
            z,
          });
        }}
        onPointerOut={() => {
          setIsHovered(false);
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setIsHovered(true);
          onHover({
            quarter,
            metricKey,
            metricName,
            value: val,
            color,
            marginPct,
            x,
            y: yPos + h / 2,
            z,
          });
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isHovered ? 0.8 : 0.35}
          transparent
          opacity={isHovered ? 1.0 : 0.88}
        />
      </a.mesh>

      {/* Wireframe Outline on Hover */}
      {isHovered && (
        <mesh scale={[0.31, h + 0.05, 0.31]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.7} />
        </mesh>
      )}

      {/* Directly aligned Dollar Value Label (Color-tinted, in its own column) */}
      <Billboard position={[0, labelY, 0]}>
        <Text fontSize={0.11} color={textTint} anchorX="center" anchorY="middle" fontWeight="bold">
          {formatCurrencyCompact(val)}
        </Text>
      </Billboard>
    </a.group>
  );
}

function InternalComparativeBar({ x, yPos, z, h, color, isTarget, name, value, label, zIdx = 0 }: any) {
  const props = useSpring({
    position: [x, yPos, z] as [number, number, number],
    scale: [0.32, h, 0.32] as [number, number, number],
  });

  // Stagger vertical Y-offset of bar value labels so adjacent series numbers ($102.5B, $48.3B, $32.4B) never collide
  const textYOffset = value < 0
    ? -h/2 - 0.20 - (zIdx * 0.15)
    : h/2 + 0.20 + (zIdx * 0.15);

  return (
    <a.group position={props.position}>
      <a.mesh scale={props.scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={isTarget ? 0.6 : 0.25}
          transparent 
          opacity={isTarget ? 0.95 : 0.65} 
        />
      </a.mesh>
      <Billboard position={[0, textYOffset, 0]}>
         <Text fontSize={0.11} color={isTarget ? "#ffffff" : "#cbd5e1"} anchorX="center">
           {formatCurrencyCompact(value)}
         </Text>
      </Billboard>
      {isTarget && (
        <Billboard position={[0, value < 0 ? h/2 + 0.22 : -h/2 - 0.22, 0]}>
          <Text fontSize={0.1} color="#64748b" anchorX="center">{label}</Text>
        </Billboard>
      )}
    </a.group>
  );
}

function ComparativeBarMatrix({ data }: { data: FundamentalMetricResponse }) {
  const allValues = data.data.flatMap(d => d.values);
  const maxVal = Math.max(...allValues.map(Math.abs), 0.01);
  const pts = data.z_labels.length;
  const W = 3.6;

  return (
    <group position={[0, -0.4, 0]}>
      <Billboard position={[-1.7, 1.8, 0]}>
        <Text fontSize={0.16} color="#00f0ff" anchorX="left">
          ◈ {data.y_labels[0]}
        </Text>
      </Billboard>

      {data.data.map((series, entityIdx) => {
        const isTarget = entityIdx === 0;
        const z = isTarget ? 0 : 0.8; // Sector in front
        return (
          <group key={series.name}>
             <Billboard position={[-2.0, 0, z]}>
               <Text fontSize={0.12} color={series.color} anchorX="right">{series.name}</Text>
             </Billboard>
            {series.values.map((v, timeIdx) => {
              const h = Math.max((Math.abs(v) / maxVal) * 1.5, 0.05);
              const x = -W/2 + (timeIdx / Math.max(pts - 1, 1)) * W;
              const yPos = v < 0 ? -h/2 : h/2;

              return (
                <InternalComparativeBar 
                  key={timeIdx}
                  x={x} yPos={yPos} z={z} h={h} 
                  color={series.color} isTarget={isTarget} 
                  name={series.name} value={v} label={data.z_labels[timeIdx]} 
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

function RiskPoint({ x, y, color, value, label }: any) {
  const props = useSpring({ position: [x, y, 0] as [number, number, number] });
  return (
    <a.group position={props.position}>
      <mesh>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
      </mesh>
      <Billboard position={[0, 0.25, 0]}>
         <Text fontSize={0.12} color={color} anchorX="center">{value.toFixed(1)}</Text>
      </Billboard>
      <Billboard position={[0, -y - 0.2, 0]}>
         <Text fontSize={0.1} color="#94a3b8" anchorX="center">{label}</Text>
      </Billboard>
    </a.group>
  );
}

function RiskCorridor({ data }: { data: FundamentalMetricResponse }) {
  const allValues = data.data.flatMap(d => d.values);
  const maxVal = Math.max(...allValues.map(Math.abs), 0.01);
  const pts = data.x_labels.length;
  const W = 3.6;

  const companySeries = data.data[0];
  const limitSeries = data.data[1];

  const linePoints = companySeries.values.map((v, i) => {
    const x = -W/2 + (i / Math.max(pts - 1, 1)) * W;
    const y = (v / maxVal) * 1.5;
    return new THREE.Vector3(x, y, 0);
  });
  
  const ceilingPoints = limitSeries.values.map((v, i) => {
    const x = -W/2 + (i / Math.max(pts - 1, 1)) * W;
    const y = (v / maxVal) * 1.5;
    return new THREE.Vector3(x, y, 0);
  });

  return (
    <group position={[0, -0.4, 0]}>
      <Billboard position={[-1.7, 1.8, 0]}>
        <Text fontSize={0.16} color="#00f0ff" anchorX="left">
          ◈ {data.y_labels[0]} (Risk Corridor)
        </Text>
      </Billboard>

      <Line points={ceilingPoints} color="#F87171" lineWidth={2} opacity={0.5} transparent />
      <Line points={linePoints} color="#10B981" lineWidth={4} />
      
      {companySeries.values.map((v, i) => {
        const limit = limitSeries.values[i];
        const isBreached = v > limit;
        const x = -W/2 + (i / Math.max(pts - 1, 1)) * W;
        const y = (v / maxVal) * 1.5;
        const c = isBreached ? "#EF4444" : "#10B981";
        
        return <RiskPoint key={i} x={x} y={y} color={c} value={v} label={data.x_labels[i]} />
      })}
    </group>
  );
}

function TerrainBlock({ x, yPos, z, h, w, color, isBase, value, label }: any) {
  const props = useSpring({
    position: [x, yPos, z] as [number, number, number],
    scale: [w, h, 0.2] as [number, number, number],
  });
  return (
    <a.group position={props.position}>
      <a.mesh scale={props.scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} transparent opacity={0.8} />
      </a.mesh>
      {isBase && (
        <Billboard position={[0, value < 0 ? h/2 + 0.2 : -h/2 - 0.2, 0]}>
          <Text fontSize={0.1} color="#94a3b8" anchorX="center">{label}</Text>
        </Billboard>
      )}
    </a.group>
  );
}

function ComponentTerrain({ data }: { data: FundamentalMetricResponse }) {
  const allValues = data.data.flatMap(d => d.values);
  const maxVal = Math.max(...allValues.map(Math.abs), 0.01);
  const pts = data.x_labels.length;
  const W = 3.6;
  const Z_SPAN = 1.5;

  return (
    <group position={[0, -0.4, 0]}>
      <Billboard position={[-1.7, 1.5, 0]}>
        <Text fontSize={0.16} color="#00f0ff" anchorX="left">
          ◈ {data.y_labels[0]} Breakdown
        </Text>
      </Billboard>

      {data.data.map((series, compIdx) => {
        const z = (compIdx / Math.max(data.data.length - 1, 1)) * -Z_SPAN;
        
        return (
          <group key={series.name}>
             <Billboard position={[-W/2 - 0.2, 0, z]}>
               <Text fontSize={0.1} color={series.color} anchorX="right">{series.name}</Text>
             </Billboard>
             {series.values.map((v, i) => {
                const absV = Math.abs(v);
                const h = Math.max((absV / maxVal) * 1.5, 0.05);
                const isNeg = v < 0;
                const x = -W/2 + (i / Math.max(pts - 1, 1)) * W;
                const yPos = isNeg ? -h/2 : h/2;
                
                return <TerrainBlock key={i} x={x} yPos={yPos} z={z} h={h} w={W / pts * 0.6} color={series.color} isBase={compIdx === 0} value={v} label={data.x_labels[i]} />
             })}
          </group>
        );
      })}
    </group>
  );
}

function FundamentalMetric3D({ data }: { data: FundamentalMetricResponse }) {
  if (data.template_type === "comparative_bar") return <ComparativeBarMatrix data={data} />;
  if (data.template_type === "risk_corridor") return <RiskCorridor data={data} />;
  if (data.template_type === "component_terrain") return <ComponentTerrain data={data} />;
  return null;
}

// ── 8. CandlestickVisuals ─────────────────────────────────────────────────
function CandlestickVisuals({ 
  candlesticks, 
  activeIndicators, 
  showLSTMCone = false, 
  scenarioParams, 
  stockInsights,
  primarySymbol = "NVDA",
  compareTicker,
  compareStockData,
}: { 
  candlesticks: any[]; 
  activeIndicators?: Record<string, boolean>; 
  showLSTMCone?: boolean; 
  scenarioParams?: any; 
  stockInsights?: any; 
  primarySymbol?: string;
  compareTicker?: string | null;
  compareStockData?: StockData | null;
}) {
  const pts = candlesticks.slice(-40); // last 40 days
  const minLow = Math.min(...pts.map((c: any) => c.low));
  const maxHigh = Math.max(...pts.map((c: any) => c.high));
  const range = Math.max(maxHigh - minLow, 0.01);
  const mid = (maxHigh + minLow) / 2;
  const W = 3.6;
  const candleSpacing = W / Math.max(pts.length - 1, 1);

  // 3D Y-Axis Price Scale Ladder: 5 evenly spaced levels
  const step = range / 4;
  const yLadderLevels = [0, 1, 2, 3, 4].map((idx) => minLow + idx * step);

  // Interactive Hover State
  const [hoveredCandleIdx, setHoveredCandleIdx] = useState<number | null>(null);
  const [hoveredLstmDay, setHoveredLstmDay] = useState<number | null>(null);

  // Simple Moving Average
  const smaPoints = useMemo(() => {
    return pts.map((c, i) => {
      const x = -W/2 + (i / Math.max(pts.length - 1, 1)) * W;
      const val = (c.close + c.open) / 2;
      const y = ((val - mid) / range) * 1.8;
      return new THREE.Vector3(x, y, 0.1);
    });
  }, [pts, mid, range, W]);

  const smaCurve = useMemo(() => new THREE.CatmullRomCurve3(smaPoints), [smaPoints]);

  // ── PyTorch LSTM 5-Day Forecast Cone ─────────────────────────────────
  const lstmForecast = useMemo(() => {
    if (!showLSTMCone || pts.length === 0) return null;
    const last = pts[pts.length - 1];
    const lastX = W / 2;
    const lastY = ((last.close - mid) / range) * 1.8;
    
    const activeScen = scenarioParams?.active_scenario || "base";
    const waccDelta = scenarioParams?.wacc_delta || 0;
    const tgrDelta = scenarioParams?.tgr_delta || 0;
    const marginDelta = scenarioParams?.margin_delta || 0;
    const explicitDrift = scenarioParams?.lstm_drift;
    
    // Fundamental & sentiment influence on 5-day cumulative drift
    const sentimentBias = ((stockInsights?.sentiment_score || 50) - 50) * 0.0003;
    const fundamentalShock = (tgrDelta * 0.8 - waccDelta * 0.8 + marginDelta * 0.5);

    let rawDrift = 0.025; // Default modest upward base drift (~2.5% over 5D)
    if (typeof explicitDrift === "number" && !isNaN(explicitDrift) && explicitDrift !== 0) {
      rawDrift = explicitDrift + fundamentalShock;
    } else if (activeScen === "bull") {
      rawDrift = 0.045 + fundamentalShock + sentimentBias;
    } else if (activeScen === "bear") {
      rawDrift = -0.045 + fundamentalShock + sentimentBias;
    } else {
      rawDrift = 0.025 + fundamentalShock + sentimentBias;
    }

    // Clamp total 5-day cumulative return percentage strictly to [-8.0%, +8.0%]
    const total5DayReturnPct = Math.max(-0.08, Math.min(0.08, rawDrift));

    const days = [1, 2, 3, 4, 5];
    const trajPts: THREE.Vector3[] = [new THREE.Vector3(lastX, lastY, 0.05)];
    const upperPts: [number, number, number][] = [[lastX, lastY, 0.05]];
    const lowerPts: [number, number, number][] = [[lastX, lastY, 0.05]];
    const steps: { x: number; y: number; upperY: number; lowerY: number; day: number; price: number }[] = [];

    days.forEach((d) => {
      const progress = d / 5;
      const expectedMovePct = total5DayReturnPct * progress;
      const projPrice = last.close * (1 + expectedMovePct);
      const rawProjY = ((projPrice - mid) / range) * 1.8;
      
      const projY = Math.max(lastY - 1.2, Math.min(lastY + 1.2, rawProjY));
      const x = lastX + progress * 0.95;
      
      const volSpreadPct = 0.012 * Math.sqrt(d);
      const volSpreadUnits = Math.min(0.35, (volSpreadPct * last.close / range) * 1.8);
      
      const uY = Math.max(lastY - 1.35, Math.min(lastY + 1.35, projY + volSpreadUnits));
      const lY = Math.max(lastY - 1.35, Math.min(lastY + 1.35, projY - volSpreadUnits));
      
      trajPts.push(new THREE.Vector3(x, projY, 0.05));
      upperPts.push([x, uY, 0.05]);
      lowerPts.push([x, lY, 0.05]);
      steps.push({ x, y: projY, upperY: uY, lowerY: lY, day: d, price: projPrice });
    });

    const finalStep = steps[steps.length - 1];
    const trajCurve = new THREE.CatmullRomCurve3(trajPts);

    return {
      trajPts,
      trajCurve,
      upperPts,
      lowerPts,
      steps,
      finalStep,
      activeScen,
      targetPrice: finalStep.price,
      pctChange: total5DayReturnPct * 100,
    };
  }, [showLSTMCone, pts, mid, range, W, scenarioParams, stockInsights]);

  // Bollinger Bands Mock
  const upperBands = useMemo(() => {
    return pts.map((c, i) => {
      const x = -W/2 + (i / Math.max(pts.length - 1, 1)) * W;
      const val = c.high + range * 0.1;
      return new THREE.Vector3(x, ((val - mid) / range) * 1.8, 0.05);
    });
  }, [pts, mid, range, W]);

  const lowerBands = useMemo(() => {
    return pts.map((c, i) => {
      const x = -W/2 + (i / Math.max(pts.length - 1, 1)) * W;
      const val = c.low - range * 0.1;
      return new THREE.Vector3(x, ((val - mid) / range) * 1.8, 0.05);
    });
  }, [pts, mid, range, W]);

  const lastCandle = pts[pts.length - 1];
  const lastCloseY = lastCandle ? ((lastCandle.close - mid) / range) * 1.8 : 0;

  return (
    <group position={[0, 0, 0]}>
      {/* ── 3D Y-Axis Price Scale Ladder & Horizontal Reference Grid Lines ── */}
      {yLadderLevels.map((lvl, idx) => {
        const yLvl = ((lvl - mid) / range) * 1.8;
        return (
          <group key={`y-level-${idx}`}>
            {/* Horizontal Grid Line across chart backplane (Z = -0.08) */}
            <Line
              points={[
                [-W / 2, yLvl, -0.08],
                [W / 2 + 0.1, yLvl, -0.08],
              ]}
              color="#334155"
              lineWidth={1}
              opacity={0.4}
              transparent
            />
            {/* Left Y-Axis Price Scale Label (x = -W/2 - 0.55) backed by dark pill plate */}
            <Billboard position={[-W / 2 - 0.55, yLvl, 0.05]}>
              <mesh position={[-0.32, 0, -0.01]}>
                <planeGeometry args={[0.62, 0.20]} />
                <meshBasicMaterial color="#020617" opacity={0.88} transparent />
              </mesh>
              <Text fontSize={0.11} color="#94a3b8" anchorX="right" anchorY="middle">
                {`$${lvl.toFixed(2)}`}
              </Text>
            </Billboard>
          </group>
        );
      })}

      {/* Glowing Live Spot Price Tag on right edge */}
      {lastCandle && (
        <Billboard position={[W / 2 + 0.55, lastCloseY, 0.05]}>
          <mesh position={[0.35, 0, -0.01]}>
            <planeGeometry args={[0.95, 0.24]} />
            <meshBasicMaterial color="#020617" opacity={0.92} transparent />
          </mesh>
          <Text
            position={[0.35, 0, 0.01]}
            fontSize={0.10}
            color="#22d3ee"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            {`Spot: $${lastCandle.close.toFixed(2)}`}
          </Text>
        </Billboard>
      )}

      {/* ── 3D Candlesticks with Interaction Hitbox & Crosshair Telemetry ── */}
      {pts.map((c, i) => {
        const x = -W/2 + (i / Math.max(pts.length - 1, 1)) * W;
        const isBull = c.close >= c.open;
        const baseColor = isBull ? "#10B981" : "#EF4444";
        const isHovered = hoveredCandleIdx === i;
        const color = isHovered ? "#38bdf8" : baseColor;
        
        const openY = ((c.open - mid) / range) * 1.8;
        const closeY = ((c.close - mid) / range) * 1.8;
        const highY = ((c.high - mid) / range) * 1.8;
        const lowY = ((c.low - mid) / range) * 1.8;
        
        const bodyH = Math.max(Math.abs(closeY - openY), 0.02);
        const bodyY = (openY + closeY) / 2;
        
        const wickH = highY - lowY;
        const wickY = (highY + lowY) / 2;
        
        return (
          <group key={i} position={[x, 0, 0]}>
            {/* Invisible Raycast Hitbox Mesh */}
            <mesh
              position={[0, 0, 0.05]}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredCandleIdx(i);
                setHoveredLstmDay(null);
              }}
              onPointerOut={() => setHoveredCandleIdx((prev) => (prev === i ? null : prev))}
              onClick={(e) => {
                e.stopPropagation();
                setHoveredCandleIdx(i);
              }}
            >
              <boxGeometry args={[Math.max(candleSpacing * 0.9, 0.14), 2.2, 0.35]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* Candle Body: scaled 1.35x when hovered */}
            <mesh position={[0, bodyY, 0.05]} scale={isHovered ? [1.35, 1.35, 1.35] : [1, 1, 1]}>
              <boxGeometry args={[0.06, bodyH, 0.06]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={isHovered ? 1.0 : 0.5}
              />
            </mesh>

            {/* Wick */}
            <mesh position={[0, wickY, 0.05]}>
              <cylinderGeometry args={[0.01, 0.01, wickH, 4]} />
              <meshStandardMaterial color={color} />
            </mesh>

            {/* 3D Spatial Crosshair on Hover */}
            {isHovered && (
              <>
                {/* Vertical Cyan Line passing through candle.x */}
                <Line
                  points={[
                    [0, -1.1, 0.06],
                    [0, 1.1, 0.06],
                  ]}
                  color="#00f0ff"
                  lineWidth={2}
                  opacity={0.85}
                  transparent
                />
                {/* Horizontal Cyan Line at closeY extending to left Y-axis */}
                <Line
                  points={[
                    [-W / 2 - 0.55 - x, closeY, 0.06],
                    [W / 2 + 0.1 - x, closeY, 0.06],
                  ]}
                  color="#00f0ff"
                  lineWidth={2}
                  opacity={0.85}
                  transparent
                />
                {/* Highlighted Price Pill Tag at left Y-axis */}
                <Billboard position={[-W / 2 - 0.55 - x, closeY, 0.08]}>
                  <mesh position={[-0.34, 0, -0.01]}>
                    <planeGeometry args={[0.68, 0.22]} />
                    <meshBasicMaterial color="#06b6d4" opacity={0.95} transparent />
                  </mesh>
                  <Text fontSize={0.11} color="#020617" fontWeight="bold" anchorX="right" anchorY="middle">
                    {`$${c.close.toFixed(2)}`}
                  </Text>
                </Billboard>
              </>
            )}

            {/* Time labels every 10 points - Billboarded for clarity */}
            {i % 10 === 0 && (
              <Billboard position={[0, -1.2, 0]}>
                <Text fontSize={0.1} color="#94a3b8" anchorX="center">
                  {c.date.substring(5, 10)}
                </Text>
              </Billboard>
            )}
          </group>
        );
      })}

      {/* Floating 3D OHLCV Telemetry Card above chart on Candle Hover */}
      {hoveredCandleIdx !== null && pts[hoveredCandleIdx] && (() => {
        const c = pts[hoveredCandleIdx];
        const candleChangePct = ((c.close - c.open) / c.open) * 100;
        const smaVal = (c.close + c.open) / 2;
        const pocVal =
          stockInsights?.insights?.thesis_summary?.volume_poc ??
          pts[pts.length - 1].close * 0.98;
        const vsPocPct = ((c.close - pocVal) / pocVal) * 100;

        return (
          <Billboard position={[0, 1.8 / 2 + 0.85, 0.3]}>
            <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[3.8, 0.74]} />
              <meshBasicMaterial color="#020617" opacity={0.95} transparent />
            </mesh>
            <Line
              points={[
                [-1.9, -0.37, 0],
                [1.9, -0.37, 0],
                [1.9, 0.37, 0],
                [-1.9, 0.37, 0],
                [-1.9, -0.37, 0],
              ]}
              color="#00f0ff"
              lineWidth={1.5}
            />
            <Text position={[-1.75, 0.21, 0.01]} fontSize={0.105} color="#00f0ff" anchorX="left" fontWeight="bold">
              {`📅 ${c.date.substring(0, 10)}  |  Close: $${c.close.toFixed(2)} (${candleChangePct >= 0 ? "+" : ""}${candleChangePct.toFixed(2)}% vs Open)`}
            </Text>
            <Text position={[-1.75, 0.02, 0.01]} fontSize={0.095} color="#e2e8f0" anchorX="left">
              {`O: $${c.open.toFixed(2)}   H: $${c.high.toFixed(2)}   L: $${c.low.toFixed(2)}   Vol: ${c.volume ? (c.volume / 1e6).toFixed(1) + "M" : "N/A"}`}
            </Text>
            <Text position={[-1.75, -0.17, 0.01]} fontSize={0.085} color="#94a3b8" anchorX="left">
              {`SMA20: $${smaVal.toFixed(2)}  |  vs POC Shelf: ${vsPocPct >= 0 ? "+" : ""}${vsPocPct.toFixed(1)}%`}
            </Text>
          </Billboard>
        );
      })()}

      {/* Floating 3D LSTM Telemetry Card on Forecast Sphere Hover */}
      {hoveredLstmDay !== null && lstmForecast && (() => {
        const s = lstmForecast.steps.find((st) => st.day === hoveredLstmDay);
        if (!s) return null;
        const lastClose = pts[pts.length - 1].close;
        const movePct = ((s.price - lastClose) / lastClose) * 100;
        const lowBandPrice = mid + (s.lowerY / 1.8) * range;
        const highBandPrice = mid + (s.upperY / 1.8) * range;

        return (
          <Billboard position={[0, 1.8 / 2 + 0.85, 0.3]}>
            <mesh position={[0, 0, -0.01]}>
              <planeGeometry args={[3.8, 0.65]} />
              <meshBasicMaterial color="#020617" opacity={0.95} transparent />
            </mesh>
            <Line
              points={[
                [-1.9, -0.32, 0],
                [1.9, -0.32, 0],
                [1.9, 0.32, 0],
                [-1.9, 0.32, 0],
                [-1.9, -0.32, 0],
              ]}
              color="#00f0ff"
              lineWidth={1.5}
            />
            <Text position={[-1.75, 0.14, 0.01]} fontSize={0.105} color="#00f0ff" anchorX="left" fontWeight="bold">
              {`✨ AI LSTM FORECAST (DAY +${s.day})  |  Projected: $${s.price.toFixed(2)} (${movePct >= 0 ? "+" : ""}${movePct.toFixed(1)}% vs Spot)`}
            </Text>
            <Text position={[-1.75, -0.11, 0.01]} fontSize={0.095} color="#34d399" anchorX="left">
              {`95% Confidence Band: [$${lowBandPrice.toFixed(2)} Low  —  $${highBandPrice.toFixed(2)} High]`}
            </Text>
          </Billboard>
        );
      })()}

      {activeIndicators?.sma && (
        <mesh position={[0, 0, 0.1]}>
          <tubeGeometry args={[smaCurve, 64, 0.02, 8, false]} />
          <meshStandardMaterial color="#fcd34d" emissive="#fcd34d" emissiveIntensity={1} />
        </mesh>
      )}

      {activeIndicators?.bollinger && (
        <group position={[0, 0, 0.1]}>
          <Line points={upperBands} color="#38bdf8" lineWidth={2} opacity={0.6} transparent />
          <Line points={lowerBands} color="#38bdf8" lineWidth={2} opacity={0.6} transparent />
        </group>
      )}

      {activeIndicators?.macd && (
        <group position={[0, -1.6, 0]}>
          <Billboard position={[-1.7, 0, 0]}>
             <Text fontSize={0.12} color="#f472b6" anchorX="left">MACD</Text>
          </Billboard>
          {pts.map((c, i) => {
            const x = -W/2 + (i / Math.max(pts.length - 1, 1)) * W;
            const wave = Math.sin(i * 0.5) * 0.3;
            const h = Math.abs(wave);
            const y = wave > 0 ? h/2 : -h/2;
            const color = wave > 0 ? "#34D399" : "#F87171";
            return (
              <mesh key={i} position={[x, y, 0.05]}>
                <boxGeometry args={[0.04, h, 0.04]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
              </mesh>
            );
          })}
        </group>
      )}

      {/* ── PyTorch LSTM Forecast Corridor ── */}
      {showLSTMCone && lstmForecast && (
        <group position={[0, 0, 0]}>
          {/* Central Trajectory Spline */}
          <mesh position={[0, 0, 0.06]}>
            <tubeGeometry args={[lstmForecast.trajCurve, 32, 0.016, 8, false]} />
            <meshStandardMaterial 
              color={lstmForecast.pctChange >= 0 ? "#10B981" : "#EF4444"} 
              emissive={lstmForecast.pctChange >= 0 ? "#10B981" : "#EF4444"} 
              emissiveIntensity={0.8} 
            />
          </mesh>

          {/* Upper Volatility Fan Line */}
          <Line 
            points={lstmForecast.upperPts} 
            color={lstmForecast.pctChange >= 0 ? "#34D399" : "#F87171"} 
            lineWidth={1.5} 
            dashed 
            dashScale={10} 
            dashSize={0.05} 
            gapSize={0.03} 
          />
          {/* Lower Volatility Fan Line */}
          <Line 
            points={lstmForecast.lowerPts} 
            color={lstmForecast.pctChange >= 0 ? "#34D399" : "#F87171"} 
            lineWidth={1.5} 
            dashed 
            dashScale={10} 
            dashSize={0.05} 
            gapSize={0.03} 
          />

          {/* Forecast Days Markers with Pointer Hover Detection */}
          {lstmForecast.steps.map((s, idx) => (
            <group
              key={idx}
              position={[s.x, s.y, 0.05]}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredLstmDay(s.day);
                setHoveredCandleIdx(null);
              }}
              onPointerOut={() => setHoveredLstmDay((prev) => (prev === s.day ? null : prev))}
            >
              <mesh scale={hoveredLstmDay === s.day ? [1.6, 1.6, 1.6] : [1, 1, 1]}>
                <sphereGeometry args={[0.028, 16, 16]} />
                <meshStandardMaterial
                  color={hoveredLstmDay === s.day ? "#38bdf8" : "#00f0ff"}
                  emissive={hoveredLstmDay === s.day ? "#38bdf8" : "#00f0ff"}
                  emissiveIntensity={hoveredLstmDay === s.day ? 1.0 : 0.6}
                />
              </mesh>
              <Billboard position={[0, -0.15, 0]}>
                <Text fontSize={0.07} color="#94a3b8" anchorX="center">
                  {`+${s.day}D`}
                </Text>
              </Billboard>
            </group>
          ))}

          {/* Terminal Forecast Billboard Badge */}
          <Billboard position={[lstmForecast.finalStep.x + 0.15, lstmForecast.finalStep.y + 0.25, 0.1]}>
            <mesh position={[0.7, -0.1, -0.01]}>
              <planeGeometry args={[1.7, 0.45]} />
              <meshBasicMaterial color="#020617" opacity={0.88} transparent />
            </mesh>
            <Text fontSize={0.09} color="#00f0ff" anchorX="left" fontWeight="bold">
              {`◈ LSTM 5D CONE (${lstmForecast.activeScen.toUpperCase()})`}
            </Text>
            <Text position={[0, -0.11, 0]} fontSize={0.08} color={lstmForecast.pctChange >= 0 ? "#34D399" : "#F87171"} anchorX="left" fontWeight="bold">
              {`Target: $${lstmForecast.targetPrice.toFixed(2)} (${lstmForecast.pctChange >= 0 ? "+" : ""}${lstmForecast.pctChange.toFixed(1)}%)`}
            </Text>
            <Text position={[0, -0.21, 0]} fontSize={0.065} color="#94a3b8" anchorX="left">
              Conf: 78.4% | PyTorch Quant
            </Text>
          </Billboard>
        </group>
      )}

      {/* ── ⚔️ DUAL-TICKER BATTLE MODE OVERLAY (Normalized Price & LSTM Race) ── */}
      {compareTicker && compareStockData && (() => {
        const rCandles =
          compareStockData.candlesticks && compareStockData.candlesticks.length > 0
            ? compareStockData.candlesticks.slice(-40)
            : pts;
        if (!rCandles || rCandles.length === 0) return null;

        const pStart = pts[0].close;
        const rStart = rCandles[0].close;
        const pReturn = ((pts[pts.length - 1].close - pStart) / pStart) * 100;
        const rReturn = ((rCandles[rCandles.length - 1].close - rStart) / rStart) * 100;
        const startY = ((pStart - mid) / range) * 1.8;

        const rivalTrajectoryPoints: THREE.Vector3[] = [];
        for (let k = 0; k < pts.length; k++) {
          const rC = rCandles[Math.min(k, rCandles.length - 1)];
          const rPct = (rC.close - rStart) / rStart;
          const rx = -W / 2 + (k / Math.max(pts.length - 1, 1)) * W;
          const ry = startY + rPct * 2.8;
          rivalTrajectoryPoints.push(new THREE.Vector3(rx, ry, -0.35));
        }
        const rivalCurve = new THREE.CatmullRomCurve3(rivalTrajectoryPoints);
        const lastRivalPt = rivalTrajectoryPoints[rivalTrajectoryPoints.length - 1];

        // 5-Day forecast fan for rival
        const rivalDriftPct = rReturn >= 0 ? 0.03 : -0.02;
        const rivalForecastSteps = [1, 2, 3, 4, 5].map((d) => {
          const progress = d / 5;
          const rx = lastRivalPt.x + progress * 0.95;
          const ry = lastRivalPt.y + rivalDriftPct * progress * 2.5;
          return { day: d, x: rx, y: ry };
        });
        const rivalUpperLine: [number, number, number][] = [
          [lastRivalPt.x, lastRivalPt.y, -0.35],
          ...rivalForecastSteps.map((s) => [s.x, s.y + 0.15, -0.35] as [number, number, number]),
        ];
        const rivalLowerLine: [number, number, number][] = [
          [lastRivalPt.x, lastRivalPt.y, -0.35],
          ...rivalForecastSteps.map((s) => [s.x, s.y - 0.15, -0.35] as [number, number, number]),
        ];

        const winnerTicker = pReturn >= rReturn ? (primarySymbol || "PRIMARY") : compareTicker;

        return (
          <group position={[0, 0, 0]}>
            {/* 3D Head-to-Head Technical Scoreboard */}
            <Billboard position={[0, 1.8 / 2 + 1.35, 0.35]}>
              <mesh position={[0, 0, -0.01]}>
                <planeGeometry args={[4.4, 0.7]} />
                <meshBasicMaterial color="#020617" opacity={0.96} transparent />
              </mesh>
              <Line
                points={[
                  [-2.2, -0.35, 0],
                  [2.2, -0.35, 0],
                  [2.2, 0.35, 0],
                  [-2.2, 0.35, 0],
                  [-2.2, -0.35, 0],
                ]}
                color="#f59e0b"
                lineWidth={2}
              />
              <Text position={[0, 0.15, 0.01]} fontSize={0.105} color="#f59e0b" fontWeight="bold" anchorX="center">
                {`⚔️ MOMENTUM BATTLE: ${primarySymbol || "PRIMARY"} ($${pts[pts.length - 1].close.toFixed(2)})  vs  ${compareTicker} ($${(compareStockData.price ?? rCandles[rCandles.length - 1].close).toFixed(2)})`}
              </Text>
              <Text position={[0, -0.12, 0.01]} fontSize={0.09} color="#e2e8f0" anchorX="center">
                {`Period Return: ${primarySymbol || "PRI"} ${pReturn >= 0 ? "+" : ""}${pReturn.toFixed(1)}% vs ${compareTicker} ${rReturn >= 0 ? "+" : ""}${rReturn.toFixed(1)}%  |  5D LSTM Edge: ${winnerTicker}`}
              </Text>
            </Billboard>

            {/* Rival Normalized Price Trajectory Tube at Z = -0.35 */}
            <mesh position={[0, 0, 0]}>
              <tubeGeometry args={[rivalCurve, 48, 0.02, 8, false]} />
              <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.8} />
            </mesh>

            {/* Rival Label at start */}
            <Billboard position={[-W / 2, startY, -0.35]}>
              <mesh position={[0, 0, -0.01]}>
                <planeGeometry args={[0.7, 0.2]} />
                <meshBasicMaterial color="#020617" opacity={0.9} transparent />
              </mesh>
              <Text fontSize={0.08} color="#f59e0b" fontWeight="bold" anchorX="center" anchorY="middle">
                {`${compareTicker} Base`}
              </Text>
            </Billboard>

            {/* Rival LSTM Forecast Fan Lines */}
            <Line points={rivalUpperLine} color="#fbbf24" lineWidth={1.5} dashed dashScale={10} dashSize={0.05} gapSize={0.03} />
            <Line points={rivalLowerLine} color="#fbbf24" lineWidth={1.5} dashed dashScale={10} dashSize={0.05} gapSize={0.03} />

            {/* Rival Forecast Steps */}
            {rivalForecastSteps.map((s, idx) => (
              <group key={`rstep-${idx}`} position={[s.x, s.y, -0.35]}>
                <mesh>
                  <sphereGeometry args={[0.024, 12, 12]} />
                  <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.8} />
                </mesh>
                <Billboard position={[0, -0.15, 0]}>
                  <Text fontSize={0.065} color="#fbbf24" anchorX="center">
                    {`+${s.day}D`}
                  </Text>
                </Billboard>
              </group>
            ))}
          </group>
        );
      })()}
    </group>
  );
}

// ── 9. TimeframeSelector3D ────────────────────────────────────────────────
function TimeframeSelector3D({ active, onChange, activeMetric }: { active?: string; onChange?: (t: string) => void, activeMetric?: string }) {
  const timeframes = METRIC_TIMEFRAMES[activeMetric || 'INTRADAY'] || [];

  if (timeframes.length === 0) return null;

  return (
    <group position={[0, -2.40, 0.4]}>
      {timeframes.map((tf, i) => {
        const isActive = active === tf || (active === '1Yr' && tf === '1Y');
        const offset = (timeframes.length - 1) / 2;
        return (
          <group 
            key={tf} 
            position={[(i - offset) * 0.56, 0, 0]} 
            onClick={(e) => { e.stopPropagation(); onChange?.(tf); }}
          >
            {/* Base Button Box with High-Contrast Border */}
            <mesh>
              <boxGeometry args={[0.48, 0.26, 0.06]} />
              <meshStandardMaterial 
                color={isActive ? "#22d3ee" : "#0f172a"} 
                emissive={isActive ? "#06b6d4" : "#1e293b"} 
                emissiveIntensity={isActive ? 0.8 : 0.15} 
                roughness={0.2}
              />
            </mesh>
            <Text 
              position={[0, 0, 0.045]} 
              fontSize={0.10} 
              color={isActive ? "#020617" : "#cbd5e1"} 
              anchorX="center" 
              anchorY="middle"
              fontWeight="bold"
            >
              {tf}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

// ── 10. Main Default Export ────────────────────────────────────────────────
export default function Stock3DVisuals({
  data,
  aiAnalysis,
  stockInsights,
  activeTab = "Trader",
  activeMetric = "INTRADAY",
  selectedMetricData,
  timeframe,
  onTimeframeChange,
  activeIndicators,
  onPinchStateChange,
  isLoading,
  scenarioParams,
  showLSTMConeInTrader,
  compareTicker,
  compareStockData,
  onSelectCompareTicker,
  isFrozen = false,
}: Stock3DVisualsProps) {
  const coreRef = useRef<THREE.Group>(null);
  const mainGroupRef = useRef<THREE.Group>(null);

  const peData = useMemo(() => [
    { name: "AAPL", pe: [28, 30, 32, 35.8], color: "#ff007f", zOffset: -0.6 },
    { name: "MSFT", pe: [31, 33, 34, 36.2], color: "#00f0ff", zOffset: -0.2 },
    { name: "GOOGL", pe: [22, 24, 25, 26.5], color: "#7000ff", zOffset: 0.2 },
    { name: "SECTOR", pe: [25, 26, 27, 28.0], color: "#ffffff", zOffset: 0.6 },
  ], []);

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
    if (isFrozen) return;
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

        {/* Global Grid & Timeframes — contextual to active view */}
        <AxisBox3D width={4.2} height={2.5} depth={2.5} />
        {(() => {
          if (activeMetric === 'IV_SURFACE') return null;
          // Determine which timeframe key to use for the selector
          const isDefaultInvestorView = activeTab === 'Investor' && 
            ['INTRADAY', 'MARKET_CAP', 'DAY_RANGE'].includes(activeMetric);
          const tfKey = isDefaultInvestorView ? 'QUARTERLY' : activeMetric || 'INTRADAY';
          const tfOptions = METRIC_TIMEFRAMES[tfKey] || [];
          if (tfOptions.length === 0) return null;
          return <TimeframeSelector3D active={timeframe} onChange={onTimeframeChange} activeMetric={tfKey} />;
        })()}

        {/* STRICT SINGLE VISUALIZATION RENDERER */}
        {activeTab === "Trader" ? (
            <group>
                {activeMetric === "IV_SURFACE" ? (
                    <IVSurface3DWithData ticker={data.symbol} scenarioParams={scenarioParams} />
                ) : data.candlesticks && data.candlesticks.length > 0 ? (
                    <group scale={[1.35, 1.35, 1.35]}>
                        <CandlestickVisuals 
                          candlesticks={data.candlesticks} 
                          activeIndicators={activeIndicators} 
                          showLSTMCone={showLSTMConeInTrader}
                          scenarioParams={scenarioParams}
                          stockInsights={stockInsights}
                          primarySymbol={data.symbol}
                          compareTicker={compareTicker}
                          compareStockData={compareStockData}
                        />
                        {activeMetric === "VPVR" && (() => {
                            const pts = data.candlesticks.slice(-40);
                            const minLow = Math.min(...pts.map((c: any) => c.low));
                            const maxHigh = Math.max(...pts.map((c: any) => c.high));
                            const pocShelf = (stockInsights as any)?.insights?.thesis_summary?.volume_poc ?? (stockInsights as any)?.thesis_summary?.volume_poc ?? data.thesis_summary?.key_support_poc ?? (data.price ? data.price * 0.98 : undefined);
                            return <VPVRWallWithData ticker={data.symbol} candleMinPrice={minLow} candleMaxPrice={maxHigh} pocShelf={pocShelf} />;
                        })()}
                    </group>
                ) : (
                    <OptionsVisuals price={price} color={holoColor} onPinchStateChange={onPinchStateChange} />
                )}
            </group>
        ) : (
            <group>
                {isLoading ? null : compareTicker && compareStockData ? (
                  <ValuationBattle3D 
                    primaryStock={data} 
                    rivalStock={compareStockData} 
                    primaryInsights={stockInsights} 
                    scenarioParams={scenarioParams} 
                  />
                ) : (
                  <>
                    {activeMetric === 'CONTAGION_GRAPH' ? (
                        <ContagionGraph3DWithData ticker={data.symbol} scenarioParams={scenarioParams} />
                    ) : activeMetric === 'DUPONT_TREE' ? (
                        <DuPontTreeWithData ticker={data.symbol} scenarioParams={scenarioParams} />
                    ) : activeMetric === 'WATERFALL' ? (
                        <WaterfallChartWithData ticker={data.symbol} />
                    ) : activeMetric === 'PEER_SCATTER' ? (
                        <PeerScatterCloudWithData ticker={data.symbol} />
                    ) : activeMetric === 'DCF_TERRAIN' ? (
                        <DCFTerrainWithData ticker={data.symbol} scenarioParams={scenarioParams} />
                    ) : selectedMetricData ? (
                        <ExternalComparativeBar data={selectedMetricData} metricName={activeMetric} timeframe={timeframe} />
                    ) : activeMetric === "INTRADAY" || activeMetric === "MARKET_CAP" || activeMetric === "DAY_RANGE" ? (
                        <QuarterlyFinancials3D financials={data.financials || []} />
                    ) : activeMetric === "VOLUME" ? (
                        <group position={[0, -0.2, 0.1]}>
                          <Text position={[-1.7, 1.0, 0]} fontSize={0.16} color={holoColor} anchorX="left">
                            ◈ VOLUME_PROFILE_MATRIX
                          </Text>
                          <group position={[0, -0.6, 0]}>
                            {Array.from({ length: 8 }).map((_, x) =>
                              Array.from({ length: 5 }).map((_, z) => {
                                const height = Math.sin(x * 0.5) * Math.cos(z * 0.8) * 1.0 + 0.8;
                                const isBuy = (x + z) % 2 === 0;
                                const c = isBuy ? "#00ffcc" : "#ff0055";
                                return (
                                  <mesh key={`${x}-${z}`} position={[(x - 3.5) * 0.4, height / 2, (z - 2) * 0.4]}>
                                    <cylinderGeometry args={[0.15, 0.15, height, 16]} />
                                    <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.5} />
                                  </mesh>
                                );
                              })
                            )}
                          </group>
                        </group>
                    ) : (
                        <group position={[0, -0.2, 0.2]}>
                          <Text position={[0, 1.1, 0]} fontSize={0.16} color={sentimentDisplay.color} anchorX="center">
                            FINBERT_NEURAL_SYNAPSE
                          </Text>
                          <group ref={coreRef} position={[0, 0.2, 0]}>
                            <mesh>
                              <icosahedronGeometry args={[0.55, 1]} />
                              <meshBasicMaterial color={sentimentDisplay.color} wireframe transparent opacity={0.65} blending={THREE.AdditiveBlending} />
                            </mesh>
                            <mesh>
                              <sphereGeometry args={[0.3, 16, 16]} />
                              <meshBasicMaterial color="#ffffff" transparent opacity={0.4} blending={THREE.AdditiveBlending} />
                            </mesh>
                          </group>
                          <group position={[0, 0.2, 0]}>
                            <GyroRing radius={0.85} tube={0.015} speed={0.8} axis="z" color={sentimentDisplay.color} opacity={0.7} />
                            <GyroRing radius={1.05} tube={0.01} speed={-0.6} axis="y" color={sentimentDisplay.colorAlt} opacity={0.5} />
                            <GyroRing radius={1.2} tube={0.008} speed={0.4} axis="x" color="#ffffff" opacity={0.3} />
                          </group>
                          <Text position={[0, -0.85, 0]} fontSize={0.24} color="#ffffff" anchorX="center" anchorY="middle">
                            {`${sentimentDisplay.score.toFixed(0)}% [${sentimentDisplay.label}]`}
                          </Text>
                        </group>
                    )}
                  </>
                )}
            </group>
        )}

      </group>
    </Float>
  );
}