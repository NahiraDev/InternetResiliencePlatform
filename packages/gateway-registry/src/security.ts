import { createHash, createPublicKey, verify } from 'node:crypto';
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

const DEFAULT_POLICY: GatewaySecurityPolicy = {
  maxClockSkewMs: 30_000,
  maxAttestationAgeMs: 5 * 60_000,
  requireArtifactAttestation: true,
};

const SHA256_HEX = /^[a-f0-9]{64}$/;

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`${field} is required`);
}

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid ISO timestamp`);
  return parsed;
}

function assertWindow(issuedAt: string, expiresAt: string, nowMs: number, policy: GatewaySecurityPolicy): void {
  const issued = timestamp(issuedAt, 'issuedAt');
  const expires = timestamp(expiresAt, 'expiresAt');
  if (expires <= issued) throw new Error('expiresAt must be after issuedAt');
  if (issued > nowMs + policy.maxClockSkewMs) throw new Error('attestation issuedAt is in the future');
  if (expires < nowMs - policy.maxClockSkewMs) throw new Error('attestation has expired');
  if (nowMs - issued > policy.maxAttestationAgeMs + policy.maxClockSkewMs) throw new Error('attestation is too old');
}

function decodeSignature(value: string): Buffer {
  assertNonEmpty(value, 'signature');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length === 0) throw new Error('signature must be valid base64');
  return decoded;
}

function getKey(keys: ReadonlyMap<string, GatewaySecurityKey>, keyId: string): GatewaySecurityKey {
  const key = keys.get(keyId);
  if (!key) throw new Error(`security key ${keyId} is not trusted`);
  if (key.revoked) throw new Error(`security key ${keyId} is revoked`);
  if (key.algorithm !== 'ed25519') throw new Error(`unsupported security algorithm: ${key.algorithm}`);
  return key;
}

function verifySignature(payload: unknown, signature: string, key: GatewaySecurityKey): void {
  try {
    const publicKey = createPublicKey(key.publicKey);
    const valid = verify(null, Buffer.from(canonicalize(payload)), publicKey, decodeSignature(signature));
    if (!valid) throw new Error('signature verification failed');
  } catch (error) {
    if (error instanceof Error && error.message === 'signature verification failed') throw error;
    throw new Error('invalid security key or signature', { cause: error });
  }
}

function assertProviderAllowed(gateway: GatewayMetadata, providerId: string | undefined, policy: GatewaySecurityPolicy): void {
  if (providerId !== undefined && gateway.providerId !== undefined && providerId !== gateway.providerId) {
    throw new Error('attestation provider does not match gateway provider');
  }
  if (policy.allowedProviderIds !== undefined) {
    const effectiveProvider = providerId ?? gateway.providerId;
    if (effectiveProvider === undefined || !policy.allowedProviderIds.includes(effectiveProvider)) {
      throw new Error('gateway provider is not allowed by security policy');
    }
  }
}

export function sha256Hex(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function assertSha256Digest(value: string): void {
  if (!SHA256_HEX.test(value)) throw new Error('digestSha256 must be a lowercase SHA-256 hexadecimal digest');
}

export function verifyArtifactDigest(input: Uint8Array, expectedDigest: string): boolean {
  assertSha256Digest(expectedDigest);
  return sha256Hex(input) === expectedDigest;
}

export class GatewaySecurityVerifier {
  private readonly keys = new Map<string, GatewaySecurityKey>();
  private readonly policy: GatewaySecurityPolicy;

  constructor(
    keys: readonly GatewaySecurityKey[],
    policy: Partial<GatewaySecurityPolicy> = {},
    private readonly telemetry?: GatewaySecurityTelemetry,
  ) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
    if (!Number.isFinite(this.policy.maxClockSkewMs) || this.policy.maxClockSkewMs < 0) throw new Error('maxClockSkewMs must be a finite non-negative number');
    if (!Number.isFinite(this.policy.maxAttestationAgeMs) || this.policy.maxAttestationAgeMs <= 0) throw new Error('maxAttestationAgeMs must be a finite positive number');
    for (const key of keys) this.addKey(key);
  }

  addKey(key: GatewaySecurityKey): void {
    assertNonEmpty(key.keyId, 'keyId');
    assertNonEmpty(key.publicKey, 'publicKey');
    if (key.algorithm !== 'ed25519') throw new Error(`unsupported security algorithm: ${key.algorithm}`);
    createPublicKey(key.publicKey);
    this.keys.set(key.keyId, { ...key });
  }

  revokeKey(keyId: string): void {
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`security key ${keyId} is not trusted`);
    this.keys.set(keyId, { ...key, revoked: true });
  }

  verifyIdentity(
    gateway: GatewayMetadata,
    attestation: GatewayIdentityAttestation,
    now = new Date(),
  ): GatewaySecurityAssessment {
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) throw new Error('now must be a valid date');
    const payload = attestation.payload;
    if (payload.gatewayId !== gateway.id) throw new Error('identity attestation gatewayId does not match gateway');
    if (payload.algorithm !== 'ed25519') throw new Error('unsupported identity attestation algorithm');
    assertNonEmpty(payload.nonce, 'identity attestation nonce');
    assertWindow(payload.issuedAt, payload.expiresAt, nowMs, this.policy);
    assertProviderAllowed(gateway, payload.providerId, this.policy);
    const key = getKey(this.keys, payload.keyId);
    verifySignature(payload, attestation.signature, key);
    const assessment: GatewaySecurityAssessment = {
      gatewayId: gateway.id,
      identityVerified: true,
      artifactVerified: false,
      assessedAt: new Date(nowMs).toISOString(),
      identityKeyId: key.keyId,
    };
    return assessment;
  }

  verifyArtifact(
    gateway: GatewayMetadata,
    attestation: GatewayArtifactAttestation,
    artifact: Uint8Array,
    now = new Date(),
  ): GatewaySecurityAssessment {
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) throw new Error('now must be a valid date');
    const payload = attestation.payload;
    if (payload.gatewayId !== gateway.id) throw new Error('artifact attestation gatewayId does not match gateway');
    if (payload.algorithm !== 'ed25519') throw new Error('unsupported artifact attestation algorithm');
    assertNonEmpty(payload.artifactId, 'artifactId');
    assertNonEmpty(payload.version, 'artifact version');
    assertNonEmpty(payload.nonce, 'artifact attestation nonce');
    assertWindow(payload.issuedAt, payload.expiresAt, nowMs, this.policy);
    assertSha256Digest(payload.digestSha256);
    if (!verifyArtifactDigest(artifact, payload.digestSha256)) throw new Error('artifact digest does not match attestation');
    const key = getKey(this.keys, payload.keyId);
    verifySignature(payload, attestation.signature, key);
    return {
      gatewayId: gateway.id,
      identityVerified: false,
      artifactVerified: true,
      assessedAt: new Date(nowMs).toISOString(),
      identityKeyId: key.keyId,
      artifactKeyId: key.keyId,
    };
  }

  assess(
    gateway: GatewayMetadata,
    identity: GatewayIdentityAttestation,
    artifact?: { attestation: GatewayArtifactAttestation; bytes: Uint8Array },
    now = new Date(),
  ): GatewaySecurityAssessment {
    try {
      const identityAssessment = this.verifyIdentity(gateway, identity, now);
      if (this.policy.requireArtifactAttestation && artifact === undefined) throw new Error('artifact attestation is required by security policy');
      if (artifact !== undefined) {
        const artifactAssessment = this.verifyArtifact(gateway, artifact.attestation, artifact.bytes, now);
        if (artifactAssessment.artifactKeyId !== identityAssessment.identityKeyId) throw new Error('identity and artifact signer keys do not match');
        identityAssessment.artifactVerified = true;
        identityAssessment.artifactKeyId = artifactAssessment.artifactKeyId;
      }
      void this.telemetry?.publish({ type: 'gateway.security.verified', gatewayId: gateway.id, occurredAt: identityAssessment.assessedAt, reason: 'Gateway identity and supply-chain evidence verified.' });
      return identityAssessment;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'gateway security verification failed';
      void this.telemetry?.publish({ type: 'gateway.security.rejected', gatewayId: gateway.id, occurredAt: new Date().toISOString(), reason });
      throw error;
    }
  }
}

export function canonicalSecurityPayload(payload: unknown): string {
  return canonicalize(payload);
}
