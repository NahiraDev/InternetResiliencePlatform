/**
 * Phase 138 — Capability Discovery & Provider Directory.
 *
 * A directory of providers keyed by the capabilities they offer, with semantic
 * version ranges, heartbeat-based liveness and deterministic resolution.
 * Discovery is read-only metadata: selecting a provider here grants no
 * authority; resources are still admitted through the fabric.
 */

import { compareSemVer, parseSemVer, satisfies } from './semver.js';

export interface ProviderCapability { readonly name: string; readonly version: string }
export interface ProviderListing {
  readonly id: string;
  readonly capabilities: readonly ProviderCapability[];
  readonly region?: string;
  readonly priority: number;
  readonly heartbeatTtlMs: number;
  readonly lastHeartbeatMs: number;
}
export interface CapabilityQuery { readonly capability: string; readonly range?: string; readonly region?: string; readonly excludeProviders?: readonly string[] }
export interface Resolution { readonly providerId: string; readonly capability: ProviderCapability; readonly alive: true }

export class CapabilityDirectory {
  private readonly listings = new Map<string, ProviderListing>();

  announce(listing: Omit<ProviderListing, 'lastHeartbeatMs'>, nowMs: number): void {
    if (listing.heartbeatTtlMs <= 0) throw new Error('heartbeatTtlMs must be positive');
    for (const c of listing.capabilities) parseSemVer(c.version);
    this.listings.set(listing.id, Object.freeze({ ...listing, lastHeartbeatMs: nowMs }));
  }

  heartbeat(id: string, nowMs: number): boolean {
    const l = this.listings.get(id);
    if (!l) return false;
    this.listings.set(id, Object.freeze({ ...l, lastHeartbeatMs: nowMs }));
    return true;
  }

  withdraw(id: string): boolean { return this.listings.delete(id); }
  isAlive(id: string, nowMs: number): boolean { const l = this.listings.get(id); return l !== undefined && nowMs - l.lastHeartbeatMs <= l.heartbeatTtlMs; }

  /** All matching live providers, best first: region match, higher version, higher priority, then id. */
  discover(query: CapabilityQuery, nowMs: number): readonly Resolution[] {
    const out: { r: Resolution; l: ProviderListing }[] = [];
    for (const l of this.listings.values()) {
      if (!this.isAlive(l.id, nowMs) || query.excludeProviders?.includes(l.id)) continue;
      const matches = l.capabilities.filter((c) => c.name === query.capability && (!query.range || satisfies(c.version, query.range)));
      const best = matches.sort((a, b) => compareSemVer(parseSemVer(b.version), parseSemVer(a.version)))[0];
      if (best) out.push({ r: Object.freeze({ providerId: l.id, capability: best, alive: true as const }), l });
    }
    return Object.freeze(out.sort((a, b) =>
      (query.region ? Number(b.l.region === query.region) - Number(a.l.region === query.region) : 0)
      || compareSemVer(parseSemVer(b.r.capability.version), parseSemVer(a.r.capability.version))
      || b.l.priority - a.l.priority || a.l.id.localeCompare(b.l.id)).map((x) => x.r));
  }

  resolve(query: CapabilityQuery, nowMs: number): Resolution | undefined { return this.discover(query, nowMs)[0]; }

  /** Capabilities currently offered by no live provider but required: the gaps. */
  gaps(required: readonly string[], nowMs: number): readonly string[] {
    return Object.freeze(required.filter((c) => this.discover({ capability: c }, nowMs).length === 0).sort());
  }

  /** Removes listings dead for longer than `graceMs` past their TTL. */
  sweep(nowMs: number, graceMs = 0): readonly string[] {
    const gone: string[] = [];
    for (const l of [...this.listings.values()]) if (nowMs - l.lastHeartbeatMs > l.heartbeatTtlMs + graceMs) { this.listings.delete(l.id); gone.push(l.id); }
    return Object.freeze(gone.sort());
  }
}
