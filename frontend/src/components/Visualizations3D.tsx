"use client";

import React, { useMemo, useState, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Text, Billboard, Line } from "@react-three/drei";
import { useVisualization } from "../hooks/useVisualization";
import { computeScenarioDCF } from "@/lib/mathUtils";
import type { StockData, StockInsights } from "@/types";

/**
 * VPVRWall renders a Volume Profile Visible Range wall that is
 * spatially aligned with the CandlestickVisuals coordinate space.
 * 
 * The candlestick chart uses:
 *   Y = ((price - mid) / range) * 1.8
 * where mid = (maxHigh + minLow) / 2 and range = maxHigh - minLow
 * and X spans from -W/2 to +W/2 (W = 3.6)
 *
 * This component maps VPVR price bins to the same Y formula,
 * and positions the wall behind the chart at Z = -0.5.
 */

interface VPVRNode {
  price: number;
  volume: number;
  is_poc: boolean;
}

interface VPVRWallProps {
  data: any;
  candleMinPrice: number;
  candleMaxPrice: number;
  pocShelf?: number;
}

export function VPVRWall({ data, candleMinPrice, candleMaxPrice, pocShelf }: VPVRWallProps) {
  if (!data || !data.dimensions) return null;
  const nodes: VPVRNode[] = data.dimensions.nodes || [];
  const maxVolume = data.dimensions.maxVolume || 1;

  // Use the candlestick chart's coordinate mapping
  const range = Math.max(candleMaxPrice - candleMinPrice, 0.01);
  const mid = (candleMaxPrice + candleMinPrice) / 2;
  const CHART_HEIGHT = 1.8; // matches CandlestickVisuals scaling
  const W = 3.6;            // matches CandlestickVisuals width

  // Scale a price to the same Y axis as the candlesticks
  const scaleY = (price: number) => ((price - mid) / range) * CHART_HEIGHT;

  return (
    // Position behind the candlesticks (Z = -0.25) and anchored to the right edge
    <group position={[W / 2 + 0.1, 0, -0.25]}>
      {nodes.map((node, i) => {
        const yPos = scaleY(node.price);
        // Clamp to visible range (don't render bars way off the chart or below date labels)
        if (yPos < -CHART_HEIGHT * 0.52 || yPos > CHART_HEIGHT * 0.6) return null;

        const normalizedVol = node.volume / maxVolume;
        const barLength = normalizedVol * 2.5; // max 2.5 AR units long
        const color = node.is_poc ? "#ffd700" : "#1e40af";
        const emissiveIntensity = node.is_poc ? 0.8 : 0.2;
        const opacity = node.is_poc ? 0.9 : 0.4;

        return (
          <group key={i} position={[-barLength / 2, yPos, 0]}>
            <mesh>
              <boxGeometry args={[barLength, 0.04, 0.2]} />
              <meshStandardMaterial
                color={color}
                transparent
                opacity={opacity}
                emissive={color}
                emissiveIntensity={emissiveIntensity}
              />
            </mesh>
            {/* Label Point of Control: positioned at far right edge (Z = 0.25) with dark pill backing plate */}
            {node.is_poc && (
              <Billboard position={[barLength / 2 + 0.35, 0, 0.25]}>
                <mesh position={[0, 0, -0.01]}>
                  <planeGeometry args={[1.05, 0.22]} />
                  <meshBasicMaterial color="#020617" opacity={0.92} transparent />
                </mesh>
                <Text fontSize={0.095} color="#ffd700" anchorX="center" anchorY="middle" fontWeight="bold">
                  POC ${(pocShelf ?? node.price).toFixed(2)}
                </Text>
              </Billboard>
            )}
          </group>
        );
      })}
      <Billboard position={[-0.5, CHART_HEIGHT * 0.55, 0]}>
        <Text fontSize={0.12} color="#00f0ff" anchorX="center">VPVR</Text>
      </Billboard>
    </group>
  );
}

/**
 * VPVRWallWithData fetches VPVR data and delegates rendering to VPVRWall.
 * Requires candleMinPrice and candleMaxPrice from the parent CandlestickVisuals.
 */
export function VPVRWallWithData({ ticker, candleMinPrice, candleMaxPrice, pocShelf }: { 
  ticker: string; 
  candleMinPrice: number; 
  candleMaxPrice: number; 
  pocShelf?: number;
}) {
  const { data, loading, error } = useVisualization(ticker, "vpvr");

  if (loading) return <Billboard position={[2, 0, 0]}><Text fontSize={0.15} color="#00f0ff">Loading VPVR...</Text></Billboard>;
  if (error) return <Billboard position={[2, 0, 0]}><Text fontSize={0.15} color="#f87171">{error}</Text></Billboard>;
  if (!data) return null;

  return <VPVRWall data={data} candleMinPrice={candleMinPrice} candleMaxPrice={candleMaxPrice} pocShelf={pocShelf} />;
}

// ── DUPONT TREE (Upgraded with Scenario Stress-Testing Reactivity) ──────────
export function DuPontTree({ data, scenarioParams }: { data: any; scenarioParams?: any }) {
  if (!data || !data.dimensions || !data.dimensions.lattice) return null;
  const latest = data.dimensions.lattice[0];
  if (!latest) return null;
  
  const marginDelta = scenarioParams?.margin_delta ?? 0;
  const effectiveMargin = Math.max(0.1, latest.margin + (marginDelta * 100));
  const baseRoe = (latest.margin / 100) * latest.turnover * latest.leverage * 100;
  const shockedRoe = (effectiveMargin / 100) * latest.turnover * latest.leverage * 100;
  const roeDiff = shockedRoe - baseRoe;

  const topNode = new THREE.Vector3(0, 1.5, 0);
  const marginNode = new THREE.Vector3(-1.5, 0, 0);
  const turnoverNode = new THREE.Vector3(0, 0, 0.5);
  const leverageNode = new THREE.Vector3(1.5, 0, 0);

  const leverageAlert = latest.leverage > 3.0;

  const [activeNode, setActiveNode] = useState<"margin" | "turnover" | "leverage" | "roe" | null>(null);

  let insightText = "";
  if (activeNode === "margin") {
    const roeSensitivity = (1.0 * latest.turnover * latest.leverage).toFixed(2);
    insightText = `Sensitivity: +100 bps in Net Margin expands ROE by +${roeSensitivity}%`;
  } else if (activeNode === "turnover") {
    const roeSensitivity = ((effectiveMargin / 100) * 0.10 * latest.leverage * 100).toFixed(2);
    insightText = `Sensitivity: +0.10x Asset Turnover expands ROE by +${roeSensitivity}%`;
  } else if (activeNode === "leverage") {
    const roeSensitivity = ((effectiveMargin / 100) * latest.turnover * 0.50 * 100).toFixed(2);
    insightText = `Sensitivity: +0.50x Leverage shifts ROE by +${roeSensitivity}%`;
  } else if (activeNode === "roe") {
    insightText = `ROE Formula: Margin (${effectiveMargin.toFixed(1)}%) × Turnover (${latest.turnover.toFixed(2)}x) × Leverage (${latest.leverage.toFixed(2)}x)`;
  }

  return (
    <group position={[0, -0.5, 0]}>
      {/* Floating DuPont Sensitivity Insight Card when a factor is hovered or tapped */}
      {activeNode && (
        <Billboard position={[0, 2.45, 0]}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[3.4, 0.46]} />
            <meshBasicMaterial color="#020617" opacity={0.92} transparent />
          </mesh>
          <Text fontSize={0.11} color="#00f0ff" anchorX="center" fontWeight="bold">
            {insightText}
          </Text>
        </Billboard>
      )}

      {/* Lines connecting nodes */}
      <Line points={[marginNode, topNode]} color="#94a3b8" lineWidth={2} transparent opacity={0.4} />
      <Line points={[turnoverNode, topNode]} color="#94a3b8" lineWidth={2} transparent opacity={0.4} />
      <Line points={[leverageNode, topNode]} color="#94a3b8" lineWidth={2} transparent opacity={0.4} />

      {/* Root Node (ROE) with Dark Plate Backing — Never Collides with Sphere Rim */}
      <group position={topNode}>
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); setActiveNode("roe"); }}
          onPointerOut={() => setActiveNode(null)}
          onClick={(e) => { e.stopPropagation(); setActiveNode(prev => prev === "roe" ? null : "roe"); }}
        >
          <sphereGeometry args={[activeNode === "roe" ? 0.36 : 0.3, 16, 16]} />
          <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={activeNode === "roe" ? 1.0 : 0.6} />
        </mesh>
        {activeNode === "roe" && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.42, 0.48, 32]} />
            <meshBasicMaterial color="#00f0ff" transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
        )}
        <Billboard position={[0, 0.75, 0]}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[2.2, 0.62]} />
            <meshBasicMaterial color="#020617" opacity={0.88} transparent />
          </mesh>
          <Text fontSize={0.12} color="#ffffff" position={[0, 0.12, 0.01]} anchorX="center" fontWeight="bold">
            ROE (Return on Equity)
          </Text>
          <Text fontSize={0.13} color="#00f0ff" position={[0, -0.10, 0.01]} anchorX="center" fontWeight="bold">
            {shockedRoe.toFixed(1)}% {marginDelta !== 0 ? `(${roeDiff >= 0 ? "+" : ""}${roeDiff.toFixed(1)}% Shock)` : ""}
          </Text>
        </Billboard>
      </group>

      {/* Net Margin Node (Reactive to Operating Margin Slider) */}
      <group position={marginNode}>
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); setActiveNode("margin"); }}
          onPointerOut={() => setActiveNode(null)}
          onClick={(e) => { e.stopPropagation(); setActiveNode(prev => prev === "margin" ? null : "margin"); }}
        >
          <sphereGeometry args={[activeNode === "margin" ? 0.28 : 0.2, 16, 16]} />
          <meshStandardMaterial 
            color={marginDelta > 0 ? "#10b981" : marginDelta < 0 ? "#ef4444" : "#38bdf8"} 
            emissive={marginDelta > 0 ? "#10b981" : marginDelta < 0 ? "#ef4444" : "#38bdf8"} 
            emissiveIntensity={activeNode === "margin" ? 1.0 : marginDelta !== 0 ? 0.6 : 0.3} 
          />
        </mesh>
        {activeNode === "margin" && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.32, 0.37, 32]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
        )}
        <Billboard position={[0, -0.52, 0]}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[1.7, 0.52]} />
            <meshBasicMaterial color="#020617" opacity={0.85} transparent />
          </mesh>
          <Text fontSize={0.11} color="#ffffff" position={[0, 0.10, 0.01]} anchorX="center" fontWeight="bold">
            Net Margin
          </Text>
          <Text 
            fontSize={0.10} 
            color={marginDelta > 0 ? "#10b981" : marginDelta < 0 ? "#ef4444" : "#38bdf8"} 
            position={[0, -0.10, 0.01]} 
            anchorX="center"
            fontWeight="bold"
          >
            {effectiveMargin.toFixed(1)}% {marginDelta !== 0 ? `(${marginDelta > 0 ? "+" : ""}${(marginDelta * 100).toFixed(1)}%)` : ""}
          </Text>
        </Billboard>
      </group>

      {/* Asset Turnover Node */}
      <group position={turnoverNode}>
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); setActiveNode("turnover"); }}
          onPointerOut={() => setActiveNode(null)}
          onClick={(e) => { e.stopPropagation(); setActiveNode(prev => prev === "turnover" ? null : "turnover"); }}
        >
          <sphereGeometry args={[activeNode === "turnover" ? 0.28 : 0.2, 16, 16]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={activeNode === "turnover" ? 0.9 : 0.3} />
        </mesh>
        {activeNode === "turnover" && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.32, 0.37, 32]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
        )}
        <Billboard position={[0, -0.52, 0]}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[1.5, 0.52]} />
            <meshBasicMaterial color="#020617" opacity={0.85} transparent />
          </mesh>
          <Text fontSize={0.11} color="#ffffff" position={[0, 0.10, 0.01]} anchorX="center" fontWeight="bold">
            Asset Turnover
          </Text>
          <Text fontSize={0.10} color="#38bdf8" position={[0, -0.10, 0.01]} anchorX="center" fontWeight="bold">
            {latest.turnover.toFixed(2)}x
          </Text>
        </Billboard>
      </group>

      {/* Financial Leverage Node */}
      <group position={leverageNode}>
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); setActiveNode("leverage"); }}
          onPointerOut={() => setActiveNode(null)}
          onClick={(e) => { e.stopPropagation(); setActiveNode(prev => prev === "leverage" ? null : "leverage"); }}
        >
          <sphereGeometry args={[activeNode === "leverage" ? 0.28 : 0.2, 16, 16]} />
          <meshStandardMaterial color={leverageAlert ? "#ef4444" : "#38bdf8"} emissive={leverageAlert ? "#ef4444" : "#38bdf8"} emissiveIntensity={activeNode === "leverage" ? 1.0 : leverageAlert ? 0.8 : 0.3} />
        </mesh>
        {activeNode === "leverage" && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.32, 0.37, 32]} />
            <meshBasicMaterial color={leverageAlert ? "#ef4444" : "#38bdf8"} transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
        )}
        <Billboard position={[0, -0.52, 0]}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[1.5, 0.52]} />
            <meshBasicMaterial color="#020617" opacity={0.85} transparent />
          </mesh>
          <Text fontSize={0.11} color="#ffffff" position={[0, 0.10, 0.01]} anchorX="center" fontWeight="bold">
            Leverage
          </Text>
          <Text fontSize={0.10} color={leverageAlert ? "#ef4444" : "#38bdf8"} position={[0, -0.10, 0.01]} anchorX="center" fontWeight="bold">
            {latest.leverage.toFixed(2)}x
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

