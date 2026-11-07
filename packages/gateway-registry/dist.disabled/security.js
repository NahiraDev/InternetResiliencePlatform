import { createHash, createPublicKey, verify } from 'node:crypto';
const DEFAULT_POLICY = {
    maxClockSkewMs: 30_000,
    maxAttestationAgeMs: 5 * 60_000,
    requireArtifactAttestation: true,
    maxTrackedNonces: 10_000,
};
const SHA256_HEX = /^[a-f0-9]{64}$/;
const MAX_TELEMETRY_REASON_LENGTH = 256;
function canonicalize(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalize).join(',')}]`;
    const object = value;
    return `{${Object.keys(object)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
        .join(',')}}`;
}
function assertNonEmpty(value, field) {
    if (!value.trim())
        throw new Error(`${field} is required`);
}
function timestamp(value, field) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed))
        throw new Error(`${field} must be a valid ISO timestamp`);
    return parsed;
}
function assertWindow(issuedAt, expiresAt, nowMs, policy) {
    const issued = timestamp(issuedAt, 'issuedAt');
    const expires = timestamp(expiresAt, 'expiresAt');
    if (expires <= issued)
        throw new Error('expiresAt must be after issuedAt');
    if (expires < nowMs - policy.maxClockSkewMs)
        throw new Error('attestation has expired');
    if (issued > nowMs + policy.maxClockSkewMs)
        throw new Error('attestation issuedAt is in the future');
    if (nowMs - issued > policy.maxAttestationAgeMs + policy.maxClockSkewMs)
        throw new Error('attestation is too old');
    return expires;
}
function decodeSignature(value) {
    assertNonEmpty(value, 'signature');
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length === 0)
        throw new Error('signature must be valid base64');
    return decoded;
}
function getKey(keys, keyId) {
    const key = keys.get(keyId);
    if (!key)
        throw new Error(`security key ${keyId} is not trusted`);
    if (key.revoked)
        throw new Error(`security key ${keyId} is revoked`);
    if (key.algorithm !== 'ed25519')
        throw new Error(`unsupported security algorithm: ${key.algorithm}`);
    return key;
}
function verifySignature(payload, signature, key) {
    try {
        const publicKey = createPublicKey(key.publicKey);
        const valid = verify(null, Buffer.from(canonicalize(payload)), publicKey, decodeSignature(signature));
        if (!valid)
            throw new Error('signature verification failed');
    }
    catch (error) {
        if (error instanceof Error && error.message === 'signature verification failed')
            throw error;
        throw new Error('invalid security key or signature', { cause: error });
    }
}
function assertProviderAllowed(gateway, providerId, policy) {
    if (providerId !== undefined &&
        gateway.providerId !== undefined &&
        providerId !== gateway.providerId) {
        throw new Error('attestation provider does not match gateway provider');
    }
    if (policy.allowedProviderIds !== undefined) {
        const effectiveProvider = providerId ?? gateway.providerId;
        if (effectiveProvider === undefined || !policy.allowedProviderIds.includes(effectiveProvider)) {
            throw new Error('gateway provider is not allowed by security policy');
        }
    }
}
function boundedTelemetryReason(error) {
    const reason = error instanceof Error ? error.message : 'gateway security verification failed';
    return reason.replace(/[\r\n\t]+/g, ' ').slice(0, MAX_TELEMETRY_REASON_LENGTH);
}
export function sha256Hex(input) {
    return createHash('sha256').update(input).digest('hex');
}
export function assertSha256Digest(value) {
    if (!SHA256_HEX.test(value))
        throw new Error('digestSha256 must be a lowercase SHA-256 hexadecimal digest');
}
export function verifyArtifactDigest(input, expectedDigest) {
    assertSha256Digest(expectedDigest);
    return sha256Hex(input) === expectedDigest;
}
export class GatewaySecurityVerifier {
    telemetry;
    keys = new Map();
    seenNonces = new Map();
    policy;
    constructor(keys, policy = {}, telemetry) {
        this.telemetry = telemetry;
        this.policy = { ...DEFAULT_POLICY, ...policy };
        if (!Number.isFinite(this.policy.maxClockSkewMs) || this.policy.maxClockSkewMs < 0)
            throw new Error('maxClockSkewMs must be a finite non-negative number');
        if (!Number.isFinite(this.policy.maxAttestationAgeMs) || this.policy.maxAttestationAgeMs <= 0)
            throw new Error('maxAttestationAgeMs must be a finite positive number');
        if (!Number.isInteger(this.policy.maxTrackedNonces) || this.policy.maxTrackedNonces < 1)
            throw new Error('maxTrackedNonces must be a positive integer');
        for (const key of keys)
            this.addKey(key);
    }
    addKey(key) {
        assertNonEmpty(key.keyId, 'keyId');
        assertNonEmpty(key.publicKey, 'publicKey');
        if (key.algorithm !== 'ed25519')
            throw new Error(`unsupported security algorithm: ${key.algorithm}`);
        createPublicKey(key.publicKey);
        this.keys.set(key.keyId, { ...key });
    }
    revokeKey(keyId) {
        const key = this.keys.get(keyId);
        if (!key)
            throw new Error(`security key ${keyId} is not trusted`);
        this.keys.set(keyId, { ...key, revoked: true });
    }
    verifyIdentity(gateway, attestation, now = new Date()) {
        const nowMs = now.getTime();
        if (!Number.isFinite(nowMs))
            throw new Error('now must be a valid date');
        const payload = attestation.payload;
        if (payload.algorithm !== 'ed25519')
            throw new Error('unsupported identity attestation algorithm');
        assertNonEmpty(payload.nonce, 'identity attestation nonce');
        const key = getKey(this.keys, payload.keyId);
        verifySignature(payload, attestation.signature, key);
        if (payload.gatewayId !== gateway.id)
            throw new Error('identity attestation gatewayId does not match gateway');
        const expiresAt = assertWindow(payload.issuedAt, payload.expiresAt, nowMs, this.policy);
        assertProviderAllowed(gateway, payload.providerId, this.policy);
        this.consumeNonce(`identity:${key.keyId}:${payload.nonce}`, expiresAt, nowMs);
        return {
            gatewayId: gateway.id,
            identityVerified: true,
            artifactVerified: false,
            assessedAt: new Date(nowMs).toISOString(),
            identityKeyId: key.keyId,
        };
    }
    verifyArtifact(gateway, attestation, artifact, now = new Date()) {
        const nowMs = now.getTime();
        if (!Number.isFinite(nowMs))
            throw new Error('now must be a valid date');
        const payload = attestation.payload;
        if (payload.algorithm !== 'ed25519')
            throw new Error('unsupported artifact attestation algorithm');
        assertNonEmpty(payload.artifactId, 'artifactId');
        assertNonEmpty(payload.version, 'artifact version');
        assertNonEmpty(payload.nonce, 'artifact attestation nonce');
        const key = getKey(this.keys, payload.keyId);
        verifySignature(payload, attestation.signature, key);
        if (payload.gatewayId !== gateway.id)
            throw new Error('artifact attestation gatewayId does not match gateway');
        const expiresAt = assertWindow(payload.issuedAt, payload.expiresAt, nowMs, this.policy);
        assertSha256Digest(payload.digestSha256);
        if (!verifyArtifactDigest(artifact, payload.digestSha256))
            throw new Error('artifact digest does not match attestation');
        this.consumeNonce(`artifact:${key.keyId}:${payload.nonce}`, expiresAt, nowMs);
        return {
            gatewayId: gateway.id,
            identityVerified: false,
            artifactVerified: true,
            assessedAt: new Date(nowMs).toISOString(),
            identityKeyId: key.keyId,
            artifactKeyId: key.keyId,
        };
    }
    assess(gateway, identity, artifact, now = new Date()) {
        try {
            const identityAssessment = this.verifyIdentity(gateway, identity, now);
            if (this.policy.requireArtifactAttestation && artifact === undefined)
                throw new Error('artifact attestation is required by security policy');
            if (artifact !== undefined) {
                const artifactAssessment = this.verifyArtifact(gateway, artifact.attestation, artifact.bytes, now);
                if (artifactAssessment.artifactKeyId !== identityAssessment.identityKeyId)
                    throw new Error('identity and artifact signer keys do not match');
                identityAssessment.artifactVerified = true;
                identityAssessment.artifactKeyId = artifactAssessment.artifactKeyId;
            }
            this.publishTelemetry({
                type: 'gateway.security.verified',
                gatewayId: gateway.id,
                occurredAt: identityAssessment.assessedAt,
                reason: 'Gateway identity and supply-chain evidence verified.',
            });
            return identityAssessment;
        }
        catch (error) {
            this.publishTelemetry({
                type: 'gateway.security.rejected',
                gatewayId: gateway.id,
                occurredAt: new Date().toISOString(),
                reason: boundedTelemetryReason(error),
            });
            throw error;
        }
    }
    publishTelemetry(event) {
        try {
            void Promise.resolve(this.telemetry?.publish(event)).catch(() => undefined);
        }
        catch {
            // Telemetry is observational and must never alter verification semantics.
        }
    }
    consumeNonce(key, expiresAt, nowMs) {
        for (const [trackedKey, trackedExpiry] of this.seenNonces) {
            if (trackedExpiry <= nowMs)
                this.seenNonces.delete(trackedKey);
        }
        if (this.seenNonces.has(key))
            throw new Error('attestation nonce has already been used');
        if (this.seenNonces.size >= this.policy.maxTrackedNonces) {
            throw new Error('nonce tracking capacity is exhausted');
        }
        this.seenNonces.set(key, expiresAt);
    }
}
export function canonicalSecurityPayload(payload) {
    return canonicalize(payload);
}
//# sourceMappingURL=security.js.map