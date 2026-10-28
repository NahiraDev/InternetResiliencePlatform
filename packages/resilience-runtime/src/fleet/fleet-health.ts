/**
 * Phase 120 — Fleet Health & Observability.
 *
 * Aggregates per-device health reports and presence into tenant-scoped fleet
 * rollups: availability, degraded and offline ratios, version skew and SLO
 * status, with ranked offenders. Rollups never mix tenants; callers must pass a
 * single-tenant device set.
 */

import { derivePresence, type Presence, type PresencePolicy, DEFAULT_PRESENCE_POLICY } from './device-lifecycle.js';
import { compareVersions, type ManagedDevice } from './inventory.js';

export interface DeviceHealthReport {
  readonly deviceId: string;
  readonly status: 'healthy' | 'degraded' | 'failed' | 'unknown';
  readonly score: number;
  readonly reportedAtMs: number;
}

export interface FleetSlo { readonly minAvailability: number; readonly maxDegradedRatio: number; readonly maxVersionSkew: number }
export const DEFAULT_FLEET_SLO: FleetSlo = Object.freeze({ minAvailability: 0.95, maxDegradedRatio: 0.1, maxVersionSkew: 2 });

export interface FleetHealthSummary {
  readonly tenantId: string;
  readonly total: number;
  readonly online: number;
  readonly offline: number;
  readonly healthy: number;
  readonly degraded: number;
  readonly failed: number;
  readonly unknown: number;
  readonly availability: number;
  readonly degradedRatio: number;
  readonly versionDistribution: Readonly<Record<string, number>>;
  readonly versionSkew: number;
  readonly worst: readonly { readonly deviceId: string; readonly score: number; readonly presence: Presence }[];
  readonly slo: { readonly met: boolean; readonly violations: readonly string[] };
}

export class FleetHealthError extends Error {
  constructor(message: string) { super(message); this.name = 'FleetHealthError'; }
}

export const summarizeFleetHealth = (
  devices: readonly ManagedDevice[], reports: readonly DeviceHealthReport[], nowMs: number,
  options: { readonly presence?: PresencePolicy; readonly slo?: FleetSlo; readonly topN?: number; readonly reportMaxAgeMs?: number } = {},
): FleetHealthSummary => {
  const tenants = new Set(devices.map((d) => d.tenantId));
  if (tenants.size > 1) throw new FleetHealthError('fleet health rollups must be computed per tenant');
  const tenantId = [...tenants][0] ?? 'none';
  const presencePolicy = options.presence ?? DEFAULT_PRESENCE_POLICY;
  const slo = options.slo ?? DEFAULT_FLEET_SLO;
  const maxAge = options.reportMaxAgeMs ?? 10 * 60_000;
  const latest = new Map<string, DeviceHealthReport>();
  for (const r of reports) { const cur = latest.get(r.deviceId); if (!cur || r.reportedAtMs > cur.reportedAtMs) latest.set(r.deviceId, r); }
  const counts = { healthy: 0, degraded: 0, failed: 0, unknown: 0 };
  let online = 0;
  const versions: Record<string, number> = {};
  const rows: { deviceId: string; score: number; presence: Presence }[] = [];
  for (const d of devices) {
    const presence = derivePresence(d.lastSeenAtMs, nowMs, presencePolicy);
    if (presence === 'online') online += 1;
    const rep = latest.get(d.deviceId);
    const fresh = rep !== undefined && nowMs - rep.reportedAtMs <= maxAge && presence !== 'lost' && presence !== 'never-seen';
    const status = fresh ? (rep as DeviceHealthReport).status : 'unknown';
    counts[status] += 1;
    versions[d.agentVersion] = (versions[d.agentVersion] ?? 0) + 1;
    rows.push({ deviceId: d.deviceId, score: fresh ? (rep as DeviceHealthReport).score : 0, presence });
  }
  const total = devices.length;
  const availability = total === 0 ? 1 : online / total;
  const degradedRatio = total === 0 ? 0 : (counts.degraded + counts.failed) / total;
  const sorted = Object.keys(versions).sort(compareVersions);
  const skew = sorted.length < 2 ? 0 : majorMinorDistance(sorted[0] as string, sorted[sorted.length - 1] as string);
  const violations: string[] = [];
  if (availability < slo.minAvailability) violations.push('availability-below-slo');
  if (degradedRatio > slo.maxDegradedRatio) violations.push('degraded-ratio-above-slo');
  if (skew > slo.maxVersionSkew) violations.push('version-skew-above-slo');
  return Object.freeze({
    tenantId, total, online, offline: total - online, ...counts, availability, degradedRatio,
    versionDistribution: Object.freeze(versions), versionSkew: skew,
    worst: Object.freeze(rows.sort((a, b) => a.score - b.score || a.deviceId.localeCompare(b.deviceId)).slice(0, options.topN ?? 5)),
    slo: Object.freeze({ met: violations.length === 0, violations: Object.freeze(violations) }),
  });
};

const majorMinorDistance = (low: string, high: string): number => {
  const l = low.split('.').map((s) => Number.parseInt(s, 10) || 0);
  const h = high.split('.').map((s) => Number.parseInt(s, 10) || 0);
  return Math.abs(((h[0] ?? 0) - (l[0] ?? 0)) * 100 + ((h[1] ?? 0) - (l[1] ?? 0)));
};
