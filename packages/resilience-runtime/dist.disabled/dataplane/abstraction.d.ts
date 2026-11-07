/**
 * Phase 128 — Data-Plane Abstraction & Enforcement.
 *
 * A vendor-neutral rule model plus a compiler that turns desired rules into an
 * ordered operation plan with exact inverse operations, validated against the
 * backend's declared capabilities. `applyDataPlanePlan` applies a plan
 * transactionally (rollback on first failure) but requires a transaction id
 * issued by the privileged mutation boundary, so it can only run as part of a
 * governed mutation; nothing else in the system may call a backend directly.
 */
export type DataPlaneAction = {
    readonly type: 'steer';
    readonly pathId: string;
} | {
    readonly type: 'mark';
    readonly mark: number;
} | {
    readonly type: 'rate-limit';
    readonly kbps: number;
} | {
    readonly type: 'drop';
} | {
    readonly type: 'accept';
};
export type DataPlaneMatchProto = 'tcp' | 'udp' | 'icmp' | 'any';
export interface DataPlaneMatch {
    readonly sourceCidr?: string;
    readonly destinationCidr?: string;
    readonly protocol?: DataPlaneMatchProto;
    readonly destinationPorts?: readonly [number, number];
    readonly mark?: number;
}
export interface DataPlaneRule {
    readonly id: string;
    readonly priority: number;
    readonly match: DataPlaneMatch;
    readonly action: DataPlaneAction;
    readonly owner: string;
}
export type DataPlaneOp = {
    readonly kind: 'install';
    readonly rule: DataPlaneRule;
} | {
    readonly kind: 'remove';
    readonly ruleId: string;
} | {
    readonly kind: 'replace';
    readonly rule: DataPlaneRule;
};
export interface BackendCapabilities {
    readonly id: string;
    readonly actions: readonly DataPlaneAction['type'][];
    readonly maxRules: number;
    readonly supportsIpv6: boolean;
    readonly supportsPortRanges: boolean;
}
export interface DataPlaneBackend {
    readonly capabilities: BackendCapabilities;
    list(): Promise<readonly DataPlaneRule[]>;
    apply(op: DataPlaneOp, signal: AbortSignal): Promise<void>;
}
export interface DataPlanePlan {
    readonly ops: readonly DataPlaneOp[];
    /** Applying `inverse` in order undoes `ops` applied in order. */
    readonly inverse: readonly DataPlaneOp[];
    readonly rejected: readonly {
        readonly ruleId: string;
        readonly reason: string;
    }[];
}
export declare class DataPlaneValidationError extends Error {
    readonly violations: readonly string[];
    constructor(violations: readonly string[]);
}
export declare const validateRule: (rule: DataPlaneRule, caps: BackendCapabilities) => readonly string[];
/** Plans the operations needed to move `current` to `desired`, restricted to rules owned by `owner`. */
export declare const compileEnforcementPlan: (desired: readonly DataPlaneRule[], current: readonly DataPlaneRule[], caps: BackendCapabilities, owner: string) => DataPlanePlan;
export interface EnforcementResult {
    readonly status: 'applied' | 'rolled-back' | 'rollback-failed' | 'noop' | 'rejected';
    readonly transactionId: string;
    readonly applied: number;
    readonly error?: string;
}
/**
 * Applies a plan transactionally. `transactionId` must be the id of a transaction opened by the
 * privileged mutation boundary; an empty id is refused so ungoverned callers cannot enforce rules.
 */
export declare const applyDataPlanePlan: (plan: DataPlanePlan, backend: Pick<DataPlaneBackend, "apply">, transactionId: string, signal?: AbortSignal) => Promise<EnforcementResult>;
/** Detects rules of one backend whose matches overlap with differing actions at equal priority (ambiguous). */
export declare const findAmbiguousRules: (rules: readonly DataPlaneRule[]) => readonly [string, string][];
//# sourceMappingURL=abstraction.d.ts.map