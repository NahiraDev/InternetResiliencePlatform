/**
 * Phase 110 — Secrets & Key Lifecycle.
 *
 * Versioned symmetric keys with an explicit lifecycle (active → retiring →
 * retired → destroyed, or revoked), rotation policy with overlap, and AES-256-GCM
 * envelope encryption that records the key version. Key material never appears
 * in snapshots or errors; only fingerprints do. Persistence of wrapped keys is
 * the caller's responsibility through the existing secret store boundaries.
 */
export type KeyState = 'active' | 'retiring' | 'retired' | 'revoked' | 'destroyed';
export interface KeyRotationPolicy {
    readonly maxAgeMs: number;
    /** Time an outgoing key stays usable for decryption only. */
    readonly overlapMs: number;
    /** Retired keys are destroyed after this period. */
    readonly destroyAfterMs: number;
}
export declare const DEFAULT_KEY_ROTATION_POLICY: KeyRotationPolicy;
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
export declare class KeyLifecycleError extends Error {
    readonly code: string;
    constructor(code: string);
}
interface KeyRecord {
    descriptor: KeyDescriptor;
    material: Buffer | undefined;
}
export declare class KeyLifecycleManager {
    private readonly policy;
    private readonly random;
    private readonly keys;
    constructor(policy?: KeyRotationPolicy, random?: (n: number) => Buffer);
    private mint;
    create(keyId: string, nowMs: number): KeyDescriptor;
    private setState;
    active(keyId: string): KeyRecord | undefined;
    rotate(keyId: string, nowMs: number): KeyDescriptor;
    /** Revocation is immediate and destroys material; ciphertext under it becomes unrecoverable by design. */
    revoke(keyId: string, version: number, nowMs: number): KeyDescriptor;
    /** Advances time-based transitions; returns descriptors that changed. */
    tick(nowMs: number): readonly KeyDescriptor[];
    dueForRotation(nowMs: number): readonly string[];
    describe(keyId: string): readonly KeyDescriptor[];
    seal(keyId: string, plaintext: Buffer | string, aad?: string): SealedEnvelope;
    /** Decrypts with the recorded version; retiring keys still decrypt, retired/revoked/destroyed do not. */
    open(envelope: SealedEnvelope, aad?: string): Buffer;
    /** Re-encrypts under the current active version so retiring keys can be retired safely. */
    reseal(envelope: SealedEnvelope, aad?: string): SealedEnvelope;
}
export {};
//# sourceMappingURL=key-lifecycle.d.ts.map