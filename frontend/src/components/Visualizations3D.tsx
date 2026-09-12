"use client";

import React, { useMemo } from "react";
import * as THREE from "three";
import { Text, Billboard, Line } from "@react-three/drei";
import { useVisualization } from "../hooks/useVisualization";

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

// ── DUPONT TREE ─────────────────────────────────────────────────────────
export function DuPontTree({ data }: { data: any }) {
  if (!data || !data.dimensions || !data.dimensions.lattice) return null;
  const latest = data.dimensions.lattice[0];
  if (!latest) return null;
  
  const roe = (latest.margin / 100) * latest.turnover * latest.leverage * 100;

  const topNode = new THREE.Vector3(0, 1.5, 0); // Normalized down from 2 to 1.5 so it fits nicely
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

      {/* Nodes */}
      <group position={topNode}>
        <mesh>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.6} />
        </mesh>
        <Billboard position={[0, 0.5, 0]}>
          <Text fontSize={0.15} color="#ffffff">ROE</Text>
          <Text fontSize={0.12} color="#00f0ff" position={[0, -0.2, 0]}>{roe.toFixed(1)}%</Text>
        </Billboard>
      </group>

      <group position={marginNode}>
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.3} />
        </mesh>
        <Billboard position={[0, -0.4, 0]}>
          <Text fontSize={0.12} color="#ffffff">Net Margin</Text>
          <Text fontSize={0.1} color="#38bdf8" position={[0, -0.15, 0]}>{latest.margin.toFixed(1)}%</Text>
        </Billboard>
      </group>

      <group position={turnoverNode}>
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.3} />
        </mesh>
        <Billboard position={[0, -0.4, 0]}>
          <Text fontSize={0.12} color="#ffffff">Turnover</Text>
          <Text fontSize={0.1} color="#38bdf8" position={[0, -0.15, 0]}>{latest.turnover.toFixed(2)}x</Text>
        </Billboard>
      </group>

      <group position={leverageNode}>
        <mesh>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color={leverageAlert ? "#ef4444" : "#38bdf8"} emissive={leverageAlert ? "#ef4444" : "#38bdf8"} emissiveIntensity={leverageAlert ? 0.8 : 0.3} />
        </mesh>
        <Billboard position={[0, -0.4, 0]}>
          <Text fontSize={0.12} color="#ffffff">Leverage</Text>
          <Text fontSize={0.1} color={leverageAlert ? "#ef4444" : "#38bdf8"} position={[0, -0.15, 0]}>{latest.leverage.toFixed(2)}x</Text>
        </Billboard>
      </group>
    </group>
  );
}

