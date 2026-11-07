/**
 * Phase 141 — Privacy-Preserving Telemetry.
 *
 * Field-level minimization applied before telemetry leaves a trust domain:
 * keyed pseudonymization (HMAC-SHA256, rotating salt epochs), address
 * coarsening, timestamp bucketing, k-anonymity suppression of small groups
 * and Laplace noise for released counts with an injected random source.
 * Unknown fields are dropped (deny by default).
 */
export type FieldTreatment = 'keep' | 'pseudonymize' | 'coarsen-ip' | 'bucket-time' | 'drop';
export interface PrivacyPolicy {
    readonly fields: Readonly<Record<string, FieldTreatment>>;
    readonly ipv4Prefix: number;
    readonly ipv6Prefix: number;
    readonly timeBucketMs: number;
    readonly saltEpochMs: number;
}
export declare const DEFAULT_PRIVACY_POLICY: PrivacyPolicy;
export declare class Pseudonymizer {
    private readonly masterKey;
    private readonly epochMs;
    constructor(masterKey: Buffer | string, epochMs: number);
    /** Stable within an epoch, unlinkable across epochs. */
    pseudonym(value: string, nowMs: number, context?: string): string;
}
export declare const coarsenAddress: (text: string, ipv4Prefix: number, ipv6Prefix: number) => string;
export declare const minimizeRecord: (record: Readonly<Record<string, unknown>>, policy: PrivacyPolicy, pseudo: Pseudonymizer, nowMs: number) => Record<string, unknown>;
export interface GroupCount {
    readonly key: string;
    readonly count: number;
}
/** Suppresses groups smaller than k and reports how much was withheld. */
export declare const kAnonymize: (groups: readonly GroupCount[], k: number) => {
    readonly released: readonly GroupCount[];
    readonly suppressedGroups: number;
    readonly suppressedTotal: number;
};
/** Laplace(0, sensitivity/epsilon) noise from a uniform source in (0,1); the result is clamped at zero and rounded. */
export declare const noisyCount: (count: number, epsilon: number, random: () => number, sensitivity?: number) => number;
/** Tracks cumulative epsilon so noisy releases cannot exceed a total privacy budget. */
export declare class PrivacyBudget {
    private readonly total;
    private spent;
    constructor(total: number);
    spend(epsilon: number): boolean;
    remaining(): number;
}
//# sourceMappingURL=privacy-telemetry.d.ts.map