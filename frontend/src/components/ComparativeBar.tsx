import React from 'react';
import { Box, Text, Billboard } from '@react-three/drei';

// Safely normalize dual arrays to fit inside the AR viewport
function normalizeComparativeData(arrays: number[][], maxHeight = 2.5) {
    const allValues = arrays.flat().filter(n => typeof n === 'number');
    if (allValues.length === 0) return arrays.map(arr => arr.map(() => 0));
    
    const maxVal = Math.max(...allValues);
    const minVal = Math.min(...allValues);
    
    if (maxVal === minVal) return arrays.map(arr => arr.map(() => maxHeight / 2));

    return arrays.map(arr => 
        arr.map(val => ((val - minVal) / (maxVal - minVal)) * maxHeight)
    );
}

// Clean up massive numbers into B and M
const formatValue = (val: number) => {
    if (val === undefined || val === null) return "0.00";
    if (Math.abs(val) >= 1.0e+9) return (val / 1.0e+9).toFixed(2) + "B";
    if (Math.abs(val) >= 1.0e+6) return (val / 1.0e+6).toFixed(2) + "M";
    return val.toFixed(2);
};

export default function ComparativeBar({ data, metricName, timeframe }: any) {
    if (!data) return null;

    // 1. Extract data safely based on your backend schema
    const rawCompany = data.company || (data.data && data.data[0]?.values) || [];
    const rawSector = data.sector || (data.data && data.data[1]?.values) || [];
    const rawLabels = data.labels || data.z_labels || data.x_labels || [];

    // 2. FRONTEND FAILSAFE: Force the slice based on UI Timeframe
    let sliceCount = 4; // Default 1Y (4 quarters)
    if (timeframe === "3Y") sliceCount = 3;
    else if (timeframe === "5Y") sliceCount = 5;
    else if (timeframe === "10Y") sliceCount = 10;
    
    const safeCompany = rawCompany.slice(-sliceCount);
    const safeSector = rawSector.slice(-sliceCount);
    const safeLabels = rawLabels.slice(-sliceCount);

    const [scaledCompany, scaledSector] = normalizeComparativeData([safeCompany, safeSector], 2.5);

    return (
        <group position={[0, -1, 0]}>
            {/* METRIC TITLE */}
            <Billboard position={[0, 3.5, 0]}>
                <Text fontSize={0.25} color="#00f0ff" anchorX="center" anchorY="bottom">
                    {`◆ ${metricName || "METRIC"}`}
                </Text>
            </Billboard>

            {safeLabels.map((label: string, index: number) => {
                const groupX = (index * 2.0) - (safeLabels.length * 2.0) / 2 + 1;
                const compHeight = Math.max(scaledCompany[index] || 0.1, 0.1);
                const sectHeight = Math.max(scaledSector[index] || 0.1, 0.1);

                return (
                    <group key={index} position={[groupX, 0, 0]}>
                        
                        {/* SECTOR BAR (Background, High Opacity, Depth Write False) */}
                        <group position={[0, sectHeight / 2, -0.8]}>
                            <Box args={[0.8, sectHeight, 0.4]}>
                                <meshBasicMaterial 
                                    color="#cbd5e1" 
                                    transparent={true} 
                                    opacity={0.45} 
                                    depthWrite={false} 
                                />
                            </Box>
                            <Billboard position={[0, sectHeight / 2 + 0.25, 0]}>
                                <Text fontSize={0.16} color="#cbd5e1">
                                    {formatValue(safeSector[index])}
                                </Text>
                            </Billboard>
                        </group>

                        {/* COMPANY BAR (Foreground, Glowing) */}
                        <group position={[0, compHeight / 2, 0]}>
                            <Box args={[0.5, compHeight, 0.5]}>
                                <meshStandardMaterial 
                                    color="#00f0ff" 
                                    emissive="#00f0ff" 
                                    emissiveIntensity={0.8} 
                                />
                            </Box>
                            <Billboard position={[0, compHeight / 2 + 0.25, 0]}>
                                <Text fontSize={0.18} color="#ffffff">
                                    {formatValue(safeCompany[index])}
                                </Text>
                            </Billboard>
                        </group>

                        {/* TIMELINE LABEL */}
                        <Billboard position={[0, -0.4, 0]}>
                            <Text fontSize={0.15} color="#64748b">
                                {label}
                            </Text>
                        </Billboard>

                        {/* "SECTOR" LEGEND (First Bar Only) */}
                        {index === 0 && (
                            <Billboard position={[-1.2, sectHeight / 2, -0.8]}>
                                <Text fontSize={0.16} color="#cbd5e1" anchorX="right">
                                    SECTOR
                                </Text>
                            </Billboard>
                        )}
                    </group>
                );
            })}
        </group>
    );
}
