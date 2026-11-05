/**
 * Phase 108 — Device Identity & Enrollment Trust.
 *
 * Enrollment uses single-use, expiring, HMAC-signed tokens plus a signed
 * proof-of-possession of an Ed25519 device key. A device identity is bound to
 * its public-key fingerprint and moves through an explicit trust state
 * machine. Signing secrets are supplied by the caller and never stored here.
 */
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';
const TRANSITIONS = Object.freeze({
    pending: ['enrolled', 'revoked'], enrolled: ['suspended', 'revoked'], suspended: ['enrolled', 'revoked'], revoked: [],
});
export class EnrollmentError extends Error {
    code;
    constructor(code, message) {
        super(message ? `${code}: ${message}` : code);
        this.code = code;
        this.name = 'EnrollmentError';
    }
}
const b64 = (b) => b.toString('base64url');
const sign = (secret, payload) => createHmac('sha256', secret).update(payload).digest();
export const fingerprintPublicKey = (publicKeyPem) => {
    const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
    return createHash('sha256').update(der).digest('hex');
};
export const issueEnrollmentToken = (secret, claims) => {
    if (claims.expiresAtMs <= claims.issuedAtMs)
        throw new EnrollmentError('invalid-token-lifetime');
    const full = { ...claims, tokenId: claims.tokenId ?? randomBytes(12).toString('hex') };
    const payload = b64(Buffer.from(JSON.stringify(full)));
    return `${payload}.${b64(sign(secret, payload))}`;
};
export const verifyEnrollmentToken = (secret, token, nowMs) => {
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined)
        throw new EnrollmentError('malformed-token');
    const expected = sign(secret, payload);
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
        throw new EnrollmentError('bad-token-signature');
    let claims;
    try {
        claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    }
    catch {
        throw new EnrollmentError('malformed-token');
    }
    if (typeof claims.tokenId !== 'string' || typeof claims.tenantId !== 'string' || !Number.isFinite(claims.expiresAtMs))
        throw new EnrollmentError('malformed-token');
    if (nowMs >= claims.expiresAtMs)
        throw new EnrollmentError('token-expired');
    if (nowMs < claims.issuedAtMs - 60_000)
        throw new EnrollmentError('token-not-yet-valid');
    return Object.freeze(claims);
};
/** Canonical proof-of-possession message the device must sign with its private key. */
export const enrollmentProofMessage = (tokenId, deviceId) => Buffer.from(`irp-enroll-v1|${tokenId}|${deviceId}`);
export class DeviceEnrollmentLedger {
    tokenSecret;
    devices = new Map();
    consumedTokens = new Set();
    fingerprints = new Map();
    constructor(tokenSecret) {
        this.tokenSecret = tokenSecret;
    }
    enroll(input) {
        const claims = verifyEnrollmentToken(this.tokenSecret, input.token, input.nowMs);
        if (this.consumedTokens.has(claims.tokenId))
            throw new EnrollmentError('token-already-used');
        if (this.devices.has(input.deviceId))
            throw new EnrollmentError('device-already-enrolled');
        let publicKey;
        let fingerprint;
        try {
            publicKey = createPublicKey(input.publicKeyPem);
            fingerprint = fingerprintPublicKey(input.publicKeyPem);
        }
        catch {
            throw new EnrollmentError('invalid-public-key');
        }
        if (publicKey.asymmetricKeyType !== 'ed25519')
            throw new EnrollmentError('unsupported-key-type');
        if (this.fingerprints.has(fingerprint))
            throw new EnrollmentError('public-key-already-bound');
        const ok = cryptoVerify(null, enrollmentProofMessage(claims.tokenId, input.deviceId), publicKey, input.proofSignature);
        if (!ok)
            throw new EnrollmentError('proof-of-possession-failed');
        this.consumedTokens.add(claims.tokenId);
        this.fingerprints.set(fingerprint, input.deviceId);
        const identity = Object.freeze({
            deviceId: input.deviceId, tenantId: claims.tenantId, publicKeyFingerprint: fingerprint, publicKeyPem: input.publicKeyPem, state: 'enrolled',
            trust: claims.maxTrust, enrolledAtMs: input.nowMs, updatedAtMs: input.nowMs,
            history: Object.freeze([{ from: 'pending', to: 'enrolled', atMs: input.nowMs, reason: 'enrollment-token-redeemed' }]),
        });
        this.devices.set(input.deviceId, identity);
        return identity;
    }
    transition(deviceId, to, reason, nowMs) {
        const current = this.devices.get(deviceId);
        if (!current)
            throw new EnrollmentError('unknown-device');
        if (!TRANSITIONS[current.state].includes(to))
            throw new EnrollmentError('illegal-transition', `${current.state} -> ${to}`);
        const next = Object.freeze({ ...current, state: to, updatedAtMs: nowMs, history: Object.freeze([...current.history, { from: current.state, to, atMs: nowMs, reason }]) });
        this.devices.set(deviceId, next);
        return next;
    }
    get(deviceId) { return this.devices.get(deviceId); }
    /** A device is trusted for control-plane use only while enrolled. */
    isTrusted(deviceId) { return this.devices.get(deviceId)?.state === 'enrolled'; }
    list(tenantId) {
        return Object.freeze([...this.devices.values()].filter((d) => !tenantId || d.tenantId === tenantId).sort((a, b) => a.deviceId.localeCompare(b.deviceId)));
    }
}
//# sourceMappingURL=device-identity.js.map