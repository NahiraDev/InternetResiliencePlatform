import type { NetworkSnapshotInput } from './NetworkSnapshot.js';
export interface QualityScoreWeights {
    latency: number;
    packetLoss: number;
    jitter: number;
    dns: number;
    http: number;
    bandwidth: number;
    reachability: number;
}
export declare const DEFAULT_QUALITY_WEIGHTS: QualityScoreWeights;
export declare const calculateQualityScore: (metrics: Omit<NetworkSnapshotInput, "qualityScore" | "timestamp">, weights?: QualityScoreWeights) => number;
//# sourceMappingURL=QualityScore.d.ts.map