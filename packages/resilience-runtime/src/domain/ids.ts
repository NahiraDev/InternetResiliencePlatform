let sequence = 0;
/**
 * Per-process epoch. Ids used to be a bare counter that restarted at 1 in every process, so a
 * restarted daemon re-issued ids already persisted by the previous run and the durable stores
 * silently overwrote history. The epoch (start time plus randomness) makes ids unique across
 * restarts while staying roughly time-ordered.
 */
const epoch = `${Date.now().toString(36)}${Math.floor(Math.random() * 0x10000).toString(36).padStart(3, '0')}`;
export const stableId = (prefix: string, seed: string) =>
  `${prefix}-${Buffer.from(seed).toString('hex').slice(0, 24)}`;
export const nextId = (prefix: string) => `${prefix}-${epoch}-${(++sequence).toString().padStart(6, '0')}`;
export const nowIso = () => new Date().toISOString();
export const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
};
