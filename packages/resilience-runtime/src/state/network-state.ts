import type { AuditFields } from '../domain/types.js';

export type NetworkStateLayer = 'desired' | 'observed' | 'actual';
export type ReconciliationStatus =
  | 'aligned'
  | 'pending'
  | 'drifted'
  | 'unknown'
  | 'conflicted';

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

const EMPTY_STATE: NetworkStateSnapshot = Object.freeze({
  id: 'network-state:initial',
  schemaVersion: 1,
  createdAt: new Date(0).toISOString(),
  source: 'resilience-runtime',
  metadata: Object.freeze({}),
  stateVersion: 0,
  desired: Object.freeze([]),
  observed: Object.freeze([]),
  actual: Object.freeze([]),
  reconciliation: 'unknown',
});

const freezeResources = (resources: readonly NetworkStateResource[]) =>
  Object.freeze(
    resources.map((resource) =>
      Object.freeze({
        ...resource,
        attributes: Object.freeze({ ...resource.attributes }),
      }),
    ),
  );

const reconcile = (
  desired: readonly NetworkStateResource[],
  observed: readonly NetworkStateResource[],
  actual: readonly NetworkStateResource[],
): ReconciliationStatus => {
  if (desired.length === 0 && observed.length === 0 && actual.length === 0) return 'unknown';

  const signature = (resources: readonly NetworkStateResource[]) =>
    JSON.stringify(
      [...resources]
        .map((resource) => ({
          id: resource.resourceId,
          type: resource.resourceType,
          attributes: resource.attributes,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );

  const desiredSignature = signature(desired);
  const observedSignature = signature(observed);
  const actualSignature = signature(actual);

  if (desiredSignature === actualSignature && actualSignature === observedSignature) return 'aligned';
  if (desiredSignature !== actualSignature && observedSignature === actualSignature) return 'pending';
  if (desiredSignature === actualSignature && observedSignature !== actualSignature) return 'drifted';
  return 'conflicted';
};

export class InMemoryNetworkStateStore implements NetworkStateStore {
  private snapshot: NetworkStateSnapshot = EMPTY_STATE;

  get(): NetworkStateSnapshot {
    return this.snapshot;
  }

  apply(update: NetworkStateUpdate): NetworkStateSnapshot {
    if (
      update.expectedStateVersion !== undefined &&
      update.expectedStateVersion !== this.snapshot.stateVersion
    ) {
      throw new Error(
        `Network state version conflict: expected ${update.expectedStateVersion}, actual ${this.snapshot.stateVersion}`,
      );
    }

    const next = {
      ...this.snapshot,
      id: `network-state:${this.snapshot.stateVersion + 1}`,
      createdAt: new Date().toISOString(),
      stateVersion: this.snapshot.stateVersion + 1,
      [update.layer]: freezeResources(update.resources),
    } as Omit<NetworkStateSnapshot, 'reconciliation'>;

    this.snapshot = Object.freeze({
      ...next,
      reconciliation: reconcile(next.desired, next.observed, next.actual),
    });

    return this.snapshot;
  }
}
