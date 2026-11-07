import type { GatewayMetadata } from './index.js';
export type GatewaySecurityAlgorithm = 'ed25519';
export interface GatewaySecurityKey {
    keyId: string;
    algorithm: GatewaySecurityAlgorithm;
    publicKey: string;
    revoked?: boolean;
}
export interface GatewaySecurityPolicy {
    maxClockSkewMs: number;
    maxAttestationAgeMs: number;
    requireArtifactAttestation: boolean;
    maxTrackedNonces: number;
    allowedProviderIds?: readonly string[];
}
export interface GatewayIdentityAttestationPayload {
    gatewayId: string;
    providerId?: string;
    keyId: string;
    algorithm: GatewaySecurityAlgorithm;
    issuedAt: string;
    expiresAt: string;
    nonce: string;
}
export interface GatewayIdentityAttestation {
    payload: GatewayIdentityAttestationPayload;
    signature: string;
}
export interface GatewayArtifactAttestationPayload {
    gatewayId: string;
    artifactId: string;
    version: string;
    digestSha256: string;
    keyId: string;
    algorithm: GatewaySecurityAlgorithm;
    issuedAt: string;
    expiresAt: string;
    nonce: string;
}
export interface GatewayArtifactAttestation {
    payload: GatewayArtifactAttestationPayload;
    signature: string;
}
export interface GatewaySecurityAssessment {
    gatewayId: string;
    identityVerified: boolean;
    artifactVerified: boolean;
    assessedAt: string;
    identityKeyId: string;
    artifactKeyId?: string;
}
export interface GatewaySecurityTelemetry {
    publish(event: {
        type: 'gateway.security.verified' | 'gateway.security.rejected';
        gatewayId: string;
        occurredAt: string;
        reason: string;
    }): Promise<void> | void;
}
export declare function sha256Hex(input: Uint8Array): string;
export declare function assertSha256Digest(value: string): void;
export declare function verifyArtifactDigest(input: Uint8Array, expectedDigest: string): boolean;
export declare class GatewaySecurityVerifier {
    private readonly telemetry?;
    private readonly keys;
    private readonly seenNonces;
    private readonly policy;
    constructor(keys: readonly GatewaySecurityKey[], policy?: Partial<GatewaySecurityPolicy>, telemetry?: GatewaySecurityTelemetry | undefined);
    addKey(key: GatewaySecurityKey): void;
    revokeKey(keyId: string): void;
    verifyIdentity(gateway: GatewayMetadata, attestation: GatewayIdentityAttestation, now?: Date): GatewaySecurityAssessment;
    verifyArtifact(gateway: GatewayMetadata, attestation: GatewayArtifactAttestation, artifact: Uint8Array, now?: Date): GatewaySecurityAssessment;
    assess(gateway: GatewayMetadata, identity: GatewayIdentityAttestation, artifact?: {
        attestation: GatewayArtifactAttestation;
        bytes: Uint8Array;
    }, now?: Date): GatewaySecurityAssessment;
    private publishTelemetry;
    private consumeNonce;
}
export declare function canonicalSecurityPayload(payload: unknown): string;
//# sourceMappingURL=security.d.ts.map