export function DuPontTreeWithData({ ticker }: { ticker: string }) {
  const { data, loading, error } = useVisualization(ticker, "dupont");
  if (loading) return <Billboard><Text fontSize={0.15} color="#00f0ff">Loading DuPont Tree...</Text></Billboard>;
  if (error) return <Billboard><Text fontSize={0.15} color="#f87171">{error}</Text></Billboard>;
  if (!data) return null;
  return <DuPontTree data={data} />;
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
export function PeerScatterCloud({ data, ticker }: { data: any, ticker: string }) {
  if (!data || !data.dimensions || !data.dimensions.peers) return null;
  const peers = data.dimensions.peers;

  // X: P/E, Y: ROE %, Z: Rev Growth %
  const peList = peers.map((p: any) => p.pe);
  const roeList = peers.map((p: any) => p.roe);
  const revList = peers.map((p: any) => p.rev_growth);

  const minPE = Math.min(...peList), maxPE = Math.max(...peList);
  const minROE = Math.min(...roeList), maxROE = Math.max(...roeList);
  const minRev = Math.min(...revList), maxRev = Math.max(...revList);

  const norm = (val: number, min: number, max: number) => {
    if (min === max) return 0; // Gotcha 1: Zero-Division Trap
    return -2 + ((val - min) / (max - min)) * 4;
  };

  return (
    <group>
      {peers.map((p: any, i: number) => {
        const x = norm(p.pe, minPE, maxPE);
        const y = norm(p.roe, minROE, maxROE);
        const z = norm(p.rev_growth, minRev, maxRev);

        const isTarget = p.ticker === ticker || p.is_target;
        const color = isTarget ? "#00f0ff" : "#475569";
        const emissiveIntensity = isTarget ? 1.2 : 0;
        const opacity = isTarget ? 1 : 0.6;

        return (
          <group key={p.ticker} position={[x, y, z]}>
            <mesh>
              <sphereGeometry args={[0.15, 16, 16]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} transparent opacity={opacity} />
            </mesh>
            <Billboard position={[0, 0.3, 0]}>
              <Text fontSize={0.12} color={isTarget ? "#ffffff" : "#cbd5e1"}>{p.ticker}</Text>
            </Billboard>
          </group>
        );
      })}
      
      {/* Draw faint axis lines for reference */}
      <Line points={[[-2, -2, 0], [2, -2, 0]]} color="#334155" />
      <Line points={[[-2, -2, 0], [-2, 2, 0]]} color="#334155" />
      <Line points={[[-2, -2, -2], [-2, -2, 2]]} color="#334155" />
      <Billboard position={[0, -2.2, 0]}><Text fontSize={0.1} color="#64748b">P/E (X)</Text></Billboard>
      <Billboard position={[-2.2, 0, 0]}><Text fontSize={0.1} color="#64748b">ROE (Y)</Text></Billboard>
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

// ── DCF TERRAIN ─────────────────────────────────────────────────────────────
export function DCFTerrain({ data }: { data: any }) {
  if (!data || !data.dimensions || !data.dimensions.prices) return null;
  const { wacc, growth, prices, current_price } = data.dimensions;

  const waccRange = wacc; // X axis
  const growthRange = growth; // Z axis
  const matrix = prices; // 2D array of Y values

  // Find min and max prices to normalize Y to [-2, 2]
  const allPrices = matrix.flat();
  const minPrice = Math.min(...allPrices, current_price);
  const maxPrice = Math.max(...allPrices, current_price);

  const normY = (p: number) => {
    if (minPrice === maxPrice) return 0;
    return -2 + ((p - minPrice) / (maxPrice - minPrice)) * 4;
  };

  const normX = (i: number) => -2 + (4 / (waccRange.length - 1)) * i;
  const normZ = (j: number) => -2 + (4 / (growthRange.length - 1)) * j;

  const normalizedCurrentPriceY = normY(current_price);

  return (
    <group>
      {/* The Grid Spheres */}
      {matrix.map((row: number[], i: number) => 
        row.map((price: number, j: number) => {
          const y = normY(price);
          const isUndervalued = price > current_price;
          const color = isUndervalued ? "#10b981" : "#f43f5e"; // Green if implied price > current (undervalued), Red if overvalued

          return (
            <mesh key={`${i}-${j}`} position={[normX(i), y, normZ(j)]}>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
            </mesh>
          );
        })
      )}

      {/* Row Lines (along Z axis for each X) */}
      {matrix.map((row: number[], i: number) => {
        const points = row.map((price: number, j: number) => new THREE.Vector3(normX(i), normY(price), normZ(j)));
        return <Line key={`row-${i}`} points={points} color="#38bdf8" lineWidth={1} transparent opacity={0.4} />;
      })}

      {/* Column Lines (along X axis for each Z) */}
      {growthRange.map((_: any, j: number) => {
        const points = matrix.map((row: number[], i: number) => new THREE.Vector3(normX(i), normY(row[j]), normZ(j)));
        return <Line key={`col-${j}`} points={points} color="#38bdf8" lineWidth={1} transparent opacity={0.4} />;
      })}

      {/* Intersection Plane at Current Price (Gotcha 3 handled here) */}
      <mesh position={[0, normalizedCurrentPriceY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      
      {/* Label for Current Price Plane */}
      <Billboard position={[2.2, normalizedCurrentPriceY, 0]}>
        <Text fontSize={0.12} color="#ffffff">Current P: ${current_price.toFixed(2)}</Text>
      </Billboard>
    </group>
  );
}

export function DCFTerrainWithData({ ticker }: { ticker: string }) {
  const { data, loading, error } = useVisualization(ticker, "dcf_terrain");
  if (loading) return <Billboard><Text fontSize={0.15} color="#00f0ff">Loading DCF Terrain...</Text></Billboard>;
  if (error) return <Billboard><Text fontSize={0.15} color="#f87171">{error}</Text></Billboard>;
  if (!data) return null;
  return <DCFTerrain data={data} />;
}
