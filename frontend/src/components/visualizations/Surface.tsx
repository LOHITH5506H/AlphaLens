import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import gsap from 'gsap';

export interface SurfaceProps {
  data: number[][]; // Volatility data grid
  width?: number;
  height?: number;
}

export function Surface({ data, width = 10, height = 10 }: SurfaceProps) {
  const rows = data.length || 10;
  const cols = data[0]?.length || 10;

  // Shared geometry for the layered materials
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(width, height, cols - 1, rows - 1);
    // Rotate to lie flat initially so Z is up in group space
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [width, height, cols, rows]);

  useEffect(() => {
    const positions = geometry.attributes.position;
    const targetY = new Float32Array(positions.count);
    
    // Map data to targetY (displacement along Y axis of the geometry vertices)
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const idx = i * cols + j;
        if (idx < positions.count) {
            targetY[idx] = data[i]?.[j] || 0;
        }
      }
    }
    
    const currentY = Array.from(positions.array).filter((_, i) => i % 3 === 1);
    
    gsap.to(currentY, {
      endArray: targetY,
      duration: 1.5,
      ease: "power2.out",
      onUpdate: () => {
        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          pos.setY(i, currentY[i]);
        }
        pos.needsUpdate = true;
        geometry.computeVertexNormals();
      }
    });
    
  }, [data, geometry, rows, cols]);

  return (
    <group>
      {/* Translucent glowing base */}
      <mesh geometry={geometry}>
        <meshPhysicalMaterial 
          color="#0066ff"
          emissive="#002288"
          emissiveIntensity={0.5}
          transmission={0.9}
          opacity={1}
          metalness={0.1}
          roughness={0.1}
          ior={1.5}
          thickness={0.5}
          side={THREE.DoubleSide}
          transparent
        />
      </mesh>
      
      {/* Wireframe overlay */}
      <mesh geometry={geometry}>
        <meshStandardMaterial 
          color="#00ffff"
          wireframe={true}
          transparent
          opacity={0.3}
        />
      </mesh>
      
      <Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, 5, 0]}>
        <Text fontSize={0.5} color="white" anchorX="center" anchorY="middle">
          Implied Volatility Surface
        </Text>
      </Billboard>
    </group>
  );
}
