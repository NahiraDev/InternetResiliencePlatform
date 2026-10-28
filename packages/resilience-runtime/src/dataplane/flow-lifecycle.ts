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

export interface FlowKey { readonly protocol: TrafficProtocol; readonly src: string; readonly srcPort: number; readonly dst: string; readonly dstPort: number }

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

export const DEFAULT_FLOW_TABLE_CONFIG: FlowTableConfig = Object.freeze({
  capacity: 65_536,
  idleTimeoutMs: Object.freeze({ tcp: 300_000, udp: 60_000, icmp: 10_000, quic: 120_000, other: 60_000 }),
  stalledAfterMs: 30_000, longLivedMs: 600_000, closedRetentionMs: 30_000,
});

export const flowKeyString = (k: FlowKey): string => `${k.protocol}|${k.src}:${k.srcPort}>${k.dst}:${k.dstPort}`;

export interface FlowStats {
  readonly active: number;
  readonly byState: Readonly<Record<FlowState, number>>;
  readonly longLived: number;
  readonly evicted: number;
  readonly created: number;
  readonly closed: number;
}

export class FlowTable {
  private readonly flows = new Map<string, FlowRecord>();
  private evicted = 0; private created = 0; private closedCount = 0;
  constructor(private readonly config: FlowTableConfig = DEFAULT_FLOW_TABLE_CONFIG) {
    if (config.capacity < 1) throw new Error('flow table capacity must be positive');
  }

  observe(e: FlowEvent): FlowRecord {
    const key = flowKeyString(e.key);
    const prev = this.flows.get(key);
    let state: FlowState = prev?.state ?? 'new';
    if (e.signal === 'rst') state = 'closed';
    else if (e.signal === 'fin') state = state === 'closing' ? 'closed' : 'closing';
    else if (state === 'stalled') state = 'established';
    else if (state === 'new' && (e.signal === 'ack' || e.signal === 'data') && (prev?.packets ?? 0) + (e.packets ?? 1) > 1) state = 'established';
    else if (e.key.protocol !== 'tcp' && state === 'new' && (prev !== undefined)) state = 'established';
    if (state === 'closed' && prev?.state !== 'closed') this.closedCount += 1;
    if (!prev) this.created += 1;
    const next: FlowRecord = Object.freeze({
      key, protocol: e.key.protocol, state, ...((e.pathId ?? prev?.pathId) ? { pathId: (e.pathId ?? prev?.pathId) as string } : {}),
      firstSeenMs: prev?.firstSeenMs ?? e.atMs, lastSeenMs: Math.max(prev?.lastSeenMs ?? 0, e.atMs),
      bytes: (prev?.bytes ?? 0) + Math.max(0, e.bytes ?? 0), packets: (prev?.packets ?? 0) + Math.max(0, e.packets ?? 1),
      migratable: e.migratable ?? prev?.migratable ?? e.key.protocol === 'quic',
    });
    this.flows.set(key, next);
    this.enforceCapacity();
    return next;
  }

  private enforceCapacity(): void {
    while (this.flows.size > this.config.capacity) {
      // Evict closed first, then the least recently seen; never evict silently in a way that hides loss.
      const victim = [...this.flows.values()].sort((a, b) => (a.state === 'closed' ? 0 : 1) - (b.state === 'closed' ? 0 : 1) || a.lastSeenMs - b.lastSeenMs || a.key.localeCompare(b.key))[0] as FlowRecord;
      this.flows.delete(victim.key); this.evicted += 1;
    }
  }

  /** Marks idle flows stalled or closed and drops long-closed records. Returns keys whose state changed. */
  sweep(nowMs: number): readonly string[] {
    const changed: string[] = [];
    for (const f of [...this.flows.values()]) {
      const idle = nowMs - f.lastSeenMs;
      if (f.state === 'closed') { if (idle > this.config.closedRetentionMs) this.flows.delete(f.key); continue; }
      if (idle >= this.config.idleTimeoutMs[f.protocol]) { this.flows.set(f.key, Object.freeze({ ...f, state: 'closed' })); this.closedCount += 1; changed.push(f.key); }
      else if (f.state !== 'stalled' && f.state !== 'new' && idle >= this.config.stalledAfterMs) { this.flows.set(f.key, Object.freeze({ ...f, state: 'stalled' })); changed.push(f.key); }
    }
    return Object.freeze(changed.sort());
  }

  get(key: FlowKey): FlowRecord | undefined { return this.flows.get(flowKeyString(key)); }

  /**
   * Whether the flow can be moved to another path now. Established non-migratable flows are pinned
   * (moving them resets the connection); new, stalled, closed and migratable flows may move.
   */
  canMigrate(key: FlowKey): { readonly allowed: boolean; readonly reason: string } {
    const f = this.get(key);
    if (!f) return Object.freeze({ allowed: true, reason: 'unknown-flow' });
    if (f.state === 'closed' || f.state === 'closing') return Object.freeze({ allowed: true, reason: 'flow-ending' });
    if (f.migratable) return Object.freeze({ allowed: true, reason: 'protocol-supports-migration' });
    if (f.state === 'established') return Object.freeze({ allowed: false, reason: 'established-flow-would-reset' });
    return Object.freeze({ allowed: true, reason: `flow-${f.state}` });
  }

  /** Flows pinned to a path, i.e. those a path change would disrupt. */
  pinnedTo(pathId: string): readonly FlowRecord[] {
    return Object.freeze([...this.flows.values()].filter((f) => f.pathId === pathId && f.state === 'established' && !f.migratable).sort((a, b) => a.key.localeCompare(b.key)));
  }

  stats(nowMs: number): FlowStats {
    const byState: Record<FlowState, number> = { new: 0, established: 0, closing: 0, closed: 0, stalled: 0 };
    let longLived = 0;
    for (const f of this.flows.values()) { byState[f.state] += 1; if (f.state !== 'closed' && nowMs - f.firstSeenMs >= this.config.longLivedMs) longLived += 1; }
    return Object.freeze({ active: this.flows.size - byState.closed, byState: Object.freeze(byState), longLived, evicted: this.evicted, created: this.created, closed: this.closedCount });
  }
}
