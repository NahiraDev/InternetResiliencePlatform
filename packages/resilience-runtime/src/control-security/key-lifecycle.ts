/**
 * Phase 110 — Secrets & Key Lifecycle.
 *
 * Versioned symmetric keys with an explicit lifecycle (active → retiring →
 * retired → destroyed, or revoked), rotation policy with overlap, and AES-256-GCM
 * envelope encryption that records the key version. Key material never appears
 * in snapshots or errors; only fingerprints do. Persistence of wrapped keys is
 * the caller's responsibility through the existing secret store boundaries.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export type KeyState = 'active' | 'retiring' | 'retired' | 'revoked' | 'destroyed';

export interface KeyRotationPolicy {
  readonly maxAgeMs: number;
  /** Time an outgoing key stays usable for decryption only. */
  readonly overlapMs: number;
  /** Retired keys are destroyed after this period. */
  readonly destroyAfterMs: number;
}

export const DEFAULT_KEY_ROTATION_POLICY: KeyRotationPolicy = Object.freeze({ maxAgeMs: 30 * 24 * 3_600_000, overlapMs: 24 * 3_600_000, destroyAfterMs: 90 * 24 * 3_600_000 });

export interface KeyDescriptor {
  readonly keyId: string;
  readonly version: number;
  readonly state: KeyState;
  readonly fingerprint: string;
  readonly createdAtMs: number;
  readonly stateChangedAtMs: number;
}

export interface SealedEnvelope {
  readonly keyId: string;
  readonly version: number;
  readonly iv: string;
  readonly tag: string;
  readonly ciphertext: string;
}

export class KeyLifecycleError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'KeyLifecycleError'; }
}

interface KeyRecord { descriptor: KeyDescriptor; material: Buffer | undefined }

export class KeyLifecycleManager {
  private readonly keys = new Map<string, KeyRecord[]>();
  constructor(private readonly policy: KeyRotationPolicy = DEFAULT_KEY_ROTATION_POLICY, private readonly random: (n: number) => Buffer = randomBytes) {
    if (policy.maxAgeMs <= 0 || policy.overlapMs < 0 || policy.destroyAfterMs <= 0) throw new KeyLifecycleError('invalid-policy');
  }

  private mint(keyId: string, version: number, nowMs: number): KeyRecord {
    const material = this.random(32);
    return { material, descriptor: Object.freeze({ keyId, version, state: 'active', fingerprint: createHash('sha256').update(material).digest('hex').slice(0, 16), createdAtMs: nowMs, stateChangedAtMs: nowMs }) };
  }

  create(keyId: string, nowMs: number): KeyDescriptor {
    if (this.keys.has(keyId)) throw new KeyLifecycleError('key-exists');
    const rec = this.mint(keyId, 1, nowMs);
    this.keys.set(keyId, [rec]);
    return rec.descriptor;
  }

  private setState(rec: KeyRecord, state: KeyState, nowMs: number) {
    rec.descriptor = Object.freeze({ ...rec.descriptor, state, stateChangedAtMs: nowMs });
    if (state === 'destroyed' || state === 'revoked') { rec.material?.fill(0); rec.material = undefined; }
  }

  active(keyId: string): KeyRecord | undefined { return this.keys.get(keyId)?.find((r) => r.descriptor.state === 'active'); }

  rotate(keyId: string, nowMs: number): KeyDescriptor {
    const versions = this.keys.get(keyId);
    const current = this.active(keyId);
    if (!versions || !current) throw new KeyLifecycleError('no-active-key');
    this.setState(current, 'retiring', nowMs);
    const next = this.mint(keyId, current.descriptor.version + 1, nowMs);
    versions.push(next);
    return next.descriptor;
  }

  /** Revocation is immediate and destroys material; ciphertext under it becomes unrecoverable by design. */
  revoke(keyId: string, version: number, nowMs: number): KeyDescriptor {
    const rec = this.keys.get(keyId)?.find((r) => r.descriptor.version === version);
    if (!rec) throw new KeyLifecycleError('unknown-key-version');
    this.setState(rec, 'revoked', nowMs);
    return rec.descriptor;
  }

  /** Advances time-based transitions; returns descriptors that changed. */
  tick(nowMs: number): readonly KeyDescriptor[] {
    const changed: KeyDescriptor[] = [];
    for (const versions of this.keys.values()) {
      for (const rec of versions) {
        const d = rec.descriptor;
        if (d.state === 'retiring' && nowMs - d.stateChangedAtMs >= this.policy.overlapMs) { this.setState(rec, 'retired', nowMs); changed.push(rec.descriptor); }
        else if (d.state === 'retired' && nowMs - d.stateChangedAtMs >= this.policy.destroyAfterMs) { this.setState(rec, 'destroyed', nowMs); changed.push(rec.descriptor); }
      }
    }
    return Object.freeze(changed);
  }

  dueForRotation(nowMs: number): readonly string[] {
    return Object.freeze([...this.keys.keys()].filter((id) => { const a = this.active(id); return a !== undefined && nowMs - a.descriptor.createdAtMs >= this.policy.maxAgeMs; }).sort());
  }

  describe(keyId: string): readonly KeyDescriptor[] { return Object.freeze((this.keys.get(keyId) ?? []).map((r) => r.descriptor)); }

  seal(keyId: string, plaintext: Buffer | string, aad: string = ''): SealedEnvelope {
    const rec = this.active(keyId);
    if (!rec?.material) throw new KeyLifecycleError('no-active-key');
    const iv = this.random(12);
    const cipher = createCipheriv('aes-256-gcm', rec.material, iv);
    cipher.setAAD(Buffer.from(`${keyId}|${rec.descriptor.version}|${aad}`));
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Object.freeze({ keyId, version: rec.descriptor.version, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ct.toString('base64') });
  }

  /** Decrypts with the recorded version; retiring keys still decrypt, retired/revoked/destroyed do not. */
  open(envelope: SealedEnvelope, aad: string = ''): Buffer {
    const rec = this.keys.get(envelope.keyId)?.find((r) => r.descriptor.version === envelope.version);
    if (!rec || !rec.material || !(rec.descriptor.state === 'active' || rec.descriptor.state === 'retiring')) throw new KeyLifecycleError('key-unavailable');
    try {
      const decipher = createDecipheriv('aes-256-gcm', rec.material, Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(Buffer.from(`${envelope.keyId}|${envelope.version}|${aad}`));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
    } catch { throw new KeyLifecycleError('decryption-failed'); }
  }

  /** Re-encrypts under the current active version so retiring keys can be retired safely. */
  reseal(envelope: SealedEnvelope, aad: string = ''): SealedEnvelope { return this.seal(envelope.keyId, this.open(envelope, aad), aad); }
}
