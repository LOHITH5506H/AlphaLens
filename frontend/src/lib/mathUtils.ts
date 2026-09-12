export function normalizeData(dataArray: number[], maxHeight: number = 2.0) {
    const maxVal = Math.max(...dataArray);
    const minVal = Math.min(...dataArray);
    
    // Avoid division by zero if all values are identical
    if (maxVal === minVal) return dataArray.map(() => maxHeight / 2);

    return dataArray.map(val => 
        ((val - minVal) / (maxVal - minVal)) * maxHeight
    );
}

// Pass an array of arrays to find the global min/max across all datasets
export function normalizeComparativeData(arrays: number[][], maxHeight: number = 2.5) {
    const allValues = arrays.flat();
    const maxVal = Math.max(...allValues);
    const minVal = Math.min(...allValues);
    
    // Fallback if all values are perfectly identical
    if (maxVal === minVal) {
        return arrays.map(arr => arr.map(() => maxHeight / 2));
    }

    return arrays.map(arr => 
        arr.map(val => ((val - minVal) / (maxVal - minVal)) * maxHeight)
    );
}
