/**
 * Phase 137 — Plugin/Provider Lifecycle Governance.
 *
 * Manifest verification (HMAC-SHA256 over a canonical manifest, constant-time
 * compare), capability allow-listing and a strict lifecycle state machine
 * (registered → verified → active ⇄ suspended → retired). Plugins that fail
 * health repeatedly are quarantined automatically; a plugin can never be
 * granted a capability that was not in its signed manifest or not allowed.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { compareSemVer, parseSemVer, satisfies } from './semver.js';

export type PluginState = 'registered' | 'verified' | 'active' | 'suspended' | 'quarantined' | 'retired';

export interface PluginManifest {
  readonly id: string;
  readonly version: string;
  readonly publisher: string;
  readonly capabilities: readonly string[];
  readonly requiresRuntime: string;
  readonly signature: string;
}

export interface PluginRecord { readonly manifest: PluginManifest; readonly state: PluginState; readonly consecutiveFailures: number; readonly history: readonly { readonly state: PluginState; readonly atMs: number; readonly reason: string }[] }

export class PluginGovernanceError extends Error {
  constructor(readonly code: 'bad-signature' | 'capability-not-allowed' | 'runtime-incompatible' | 'invalid-transition' | 'unknown-plugin' | 'downgrade' | 'untrusted-publisher', message?: string) { super(message ? `${code}: ${message}` : code); this.name = 'PluginGovernanceError'; }
}

const canonicalManifest = (m: Omit<PluginManifest, 'signature'>): string => JSON.stringify([m.id, m.version, m.publisher, [...m.capabilities].sort(), m.requiresRuntime]);

export const signManifest = (m: Omit<PluginManifest, 'signature'>, key: Buffer | string): string => createHmac('sha256', key).update(canonicalManifest(m)).digest('hex');

const TRANSITIONS: Readonly<Record<PluginState, readonly PluginState[]>> = {
  registered: ['verified', 'retired'], verified: ['active', 'retired'], active: ['suspended', 'quarantined', 'retired'],
  suspended: ['active', 'retired'], quarantined: ['suspended', 'retired'], retired: [],
};

export interface PluginGovernanceOptions {
  readonly publisherKeys: Readonly<Record<string, Buffer | string>>;
  readonly allowedCapabilities: readonly string[];
  readonly runtimeVersion: string;
  readonly failureThreshold?: number;
}

export class PluginGovernor {
  private readonly plugins = new Map<string, PluginRecord>();
  constructor(private readonly options: PluginGovernanceOptions) { parseSemVer(options.runtimeVersion); }

  register(manifest: PluginManifest, nowMs: number): PluginRecord {
    const prev = this.plugins.get(manifest.id);
    if (prev && compareSemVer(parseSemVer(manifest.version), parseSemVer(prev.manifest.version)) < 0) throw new PluginGovernanceError('downgrade', `${manifest.id} ${manifest.version} is older than ${prev.manifest.version}`);
    const rec: PluginRecord = Object.freeze({ manifest: Object.freeze({ ...manifest }), state: 'registered', consecutiveFailures: 0, history: Object.freeze([{ state: 'registered' as PluginState, atMs: nowMs, reason: 'registered' }]) });
    this.plugins.set(manifest.id, rec);
    return rec;
  }

  verify(id: string, nowMs: number): PluginRecord {
    const rec = this.require(id); const m = rec.manifest;
    const key = this.options.publisherKeys[m.publisher];
    if (key === undefined) throw new PluginGovernanceError('untrusted-publisher', m.publisher);
    const expected = Buffer.from(signManifest(m, key), 'hex'); const given = Buffer.from(m.signature, 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new PluginGovernanceError('bad-signature');
    const denied = m.capabilities.filter((c) => !this.options.allowedCapabilities.includes(c));
    if (denied.length) throw new PluginGovernanceError('capability-not-allowed', denied.join(','));
    if (!satisfies(this.options.runtimeVersion, m.requiresRuntime)) throw new PluginGovernanceError('runtime-incompatible', `${m.requiresRuntime} vs ${this.options.runtimeVersion}`);
    return this.move(rec, 'verified', nowMs, 'signature-and-capabilities-verified');
  }

  activate(id: string, nowMs: number): PluginRecord { return this.move(this.require(id), 'active', nowMs, 'activated'); }
  suspend(id: string, nowMs: number, reason: string): PluginRecord { return this.move(this.require(id), 'suspended', nowMs, reason); }
  retire(id: string, nowMs: number, reason: string): PluginRecord { return this.move(this.require(id), 'retired', nowMs, reason); }

  /** Records a health probe result; repeated failures quarantine an active plugin. */
  reportHealth(id: string, healthy: boolean, nowMs: number): PluginRecord {
    const rec = this.require(id);
    if (healthy) { const r = Object.freeze({ ...rec, consecutiveFailures: 0 }); this.plugins.set(id, r); return r; }
    const failures = rec.consecutiveFailures + 1;
    const updated = Object.freeze({ ...rec, consecutiveFailures: failures });
    this.plugins.set(id, updated);
    if (rec.state === 'active' && failures >= (this.options.failureThreshold ?? 3)) return this.move(updated, 'quarantined', nowMs, `health-failures:${failures}`);
    return updated;
  }

  /** The capabilities a plugin may currently exercise: only while active, and only those in its verified manifest. */
  effectiveCapabilities(id: string): readonly string[] {
    const rec = this.plugins.get(id);
    return rec?.state === 'active' ? Object.freeze([...rec.manifest.capabilities].sort()) : Object.freeze([]);
  }

  get(id: string): PluginRecord | undefined { return this.plugins.get(id); }
  list(): readonly PluginRecord[] { return Object.freeze([...this.plugins.values()].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))); }

  private require(id: string): PluginRecord { const r = this.plugins.get(id); if (!r) throw new PluginGovernanceError('unknown-plugin', id); return r; }
  private move(rec: PluginRecord, to: PluginState, nowMs: number, reason: string): PluginRecord {
    if (!TRANSITIONS[rec.state].includes(to)) throw new PluginGovernanceError('invalid-transition', `${rec.state} -> ${to}`);
    const next: PluginRecord = Object.freeze({ ...rec, state: to, history: Object.freeze([...rec.history, { state: to, atMs: nowMs, reason }]) });
    this.plugins.set(rec.manifest.id, next);
    return next;
  }
}
