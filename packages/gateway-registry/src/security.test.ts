import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { GatewayMetadata } from './index.js';
import {
  GatewaySecurityVerifier,
  canonicalSecurityPayload,
  sha256Hex,
  verifyArtifactDigest,
  type GatewayArtifactAttestationPayload,
  type GatewayIdentityAttestationPayload,
} from './security.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const gateway: GatewayMetadata = {
  id: 'gw-security-1',
  name: 'Security Test Gateway',
  endpoint: { host: '198.51.100.10', port: 51820, family: 'ipv4' },
  ownership: { ownerId: 'owner-1', managedBy: 'provider' },
  capabilities: { tunnelProtocols: ['wireguard'], addressFamilies: ['ipv4'], transports: ['udp'], features: [] },
  lifecycle: 'active',
  trust: 'pending',
  tags: ['test'],
  providerId: 'provider-a',
  createdAt: '2026-08-28T12:00:00.000Z',
  updatedAt: '2026-08-28T12:00:00.000Z',
};

const signPayload = (payload: unknown): string => sign(null, Buffer.from(canonicalSecurityPayload(payload)), privateKey).toString('base64');

function makeIdentity(now = '2026-08-28T12:00:00.000Z') {
  const payload: GatewayIdentityAttestationPayload = {
    gatewayId: gateway.id,
    providerId: gateway.providerId,
    keyId: 'key-1',
    algorithm: 'ed25519',
    issuedAt: now,
    expiresAt: '2026-08-28T12:05:00.000Z',
    nonce: 'nonce-identity-1',
  };
  return { payload, signature: signPayload(payload) };
}

function makeArtifact(bytes: Uint8Array, now = '2026-08-28T12:00:00.000Z') {
  const payload: GatewayArtifactAttestationPayload = {
    gatewayId: gateway.id,
    artifactId: 'gateway-agent',
    version: '1.2.3',
    digestSha256: sha256Hex(bytes),
    keyId: 'key-1',
    algorithm: 'ed25519',
    issuedAt: now,
    expiresAt: '2026-08-28T12:05:00.000Z',
    nonce: 'nonce-artifact-1',
  };
  return { payload, signature: signPayload(payload) };
}

function verifier(requireArtifactAttestation = true) {
  return new GatewaySecurityVerifier(
    [{ keyId: 'key-1', algorithm: 'ed25519', publicKey: publicKeyPem }],
    { requireArtifactAttestation },
  );
}

describe('@irp/gateway-registry security', () => {
  it('verifies a signed identity and matching signed artifact', () => {
    const bytes = Buffer.from('gateway-agent-binary-v1.2.3');
    const assessment = verifier().assess(gateway, makeIdentity(), { attestation: makeArtifact(bytes), bytes }, new Date('2026-08-28T12:01:00.000Z'));
    expect(assessment.identityVerified).toBe(true);
    expect(assessment.artifactVerified).toBe(true);
    expect(assessment.identityKeyId).toBe('key-1');
  });

  it('rejects tampered identity payloads', () => {
    const identity = makeIdentity();
    identity.payload.providerId = 'attacker';
    expect(() => verifier().verifyIdentity(gateway, identity, new Date('2026-08-28T12:01:00.000Z'))).toThrow('signature verification failed');
  });

  it('rejects expired and future attestations', () => {
    const expired = makeIdentity('2026-08-28T11:00:00.000Z');
    expect(() => verifier().verifyIdentity(gateway, expired, new Date('2026-08-28T12:01:00.000Z'))).toThrow('expired');

    const future = makeIdentity('2026-08-28T12:10:00.000Z');
    expect(() => verifier().verifyIdentity(gateway, future, new Date('2026-08-28T12:01:00.000Z'))).toThrow('future');
  });

  it('rejects revoked keys and provider policy violations', () => {
    const checked = verifier();
    checked.revokeKey('key-1');
    expect(() => checked.verifyIdentity(gateway, makeIdentity(), new Date('2026-08-28T12:01:00.000Z'))).toThrow('revoked');

    const policyVerifier = new GatewaySecurityVerifier(
      [{ keyId: 'key-1', algorithm: 'ed25519', publicKey: publicKeyPem }],
      { requireArtifactAttestation: false, allowedProviderIds: ['provider-b'] },
    );
    expect(() => policyVerifier.verifyIdentity(gateway, makeIdentity(), new Date('2026-08-28T12:01:00.000Z'))).toThrow('provider is not allowed');
  });

  it('rejects an artifact whose bytes do not match its signed digest', () => {
    const attestation = makeArtifact(Buffer.from('expected'));
    expect(() => verifier().verifyArtifact(gateway, attestation, Buffer.from('tampered'), new Date('2026-08-28T12:01:00.000Z'))).toThrow('digest does not match');
  });

  it('rejects mismatched identity and artifact signing keys', () => {
    const second = generateKeyPairSync('ed25519');
    const secondPublic = second.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const bytes = Buffer.from('artifact');
    const artifactPayload = makeArtifact(bytes).payload;
    const artifact = {
      payload: { ...artifactPayload, keyId: 'key-2' },
      signature: sign(null, Buffer.from(canonicalSecurityPayload({ ...artifactPayload, keyId: 'key-2' })), second.privateKey).toString('base64'),
    };
    const checked = new GatewaySecurityVerifier([
      { keyId: 'key-1', algorithm: 'ed25519', publicKey: publicKeyPem },
      { keyId: 'key-2', algorithm: 'ed25519', publicKey: secondPublic },
    ]);
    expect(() => checked.assess(gateway, makeIdentity(), { attestation: artifact, bytes }, new Date('2026-08-28T12:01:00.000Z'))).toThrow('signer keys do not match');
  });

  it('supports digest-only verification without accepting malformed digests', () => {
    const bytes = Buffer.from('payload');
    const digest = sha256Hex(bytes);
    expect(verifyArtifactDigest(bytes, digest)).toBe(true);
    expect(verifyArtifactDigest(Buffer.from('other'), digest)).toBe(false);
    expect(() => verifyArtifactDigest(bytes, 'not-a-digest')).toThrow('lowercase SHA-256');
  });

  it('does not require artifact evidence when policy explicitly disables that requirement', () => {
    const assessment = verifier(false).assess(gateway, makeIdentity(), undefined, new Date('2026-08-28T12:01:00.000Z'));
    expect(assessment.identityVerified).toBe(true);
    expect(assessment.artifactVerified).toBe(false);
  });
});
