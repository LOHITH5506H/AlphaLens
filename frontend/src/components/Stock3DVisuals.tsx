import React, { useState } from 'react';
import * as THREE from 'three';
import { Text, Float, MeshTransmissionMaterial, useGLTF } from '@react-three/drei';
import type { StockData, AIAnalysis } from '@/types';
import { formatPrice } from '@/lib/constants';

interface StockVisualsProps {
  data: StockData;
  aiAnalysis?: AIAnalysis | null;
}

/**
 * OPTIMIZATION: Draco Compressed GLTF Model Structure
 * Uncomment and use this component to load highly optimized 3D assets.
 * 
 * Usage: <OptimizedModel url="/models/your-bull-bear-model.glb" scale={0.5} />
 */
export function OptimizedModel({ url, scale = 1, position = [0,0,0] }: { url: string, scale?: number, position?: [number,number,number] }) {
  // Pre-load with draco decoder
  // const { scene } = useGLTF(url, 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  // return <primitive object={scene} scale={scale} position={position} />;
  return null; 
}

export default function Stock3DVisuals({ data, aiAnalysis }: StockVisualsProps) {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  const history = data.price_history || [];
  const isUp = history.length >= 2 
    ? (data.current_price || 0) >= history[history.length - 2].close 
    : true;
    
  const primaryColor = isUp ? "#10b981" : "#ef4444"; 
  
  // Bar Chart calculations
  const recentHistory = history.slice(-20);
  const minPrice = Math.min(...recentHistory.map(h => h.close));
  const maxPrice = Math.max(...recentHistory.map(h => h.close));
  const priceRange = maxPrice - minPrice || 1;
  const barWidth = 0.04;
  const spacing = 0.015;
  const chartWidth = recentHistory.length * (barWidth + spacing);
  const startX = -chartWidth / 2 + (barWidth / 2);

  return (
    <group>
      {/* Sleek Glass Background Pedestal utilizing PBR Transmission */}
      <Float speed={2} rotationIntensity={0.05} floatIntensity={0.1}>
        <mesh position={[0, 0.35, -0.05]} castShadow receiveShadow>
          <boxGeometry args={[1.4, 1.2, 0.02]} />
          <MeshTransmissionMaterial 
            backside
            samples={4}
            thickness={0.1}
            chromaticAberration={0.05}
            anisotropy={0.1}
            distortion={0.1}
            distortionScale={0.5}
            temporalDistortion={0.0}
            color="#ffffff"
            transmission={0.9}
            roughness={0.1}
            metalness={0.2}
            clearcoat={1}
            clearcoatRoughness={0.1}
          />
        </mesh>

        {/* Ticker Symbol */}
        <Text
          position={[0, 0.75, 0]}
          fontSize={0.18}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.005}
          outlineColor="#000000"
          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjQ.ttf"
        >
          {data.ticker}
        </Text>

        {/* Current Price */}
        <Text
          position={[0, 0.55, 0]}
          fontSize={0.25}
          color={primaryColor}
          anchorX="center"
          anchorY="middle"
          font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjQ.ttf"
        >
          {formatPrice(data.current_price)}
          <meshBasicMaterial toneMapped={false} color={primaryColor} />
        </Text>

        {/* AI Analysis Overlay */}
        {aiAnalysis && (
          <Text
            position={[0, 0.35, 0]}
            fontSize={0.07}
            color={
              aiAnalysis.positive > Math.max(aiAnalysis.neutral, aiAnalysis.negative) ? '#10b981' : 
              aiAnalysis.negative > Math.max(aiAnalysis.positive, aiAnalysis.neutral) ? '#ef4444' : 
              '#fbbf24'
            }
            anchorX="center"
            anchorY="middle"
          >
            {`AI: ${
              aiAnalysis.positive > Math.max(aiAnalysis.neutral, aiAnalysis.negative) ? 'Positive' : 
              aiAnalysis.negative > Math.max(aiAnalysis.positive, aiAnalysis.neutral) ? 'Negative' : 
              'Neutral'
            } (${Math.max(aiAnalysis.positive, aiAnalysis.neutral, aiAnalysis.negative).toFixed(1)}%)`}
          </Text>
        )}

        {/* 3D Bar Chart */}
        <group position={[0, -0.1, 0.1]}>
          {recentHistory.map((point, i) => {
            const normalizedHeight = ((point.close - minPrice) / priceRange) * 0.4 + 0.05;
            const barIsUp = i === 0 || point.close >= recentHistory[i - 1].close;
            const barColor = barIsUp ? "#10b981" : "#ef4444";
            
            return (
              <group key={i} position={[startX + i * (barWidth + spacing), normalizedHeight / 2, 0]}>
                <mesh 
                  castShadow
                  onPointerOver={(e) => { e.stopPropagation(); setHoveredBar(i); }}
                  onPointerOut={(e) => { e.stopPropagation(); setHoveredBar(null); }}
                >
                  <boxGeometry args={[barWidth, normalizedHeight, barWidth]} />
                  <meshPhysicalMaterial 
                    color={barColor}
                    metalness={0.9}
                    roughness={0.1}
                    emissive={barColor}
                    emissiveIntensity={hoveredBar === i ? 3 : 1.5} // Intense glow on hover
                    toneMapped={false} // Extremely critical: bypasses tonemapping so Bloom can catch emissive values > 1
                  />
                </mesh>

                {/* Interactive Tooltip using R3F pointer events */}
                {hoveredBar === i && (
                  <Text
                    position={[0, normalizedHeight / 2 + 0.05, 0.05]}
                    fontSize={0.06}
                    color="#ffffff"
                    anchorX="center"
                    anchorY="bottom"
                    outlineWidth={0.005}
                    outlineColor="#000000"
                  >
                    ${point.close.toFixed(2)}
                  </Text>
                )}
              </group>
            );
          })}
        </group>
      </Float>
    </group>
  );
}
