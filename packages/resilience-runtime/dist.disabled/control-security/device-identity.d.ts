/**
 * Phase 108 — Device Identity & Enrollment Trust.
 *
 * Enrollment uses single-use, expiring, HMAC-signed tokens plus a signed
 * proof-of-possession of an Ed25519 device key. A device identity is bound to
 * its public-key fingerprint and moves through an explicit trust state
 * machine. Signing secrets are supplied by the caller and never stored here.
 */
export type DeviceTrustState = 'pending' | 'enrolled' | 'suspended' | 'revoked';
export interface EnrollmentTokenClaims {
    readonly tokenId: string;
    readonly tenantId: string;
    readonly issuedAtMs: number;
    readonly expiresAtMs: number;
    readonly maxTrust: 'standard' | 'elevated';
}
export interface DeviceIdentity {
    readonly deviceId: string;
    readonly tenantId: string;
    readonly publicKeyFingerprint: string;
    readonly publicKeyPem: string;
    readonly state: DeviceTrustState;
    readonly trust: 'standard' | 'elevated';
    readonly enrolledAtMs?: number;
    readonly updatedAtMs: number;
    readonly history: readonly {
        readonly from: DeviceTrustState;
        readonly to: DeviceTrustState;
        readonly atMs: number;
        readonly reason: string;
    }[];
}
export declare class EnrollmentError extends Error {
    readonly code: string;
    constructor(code: string, message?: string);
}
export declare const fingerprintPublicKey: (publicKeyPem: string) => string;
export declare const issueEnrollmentToken: (secret: string | Buffer, claims: Omit<EnrollmentTokenClaims, "tokenId"> & {
    tokenId?: string;
}) => string;
export declare const verifyEnrollmentToken: (secret: string | Buffer, token: string, nowMs: number) => EnrollmentTokenClaims;
/** Canonical proof-of-possession message the device must sign with its private key. */
export declare const enrollmentProofMessage: (tokenId: string, deviceId: string) => Buffer;
export declare class DeviceEnrollmentLedger {
    private readonly tokenSecret;
    private readonly devices;
    private readonly consumedTokens;
    private readonly fingerprints;
    constructor(tokenSecret: string | Buffer);
    enroll(input: {
        token: string;
        deviceId: string;
        publicKeyPem: string;
        proofSignature: Buffer;
        nowMs: number;
    }): DeviceIdentity;
    transition(deviceId: string, to: DeviceTrustState, reason: string, nowMs: number): DeviceIdentity;
    get(deviceId: string): DeviceIdentity | undefined;
    /** A device is trusted for control-plane use only while enrolled. */
    isTrusted(deviceId: string): boolean;
    list(tenantId?: string): readonly DeviceIdentity[];
}
//# sourceMappingURL=device-identity.d.ts.map