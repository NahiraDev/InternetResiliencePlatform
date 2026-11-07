/**
 * Phase 125 — Network Simulation / Digital Twin.
 *
 * Builds an isolated twin of a fabric snapshot, applies hypothetical faults or
 * changes to the copy and reports the impact using the same fabric selection
 * and dependency analysis the live system uses. The twin is a separate fabric
 * instance seeded from immutable data; it has no path back to live resources.
 */
import { type FabricSelectionRequest, type FabricSnapshot } from '../fabric.js';
export type TwinChange = {
    readonly type: 'fail';
    readonly resourceId: string;
} | {
    readonly type: 'degrade';
    readonly resourceId: string;
    readonly healthScore: number;
} | {
    readonly type: 'recover';
    readonly resourceId: string;
} | {
    readonly type: 'set-cost';
    readonly resourceId: string;
    readonly cost: Readonly<Record<string, number>>;
} | {
    readonly type: 'fail-domain';
    readonly failureDomain: string;
};
export interface TwinSelection {
    readonly selectedId?: string;
    readonly candidateIds: readonly string[];
    readonly reason: string;
}
export interface TwinImpact {
    readonly changes: readonly TwinChange[];
    readonly changedResources: readonly string[];
    readonly before: TwinSelection;
    readonly after: TwinSelection;
    readonly selectionChanged: boolean;
    readonly lostSelectable: readonly string[];
    readonly newSinglePointsOfFailure: readonly string[];
    readonly strandedDependents: readonly string[];
    readonly verdict: 'no-impact' | 'degraded-redundancy' | 'reroute' | 'outage';
}
export declare class TwinChangeError extends Error {
    constructor(message: string);
}
export declare const simulateChanges: (snapshot: Pick<FabricSnapshot, "resources" | "edges">, changes: readonly TwinChange[], request: FabricSelectionRequest, now: string) => Promise<TwinImpact>;
//# sourceMappingURL=digital-twin.d.ts.map