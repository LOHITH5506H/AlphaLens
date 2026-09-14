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
const formatValue = (val: number, isPercent: boolean = false) => {
    if (val === undefined || val === null) return "0.00";
    if (isPercent) return val.toFixed(2) + "%";
    if (Math.abs(val) >= 1.0e+9) return (val / 1.0e+9).toFixed(2) + "B";
    if (Math.abs(val) >= 1.0e+6) return (val / 1.0e+6).toFixed(2) + "M";
    return val.toFixed(2);
};

function formatQuarterLabel(dateStr: string): string {
    if (!dateStr) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const quarter = Math.floor(d.getMonth() / 3) + 1;
    const yearShort = d.getFullYear().toString().slice(-2);
    return `Q${quarter} '${yearShort}`;
}

export default function ComparativeBar({ data, metricName, timeframe }: any) {
    if (!data) return null;

    // 1. Extract data safely based on your backend schema
    const rawCompany = data.company || (data.data && data.data[0]?.values) || [];
    const rawSector = data.sector || (data.data && data.data[1]?.values) || [];
    const rawLabels = data.labels || data.z_labels || data.x_labels || [];

    // 2. FRONTEND FAILSAFE: Force the slice based on UI Timeframe
    let sliceCount = 4; // Default 1Y (4 quarters)
    if (timeframe === "3Y") sliceCount = 12;
    else if (timeframe === "5Y") sliceCount = 20;
    else if (timeframe === "10Y") sliceCount = 40;
    else if (timeframe === "Max" || timeframe === "All") sliceCount = rawCompany.length;
    
    const safeCompany = rawCompany.slice(-sliceCount);
    const safeSector = rawSector.slice(-sliceCount);
    const safeLabels = rawLabels.slice(-sliceCount);

    const isPercent = metricName && ['Yield', 'Margin', 'ROE', 'ROA'].some(k => metricName.includes(k));

    // 3. ALL-ZERO CHECK: If every value in both arrays is 0, show "Not Applicable"
    const allValuesZero = [...safeCompany, ...safeSector].every((v: number) => v === 0 || v === undefined || v === null);

    const [scaledCompany, scaledSector] = normalizeComparativeData([safeCompany, safeSector], 2.5);

    return (
        <group position={[0, -1, 0]}>
            {/* METRIC TITLE */}
            <Billboard position={[0, 3.5, 0]}>
                <Text fontSize={0.25} color="#00f0ff" anchorX="center" anchorY="bottom">
                    {`◆ ${metricName || "METRIC"}`}
                </Text>
            </Billboard>

            {allValuesZero ? (
                /* ALL-ZERO FALLBACK: Show a "Not Applicable" message */
                <Billboard position={[0, 1.2, 0]}>
                    <Text fontSize={0.22} color="#94a3b8" anchorX="center">
                        Metric Not Applicable — No Data
                    </Text>
                </Billboard>
            ) : (
                safeLabels.map((label: string, index: number) => {
                    const groupX = (index * 2.0) - (safeLabels.length * 2.0) / 2 + 1;

                    const rawCompVal = safeCompany[index] ?? 0;
                    const rawSectVal = safeSector[index] ?? 0;

                    // ZERO HANDLING: Use flat tile (0.03) for exact zeros, normal min (0.1) otherwise
                    const compHeight = rawCompVal === 0
                        ? 0.03
                        : Math.max(scaledCompany[index] || 0.1, 0.1);
                    const sectHeight = rawSectVal === 0
                        ? 0.03
                        : Math.max(scaledSector[index] || 0.1, 0.1);

                    // X offsets to prevent label overlap
                    const companyOffsetX = 0.3;
                    const sectorOffsetX = -0.3;

                    return (
                        <group key={index} position={[groupX, 0, 0]}>
                            
                            {/* SECTOR BAR (Background, shifted left) */}
                            <group position={[sectorOffsetX, sectHeight / 2, -0.4]}>
                                <Box args={[0.5, sectHeight, 0.4]}>
                                    <meshBasicMaterial 
                                        color="#cbd5e1" 
                                        transparent={true} 
                                        opacity={0.45} 
                                        depthWrite={false} 
                                    />
                                </Box>
                                <Billboard position={[0, sectHeight / 2 + 0.25, 0]}>
                                    <Text fontSize={0.16} color="#cbd5e1">
                                        {formatValue(rawSectVal, isPercent)}
                                    </Text>
                                </Billboard>
                            </group>

                            {/* COMPANY BAR (Foreground, shifted right) */}
                            <group position={[companyOffsetX, compHeight / 2, 0]}>
                                <Box args={[0.5, compHeight, 0.5]}>
                                    <meshStandardMaterial 
                                        color="#00e5ff" 
                                        emissive="#00b4d8" 
                                        emissiveIntensity={1.4}
                                        roughness={0.25}
                                        metalness={0.7}
                                    />
                                </Box>
                                <Billboard position={[0, compHeight / 2 + 0.25, 0]}>
                                    <Text fontSize={0.18} color="#ffffff">
                                        {formatValue(rawCompVal, isPercent)}
                                    </Text>
                                </Billboard>
                            </group>

                            {/* TIMELINE LABEL */}
                            <Billboard position={[0, -0.4, 0]}>
                                <Text fontSize={0.15} color="#64748b">
                                    {formatQuarterLabel(label)}
                                </Text>
                            </Billboard>

                            {/* "SECTOR" LEGEND (First Bar Only) */}
                            {index === 0 && (
                                <Billboard position={[sectorOffsetX - 0.8, sectHeight / 2, -0.4]}>
                                    <Text fontSize={0.16} color="#cbd5e1" anchorX="right">
                                        SECTOR
                                    </Text>
                                </Billboard>
                            )}
                        </group>
                    );
                })
            )}
        </group>
    );
}
