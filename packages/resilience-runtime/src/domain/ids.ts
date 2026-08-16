let sequence = 0;
export const stableId = (prefix: string, seed: string) =>
  `${prefix}-${Buffer.from(seed).toString('hex').slice(0, 24)}`;
export const nextId = (prefix: string) => `${prefix}-${(++sequence).toString().padStart(6, '0')}`;
export const nowIso = () => new Date().toISOString();
export const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
};
