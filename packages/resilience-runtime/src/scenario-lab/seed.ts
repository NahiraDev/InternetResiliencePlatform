/**
 * Deterministic scenario seeds for issue #282.
 * Mulberry32 gives a reproducible stream from a string seed without any
 * external dependency; identical seeds must yield identical scenarios.
 */

const hashSeed = (seed: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export type SeededRandom = () => number;

/** Deterministic PRNG in [0, 1). Same seed string → same sequence. */
export const createSeededRandom = (seed: string): SeededRandom => {
  let state = hashSeed(seed);
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};
