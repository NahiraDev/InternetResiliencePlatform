/**
 * Phase 141 — Privacy-Preserving Telemetry.
 *
 * Field-level minimization applied before telemetry leaves a trust domain:
 * keyed pseudonymization (HMAC-SHA256, rotating salt epochs), address
 * coarsening, timestamp bucketing, k-anonymity suppression of small groups
 * and Laplace noise for released counts with an injected random source.
 * Unknown fields are dropped (deny by default).
 */

import { createHmac } from 'node:crypto';
import { formatAddress, parseAddress } from '../dataplane/cidr.js';

export type FieldTreatment = 'keep' | 'pseudonymize' | 'coarsen-ip' | 'bucket-time' | 'drop';
export interface PrivacyPolicy { readonly fields: Readonly<Record<string, FieldTreatment>>; readonly ipv4Prefix: number; readonly ipv6Prefix: number; readonly timeBucketMs: number; readonly saltEpochMs: number }

export const DEFAULT_PRIVACY_POLICY: PrivacyPolicy = Object.freeze({ fields: Object.freeze({}), ipv4Prefix: 24, ipv6Prefix: 48, timeBucketMs: 60_000, saltEpochMs: 86_400_000 });

export class Pseudonymizer {
  constructor(private readonly masterKey: Buffer | string, private readonly epochMs: number) { if (epochMs <= 0) throw new Error('epochMs must be positive'); }
  /** Stable within an epoch, unlinkable across epochs. */
  pseudonym(value: string, nowMs: number, context = 'default'): string {
    const epoch = Math.floor(nowMs / this.epochMs);
    const key = createHmac('sha256', this.masterKey).update(`epoch:${epoch}`).digest();
    return createHmac('sha256', key).update(`${context}\u0000${value}`).digest('hex').slice(0, 24);
  }
}

export const coarsenAddress = (text: string, ipv4Prefix: number, ipv6Prefix: number): string => {
  const a = parseAddress(text); const bits = a.family === 4 ? 32 : 128; const prefix = a.family === 4 ? ipv4Prefix : ipv6Prefix;
  const shift = BigInt(bits - prefix);
  return `${formatAddress(a.family, (a.value >> shift) << shift)}/${prefix}`;
};

export const minimizeRecord = (record: Readonly<Record<string, unknown>>, policy: PrivacyPolicy, pseudo: Pseudonymizer, nowMs: number): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    const t = policy.fields[k] ?? 'drop';
    if (t === 'drop') continue;
    if (t === 'keep') out[k] = v;
    else if (t === 'pseudonymize') out[k] = pseudo.pseudonym(String(v), nowMs, k);
    else if (t === 'coarsen-ip') out[k] = typeof v === 'string' ? coarsenAddress(v, policy.ipv4Prefix, policy.ipv6Prefix) : undefined;
    else if (t === 'bucket-time') out[k] = typeof v === 'number' ? Math.floor(v / policy.timeBucketMs) * policy.timeBucketMs : undefined;
    if (out[k] === undefined) delete out[k];
  }
  return out;
};

export interface GroupCount { readonly key: string; readonly count: number }

/** Suppresses groups smaller than k and reports how much was withheld. */
export const kAnonymize = (groups: readonly GroupCount[], k: number): { readonly released: readonly GroupCount[]; readonly suppressedGroups: number; readonly suppressedTotal: number } => {
  if (!Number.isInteger(k) || k < 1) throw new Error('k must be a positive integer');
  const released = groups.filter((g) => g.count >= k).map((g) => Object.freeze({ ...g }));
  const dropped = groups.filter((g) => g.count < k);
  return Object.freeze({ released: Object.freeze(released), suppressedGroups: dropped.length, suppressedTotal: dropped.reduce((s, g) => s + g.count, 0) });
};

/** Laplace(0, sensitivity/epsilon) noise from a uniform source in (0,1); the result is clamped at zero and rounded. */
export const noisyCount = (count: number, epsilon: number, random: () => number, sensitivity = 1): number => {
  if (!(epsilon > 0)) throw new Error('epsilon must be positive');
  const u = Math.min(1 - 1e-12, Math.max(1e-12, random())) - 0.5;
  const noise = -(sensitivity / epsilon) * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return Math.max(0, Math.round(count + noise));
};

/** Tracks cumulative epsilon so noisy releases cannot exceed a total privacy budget. */
export class PrivacyBudget {
  private spent = 0;
  constructor(private readonly total: number) { if (!(total > 0)) throw new Error('total budget must be positive'); }
  spend(epsilon: number): boolean { if (epsilon <= 0 || this.spent + epsilon > this.total + 1e-12) return false; this.spent += epsilon; return true; }
  remaining(): number { return Math.max(0, this.total - this.spent); }
}
