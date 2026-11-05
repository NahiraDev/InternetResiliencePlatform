export const average = (values) => values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
export const standardDeviation = (values) => {
    const mean = average(values);
    if (mean === null)
        return null;
    return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
};
export const packetLossRatio = (results) => results.length === 0 ? 1 : results.filter((ok) => !ok).length / results.length;
//# sourceMappingURL=Statistics.js.map