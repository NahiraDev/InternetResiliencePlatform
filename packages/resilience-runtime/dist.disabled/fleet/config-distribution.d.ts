/**
 * Phase 116 — Remote Configuration & Policy Distribution.
 *
 * Versioned, content-addressed, signed configuration bundles with staged
 * (canary → wave → full) rollout, deterministic cohort assignment, acknowledgement
 * tracking and automatic rollback when the failure ratio breaches a threshold.
 * Distribution only publishes desired configuration; each device applies it
 * through its own canonical runtime and policy gates.
 */
import { type DeviceSelector, type ManagedDevice } from './inventory.js';
export interface ConfigBundle {
    readonly bundleId: string;
    readonly version: number;
    readonly kind: 'config' | 'policy';
    readonly payload: string;
    readonly contentHash: string;
    readonly signature: string;
}
export declare const hashPayload: (payload: string) => string;
export declare const signBundle: (secret: string | Buffer, b: Omit<ConfigBundle, "contentHash" | "signature">) => ConfigBundle;
export declare const verifyBundle: (secret: string | Buffer, b: ConfigBundle) => boolean;
export interface RolloutStage {
    readonly name: string; /** Cumulative percentage of targeted devices (0,100]. */
    readonly percent: number;
}
export declare const DEFAULT_ROLLOUT_STAGES: readonly RolloutStage[];
export type DeviceRolloutStatus = 'pending' | 'offered' | 'applied' | 'failed' | 'rolled-back';
export type RolloutState = 'staged' | 'in-progress' | 'completed' | 'halted' | 'rolled-back';
export interface RolloutOptions {
    readonly stages?: readonly RolloutStage[];
    /** Failure ratio among offered devices that halts the rollout and triggers rollback. */
    readonly maxFailureRatio?: number;
    readonly minSampleForFailureRatio?: number;
}
/** Stable pseudo-random position in [0,100) for a (bundle, device) pair. */
export declare const cohortPosition: (bundleId: string, version: number, deviceId: string) => number;
export declare class ConfigRollout {
    readonly bundle: ConfigBundle;
    readonly previous: ConfigBundle | undefined;
    private state;
    private stageIndex;
    private readonly targets;
    private readonly status;
    private readonly stages;
    private readonly maxFailureRatio;
    private readonly minSample;
    constructor(bundle: ConfigBundle, previous: ConfigBundle | undefined, secret: string | Buffer, devices: readonly ManagedDevice[], selector: DeviceSelector, options?: RolloutOptions);
    get currentState(): RolloutState;
    get targetCount(): number;
    /** Devices whose cohort position falls inside the cumulative percentage of the current stage. */
    private eligible;
    /** Advances to the next stage and returns the devices newly offered the bundle. */
    advance(): readonly string[];
    private pendingAcks;
    /** Records a device acknowledgement. Returns the devices that must be rolled back if the rollout halted. */
    acknowledge(deviceId: string, outcome: 'applied' | 'failed'): readonly string[];
    summary(): Readonly<Record<DeviceRolloutStatus, number>>;
}
//# sourceMappingURL=config-distribution.d.ts.map