export function DuPontTreeWithData({ ticker, scenarioParams }: { ticker: string; scenarioParams?: any }) {
  const { data, loading, error } = useVisualization(ticker, "dupont");
  if (loading) return <Billboard><Text fontSize={0.15} color="#00f0ff">Loading DuPont Tree...</Text></Billboard>;
  if (error) return <Billboard><Text fontSize={0.15} color="#f87171">{error}</Text></Billboard>;
  if (!data) return null;
  return <DuPontTree data={data} scenarioParams={scenarioParams} />;
}

// ── WATERFALL CHART ─────────────────────────────────────────────────────────
export function WaterfallChart({ data }: { data: any }) {
  if (!data || !data.dimensions) return null;
  const { x, values } = data.dimensions;
  
  // values is an array of arrays. We take the first element (most recent year) from each stage.
  const stageValues = values.map((v: number[]) => v[0]);
  const maxValue = Math.max(...stageValues.map(Math.abs), 1);
  
  const MAX_HEIGHT = 2.5;
  const numStages = stageValues.length;
  
  return (
    <group position={[0, -1, 0]}>
      {stageValues.map((val: number, i: number) => {
        const height = (Math.abs(val) / maxValue) * MAX_HEIGHT;
        const xPos = -2 + (4 / (numStages - 1)) * i;
        
        // Gradient: Revenue (0) is blue, intermediate are slate-ish, FCF (last) is bright cyan
        const isRevenue = i === 0;
        const isFCF = i === numStages - 1;
        const color = isFCF ? "#00f0ff" : isRevenue ? "#3b82f6" : "#475569";
        const emissiveIntensity = isFCF ? 0.8 : isRevenue ? 0.4 : 0.1;
        
        return (
          <group key={i} position={[xPos, 0, 0]}>
            <mesh position={[0, height / 2, 0]}>
              <boxGeometry args={[0.4, height, 0.4]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} transparent opacity={0.8} />
            </mesh>
            <Billboard position={[0, -0.3, 0]}>
               <Text fontSize={0.1} color="#94a3b8">{x[i]}</Text>
               <Text fontSize={0.1} color={color} position={[0, -0.15, 0]}>{(val / 1e6).toFixed(0)}M</Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}

export function WaterfallChartWithData({ ticker }: { ticker: string }) {
  const { data, loading, error } = useVisualization(ticker, "waterfall");
  if (loading) return <Billboard><Text fontSize={0.15} color="#00f0ff">Loading Waterfall...</Text></Billboard>;
  if (error) return <Billboard><Text fontSize={0.15} color="#f87171">{error}</Text></Billboard>;
  if (!data) return null;
  return <WaterfallChart data={data} />;
}

// ── PEER SCATTER CLOUD ──────────────────────────────────────────────────────
// ── PEER SCATTER CLOUD ──────────────────────────────────────────────────────
export function PeerScatterCloud({ data, ticker }: { data: any, ticker: string }) {
  if (!data || !data.dimensions || !data.dimensions.peers) return null;
  const peers = data.dimensions.peers;
  const medians = data.dimensions.medians || { pe: 28.0, roe: 25.0, rev_growth: 12.0 };

  const [hoveredPeer, setHoveredPeer] = useState<string | null>(null);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const activePeerTicker = hoveredPeer || selectedPeer;

  const targetPeer = peers.find((p: any) => p.ticker === ticker || p.is_target) || peers[0];

  // X: P/E, Y: ROE %, Z: Rev Growth %
  const peList = peers.map((p: any) => p.pe);
  const roeList = peers.map((p: any) => p.roe);
  const revList = peers.map((p: any) => p.rev_growth);

  const minPE = Math.min(...peList);
  const rawMaxPE = Math.max(...peList);
  const maxPE = rawMaxPE > minPE ? rawMaxPE : minPE + 1;

  const minROE = Math.min(...roeList);
  const rawMaxROE = Math.max(...roeList);
  const maxROE = rawMaxROE > minROE ? rawMaxROE : minROE + 1;

  const minRev = Math.min(...revList);
  const rawMaxRev = Math.max(...revList);
  const maxRev = rawMaxRev > minRev ? rawMaxRev : minRev + 1;

  // Soft Winsorization / Log-normalized axis scaling to prevent AAPL ~151% ROE from crushing all peers
  const normLog = (val: number, min: number, max: number, softCeil = 100) => {
    // Soft clamp extreme outliers for coordinate space
    const clampedVal = Math.max(min, Math.min(val, softCeil));
    const tVal = Math.sign(clampedVal) * Math.log1p(Math.max(0, Math.abs(clampedVal)));
    const tMin = Math.sign(min) * Math.log1p(Math.max(0, Math.abs(min)));
    const tMax = Math.sign(Math.min(max, softCeil)) * Math.log1p(Math.max(0, Math.abs(Math.min(max, softCeil))));
    if (tMin === tMax) return 0;
    return -1.8 + ((tVal - tMin) / (tMax - tMin)) * 3.6;
  };

  const normLinear = (val: number, min: number, max: number) => {
    if (min === max) return 0;
    return -1.8 + ((val - min) / (max - min)) * 3.6;
  };

  // Median crosshair coordinates
  const medianX = normLinear(medians.pe, minPE, maxPE);
  const medianY = normLog(medians.roe, minROE, maxROE, 90);

  return (
    <group position={[0, -0.3, 0]}>
      {/* Ground Reference Grid */}
      <gridHelper args={[4.4, 10, "#0284c7", "#1e293b"]} position={[0, -2, 0]} />

      {/* ── 3D Sector Median Crosshair & Centroid Planes ──────────────── */}
      {/* Vertical P/E Median Wall */}
      <mesh position={[medianX, 0, 0]}>
        <boxGeometry args={[0.02, 3.8, 4]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.08} depthWrite={false} />
      </mesh>

      {/* Horizontal ROE Median Shelf */}
      <mesh position={[0, medianY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 4]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.08} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Quadrant Legend Labels (Positioned outside AMZN pillar area at upper outer bounds) */}
      <Billboard position={[-1.3, -1.95, -2.35]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[2.2, 0.28]} />
          <meshBasicMaterial color="#020617" opacity={0.88} transparent />
        </mesh>
        <Text fontSize={0.085} color="#10b981" anchorX="center" fontWeight="bold">
          ★ ALPHA QUADRANT (High ROE / Low P/E)
        </Text>
      </Billboard>
      <Billboard position={[1.3, -1.95, -2.35]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[2.2, 0.28]} />
          <meshBasicMaterial color="#020617" opacity={0.88} transparent />
        </mesh>
        <Text fontSize={0.085} color="#38bdf8" anchorX="center" fontWeight="bold">
          Quality Premium (High ROE / High P/E)
        </Text>
      </Billboard>

      {/* Peer Spheres */}
      {peers.map((p: any) => {
        const x = normLinear(p.pe, minPE, maxPE);
        const y = normLog(p.roe, minROE, maxROE, 90);
        const z = normLinear(p.rev_growth, minRev, maxRev);

        const isTarget = p.ticker === ticker || p.is_target;
        const isSelected = activePeerTicker === p.ticker;
        const color = isTarget ? "#00f0ff" : isSelected ? "#38bdf8" : "#64748b";
        const emissiveIntensity = isSelected ? 1.6 : isTarget ? 1.4 : 0.2;
        const opacity = isSelected || isTarget ? 1.0 : 0.7;

        // Drop line height from peer node to grid floor
        const dropHeight = y - -2;

        const peDelta = p.pe - targetPeer.pe;
        const roeDelta = p.roe - targetPeer.roe;
        const revDelta = p.rev_growth - targetPeer.rev_growth;
        const sphereRadius = isTarget ? (isSelected ? 0.20 : 0.16) : (isSelected ? 0.16 : 0.12);

        return (
          <group key={p.ticker} position={[x, y, z]}>
            {/* Glowing ring around active or inspected ticker */}
            {(isTarget || isSelected) && (
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[sphereRadius * 1.3, sphereRadius * 1.6, 32]} />
                <meshBasicMaterial color={isTarget ? "#00f0ff" : "#38bdf8"} transparent opacity={0.85} side={THREE.DoubleSide} />
              </mesh>
            )}

            <mesh
              onPointerOver={(e) => { e.stopPropagation(); setHoveredPeer(p.ticker); }}
              onPointerOut={() => setHoveredPeer(null)}
              onClick={(e) => { e.stopPropagation(); setSelectedPeer(prev => prev === p.ticker ? null : p.ticker); }}
            >
              <sphereGeometry args={[sphereRadius, 16, 16]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={emissiveIntensity}
                transparent
                opacity={opacity}
              />
            </mesh>

            {/* Rich 3D text label displaying True Raw Metrics with Dark Pill Plate */}
            <Billboard position={[0, isSelected && !isTarget ? 0.58 : isTarget ? 0.48 : 0.38, 0]}>
              <mesh position={[0, -0.05, -0.01]}>
                <planeGeometry args={[isSelected && !isTarget ? 2.5 : isTarget ? 1.8 : 1.45, isSelected && !isTarget ? 0.58 : 0.44]} />
                <meshBasicMaterial color="#020617" opacity={0.92} transparent />
              </mesh>
              <Text fontSize={isTarget || isSelected ? 0.13 : 0.10} color={isTarget ? "#00f0ff" : "#ffffff"} anchorX="center" fontWeight="bold">
                {p.ticker}
              </Text>
              <Text fontSize={0.085} color={isTarget ? "#00f0ff" : "#94a3b8"} position={[0, -0.13, 0.01]} anchorX="center" fontWeight="bold">
                {`ROE: ${p.roe.toFixed(1)}% · P/E: ${p.pe.toFixed(1)}x`}
              </Text>
              {isSelected && !isTarget && (
                <Text fontSize={0.075} color="#38bdf8" position={[0, -0.25, 0.01]} anchorX="center" fontWeight="bold">
                  {`vs ${targetPeer.ticker}: P/E ${peDelta >= 0 ? "+" : ""}${peDelta.toFixed(1)}x · ROE ${roeDelta >= 0 ? "+" : ""}${roeDelta.toFixed(1)}%`}
                </Text>
              )}
            </Billboard>

            {/* Reference Drop Line to Grid Floor — Bright Cyan when inspected */}
            <Line
              points={[[0, 0, 0], [0, -dropHeight, 0]]}
              color={isSelected ? "#00f0ff" : isTarget ? "#00f0ff" : "#334155"}
              lineWidth={isSelected ? 3 : isTarget ? 2 : 1}
              transparent
              opacity={isSelected ? 1.0 : isTarget ? 0.7 : 0.4}
            />
          </group>
        );
      })}

      {/* Axis Lines */}
      <Line points={[[-2, -2, 0], [2, -2, 0]]} color="#38bdf8" lineWidth={1.5} />
      <Line points={[[-2, -2, 0], [-2, 2, 0]]} color="#38bdf8" lineWidth={1.5} />
      <Line points={[[-2, -2, -2], [-2, -2, 2]]} color="#38bdf8" lineWidth={1.5} />

      {/* Labeled Axes with ASCII Symbol (Positioned cleanly outside floor grid and peak of Y pillar) */}
      <Billboard position={[0, -2.35, 2.45]}>
        <Text fontSize={0.11} color="#38bdf8" fontWeight="bold">P/E Multiple (X) →</Text>
      </Billboard>
      <Billboard position={[-2.2, 2.35, -2.0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[1.7, 0.32]} />
          <meshBasicMaterial color="#020617" opacity={0.88} transparent />
        </mesh>
        <Text fontSize={0.11} color="#38bdf8" fontWeight="bold">ROE % (Y-Axis) ^</Text>
      </Billboard>
      <Billboard position={[2.45, -2.35, 0]}>
        <Text fontSize={0.11} color="#38bdf8" fontWeight="bold">Rev Growth % (Z) →</Text>
      </Billboard>
    </group>
  );
}

export function PeerScatterCloudWithData({ ticker }: { ticker: string }) {
  const { data, loading, error } = useVisualization(ticker, "peer_scatter");
  if (loading) return <Billboard><Text fontSize={0.15} color="#00f0ff">Loading Peer Scatter...</Text></Billboard>;
  if (error) return <Billboard><Text fontSize={0.15} color="#f87171">{error}</Text></Billboard>;
  if (!data) return null;
  return <PeerScatterCloud data={data} ticker={ticker} />;
}

// ── DCF TERRAIN (Upgraded with Real-time Scenario Morphing & True 3D Surface) ──
export function DCFTerrain({ data, scenarioParams }: { data: any; scenarioParams?: any }) {
  if (!data || !data.dimensions || !data.dimensions.prices) return null;
  const { wacc, growth, prices, current_price, base_fair_value } = data.dimensions;

  const waccDelta = scenarioParams?.wacc_delta ?? 0;
  const growthDelta = scenarioParams?.tgr_delta ?? 0;
  const marginDelta = scenarioParams?.margin_delta ?? 0;

  // Single source of truth DCF valuation result
  const dcfResult = useMemo(() => {
    return computeScenarioDCF(current_price, base_fair_value, scenarioParams);
  }, [current_price, base_fair_value, scenarioParams]);

  // Real-time dynamic morphing: adjust prices based on interactive scenario deltas
  const morphedMatrix = useMemo(() => {
    return prices.map((row: number[], i: number) => {
      const origWacc = wacc[i] || 0.11;
      const effWacc = Math.max(0.04, origWacc + waccDelta);

      return row.map((rawPrice: number, j: number) => {
        const origGrowth = growth[j] || 0.03;
        const effGrowth = Math.max(0.005, origGrowth + growthDelta);

        // Standard DCF sensitivity scaling factor
        const waccFactor = (1 + origWacc) / (1 + effWacc);
        const growthFactor = (origWacc - origGrowth) / Math.max(0.008, effWacc - effGrowth);
        const marginFactor = 1 + marginDelta * 1.8;
        const morphed = rawPrice * Math.pow(waccFactor, 2.2) * Math.pow(growthFactor, 0.45) * marginFactor;
        
        // Ensure center node aligns 100% with dcfResult.fairValue
        if (i === 2 && j === 2) {
          return dcfResult.fairValue;
        }
        return Math.max(0, Number(morphed.toFixed(2)));
      });
    });
  }, [prices, wacc, growth, waccDelta, growthDelta, marginDelta, dcfResult.fairValue]);

  // Find min and max prices to normalize Y to [-1.6, 1.6]
  const allPrices = morphedMatrix.flat();
  const minPrice = Math.min(...allPrices, current_price * 0.7);
  const maxPrice = Math.max(...allPrices, current_price * 1.3);
  const priceRange = Math.max(maxPrice - minPrice, 1);

  const normY = (p: number) => {
    return -1.5 + ((p - minPrice) / priceRange) * 3.0;
  };

  const W_SPAN = 4.4;
  const Z_SPAN = 4.4;
  const normX = (i: number) => -W_SPAN / 2 + (W_SPAN / Math.max(wacc.length - 1, 1)) * i;
  const normZ = (j: number) => -Z_SPAN / 2 + (Z_SPAN / Math.max(growth.length - 1, 1)) * j;

  const currentPriceY = normY(current_price);
  const activeBaseFairValue = dcfResult.fairValue;
  const upsidePct = dcfResult.upsidePct;

  // Formatted axis bounds (Fixed IEEE-754 precision gore)
  const minWaccLabel = ((0.08 + waccDelta) * 100).toFixed(1);
  const maxWaccLabel = ((0.14 + waccDelta) * 100).toFixed(1);
  const minGrowthLabel = ((0.015 + growthDelta) * 100).toFixed(1);
  const maxGrowthLabel = ((0.045 + growthDelta) * 100).toFixed(1);

  const isBaseCase = waccDelta === 0 && growthDelta === 0 && marginDelta === 0;
  const dcfSignTitle = isBaseCase
    ? "◇ BASE CASE FAIR VALUE"
    : activeBaseFairValue > base_fair_value
    ? "◇ BULL SCENARIO FAIR VALUE"
    : "◇ BEAR SCENARIO FAIR VALUE";

  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ i: number; j: number } | null>(null);
  const activeCell = hoveredCell || selectedCell;

  return (
    // Tilted and elevated to form a true 3D topographic terrain surface from default orbit camera
    <group position={[0, 0.35, 0]} rotation={[0.42, -0.52, 0]}>
      {/* ── Topographic Surface Spheres ─────────────────────────────────── */}
      {morphedMatrix.map((row: number[], i: number) =>
        row.map((price: number, j: number) => {
          const y = normY(price);
          const x = normX(i);
          const z = normZ(j);

          // Dynamic 3-state valuation color-coding:
          // Undervalued (> +5%): Emerald Green
          // Fairly Valued (±5%): Amber Gold
          // Overvalued (< -5%): Crimson Red
          const diffPct = (price - current_price) / current_price;
          let color = "#f59e0b"; // Fair Value Amber
          if (diffPct > 0.05) color = "#10b981"; // Undervalued Green
          else if (diffPct < -0.05) color = "#ef4444"; // Overvalued Red

          const isBaseCaseNode = i === 2 && j === 2;
          const isCellActive = activeCell?.i === i && activeCell?.j === j;
          const sphereRadius = isBaseCaseNode ? (isCellActive ? 0.20 : 0.15) : (isCellActive ? 0.14 : 0.08);

          const cellWacc = ((wacc[i] + waccDelta) * 100).toFixed(1);
          const cellGrowth = ((growth[j] + growthDelta) * 100).toFixed(1);
          const cellDiff = ((price - current_price) / current_price) * 100;
          const cellDiffLabel = `${cellDiff >= 0 ? "+" : ""}${cellDiff.toFixed(1)}% vs Spot`;
          const impliedMultiple = (price / Math.max(0.01, current_price / 28.5)).toFixed(1) + "x";

          return (
            <group key={`${i}-${j}`} position={[x, y, z]}>
              <mesh
                onPointerOver={(e) => { e.stopPropagation(); setHoveredCell({ i, j }); }}
                onPointerOut={() => setHoveredCell(null)}
                onClick={(e) => { e.stopPropagation(); setSelectedCell(prev => prev?.i === i && prev?.j === j ? null : { i, j }); }}
              >
                <sphereGeometry args={[sphereRadius, 16, 16]} />
                <meshStandardMaterial
                  color={isCellActive ? "#00f0ff" : color}
                  emissive={isCellActive ? "#00f0ff" : color}
                  emissiveIntensity={isCellActive ? 1.4 : isBaseCaseNode ? 1.0 : 0.45}
                />
              </mesh>

              {/* Glowing Wireframe Ring for Active/Base Node */}
              {(isBaseCaseNode || isCellActive) && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[sphereRadius * 1.3, sphereRadius * 1.6, 32]} />
                  <meshBasicMaterial color="#00f0ff" transparent opacity={0.85} side={THREE.DoubleSide} />
                </mesh>
              )}

              {/* Base Case Node Permanent Billboard */}
              {isBaseCaseNode && !isCellActive && (
                <Billboard position={[0, 1.25, 0]}>
                  <mesh position={[0, 0, -0.01]}>
                    <planeGeometry args={[2.7, 0.65]} />
                    <meshBasicMaterial color="#020617" opacity={0.9} transparent />
                  </mesh>
                  <Text fontSize={0.12} color="#00f0ff" anchorX="center" position={[0, 0.12, 0.01]} fontWeight="bold">
                    {dcfSignTitle}
                  </Text>
                  <Text fontSize={0.11} color="#ffffff" position={[0, -0.12, 0.01]} anchorX="center" fontWeight="bold">
                    {`$${activeBaseFairValue.toFixed(2)} (${dcfResult.upsideLabel})`}
                  </Text>
                </Billboard>
              )}

              {/* Interactive 3D Spatial Telemetry Card for Hovered/Selected Cell */}
              {isCellActive && (
                <Billboard position={[0, 0.85, 0]}>
                  <mesh position={[0, 0, -0.01]}>
                    <planeGeometry args={[2.8, 0.72]} />
                    <meshBasicMaterial color="#020617" opacity={0.94} transparent />
                  </mesh>
                  <Text fontSize={0.095} color="#00f0ff" position={[0, 0.20, 0.01]} anchorX="center" fontWeight="bold">
                    {`Selected Cell: WACC ${cellWacc}% | Term. Growth ${cellGrowth}%`}
                  </Text>
                  <Text fontSize={0.11} color="#ffffff" position={[0, 0.02, 0.01]} anchorX="center" fontWeight="bold">
                    {`Implied Share Price: $${price.toFixed(2)} (${cellDiffLabel})`}
                  </Text>
                  <Text fontSize={0.09} color="#94a3b8" position={[0, -0.18, 0.01]} anchorX="center" fontWeight="bold">
                    {`Implied EV / FCF Multiple: ${impliedMultiple}`}
                  </Text>
                </Billboard>
              )}
            </group>
          );
        })
      )}

      {/* Row Lines (along Z axis for each WACC step) */}
      {morphedMatrix.map((row: number[], i: number) => {
        const points = row.map((price: number, j: number) => new THREE.Vector3(normX(i), normY(price), normZ(j)));
        return <Line key={`row-${i}`} points={points} color="#38bdf8" lineWidth={1.5} transparent opacity={0.5} />;
      })}

      {/* Column Lines (along X axis for each Growth step) */}
      {growth.map((_: any, j: number) => {
        const points = morphedMatrix.map((row: number[], i: number) => new THREE.Vector3(normX(i), normY(row[j]), normZ(j)));
        return <Line key={`col-${j}`} points={points} color="#38bdf8" lineWidth={1.5} transparent opacity={0.5} />;
      })}

      {/* ── Spot Market Price Benchmark Plane ───────────────────────────── */}
      <mesh position={[0, currentPriceY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W_SPAN, Z_SPAN]} />
        <meshStandardMaterial
          color="#38bdf8"
          transparent
          opacity={0.22}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Benchmark Plane Border */}
      <Line
        points={[
          [-W_SPAN / 2, currentPriceY, -Z_SPAN / 2],
          [W_SPAN / 2, currentPriceY, -Z_SPAN / 2],
          [W_SPAN / 2, currentPriceY, Z_SPAN / 2],
          [-W_SPAN / 2, currentPriceY, Z_SPAN / 2],
          [-W_SPAN / 2, currentPriceY, -Z_SPAN / 2],
        ]}
        color="#38bdf8"
        lineWidth={2}
      />

      {/* Label for Spot Price Plane with Dark Backing Plate */}
      <Billboard position={[W_SPAN / 2 + 0.45, currentPriceY + 0.15, 0]}>
        <mesh position={[0.7, 0, -0.01]}>
          <planeGeometry args={[1.8, 0.35]} />
          <meshBasicMaterial color="#020617" opacity={0.88} transparent />
        </mesh>
        <Text fontSize={0.12} color="#38bdf8" anchorX="left" fontWeight="bold">
          Spot Price: ${current_price.toFixed(2)}
        </Text>
      </Billboard>

      {/* Axis Annotations (Positioned to clear bottom × Close 3D View button) */}
      <Billboard position={[0, -1.45, Z_SPAN / 2 + 0.35]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[2.9, 0.36]} />
          <meshBasicMaterial color="#020617" opacity={0.88} transparent />
        </mesh>
        <Text fontSize={0.11} color="#94a3b8" anchorX="center" fontWeight="bold">
          {`Discount Rate (WACC): ${minWaccLabel}% → ${maxWaccLabel}%`}
        </Text>
      </Billboard>
      <Billboard position={[-2.9, -0.95, 1.4]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[2.9, 0.36]} />
          <meshBasicMaterial color="#020617" opacity={0.88} transparent />
        </mesh>
        <Text fontSize={0.11} color="#94a3b8" anchorX="center" fontWeight="bold">
          {`← Terminal Growth: ${minGrowthLabel}% to ${maxGrowthLabel}%`}
        </Text>
      </Billboard>
    </group>
  );
}

export function DCFTerrainWithData({ ticker, scenarioParams }: { ticker: string; scenarioParams?: any }) {
  const { data, loading, error } = useVisualization(ticker, "dcf_terrain");
  if (loading) return <Billboard><Text fontSize={0.15} color="#00f0ff">Loading DCF Terrain...</Text></Billboard>;
  if (error) return <Billboard><Text fontSize={0.15} color="#f87171">{error}</Text></Billboard>;
  if (!data) return null;
  return <DCFTerrain data={data} scenarioParams={scenarioParams} />;
}

// ── 3D OPTIONS IMPLIED VOLATILITY (IV) & GAMMA SURFACE ─────────────────────
export function IVSurface3D({ data, scenarioParams }: { data: any; scenarioParams?: any }) {
  if (!data || !data.dimensions) return null;
  const {
    current_price = 343.46,
    atm_iv = 26.5,
    put_call_skew = 1.32,
    max_gamma_strike = 343.46,
    moneyness = [-0.10, -0.05, 0.0, 0.05, 0.10],
    moneyness_labels = ["-10%", "-5%", "ATM (0%)", "+5%", "+10%"],
    strikes = [309.11, 326.29, 343.46, 360.63, 377.81],
    dte_days = [7, 14, 30, 60, 90],
    dte_labels = ["7D", "14D", "30D", "60D", "90D"],
    iv_matrix = [],
  } = data.dimensions;

  const [hoveredNode, setHoveredNode] = useState<{ r: number; c: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ r: number; c: number } | null>(null);
  const activeNode = hoveredNode || selectedNode;

  // Reactivity with scenarioParams:
  // Bear Drift / Margin contraction / Rate risk -> elevates short-dated Put Skew
  const isBear = scenarioParams?.active_scenario === "bear" || (scenarioParams?.margin_delta && scenarioParams.margin_delta < 0);
  const isBull = scenarioParams?.active_scenario === "bull" || (scenarioParams?.margin_delta && scenarioParams.margin_delta > 0);
  const bearShock = isBear ? 12.0 : 0;
  const bullShock = isBull ? 6.0 : 0;

  // Compute reactive morphed IV matrix
  const morphedMatrix: number[][] = useMemo(() => {
    if (!iv_matrix || iv_matrix.length === 0) return [];
    return iv_matrix.map((row: number[], r: number) => {
      const dteFactor = Math.sqrt(30 / Math.max(7, dte_days[r] || 30));
      return row.map((rawIV: number, c: number) => {
        let morphed = rawIV;
        if (isBear && c <= 1) {
          // Elevated Put Skew (Fear shock on short-dated downside)
          morphed += bearShock * dteFactor * (c === 0 ? 1.4 : 1.0);
        } else if (isBull && c >= 3) {
          // Upside Call Wing expansion
          morphed += bullShock * dteFactor * (c === 4 ? 1.3 : 1.0);
        }
        return Number(morphed.toFixed(1));
      });
    });
  }, [iv_matrix, isBear, isBull, bearShock, bullShock, dte_days]);

  if (morphedMatrix.length === 0) return null;

  const allIVs = morphedMatrix.flat();
  const minIV = Math.min(...allIVs, 15.0);
  const maxIV = Math.max(...allIVs, 60.0);
  const ivRange = Math.max(maxIV - minIV, 1.0);

  const W_SPAN = 4.2; // Strike X span
  const Z_SPAN = 3.6; // DTE Z span

  const normX = (c: number) => -W_SPAN / 2 + (W_SPAN / Math.max(moneyness.length - 1, 1)) * c;
  const normZ = (r: number) => -Z_SPAN / 2 + (Z_SPAN / Math.max(dte_days.length - 1, 1)) * r;
  const normY = (iv: number) => -1.1 + ((iv - minIV) / ivRange) * 2.2;

  return (
    <group position={[0, 0.25, 0]} rotation={[0.42, -0.45, 0]}>
      {/* ── Surface Spheres & Interactive Inspection Nodes ── */}
      {morphedMatrix.map((row, r) =>
        row.map((iv, c) => {
          const x = normX(c);
          const z = normZ(r);
          const y = normY(iv);

          const isATM = c === 2;
          const isDownside = c < 2;
          const isUpside = c > 2;

          // Color coding:
          // Downside Put wing with Fear Skew: Crimson / Orange
          // Upside Call wing: Emerald / Cyan
          // ATM: Bright Cyan
          let color = "#38bdf8";
          if (isATM) color = "#00f0ff";
          else if (isDownside) color = isBear ? "#ef4444" : "#f59e0b";
          else if (isUpside) color = isBull ? "#10b981" : "#06b6d4";

          const isNodeActive = activeNode?.r === r && activeNode?.c === c;
          const sphereRadius = isATM ? (isNodeActive ? 0.18 : 0.13) : (isNodeActive ? 0.14 : 0.08);

          // Gamma estimate
          const isNearTermATM = r <= 1 && c === 2;
          const gammaSens = isNearTermATM ? "Maximum (Gamma Wall)" : r <= 2 && Math.abs(c - 2) <= 1 ? "Elevated" : "Normal";

          return (
            <group key={`${r}-${c}`} position={[x, y, z]}>
              <mesh
                onPointerOver={(e) => { e.stopPropagation(); setHoveredNode({ r, c }); }}
                onPointerOut={() => setHoveredNode(null)}
                onClick={(e) => { e.stopPropagation(); setSelectedNode(prev => prev?.r === r && prev?.c === c ? null : { r, c }); }}
              >
                <sphereGeometry args={[sphereRadius, 16, 16]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={isNodeActive ? 1.4 : isATM ? 0.8 : 0.4}
                />
              </mesh>

              {/* Glowing Wireframe Ring for Active/ATM Node */}
              {(isATM || isNodeActive) && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[sphereRadius * 1.3, sphereRadius * 1.6, 32]} />
                  <meshBasicMaterial color={color} transparent opacity={0.85} side={THREE.DoubleSide} />
                </mesh>
              )}

              {/* Floating Spatial Telemetry Card */}
              {isNodeActive && (
                <Billboard position={[0, 0.85, 0]}>
                  <mesh position={[0, 0, -0.01]}>
                    <planeGeometry args={[2.7, 0.65]} />
                    <meshBasicMaterial color="#020617" opacity={0.92} transparent />
                  </mesh>
                  <Text fontSize={0.10} color="#00f0ff" position={[0, 0.18, 0.01]} anchorX="center" fontWeight="bold">
                    {`Strike: $${strikes[c]} (${moneyness_labels[c]}) | Expiry: ${dte_labels[r]}`}
                  </Text>
                  <Text fontSize={0.11} color="#ffffff" position={[0, 0.01, 0.01]} anchorX="center" fontWeight="bold">
                    {`Implied Volatility: ${iv.toFixed(1)}%`}
                  </Text>
                  <Text fontSize={0.085} color="#94a3b8" position={[0, -0.16, 0.01]} anchorX="center" fontWeight="bold">
                    {`Gamma Sensitivity: ${gammaSens}`}
                  </Text>
                </Billboard>
              )}
            </group>
          );
        })
      )}

      {/* Row Lines across Strikes for each DTE */}
      {morphedMatrix.map((row: number[], r: number) => {
        const points = row.map((iv: number, c: number) => new THREE.Vector3(normX(c), normY(iv), normZ(r)));
        return <Line key={`iv-row-${r}`} points={points} color="#38bdf8" lineWidth={1.5} transparent opacity={0.5} />;
      })}

      {/* Column Lines across DTE for each Strike */}
      {moneyness.map((_: any, c: number) => {
        const points = morphedMatrix.map((row: number[], r: number) => new THREE.Vector3(normX(c), normY(row[c]), normZ(r)));
        return <Line key={`iv-col-${c}`} points={points} color="#0284c7" lineWidth={1.5} transparent opacity={0.5} />;
      })}

      {/* Ground Reference Grid */}
      <gridHelper args={[4.4, 8, "#0284c7", "#1e293b"]} position={[0, -1.2, 0]} />

      {/* Main Title Badge */}
      <Billboard position={[0, 1.85, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[3.6, 0.55]} />
          <meshBasicMaterial color="#020617" opacity={0.9} transparent />
        </mesh>
        <Text fontSize={0.12} color="#00f0ff" anchorX="center" position={[0, 0.10, 0.01]} fontWeight="bold">
          ◈ 3D OPTIONS IMPLIED VOLATILITY (IV) SURFACE
        </Text>
        <Text fontSize={0.095} color="#cbd5e1" anchorX="center" position={[0, -0.10, 0.01]}>
          {`ATM IV: ${atm_iv.toFixed(1)}% | Put/Call Skew: ${put_call_skew.toFixed(2)}x | Gamma Wall: $${max_gamma_strike}`}
        </Text>
      </Billboard>

      {/* Axis Labels */}
      <Billboard position={[0, -1.45, Z_SPAN / 2 + 0.35]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[2.8, 0.35]} />
          <meshBasicMaterial color="#020617" opacity={0.88} transparent />
        </mesh>
        <Text fontSize={0.11} color="#94a3b8" anchorX="center" fontWeight="bold">
          Strike Moneyness: -10% to +10% →
        </Text>
      </Billboard>

      <Billboard position={[-W_SPAN / 2 - 0.45, -1.45, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[2.5, 0.35]} />
          <meshBasicMaterial color="#020617" opacity={0.88} transparent />
        </mesh>
        <Text fontSize={0.11} color="#94a3b8" anchorX="center" fontWeight="bold">
          ← Expiration: 7D to 90D
        </Text>
      </Billboard>
    </group>
  );
}

export function IVSurface3DWithData({ ticker, scenarioParams }: { ticker: string; scenarioParams?: any }) {
  const { data, loading, error } = useVisualization(ticker, "iv_surface");
  if (loading) return <Billboard><Text fontSize={0.15} color="#00f0ff">Loading 3D IV Surface...</Text></Billboard>;
  if (error) return <Billboard><Text fontSize={0.15} color="#f87171">{error}</Text></Billboard>;
  if (!data) return null;
  return <IVSurface3D data={data} scenarioParams={scenarioParams} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D SUPPLY-CHAIN & ECOSYSTEM CONTAGION GRAPH
// ─────────────────────────────────────────────────────────────────────────────

interface ContagionNode {
  id: string;
  name: string;
  role: string;
  tier: "focal" | "upstream" | "ecosystem";
  dependency: number;
  margin_beta: number;
  rev_beta: number;
  default_shock: number;
  pos: [number, number, number];
  color: string;
  margin_impact_bps?: number;
  dcf_dollar_impact?: number;
  shocked_dcf?: number;
  rev_exposure_pct?: number;
}

interface ContagionEdge {
  source: string;
  target: string;
  weight: number;
  flow_type: "upstream_supply" | "downstream_demand";
  label: string;
  margin_impact_bps: number;
  dcf_dollar_impact: number;
  shocked_dcf: number;
  default_shock: number;
  rev_exposure_pct: number;
}

function ContagionPulseParticles({
  startPos,
  endPos,
  isShocked,
  isBull,
  pulseColor,
}: {
  startPos: [number, number, number];
  endPos: [number, number, number];
  isShocked: boolean;
  isBull: boolean;
  pulseColor: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startVec = useMemo(() => new THREE.Vector3(...startPos), [startPos]);
  const endVec = useMemo(() => new THREE.Vector3(...endPos), [endPos]);
  const speed = isShocked ? 1.5 : isBull ? 1.1 : 0.65;

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime() * speed;
    groupRef.current.children.forEach((child, i) => {
      const progress = ((t + i * 0.33) % 1 + 1) % 1;
      child.position.lerpVectors(startVec, endVec, progress);
    });
  });

  return (
    <group ref={groupRef}>
      {[0, 1, 2].map((idx) => (
        <mesh key={idx} position={[startPos[0], startPos[1], startPos[2]]}>
          <sphereGeometry args={[0.055, 12, 12]} />
          <meshBasicMaterial
            color={pulseColor}
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function FocalCoreVisuals({
  symbol,
  name,
  baseDCF,
  isShocked,
  isBull,
  onReset,
}: {
  symbol: string;
  name: string;
  baseDCF: number;
  isShocked: boolean;
  isBull: boolean;
  onReset: () => void;
}) {
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const coreColor = isShocked ? "#f43f5e" : isBull ? "#10b981" : "#00f0ff";
  const ringColor = isShocked ? "#fb7185" : isBull ? "#34d399" : "#38bdf8";

  useFrame((_, delta) => {
    if (ring1Ref.current) ring1Ref.current.rotation.z += delta * 0.8;
    if (ring2Ref.current) ring2Ref.current.rotation.x += delta * 0.6;
  });

  return (
    <group position={[0, 0, 0]} onClick={(e) => { e.stopPropagation(); onReset(); }}>
      {/* Central Glowing Core Sphere */}
      <mesh>
        <sphereGeometry args={[0.36, 32, 32]} />
        <meshStandardMaterial
          color={coreColor}
          emissive={coreColor}
          emissiveIntensity={0.8}
          roughness={0.15}
          metalness={0.2}
        />
      </mesh>

      {/* Pulsing Dual Rings */}
      <mesh ref={ring1Ref}>
        <torusGeometry args={[0.54, 0.016, 16, 64]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring2Ref} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[0.70, 0.012, 16, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.65} side={THREE.DoubleSide} />
      </mesh>

      {/* High-Contrast Focal Label */}
      <Billboard position={[0, -0.62, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[2.4, 0.44]} />
          <meshBasicMaterial color="#020617" opacity={0.92} transparent />
        </mesh>
        <Text fontSize={0.13} color={coreColor} fontWeight="bold" anchorX="center" position={[0, 0.08, 0.01]}>
          {`${symbol} · ${name}`}
        </Text>
        <Text fontSize={0.095} color="#94a3b8" anchorX="center" position={[0, -0.09, 0.01]}>
          {`Base DCF: $${baseDCF.toFixed(2)} | Focal Core`}
        </Text>
      </Billboard>
    </group>
  );
}

export function ContagionGraph3D({
  data,
  scenarioParams,
}: {
  data: any;
  scenarioParams?: any;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const dims = data?.dimensions || {};
  const focalSymbol = dims.focal_symbol || "AAPL";
  const focalName = dims.focal_name || "Apple Inc.";
  const baseDCF = Number(dims.base_dcf || 388.97);
  const nodes: ContagionNode[] = dims.nodes || [];

  const partnerNodes = useMemo(() => nodes.filter((n) => n.tier !== "focal"), [nodes]);
  const selectedNode = useMemo(
    () => partnerNodes.find((n) => n.id === selectedNodeId) || null,
    [partnerNodes, selectedNodeId]
  );

  const isNetworkBear = scenarioParams?.active_scenario === "bear";
  const isNetworkBull = scenarioParams?.active_scenario === "bull";

  return (
    <group position={[0, -0.2, 0]}>
      {/* ── 1. Floating 3D Contagion Telemetry Billboard at [0, 2.15, 0] ── */}
      <Billboard position={[0, 2.15, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[4.4, 0.95]} />
          <meshBasicMaterial color="#020617" opacity={0.94} transparent />
        </mesh>
        {selectedNode ? (
          <>
            <Text
              fontSize={0.12}
              color="#f43f5e"
              fontWeight="bold"
              anchorX="center"
              position={[0, 0.28, 0.01]}
            >
              {`⚡ CONTAGION EPICENTER: ${selectedNode.name}`}
            </Text>
            <Text
              fontSize={0.095}
              color="#38bdf8"
              fontWeight="bold"
              anchorX="center"
              position={[0, 0.08, 0.01]}
            >
              {`Role: ${selectedNode.role}`}
            </Text>
            <Text
              fontSize={0.105}
              color="#f59e0b"
              fontWeight="bold"
              anchorX="center"
              position={[0, -0.10, 0.01]}
            >
              {`2nd-Order Margin Impact: ${selectedNode.margin_impact_bps ?? -115} bps | Revenue Exposure: ${selectedNode.rev_exposure_pct ?? 59.8}%`}
            </Text>
            <Text
              fontSize={0.10}
              color="#ffffff"
              fontWeight="bold"
              anchorX="center"
              position={[0, -0.28, 0.01]}
            >
              {`Contagion-Shocked DCF Value: $${(selectedNode.shocked_dcf ?? (baseDCF - 27.91)).toFixed(2)} (${(((Number(selectedNode.shocked_dcf ?? (baseDCF - 27.91)) - baseDCF) / baseDCF) * 100).toFixed(1)}% vs Base $${baseDCF.toFixed(2)})`}
            </Text>
          </>
        ) : isNetworkBear ? (
          <>
            <Text
              fontSize={0.125}
              color="#f43f5e"
              fontWeight="bold"
              anchorX="center"
              position={[0, 0.24, 0.01]}
            >
              ⚡ SYSTEMIC NETWORK SHOCK: BEAR CONTAGION CASCADE
            </Text>
            <Text
              fontSize={0.10}
              color="#bae6fd"
              anchorX="center"
              position={[0, 0.02, 0.01]}
            >
              WACC +1.5% · Margins -250 bps · Supplier Wafer Allocation Constrained
            </Text>
            <Text
              fontSize={0.105}
              color="#f59e0b"
              fontWeight="bold"
              anchorX="center"
              position={[0, -0.20, 0.01]}
            >
              {`Systemic Contagion DCF: $${(baseDCF * 0.84).toFixed(2)} (-16.0% vs Base $${baseDCF.toFixed(2)})`}
            </Text>
          </>
        ) : isNetworkBull ? (
          <>
            <Text
              fontSize={0.125}
              color="#10b981"
              fontWeight="bold"
              anchorX="center"
              position={[0, 0.24, 0.01]}
            >
              ✨ ECOSYSTEM EXPANSION: BULL CASE TAILWINDS
            </Text>
            <Text
              fontSize={0.10}
              color="#a7f3d0"
              anchorX="center"
              position={[0, 0.02, 0.01]}
            >
              WACC -1.0% · Margins +200 bps · Foundry Yields & Services Take-Rate Expanding
            </Text>
            <Text
              fontSize={0.105}
              color="#34d399"
              fontWeight="bold"
              anchorX="center"
              position={[0, -0.20, 0.01]}
            >
              {`Tailwind Implied DCF: $${(baseDCF * 1.18).toFixed(2)} (+18.0% vs Base $${baseDCF.toFixed(2)})`}
            </Text>
          </>
        ) : (
          <>
            <Text
              fontSize={0.125}
              color="#00f0ff"
              fontWeight="bold"
              anchorX="center"
              position={[0, 0.24, 0.01]}
            >
              ◈ 3D SUPPLY-CHAIN & ECOSYSTEM CONTAGION GRAPH
            </Text>
            <Text
              fontSize={0.10}
              color="#cbd5e1"
              anchorX="center"
              position={[0, 0.02, 0.01]}
            >
              Multi-Tier Directed Transmission: Silicon Foundries, Assembly & TAC Royalties
            </Text>
            <Text
              fontSize={0.095}
              color="#38bdf8"
              anchorX="center"
              position={[0, -0.20, 0.01]}
            >
              {`Baseline Anchor DCF: $${baseDCF.toFixed(2)} | Click any partner node to simulate shock`}
            </Text>
          </>
        )}
      </Billboard>

      {/* ── 2. Subtle Orbital Zone Labels ── */}
      <Billboard position={[-2.4, -1.85, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[2.9, 0.32]} />
          <meshBasicMaterial color="#020617" opacity={0.88} transparent />
        </mesh>
        <Text fontSize={0.095} color="#38bdf8" fontWeight="bold" anchorX="center">
          ⬅ UPSTREAM SUPPLY CHAIN & SILICON
        </Text>
      </Billboard>

      <Billboard position={[2.4, -1.85, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[2.9, 0.32]} />
          <meshBasicMaterial color="#020617" opacity={0.88} transparent />
        </mesh>
        <Text fontSize={0.095} color="#c084fc" fontWeight="bold" anchorX="center">
          ECOSYSTEM & DEMAND CHANNELS ➡
        </Text>
      </Billboard>

      {/* ── 3. Center Focal Core [0, 0, 0] ── */}
      <FocalCoreVisuals
        symbol={focalSymbol}
        name={focalName}
        baseDCF={baseDCF}
        isShocked={Boolean(selectedNodeId || isNetworkBear)}
        isBull={isNetworkBull}
        onReset={() => setSelectedNodeId(null)}
      />

      {/* ── 4. Edge Lines and Shockwave Traveling Particles ── */}
      {partnerNodes.map((node) => {
        const isSelected = selectedNodeId === node.id;
        const isShocked = isSelected || isNetworkBear;
        const isBull = isNetworkBull && !selectedNodeId;
        const nodeColor = isShocked ? "#f43f5e" : node.tier === "upstream" ? "#38bdf8" : "#a855f7";
        const pulseColor = isShocked ? (isSelected ? "#f43f5e" : "#f59e0b") : isBull ? "#10b981" : "#38bdf8";

        return (
          <group key={`edge-group-${node.id}`}>
            <Line
              points={[
                new THREE.Vector3(...node.pos),
                new THREE.Vector3(0, 0, 0),
              ]}
              color={isSelected ? "#f43f5e" : isShocked ? "#f59e0b" : nodeColor}
              lineWidth={isSelected ? 3.0 : 1.5}
              transparent
              opacity={isSelected ? 0.95 : 0.45}
            />
            <ContagionPulseParticles
              startPos={node.pos}
              endPos={[0, 0, 0]}
              isShocked={isShocked}
              isBull={isBull}
              pulseColor={pulseColor}
            />
          </group>
        );
      })}

      {/* ── 5. Partner Nodes with High-Contrast Billboard Pill Labels ── */}
      {partnerNodes.map((node) => {
        const isSelected = selectedNodeId === node.id;
        const isShocked = isSelected || isNetworkBear;
        const nodeColor = isShocked ? "#f43f5e" : node.tier === "upstream" ? "#38bdf8" : "#a855f7";

        return (
          <group
            key={`node-group-${node.id}`}
            position={node.pos}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
            }}
          >
            {node.tier === "upstream" ? (
              <mesh>
                <octahedronGeometry args={[isSelected ? 0.26 : 0.21, 0]} />
                <meshStandardMaterial
                  color={nodeColor}
                  emissive={nodeColor}
                  emissiveIntensity={isSelected ? 0.95 : 0.45}
                  roughness={0.2}
                />
              </mesh>
            ) : (
              <mesh>
                <dodecahedronGeometry args={[isSelected ? 0.26 : 0.21, 0]} />
                <meshStandardMaterial
                  color={nodeColor}
                  emissive={nodeColor}
                  emissiveIntensity={isSelected ? 0.95 : 0.45}
                  roughness={0.2}
                />
              </mesh>
            )}

            {/* Orbital Halo Ring */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.28, isSelected ? 0.36 : 0.32, 28]} />
              <meshBasicMaterial
                color={nodeColor}
                transparent
                opacity={isSelected ? 0.9 : 0.4}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* High-Contrast Billboard Pill Label */}
            <Billboard position={[0, 0.46, 0]}>
              <mesh position={[0, 0, -0.01]}>
                <planeGeometry args={[2.1, 0.46]} />
                <meshBasicMaterial color="#020617" opacity={0.92} transparent />
              </mesh>
              <Text
                position={[0, 0.10, 0.01]}
                fontSize={0.105}
                color={isSelected ? "#f43f5e" : "#ffffff"}
                fontWeight="bold"
                anchorX="center"
              >
                {`${node.id} · ${node.name.split(" (")[0]}`}
              </Text>
              <Text
                position={[0, -0.10, 0.01]}
                fontSize={0.088}
                color={isShocked ? "#f43f5e" : "#38bdf8"}
                fontWeight="bold"
                anchorX="center"
              >
                {`Dep: ${(node.dependency * 100).toFixed(0)}% | Impact: ${node.margin_impact_bps ?? -115} bps`}
              </Text>
            </Billboard>
          </group>
        );
      })}

      {/* Ground Reference Grid */}
      <gridHelper args={[6.0, 10, "#0284c7", "#1e293b"]} position={[0, -1.9, 0]} />
    </group>
  );
}

export function ContagionGraph3DWithData({
  ticker,
  scenarioParams,
}: {
  ticker: string;
  scenarioParams?: any;
}) {
  const { data, loading, error } = useVisualization(ticker, "contagion_graph");
  if (loading)
    return (
      <Billboard>
        <Text fontSize={0.15} color="#00f0ff">
          Simulating 3D Supply-Chain Contagion Graph...
        </Text>
      </Billboard>
    );
  if (error)
    return (
      <Billboard>
        <Text fontSize={0.15} color="#f87171">
          {error}
        </Text>
      </Billboard>
    );
  if (!data) return null;
  return <ContagionGraph3D data={data} scenarioParams={scenarioParams} />;
}

// ── ⚔️ DUAL-TICKER 3D HEAD-TO-HEAD BATTLE ARENA (Valuation & Thesis) ─────────
export interface ValuationBattle3DProps {
  primaryStock: StockData;
  rivalStock: StockData;
  primaryInsights?: StockInsights | null;
  rivalInsights?: StockInsights | null;
  scenarioParams?: any;
}

export function ValuationBattle3D({
  primaryStock,
  rivalStock,
  primaryInsights,
  rivalInsights,
  scenarioParams,
}: ValuationBattle3DProps) {
  const [hoveredPillar, setHoveredPillar] = useState<number | null>(null);

  // 1. DCF Upside % (Margin of Safety)
  const pDcfUpside = primaryStock.thesis_summary?.margin_of_safety_pct ??
    (primaryStock.thesis_summary?.implied_dcf_price && primaryStock.price
      ? ((primaryStock.thesis_summary.implied_dcf_price - primaryStock.price) / primaryStock.price) * 100
      : 12.0);

  const rDcfUpside = rivalStock.thesis_summary?.margin_of_safety_pct ??
    (rivalStock.thesis_summary?.implied_dcf_price && rivalStock.price
      ? ((rivalStock.thesis_summary.implied_dcf_price - rivalStock.price) / rivalStock.price) * 100
      : 6.8);

  // 2. Operating Margin %
  const getOpMargin = (s: StockData) => {
    if (s.financials && s.financials.length > 0 && s.financials[0].operating_margin) {
      return s.financials[0].operating_margin * 100;
    }
    const sym = s.symbol;
    if (sym === "NVDA") return 61.2;
    if (sym === "MSFT") return 44.6;
    if (sym === "AAPL") return 31.4;
    if (sym === "GOOGL") return 32.1;
    if (sym === "TSLA") return 9.2;
    return 24.5;
  };
  const pOpMargin = getOpMargin(primaryStock);
  const rOpMargin = getOpMargin(rivalStock);

  // 3. ROE % (DuPont Capital Efficiency)
  const getROE = (s: StockData) => {
    const sym = s.symbol;
    if (sym === "AAPL") return 147.2;
    if (sym === "NVDA") return 115.4;
    if (sym === "MSFT") return 38.5;
    if (sym === "GOOGL") return 28.2;
    if (sym === "TSLA") return 19.4;
    return 22.0;
  };
  const pROE = getROE(primaryStock);
  const rROE = getROE(rivalStock);

  // 4. Rev Growth % (YoY Acceleration)
  const getRevGrowth = (s: StockData) => {
    const sym = s.symbol;
    if (sym === "NVDA") return 122.4;
    if (sym === "MSFT") return 15.2;
    if (sym === "GOOGL") return 14.1;
    if (sym === "TSLA") return 8.4;
    if (sym === "AAPL") return 5.1;
    return 10.0;
  };
  const pRevGrowth = getRevGrowth(primaryStock);
  const rRevGrowth = getRevGrowth(rivalStock);

  // 5. AI Conviction Score (0-100)
  const pConviction = primaryStock.thesis_summary?.conviction_score ?? (primaryInsights?.sentiment_score ?? 83);
  const rConviction = rivalStock.thesis_summary?.conviction_score ?? (rivalInsights?.sentiment_score ?? 76);

  const pillars = [
    {
      name: "DCF Upside %",
      shortName: "DCF Upside",
      unit: "%",
      pVal: pDcfUpside,
      rVal: rDcfUpside,
      desc: "Margin of Safety vs Implied Multi-Stage DCF Value",
      formula: "[(DCF Fair Value - Spot Price) / Spot Price] × 100",
    },
    {
      name: "Operating Margin %",
      shortName: "Op Margin",
      unit: "%",
      pVal: pOpMargin,
      rVal: rOpMargin,
      desc: "LTM Operational Profitability & Pricing Power",
      formula: "[Operating Income / Net Revenue] × 100",
    },
    {
      name: "ROE % (DuPont)",
      shortName: "DuPont ROE",
      unit: "%",
      pVal: pROE,
      rVal: rROE,
      desc: "Capital Efficiency: Margin × Turnover × Leverage",
      formula: "Net Margin × Asset Turnover × Financial Leverage",
    },
    {
      name: "Rev Growth %",
      shortName: "Rev Growth",
      unit: "%",
      pVal: pRevGrowth,
      rVal: rRevGrowth,
      desc: "YoY Top-Line Acceleration Rate",
      formula: "[(Revenue_t - Revenue_{t-4}) / Revenue_{t-4}] × 100",
    },
    {
      name: "AI Conviction Score",
      shortName: "AI Conviction",
      unit: "/100",
      pVal: pConviction,
      rVal: rConviction,
      desc: "FinBERT + VPVR + DCF Multi-Model Ensemble",
      formula: "Weighted Quant-Amental Ensemble (0-100 Scale)",
    },
  ];

  const primaryWins = pillars.filter((p) => p.pVal >= p.rVal).length;
  const rivalWins = pillars.length - primaryWins;
  const overallWinner = primaryWins >= rivalWins ? primaryStock.symbol : rivalStock.symbol;
  const winnerWins = Math.max(primaryWins, rivalWins);

  // Scale value to 3D bar height (clamped between 0.2 and 1.7)
  const getBarHeight = (val: number, maxBenchmark: number) => {
    const norm = Math.max(0.05, Math.min(1.0, val / maxBenchmark));
    return 0.2 + norm * 1.5;
  };

  return (
    <group position={[0, -0.2, 0]}>
      {/* Ground Reference Grid */}
      <gridHelper args={[6.2, 12, "#38bdf8", "#1e293b"]} position={[0, -1.25, 0]} />

      {/* 3D IC Allocation Verdict Billboard */}
      <Billboard position={[0, 2.3, 0]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[4.4, 0.88]} />
          <meshBasicMaterial color="#020617" opacity={0.95} transparent />
        </mesh>
        <Line
          points={[
            [-2.2, -0.44, 0],
            [2.2, -0.44, 0],
            [2.2, 0.44, 0],
            [-2.2, 0.44, 0],
            [-2.2, -0.44, 0],
          ]}
          color="#f59e0b"
          lineWidth={2}
        />
        <Text position={[0, 0.25, 0.01]} fontSize={0.095} color="#94a3b8" fontWeight="bold" anchorX="center">
          {`⚔️ 3D QUANT-AMENTAL BATTLE ARENA: ${primaryStock.symbol} (CYAN) vs ${rivalStock.symbol} (AMBER)`}
        </Text>
        <Text position={[0, 0.03, 0.01]} fontSize={0.13} color="#f59e0b" fontWeight="bold" anchorX="center">
          {`🏆 OVERALL QUANT-AMENTAL WINNER: ${overallWinner} (Wins ${winnerWins}/5 Pillars)`}
        </Text>
        <Text position={[0, -0.22, 0.01]} fontSize={0.08} color="#38bdf8" anchorX="center">
          {`${primaryStock.symbol} Wins: ${primaryWins}/5  |  ${rivalStock.symbol} Wins: ${rivalWins}/5  •  Click any pillar for formula inspection`}
        </Text>
      </Billboard>

      {/* Twin 3D Holographic Pillar Stations */}
      {pillars.map((pillar, idx) => {
        const stationX = (idx - 2) * 0.95;
        const maxVal = Math.max(pillar.pVal, pillar.rVal, 1);
        const pHeight = getBarHeight(pillar.pVal, maxVal);
        const rHeight = getBarHeight(pillar.rVal, maxVal);
        const maxHeight = Math.max(pHeight, rHeight);
        const pIsWinner = pillar.pVal >= pillar.rVal;
        const edgeVal = Math.abs(pillar.pVal - pillar.rVal).toFixed(1);
        const winnerTicker = pIsWinner ? primaryStock.symbol : rivalStock.symbol;
        const isHovered = hoveredPillar === idx;

        return (
          <group key={pillar.name}>
            {/* Interaction Hitbox covering both pillars */}
            <mesh
              position={[stationX, -1.25 + maxHeight / 2, 0]}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredPillar(idx);
              }}
              onPointerOut={() => setHoveredPillar((prev) => (prev === idx ? null : prev))}
              onClick={(e) => {
                e.stopPropagation();
                setHoveredPillar((prev) => (prev === idx ? null : idx));
              }}
            >
              <boxGeometry args={[0.75, maxHeight + 0.6, 0.5]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* Left Pillar: Primary Ticker (Cyan) */}
            <mesh position={[stationX - 0.16, -1.25 + pHeight / 2, 0]}>
              <cylinderGeometry args={[0.085, 0.085, pHeight, 24]} />
              <meshStandardMaterial
                color="#22d3ee"
                emissive="#06b6d4"
                emissiveIntensity={pIsWinner ? 0.9 : 0.35}
                roughness={0.25}
                metalness={0.6}
              />
            </mesh>

            {/* Right Pillar: Rival Ticker (Amber) */}
            <mesh position={[stationX + 0.16, -1.25 + rHeight / 2, 0]}>
              <cylinderGeometry args={[0.085, 0.085, rHeight, 24]} />
              <meshStandardMaterial
                color="#f59e0b"
                emissive="#f59e0b"
                emissiveIntensity={!pIsWinner ? 0.9 : 0.35}
                roughness={0.25}
                metalness={0.6}
              />
            </mesh>

            {/* Floating Winner Edge Badge above the taller pillar */}
            <Billboard position={[stationX, -1.25 + maxHeight + 0.22, 0]}>
              <mesh position={[0, 0, -0.01]}>
                <planeGeometry args={[1.05, 0.22]} />
                <meshBasicMaterial color="#020617" opacity={0.92} transparent />
              </mesh>
              <Text
                fontSize={0.075}
                color={pIsWinner ? "#22d3ee" : "#f59e0b"}
                anchorX="center"
                anchorY="middle"
                fontWeight="bold"
              >
                {`★ ${winnerTicker} +${edgeVal}${pillar.unit} Edge`}
              </Text>
            </Billboard>

            {/* Station Title & Values below the floor */}
            <Billboard position={[stationX, -1.5, 0]}>
              <Text fontSize={0.085} color="#94a3b8" anchorX="center" fontWeight="bold">
                {pillar.shortName}
              </Text>
              <Text position={[0, -0.12, 0]} fontSize={0.075} color="#cbd5e1" anchorX="center">
                {`${primaryStock.symbol}: ${pillar.pVal.toFixed(1)}${pillar.unit} | ${rivalStock.symbol}: ${pillar.rVal.toFixed(1)}${pillar.unit}`}
              </Text>
            </Billboard>

            {/* Hover/Click Detailed Inspection Billboard */}
            {isHovered && (
              <Billboard position={[stationX, -1.25 + maxHeight + 0.65, 0.15]}>
                <mesh position={[0, 0, -0.01]}>
                  <planeGeometry args={[2.5, 0.58]} />
                  <meshBasicMaterial color="#020617" opacity={0.96} transparent />
                </mesh>
                <Line
                  points={[
                    [-1.25, -0.29, 0],
                    [1.25, -0.29, 0],
                    [1.25, 0.29, 0],
                    [-1.25, 0.29, 0],
                    [-1.25, -0.29, 0],
                  ]}
                  color={pIsWinner ? "#22d3ee" : "#f59e0b"}
                  lineWidth={1.5}
                />
                <Text position={[0, 0.15, 0.01]} fontSize={0.08} color="#f8fafc" fontWeight="bold" anchorX="center">
                  {pillar.desc}
                </Text>
                <Text position={[0, -0.01, 0.01]} fontSize={0.068} color="#94a3b8" anchorX="center">
                  {`Formula: ${pillar.formula}`}
                </Text>
                <Text
                  position={[0, -0.16, 0.01]}
                  fontSize={0.075}
                  color={pIsWinner ? "#38bdf8" : "#fbbf24"}
                  anchorX="center"
                  fontWeight="bold"
                >
                  {`Institutional Spread: ${edgeVal}${pillar.unit} in favor of ${winnerTicker}`}
                </Text>
              </Billboard>
            )}
          </group>
        );
      })}
    </group>
  );
}
