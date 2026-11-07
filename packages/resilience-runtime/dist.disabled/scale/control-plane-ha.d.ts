/**
 * Phase 146 — Control-Plane High Availability.
 *
 * Deterministic replica-group membership: heartbeat liveness, quorum-gated
 * leadership with monotonically increasing terms, and fencing tokens so a
 * deposed leader's writes are rejected. Without quorum there is no leader —
 * the group fails safe (read-only) instead of splitting the brain.
 */
export interface ReplicaInfo {
    readonly id: string;
    readonly rank: number;
    readonly lastHeartbeatMs: number;
}
export interface LeadershipView {
    readonly term: number;
    readonly leaderId?: string;
    readonly hasQuorum: boolean;
    readonly liveReplicas: readonly string[];
    readonly fencingToken: number;
}
export declare class ReplicaGroup {
    private readonly clusterSize;
    private readonly heartbeatTtlMs;
    private readonly replicas;
    private term;
    private leader;
    private fencing;
    /** `clusterSize` is the configured membership; quorum is a strict majority of it. */
    constructor(clusterSize: number, heartbeatTtlMs: number);
    heartbeat(id: string, rank: number, nowMs: number): void;
    private live;
    /** Re-evaluates leadership. The term and fencing token advance only when the leader changes. */
    evaluate(nowMs: number): LeadershipView;
    /** Whether a write carrying `token` from `replicaId` may be accepted right now. */
    acceptWrite(replicaId: string, token: number, nowMs: number): boolean;
}
/** A resource guarded by fencing tokens: writes with an older token than already seen are rejected. */
export declare class FencedResource<T> {
    private highest;
    private value;
    write(token: number, value: T): boolean;
    read(): T | undefined;
    get fenceFloor(): number;
}
//# sourceMappingURL=control-plane-ha.d.ts.map