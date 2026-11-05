import type { AuditFields } from '../domain/types.js';
export type NetworkStateLayer = 'desired' | 'observed' | 'actual';
export type ReconciliationStatus = 'aligned' | 'pending' | 'drifted' | 'unknown' | 'conflicted';
export interface NetworkStateResource extends AuditFields {
    readonly resourceId: string;
    readonly resourceType: string;
    readonly attributes: Readonly<Record<string, unknown>>;
}
export interface NetworkStateSnapshot extends AuditFields {
    readonly stateVersion: number;
    readonly desired: readonly NetworkStateResource[];
    readonly observed: readonly NetworkStateResource[];
    readonly actual: readonly NetworkStateResource[];
    readonly reconciliation: ReconciliationStatus;
}
export interface NetworkStateUpdate {
    readonly layer: NetworkStateLayer;
    readonly resources: readonly NetworkStateResource[];
    readonly expectedStateVersion?: number | undefined;
}
export interface NetworkStateStore {
    get(): NetworkStateSnapshot;
    apply(update: NetworkStateUpdate): NetworkStateSnapshot;
}
export declare class InMemoryNetworkStateStore implements NetworkStateStore {
    private snapshot;
    get(): NetworkStateSnapshot;
    apply(update: NetworkStateUpdate): NetworkStateSnapshot;
}
//# sourceMappingURL=network-state.d.ts.map