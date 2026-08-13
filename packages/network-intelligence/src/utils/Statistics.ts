export const average = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
export const standardDeviation = (values: readonly number[]): number | null => {
  const mean = average(values);
  if (mean === null) return null;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
};
export const packetLossRatio = (results: readonly boolean[]): number =>
  results.length === 0 ? 1 : results.filter((ok) => !ok).length / results.length;
