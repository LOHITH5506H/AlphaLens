import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import gsap from 'gsap';

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ForecastData {
  time: number;
  price: number;
  variance: number; // Dictates the tube radius/confidence bounds
}

export interface TrajectoryProps {
  historicalData: CandleData[];
  forecastData: ForecastData[];
}

export function Trajectory({ historicalData, forecastData }: TrajectoryProps) {
  const tubeMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Map historical data to 3D volumetric candlesticks
  const candlesticks = useMemo(() => {
    return historicalData.map((d, i) => {
      const isUp = d.close >= d.open;
      const color = isUp ? "#00ffaa" : "#ff0055";
      
      const bodyHeight = Math.max(Math.abs(d.close - d.open), 0.05);
      const bodyY = Math.min(d.open, d.close) + bodyHeight / 2;
      
      const wickHeight = Math.max(d.high - d.low, 0.05);
      const wickY = d.low + wickHeight / 2;
      
      return { x: i * 2, bodyHeight, bodyY, wickHeight, wickY, color };
    });
  }, [historicalData]);

  // Construct forecast tube path representing predictive confidence corridors
  const tubeGeometry = useMemo(() => {
    if (forecastData.length < 2) return null;
    
    const startX = historicalData.length * 2;
    const points = forecastData.map((d, i) => new THREE.Vector3(startX + i * 2, d.price, 0));
    
    // Interpolate points for a smooth trajectory curve
    const curve = new THREE.CatmullRomCurve3(points);
    
    // Base tube with default radius 1
    const segments = forecastData.length * 4;
    const geo = new THREE.TubeGeometry(curve, segments, 1, 16, false);
    
    const pos = geo.attributes.position;
    const uvs = geo.attributes.uv;
    
    // Pre-allocate vectors outside the loop to avoid GC pressure
    const center = new THREE.Vector3();
    const vertex = new THREE.Vector3();
    const dir = new THREE.Vector3();
    
    // Modify vertices to map variance to the tube's radius
    for (let i = 0; i < pos.count; i++) {
      const u = uvs.getX(i);
      
      // Interpolate variance along the curve 'u' parameter (0 to 1)
      const exactIndex = u * (forecastData.length - 1);
      const index = Math.floor(exactIndex);
      const nextIndex = Math.min(index + 1, forecastData.length - 1);
      const frac = exactIndex - index;
      
      const v0 = forecastData[index]?.variance || 1;
      const v1 = forecastData[nextIndex]?.variance || 1;
      // Multiply variance by 0.05 for a sleek funnel
      const interpolatedVariance = (v0 + (v1 - v0) * frac) * 0.05;
      
      // Determine new vertex position based on curve center at `u`
      curve.getPointAt(u, center);
      vertex.fromBufferAttribute(pos, i);
      dir.subVectors(vertex, center).normalize();
      
      // Scale vertex offset from center by the confidence variance
      vertex.copy(center).add(dir.multiplyScalar(interpolatedVariance));
      pos.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    
    geo.computeVertexNormals();
    return geo;
  }, [historicalData.length, forecastData]);

  // Entrance scaling animation
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.scale.set(0, 0, 0);
      gsap.to(groupRef.current.scale, {
        x: 1, y: 1, z: 1,
        duration: 2,
        ease: "elastic.out(1, 0.7)"
      });
    }
  }, [historicalData, forecastData]);

  return (
    <group ref={groupRef}>
      {/* Historical 3D Volumetric Candlesticks */}
      {candlesticks.map((candle, i) => (
        <group key={`candle-${i}`} position={[candle.x, 0, 0]}>
          {/* Wick */}
          <mesh position={[0, candle.wickY, 0]}>
            <cylinderGeometry args={[0.05, 0.05, candle.wickHeight]} />
            <meshStandardMaterial color={candle.color} />
          </mesh>
          {/* Body */}
          <mesh position={[0, candle.bodyY, 0]}>
            <boxGeometry args={[0.8, candle.bodyHeight, 0.8]} />
            <meshStandardMaterial color={candle.color} />
          </mesh>
          
          {/* Billboarded Value Label (every 5th candle) */}
          {i % 5 === 0 && (
            <Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, candle.wickY + candle.wickHeight / 2 + 1, 0]}>
              <Text fontSize={0.5} color="white" anchorX="center" anchorY="middle">
                {historicalData[i].close.toFixed(2)}
              </Text>
            </Billboard>
          )}
        </group>
      ))}

      {/* Forecast Confidence Corridor Tube */}
      {tubeGeometry && (
        <mesh geometry={tubeGeometry}>
          <meshPhysicalMaterial 
            ref={tubeMaterialRef}
            color="#00ffff"
            emissive="#0088ff"
            emissiveIntensity={0.2}
            transparent
            opacity={0.6}
            transmission={0.8}
            roughness={0.1}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      
      {forecastData.length > 0 && (
        <Billboard 
          follow={true} 
          lockX={false} 
          lockY={false} 
          lockZ={false} 
          position={[
            (historicalData.length + forecastData.length - 1) * 2, 
            forecastData[forecastData.length - 1].price + forecastData[forecastData.length - 1].variance + 2, 
            0
          ]}
        >
          <Text fontSize={0.8} color="#00ffff" anchorX="center" anchorY="middle">
            Prediction Target
          </Text>
        </Billboard>
      )}
    </group>
  );
}
