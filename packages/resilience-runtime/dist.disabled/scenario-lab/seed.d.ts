/**
 * Deterministic scenario seeds for issue #282.
 * Mulberry32 gives a reproducible stream from a string seed without any
 * external dependency; identical seeds must yield identical scenarios.
 */
export type SeededRandom = () => number;
/** Deterministic PRNG in [0, 1). Same seed string → same sequence. */
export declare const createSeededRandom: (seed: string) => SeededRandom;
//# sourceMappingURL=seed.d.ts.map