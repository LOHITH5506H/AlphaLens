"use client";

import React, { useMemo } from "react";
import * as THREE from "three";
import { Text, Billboard, Line } from "@react-three/drei";
import { useVisualization } from "../hooks/useVisualization";
import { computeScenarioDCF } from "@/lib/mathUtils";

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
}

export function VPVRWall({ data, candleMinPrice, candleMaxPrice }: VPVRWallProps) {
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
    // Position behind the candlesticks (Z = -0.5) and anchored to the right edge
    <group position={[W / 2 + 0.1, 0, -0.5]}>
      {nodes.map((node, i) => {
        const yPos = scaleY(node.price);
        // Clamp to visible range (don't render bars way off the chart)
        if (yPos < -CHART_HEIGHT * 0.6 || yPos > CHART_HEIGHT * 0.6) return null;

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
            {/* Label the Point of Control */}
            {node.is_poc && (
              <Billboard position={[-barLength / 2 - 0.3, 0, 0]}>
                <Text fontSize={0.1} color="#ffd700" anchorX="right">
                  POC ${node.price.toFixed(0)}
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
export function VPVRWallWithData({ ticker, candleMinPrice, candleMaxPrice }: { 
  ticker: string; 
  candleMinPrice: number; 
  candleMaxPrice: number; 
}) {
  const { data, loading, error } = useVisualization(ticker, "vpvr");

  if (loading) return <Billboard position={[2, 0, 0]}><Text fontSize={0.15} color="#00f0ff">Loading VPVR...</Text></Billboard>;
  if (error) return <Billboard position={[2, 0, 0]}><Text fontSize={0.15} color="#f87171">{error}</Text></Billboard>;
  if (!data) return null;

  return <VPVRWall data={data} candleMinPrice={candleMinPrice} candleMaxPrice={candleMaxPrice} />;
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

  return (
    <group position={[0, -0.5, 0]}>
      {/* Lines connecting nodes */}
      <Line points={[marginNode, topNode]} color="#94a3b8" lineWidth={2} transparent opacity={0.4} />
      <Line points={[turnoverNode, topNode]} color="#94a3b8" lineWidth={2} transparent opacity={0.4} />
      <Line points={[leverageNode, topNode]} color="#94a3b8" lineWidth={2} transparent opacity={0.4} />

      {/* Root Node (ROE) with Dark Plate Backing — Never Collides with Sphere Rim */}
      <group position={topNode}>
        <mesh>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.6} />
        </mesh>
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
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial 
            color={marginDelta > 0 ? "#10b981" : marginDelta < 0 ? "#ef4444" : "#38bdf8"} 
            emissive={marginDelta > 0 ? "#10b981" : marginDelta < 0 ? "#ef4444" : "#38bdf8"} 
            emissiveIntensity={marginDelta !== 0 ? 0.6 : 0.3} 
          />
        </mesh>
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
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.3} />
        </mesh>
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
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color={leverageAlert ? "#ef4444" : "#38bdf8"} emissive={leverageAlert ? "#ef4444" : "#38bdf8"} emissiveIntensity={leverageAlert ? 0.8 : 0.3} />
        </mesh>
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

  // X: P/E, Y: ROE %, Z: Rev Growth %
  const peList = peers.map((p: any) => p.pe);
  const roeList = peers.map((p: any) => p.roe);
  const revList = peers.map((p: any) => p.rev_growth);

  const minPE = Math.min(...peList);
  const maxPE = Math.max(...peList);
  const minROE = Math.min(...roeList);
  const maxROE = Math.max(...roeList);
  const minRev = Math.min(...revList);
  const maxRev = Math.max(...revList);

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

      {/* Quadrant Legend Labels (Positioned at bottom floor corners to avoid colliding with top peers) */}
      <Billboard position={[-1.3, -2.1, -1.8]}>
        <Text fontSize={0.10} color="#10b981" anchorX="center" fontWeight="bold">
          ★ ALPHA QUADRANT (High ROE / Low P/E)
        </Text>
      </Billboard>
      <Billboard position={[1.3, -2.1, -1.8]}>
        <Text fontSize={0.095} color="#38bdf8" anchorX="center" fontWeight="bold">
          Quality Premium (High ROE / High P/E)
        </Text>
      </Billboard>

      {/* Peer Spheres */}
      {peers.map((p: any) => {
        const x = normLinear(p.pe, minPE, maxPE);
        const y = normLog(p.roe, minROE, maxROE, 90);
        const z = normLinear(p.rev_growth, minRev, maxRev);

        const isTarget = p.ticker === ticker || p.is_target;
        const color = isTarget ? "#00f0ff" : "#64748b";
        const emissiveIntensity = isTarget ? 1.4 : 0.2;
        const opacity = isTarget ? 1.0 : 0.7;

        // Drop line height from peer node to grid floor
        const dropHeight = y - -2;

        return (
          <group key={p.ticker} position={[x, y, z]}>
            {/* Pulsing ring around active ticker */}
            {isTarget && (
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.22, 0.26, 32]} />
                <meshBasicMaterial color="#00f0ff" transparent opacity={0.8} side={THREE.DoubleSide} />
              </mesh>
            )}

            <mesh>
              <sphereGeometry args={[isTarget ? 0.16 : 0.12, 16, 16]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={emissiveIntensity}
                transparent
                opacity={opacity}
              />
            </mesh>

            {/* Rich 3D text label displaying True Raw Metrics with Dark Pill Plate */}
            <Billboard position={[0, isTarget ? 0.48 : 0.38, 0]}>
              <mesh position={[0, -0.05, -0.01]}>
                <planeGeometry args={[isTarget ? 1.8 : 1.45, 0.44]} />
                <meshBasicMaterial color="#020617" opacity={0.88} transparent />
              </mesh>
              <Text fontSize={isTarget ? 0.13 : 0.10} color={isTarget ? "#ffffff" : "#cbd5e1"} anchorX="center" fontWeight="bold">
                {p.ticker}
              </Text>
              <Text fontSize={0.085} color={isTarget ? "#00f0ff" : "#94a3b8"} position={[0, -0.13, 0.01]} anchorX="center" fontWeight="bold">
                {`ROE: ${p.roe.toFixed(1)}% · P/E: ${p.pe.toFixed(1)}x`}
              </Text>
            </Billboard>

            {/* Reference Drop Line to Grid Floor */}
            <Line
              points={[[0, 0, 0], [0, -dropHeight, 0]]}
              color={isTarget ? "#00f0ff" : "#334155"}
              lineWidth={isTarget ? 2 : 1}
              transparent
              opacity={isTarget ? 0.7 : 0.4}
            />
          </group>
        );
      })}

      {/* Axis Lines */}
      <Line points={[[-2, -2, 0], [2, -2, 0]]} color="#38bdf8" lineWidth={1.5} />
      <Line points={[[-2, -2, 0], [-2, 2, 0]]} color="#38bdf8" lineWidth={1.5} />
      <Line points={[[-2, -2, -2], [-2, -2, 2]]} color="#38bdf8" lineWidth={1.5} />

      {/* Labeled Axes with ASCII Symbol (No missing Unicode glyph) */}
      <Billboard position={[0, -2.35, 0]}>
        <Text fontSize={0.12} color="#38bdf8">P/E Multiple (X) →</Text>
      </Billboard>
      <Billboard position={[-2.45, 0, 0]}>
        <Text fontSize={0.12} color="#38bdf8">ROE % (Y-Axis) ^</Text>
      </Billboard>
      <Billboard position={[0, -2.35, 2.2]}>
        <Text fontSize={0.12} color="#38bdf8">Rev Growth % (Z) →</Text>
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

          return (
            <group key={`${i}-${j}`} position={[x, y, z]}>
              <mesh>
                <sphereGeometry args={[isBaseCaseNode ? 0.15 : 0.08, 16, 16]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={isBaseCaseNode ? 1.0 : 0.45}
                />
              </mesh>

              {/* Base Case Node Highlight: Pulsing Cyan Ring & Elevated Billboard with Dark Backing Plate */}
              {isBaseCaseNode && (
                <>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.22, 0.28, 32]} />
                    <meshBasicMaterial color="#00f0ff" transparent opacity={0.85} side={THREE.DoubleSide} />
                  </mesh>
                  <Billboard position={[0, 1.25, 0]}>
                    <mesh position={[0, 0, -0.01]}>
                      <planeGeometry args={[2.5, 0.65]} />
                      <meshBasicMaterial color="#020617" opacity={0.9} transparent />
                    </mesh>
                    <Text fontSize={0.12} color="#00f0ff" anchorX="center" position={[0, 0.12, 0.01]} fontWeight="bold">
                      ◈ BASE CASE FAIR VALUE
                    </Text>
                    <Text fontSize={0.11} color="#ffffff" position={[0, -0.12, 0.01]} anchorX="center" fontWeight="bold">
                      {`$${activeBaseFairValue.toFixed(2)} (${dcfResult.upsideLabel})`}
                    </Text>
                  </Billboard>
                </>
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
      <Billboard position={[-W_SPAN / 2 - 0.35, -1.45, 0]}>
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
