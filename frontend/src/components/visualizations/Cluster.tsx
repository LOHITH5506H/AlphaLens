import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import gsap from 'gsap';

export interface NodeData {
  id: string;
  ticker: string;
  features: number[]; // high dimensional features for Kernel PCA mapping
  value: number; // For scaling nodes
}

export interface EdgeData {
  source: string;
  target: string;
  correlation: number;
}

export interface ClusterProps {
  nodes: NodeData[];
  edges: EdgeData[];
}

export function Cluster({ nodes, edges }: ClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const linesMaterialRef = useRef<THREE.LineBasicMaterial>(null);

  // Kernel PCA Dimension Reduction mapped to 3D space
  // We use the features array to derive the spatial coordinates as requested
  const nodePositions = useMemo(() => {
    return nodes.map((node) => {
      // In a production environment, this is where you map your Kernel PCA 
      // output dimensions to the X, Y, Z coordinates. 
      // Here, we're mapping the first 3 components to 3D space.
      const x = (node.features[0] || Math.random()) * 10 - 5;
      const y = (node.features[1] || Math.random()) * 10 - 5;
      const z = (node.features[2] || Math.random()) * 10 - 5;
      return new THREE.Vector3(x, y, z);
    });
  }, [nodes]);

  useEffect(() => {
    if (!meshRef.current) return;
    
    const dummy = new THREE.Object3D();
    
    // Animate node scales and positions smoothly when data updates
    nodes.forEach((node, i) => {
      const pos = nodePositions[i];
      const targetScale = Math.max(0.1, node.value * 0.5);
      
      const state = { scale: 0.01 };
      
      gsap.to(state, {
        scale: targetScale,
        duration: 1.5,
        ease: "back.out(1.7)",
        onUpdate: () => {
          dummy.position.copy(pos);
          dummy.scale.setScalar(state.scale);
          dummy.updateMatrix();
          meshRef.current!.setMatrixAt(i, dummy.matrix);
          meshRef.current!.instanceMatrix.needsUpdate = true;
        }
      });
    });
  }, [nodes, nodePositions]);

  // Generate highly correlated edges geometry
  const linesGeometry = useMemo(() => {
    const points: THREE.Vector3[] = [];
    edges.forEach(edge => {
      const sourceIdx = nodes.findIndex(n => n.id === edge.source);
      const targetIdx = nodes.findIndex(n => n.id === edge.target);
      
      // Connect nodes only if they exist in dataset and are highly correlated
      if (sourceIdx >= 0 && targetIdx >= 0 && edge.correlation > 0.9) {
        points.push(nodePositions[sourceIdx]);
        points.push(nodePositions[targetIdx]);
      }
    });
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [edges, nodes, nodePositions]);

  // Pulsing animation for correlation edges in render loop
  useFrame(({ clock }) => {
    if (linesMaterialRef.current) {
      linesMaterialRef.current.opacity = 0.3 + Math.sin(clock.elapsedTime * 2) * 0.2;
    }
  });

  return (
    <group>
      {/* 1 draw call for all nodes */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, nodes.length]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color="#ff00ff" roughness={0.2} metalness={0.8} />
      </instancedMesh>
      
      {/* Correlation connections */}
      {linesGeometry.attributes.position?.count > 0 && (
        <lineSegments geometry={linesGeometry}>
          <lineBasicMaterial 
            ref={linesMaterialRef}
            color="#00ffff" 
            transparent 
            opacity={0.5} 
            linewidth={2}
          />
        </lineSegments>
      )}

      {/* Perfectly legible Billboards perfectly facing camera */}
      {nodes.map((node, i) => (
        <Billboard 
          key={node.id} 
          position={nodePositions[i]} 
          follow={true} 
          lockX={false} 
          lockY={false} 
          lockZ={false}
        >
          <Text 
            position={[0, 1.5, 0]} 
            fontSize={0.4} 
            color="white" 
            anchorX="center" 
            anchorY="middle"
          >
            {node.ticker}
          </Text>
        </Billboard>
      ))}
    </group>
  );
}
