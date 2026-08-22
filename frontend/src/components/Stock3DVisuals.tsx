"use client";

import React, { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Text, Float, Line } from "@react-three/drei";
import type { StockData, AIAnalysis } from "@/types";

interface Stock3DVisualsProps {
  data: StockData;
  aiAnalysis?: AIAnalysis | null;
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

// ── 3. Main Holographic Dashboard Component ────────────────────────────────
export default function Stock3DVisuals({ data, aiAnalysis }: Stock3DVisualsProps) {
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "RIBBON" | "AI">("OVERVIEW");
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

  // Sci-Fi Color Spectrum
  const holoColor = isPositive ? "#00f0ff" : "#ff0055";
  const holoColorAlt = isPositive ? "#00ff88" : "#ff4400";
  const score = aiAnalysis?.score ?? 0.85;
  const sentiment = (aiAnalysis?.label ?? "neutral").toUpperCase();

  // 3D Extruded Ribbon Points (Intraday Trendline)
  const { ribbonPoints, ribbonMeshPoints } = useMemo(() => {
    const count = 16;
    const width = 3.6;
    const pts: [number, number, number][] = [];
    const meshPts: THREE.Vector3[] = [];
    const range = Math.max(high - low, 0.01);

    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const x = -1.8 + progress * width;
      // Synthesize realistic financial wave variance
      const wave = Math.sin(progress * Math.PI * 2.5) * 0.4 + Math.cos(progress * Math.PI * 4) * 0.2;
      const val = open + (price - open) * progress + wave * (high - low) * 0.3;
      const y = -0.3 + ((val - low) / range) * 1.2;
      const z = Math.sin(progress * Math.PI) * 0.25;

      pts.push([x, y, z]);
      meshPts.push(new THREE.Vector3(x, y, z));
    }
    return { ribbonPoints: pts, ribbonMeshPoints: meshPts };
  }, [open, price, high, low]);

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

        {/* ── 1. Holographic Floor Grid ── */}
        <group position={[0, -2.0, 0]} rotation={[-Math.PI / 2.3, 0, 0]}>
          <gridHelper args={[8, 16, holoColor, "#0f2744"]} />
          <GyroRing radius={3.5} tube={0.015} speed={0.15} axis="z" color={holoColor} opacity={0.3} />
        </group>

        {/* ── 2. Top Header HUD: Floating Ticker & Volumetric Price ── */}
        <group position={[0, 1.8, 0.2]}>
          {/* Holographic Framing Bracket */}
          <Line
            points={[
              [-3.2, 0.4, 0],
              [-3.4, 0.4, 0],
              [-3.4, -0.4, 0],
              [-3.0, -0.4, 0],
            ]}
            color={holoColor}
            lineWidth={2}
            transparent
            opacity={0.8}
          />
          <Line
            points={[
              [3.2, 0.4, 0],
              [3.4, 0.4, 0],
              [3.4, -0.4, 0],
              [3.0, -0.4, 0],
            ]}
            color={holoColor}
            lineWidth={2}
            transparent
            opacity={0.8}
          />

          {/* Symbol */}
          <Text position={[-3.0, 0.1, 0]} fontSize={0.6} color="#ffffff" anchorX="left" anchorY="middle">
            {symbol}
          </Text>
          <Text position={[-3.0, -0.3, 0]} fontSize={0.16} color={holoColor} anchorX="left" anchorY="middle">
            {`// QUANT_STREAM: LIVE`}
          </Text>

          {/* Live Price with Neon Glow */}
          <Text position={[3.0, 0.1, 0]} fontSize={0.65} color="#ffffff" anchorX="right" anchorY="middle">
            {`$${price.toFixed(2)}`}
          </Text>
          <Text position={[3.0, -0.32, 0]} fontSize={0.2} color={holoColor} anchorX="right" anchorY="middle">
            {`${isPositive ? "▲ +" : "▼ "}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`}
          </Text>
        </group>

        {/* ── 3. Interactive 3D Mode Selector Tabs ── */}
        <group position={[0, 1.1, 0.2]}>
          {(["OVERVIEW", "RIBBON", "AI"] as const).map((tab, idx) => {
            const isSelected = activeTab === tab;
            const xPos = (idx - 1) * 1.8;
            return (
              <group
                key={tab}
                position={[xPos, 0, 0]}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab(tab);
                }}
              >
                {/* 3D Tab Base */}
                <mesh position={[0, 0, 0]}>
                  <boxGeometry args={[1.5, 0.26, 0.05]} />
                  <meshBasicMaterial
                    color={isSelected ? holoColor : "#0a192f"}
                    transparent
                    opacity={isSelected ? 0.35 : 0.6}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
                <Text position={[0, 0, 0.05]} fontSize={0.13} color={isSelected ? "#ffffff" : "#64748b"}>
                  {tab}
                </Text>
              </group>
            );
          })}
        </group>

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
        {(activeTab === "OVERVIEW" || activeTab === "AI") && (
          <group position={[activeTab === "OVERVIEW" ? 1.8 : 0, -0.2, 0.2]}>
            <Text position={[0, 1.1, 0]} fontSize={0.16} color={holoColor} anchorX="center">
              ◈ FINBERT_NEURAL_SYNAPSE
            </Text>

            {/* Pulsing Energy Core */}
            <group ref={coreRef} position={[0, 0.2, 0]}>
              <mesh>
                <icosahedronGeometry args={[0.55, 1]} />
                <meshBasicMaterial
                  color={holoColor}
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

            {/* Orbital Gyroscopic HUD Rings */}
            <group position={[0, 0.2, 0]}>
              <GyroRing radius={0.85} tube={0.015} speed={0.8} axis="z" color={holoColor} opacity={0.7} />
              <GyroRing radius={1.05} tube={0.01} speed={-0.6} axis="y" color={holoColorAlt} opacity={0.5} />
              <GyroRing radius={1.2} tube={0.008} speed={0.4} axis="x" color="#ffffff" opacity={0.3} />
            </group>

            {/* Score & Sentiment Classification */}
            <Text position={[0, -0.7, 0]} fontSize={0.32} color="#ffffff" anchorX="center" anchorY="middle">
              {`${(score * 100).toFixed(0)}%`}
            </Text>
            <Text position={[0, -0.98, 0]} fontSize={0.16} color={holoColor} anchorX="center" anchorY="middle">
              {`[ ${sentiment} ]`}
            </Text>
          </group>
        )}

        {/* ── 5. Holographic Bottom Status Telemetry ── */}
        <group position={[0, -1.6, 0.2]}>
          <Line
            points={[
              [-3.0, 0, 0],
              [3.0, 0, 0],
            ]}
            color={holoColor}
            lineWidth={1}
            transparent
            opacity={0.3}
          />
          <Text position={[-2.4, -0.2, 0]} fontSize={0.13} color="#64748b" anchorX="center">
            {`VOL: ${(volume / 1000000).toFixed(2)}M`}
          </Text>
          <Text position={[0, -0.2, 0]} fontSize={0.13} color="#64748b" anchorX="center">
            {`RANGE: $${low.toFixed(1)} - $${high.toFixed(1)}`}
          </Text>
          <Text position={[2.4, -0.2, 0]} fontSize={0.13} color={holoColor} anchorX="center">
            {`AI_CONF: ${(score * 100).toFixed(0)}%`}
          </Text>
        </group>
      </group>
    </Float>
  );
}