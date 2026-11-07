/**
 * Phase 129 — Flow / Connection Lifecycle Intelligence.
 *
 * A bounded flow table tracking per-flow lifecycle (new → established →
 * closing → closed, plus stalled), byte counters and idle timeouts. It answers
 * whether a flow may be migrated to another path without breaking it, and
 * reports churn and long-lived flow statistics. Observation only.
 */
import type { TrafficProtocol } from '../traffic/classification.js';
export type FlowState = 'new' | 'established' | 'closing' | 'closed' | 'stalled';
export interface FlowKey {
    readonly protocol: TrafficProtocol;
    readonly src: string;
    readonly srcPort: number;
    readonly dst: string;
    readonly dstPort: number;
}
export interface FlowRecord {
    readonly key: string;
    readonly protocol: TrafficProtocol;
    readonly state: FlowState;
    readonly pathId?: string;
    readonly firstSeenMs: number;
    readonly lastSeenMs: number;
    readonly bytes: number;
    readonly packets: number;
    /** True for protocols or sessions that survive a path change (e.g. QUIC with connection migration). */
    readonly migratable: boolean;
}
export interface FlowEvent {
    readonly key: FlowKey;
    readonly atMs: number;
    readonly bytes?: number;
    readonly packets?: number;
    readonly pathId?: string;
    readonly signal?: 'syn' | 'ack' | 'fin' | 'rst' | 'data';
    readonly migratable?: boolean;
}
export interface FlowTableConfig {
    readonly capacity: number;
    readonly idleTimeoutMs: Readonly<Record<TrafficProtocol, number>>;
    readonly stalledAfterMs: number;
    readonly longLivedMs: number;
    readonly closedRetentionMs: number;
}
export declare const DEFAULT_FLOW_TABLE_CONFIG: FlowTableConfig;
export declare const flowKeyString: (k: FlowKey) => string;
export interface FlowStats {
    readonly active: number;
    readonly byState: Readonly<Record<FlowState, number>>;
    readonly longLived: number;
    readonly evicted: number;
    readonly created: number;
    readonly closed: number;
}
export declare class FlowTable {
    private readonly config;
    private readonly flows;
    private evicted;
    private created;
    private closedCount;
    constructor(config?: FlowTableConfig);
    observe(e: FlowEvent): FlowRecord;
    private enforceCapacity;
    /** Marks idle flows stalled or closed and drops long-closed records. Returns keys whose state changed. */
    sweep(nowMs: number): readonly string[];
    get(key: FlowKey): FlowRecord | undefined;
    /**
     * Whether the flow can be moved to another path now. Established non-migratable flows are pinned
     * (moving them resets the connection); new, stalled, closed and migratable flows may move.
     */
    canMigrate(key: FlowKey): {
        readonly allowed: boolean;
        readonly reason: string;
    };
    /** Flows pinned to a path, i.e. those a path change would disrupt. */
    pinnedTo(pathId: string): readonly FlowRecord[];
    stats(nowMs: number): FlowStats;
}
//# sourceMappingURL=flow-lifecycle.d.ts.map