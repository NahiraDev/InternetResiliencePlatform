/**
 * Phase 115 — Device Enrollment & Lifecycle.
 *
 * Operational lifecycle for managed devices layered on top of the identity
 * ledger: provisioning → active ⇄ maintenance → decommissioning → decommissioned,
 * plus derived presence (online / stale / lost) from heartbeats. Decommissioning
 * requires the device identity to have been revoked first, so a retired device
 * can never keep control-plane trust.
 */

export type LifecycleState = 'provisioning' | 'active' | 'maintenance' | 'decommissioning' | 'decommissioned';
export type Presence = 'online' | 'stale' | 'lost' | 'never-seen';

const NEXT: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = Object.freeze({
  provisioning: ['active', 'decommissioning'],
  active: ['maintenance', 'decommissioning'],
  maintenance: ['active', 'decommissioning'],
  decommissioning: ['decommissioned'],
  decommissioned: [],
});

export interface DeviceLifecycleRecord {
  readonly deviceId: string;
  readonly state: LifecycleState;
  readonly changedAtMs: number;
  readonly history: readonly { readonly from: LifecycleState | 'none'; readonly to: LifecycleState; readonly atMs: number; readonly reason: string }[];
}

export interface PresencePolicy { readonly staleAfterMs: number; readonly lostAfterMs: number }
export const DEFAULT_PRESENCE_POLICY: PresencePolicy = Object.freeze({ staleAfterMs: 3 * 60_000, lostAfterMs: 15 * 60_000 });

export class LifecycleError extends Error {
  constructor(readonly code: string, detail?: string) { super(detail ? `${code}: ${detail}` : code); this.name = 'LifecycleError'; }
}

export const derivePresence = (lastSeenAtMs: number | undefined, nowMs: number, policy: PresencePolicy = DEFAULT_PRESENCE_POLICY): Presence => {
  if (lastSeenAtMs === undefined) return 'never-seen';
  const age = nowMs - lastSeenAtMs;
  return age >= policy.lostAfterMs ? 'lost' : age >= policy.staleAfterMs ? 'stale' : 'online';
};

export interface LifecycleDependencies {
  /** Returns true while the device's identity is still trusted (enrolled). */
  readonly isIdentityTrusted: (deviceId: string) => boolean;
}

export class DeviceLifecycleManager {
  private readonly records = new Map<string, DeviceLifecycleRecord>();
  constructor(private readonly deps: LifecycleDependencies) {}

  begin(deviceId: string, nowMs: number): DeviceLifecycleRecord {
    if (this.records.has(deviceId)) throw new LifecycleError('already-managed');
    const rec: DeviceLifecycleRecord = Object.freeze({ deviceId, state: 'provisioning', changedAtMs: nowMs, history: Object.freeze([{ from: 'none' as const, to: 'provisioning' as const, atMs: nowMs, reason: 'begin' }]) });
    this.records.set(deviceId, rec);
    return rec;
  }

  transition(deviceId: string, to: LifecycleState, reason: string, nowMs: number): DeviceLifecycleRecord {
    const cur = this.records.get(deviceId);
    if (!cur) throw new LifecycleError('unknown-device');
    if (!NEXT[cur.state].includes(to)) throw new LifecycleError('illegal-transition', `${cur.state} -> ${to}`);
    if ((to === 'active') && !this.deps.isIdentityTrusted(deviceId)) throw new LifecycleError('identity-not-trusted');
    if (to === 'decommissioned' && this.deps.isIdentityTrusted(deviceId)) throw new LifecycleError('identity-still-trusted', 'revoke the device identity before decommissioning');
    const next: DeviceLifecycleRecord = Object.freeze({ ...cur, state: to, changedAtMs: nowMs, history: Object.freeze([...cur.history, { from: cur.state, to, atMs: nowMs, reason }]) });
    this.records.set(deviceId, next);
    return next;
  }

  get(deviceId: string): DeviceLifecycleRecord | undefined { return this.records.get(deviceId); }
  inState(state: LifecycleState): readonly string[] { return Object.freeze([...this.records.values()].filter((r) => r.state === state).map((r) => r.deviceId).sort()); }

  /** Only active, trusted devices may receive orchestrated work. */
  isOperational(deviceId: string): boolean { return this.records.get(deviceId)?.state === 'active' && this.deps.isIdentityTrusted(deviceId); }
}
