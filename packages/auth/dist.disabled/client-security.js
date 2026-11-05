import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
export const DEFAULT_REMOTE_CLIENT_SCOPES = [
    'runtime.read',
    'runtime.inspect',
    'autopilot.read',
    'measurements.read',
    'platform.status',
];
export const REMOTE_CLIENT_SCOPE_SET = new Set(DEFAULT_REMOTE_CLIENT_SCOPES);
const DEFAULT_CREDENTIAL_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_AUDIT_EVENTS = 1_000;
const MAX_STRING_LENGTH = 256;
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|credential|private.?key)/i;
const normalizeSecret = (value) => value.trim();
const digest = (secret, key) => createHmac('sha256', key).update(secret, 'utf8').digest();
const safeEqual = (left, right) => left.length === right.length && timingSafeEqual(left, right);
const boundedString = (value) => value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH - 1)}…`;
const sanitizeValue = (value) => {
    if (typeof value === 'string')
        return boundedString(value);
    if (typeof value === 'number' || typeof value === 'boolean' || value === null)
        return value;
    if (Array.isArray(value))
        return value.slice(0, 32).map(sanitizeValue);
    if (typeof value === 'object' && value !== null) {
        const result = {};
        for (const [key, item] of Object.entries(value)) {
            result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeValue(item);
        }
        return result;
    }
    return undefined;
};
export const sanitizeSecurityMetadata = (metadata) => {
    const value = sanitizeValue(metadata ?? {});
    return value ?? {};
};
export class DeviceCredentialService {
    secretKey;
    credentials = new Map();
    constructor(secretKey) {
        this.secretKey = secretKey;
        if (secretKey.length < 32)
            throw new Error('Device credential key must be at least 32 characters.');
    }
    issue(input) {
        const now = input.now ?? new Date();
        const ttlSeconds = input.ttlSeconds ?? DEFAULT_CREDENTIAL_TTL_SECONDS;
        if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 365 * 24 * 60 * 60)
            throw new Error('Invalid device credential TTL.');
        const deviceId = input.deviceId?.trim() || randomUUID();
        const credentialId = randomUUID();
        const secret = `irp_dc_${randomBytes(32).toString('base64url')}`;
        const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
        this.credentials.set(credentialId, {
            id: credentialId,
            deviceId,
            platform: input.platform,
            ...(input.label ? { label: boundedString(input.label) } : {}),
            createdAt: now.toISOString(),
            expiresAt,
            secretDigest: digest(secret, this.secretKey),
        });
        return { credentialId, deviceId, secret, expiresAt };
    }
    authenticate(credentialId, secret, now = new Date()) {
        const record = this.credentials.get(credentialId);
        if (!record || record.revokedAt || Date.parse(record.expiresAt) <= now.getTime())
            return null;
        const candidate = digest(normalizeSecret(secret), this.secretKey);
        if (!safeEqual(candidate, record.secretDigest))
            return null;
        record.lastUsedAt = now.toISOString();
        return {
            credentialId: record.id,
            deviceId: record.deviceId,
            platform: record.platform,
            ...(record.label ? { label: record.label } : {}),
            expiresAt: record.expiresAt,
            lastUsedAt: record.lastUsedAt,
        };
    }
    revoke(credentialId, now = new Date()) {
        const record = this.credentials.get(credentialId);
        if (!record || record.revokedAt)
            return false;
        record.revokedAt = now.toISOString();
        return true;
    }
    revokeDevice(deviceId, now = new Date()) {
        let count = 0;
        for (const record of this.credentials.values()) {
            if (record.deviceId === deviceId && !record.revokedAt) {
                record.revokedAt = now.toISOString();
                count += 1;
            }
        }
        return count;
    }
    activeCount(now = new Date()) {
        let count = 0;
        for (const record of this.credentials.values()) {
            if (!record.revokedAt && Date.parse(record.expiresAt) > now.getTime())
                count += 1;
        }
        return count;
    }
}
export class RotatingRefreshTokenStore {
    secretKey;
    records = new Map();
    constructor(secretKey) {
        this.secretKey = secretKey;
        if (secretKey.length < 32)
            throw new Error('Refresh token key must be at least 32 characters.');
    }
    issue(subject, scopes, ttlSeconds = DEFAULT_REFRESH_TTL_SECONDS, now = new Date()) {
        if (!subject.trim())
            throw new Error('Refresh token subject is required.');
        if (!Number.isInteger(ttlSeconds) || ttlSeconds < 300 || ttlSeconds > 180 * 24 * 60 * 60)
            throw new Error('Invalid refresh token TTL.');
        const tokenId = randomUUID();
        const token = `irp_rt_${randomBytes(48).toString('base64url')}`;
        const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
        this.records.set(tokenId, {
            id: tokenId,
            subject,
            issuedAt: now.toISOString(),
            expiresAt,
            scopes: [...new Set(scopes)].map(boundedString),
            tokenDigest: digest(token, this.secretKey),
        });
        return { tokenId, token, subject, scopes: [...new Set(scopes)], expiresAt };
    }
    rotate(token, now = new Date()) {
        const candidateDigest = digest(normalizeSecret(token), this.secretKey);
        for (const record of this.records.values()) {
            if (!safeEqual(candidateDigest, record.tokenDigest))
                continue;
            if (record.revokedAt || record.usedAt || Date.parse(record.expiresAt) <= now.getTime())
                return null;
            record.usedAt = now.toISOString();
            const replacementTokenId = randomUUID();
            const replacementToken = `irp_rt_${randomBytes(48).toString('base64url')}`;
            this.records.set(replacementTokenId, {
                id: replacementTokenId,
                subject: record.subject,
                issuedAt: now.toISOString(),
                expiresAt: record.expiresAt,
                scopes: [...record.scopes],
                tokenDigest: digest(replacementToken, this.secretKey),
            });
            return {
                tokenId: replacementTokenId,
                token: replacementToken,
                subject: record.subject,
                scopes: [...record.scopes],
                expiresAt: record.expiresAt,
            };
        }
        return null;
    }
    revoke(tokenId, now = new Date()) {
        const record = this.records.get(tokenId);
        if (!record || record.revokedAt)
            return false;
        record.revokedAt = now.toISOString();
        return true;
    }
    revokeSubject(subject, now = new Date()) {
        let count = 0;
        for (const record of this.records.values()) {
            if (record.subject === subject && !record.revokedAt) {
                record.revokedAt = now.toISOString();
                count += 1;
            }
        }
        return count;
    }
}
export class SecurityAuditLog {
    maxEvents;
    events = [];
    constructor(maxEvents = MAX_AUDIT_EVENTS) {
        this.maxEvents = maxEvents;
        if (!Number.isInteger(maxEvents) || maxEvents < 1)
            throw new Error('Invalid audit log size.');
    }
    record(input) {
        const event = {
            id: randomUUID(),
            at: input.at ?? new Date().toISOString(),
            action: input.action,
            ...(input.subjectId ? { subjectId: boundedString(input.subjectId) } : {}),
            ...(input.deviceId ? { deviceId: boundedString(input.deviceId) } : {}),
            ...(input.credentialId ? { credentialId: boundedString(input.credentialId) } : {}),
            success: input.success,
            metadata: sanitizeSecurityMetadata(input.metadata),
        };
        this.events.push(event);
        if (this.events.length > this.maxEvents)
            this.events.splice(0, this.events.length - this.maxEvents);
        return event;
    }
    list(limit = this.maxEvents) {
        return this.events
            .slice(Math.max(0, this.events.length - Math.min(limit, this.maxEvents)))
            .map((event) => ({
            ...event,
            metadata: { ...event.metadata },
        }));
    }
}
export const validateRemoteClientScopes = (scopes, allowed = REMOTE_CLIENT_SCOPE_SET) => {
    const unique = [...new Set(scopes)];
    if (unique.some((scope) => !allowed.has(scope)))
        throw new Error('Requested remote-client scope is not allowed.');
    return unique;
};
//# sourceMappingURL=client-security.js.map