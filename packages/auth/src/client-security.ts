import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

export type RemoteClientPlatform =
  | 'android'
  | 'ios'
  | 'linux'
  | 'macos'
  | 'windows'
  | 'unknown';

export type RemoteClientScope =
  | 'runtime.read'
  | 'runtime.inspect'
  | 'autopilot.read'
  | 'measurements.read'
  | 'platform.status';

export const DEFAULT_REMOTE_CLIENT_SCOPES: readonly RemoteClientScope[] = [
  'runtime.read',
  'runtime.inspect',
  'autopilot.read',
  'measurements.read',
  'platform.status',
];

export const REMOTE_CLIENT_SCOPE_SET = new Set<RemoteClientScope>(DEFAULT_REMOTE_CLIENT_SCOPES);

const DEFAULT_CREDENTIAL_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_AUDIT_EVENTS = 1_000;
const MAX_STRING_LENGTH = 256;
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|credential|private.?key)/i;

const normalizeSecret = (value: string): string => value.trim();
const digest = (secret: string, key: string): Buffer =>
  createHmac('sha256', key).update(secret, 'utf8').digest();
const safeEqual = (left: Buffer, right: Buffer): boolean =>
  left.length === right.length && timingSafeEqual(left, right);
const boundedString = (value: string): string =>
  value.length <= MAX_STRING_LENGTH ? value : `${value.slice(0, MAX_STRING_LENGTH - 1)}…`;

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === 'string') return boundedString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 32).map(sanitizeValue);
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeValue(item);
    }
    return result;
  }
  return undefined;
};

export const sanitizeSecurityMetadata = (
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const value = sanitizeValue(metadata ?? {});
  return (value as Record<string, unknown>) ?? {};
};

export interface DeviceCredential {
  id: string;
  deviceId: string;
  platform: RemoteClientPlatform;
  label?: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
  secretDigest: Buffer;
}

export interface IssuedDeviceCredential {
  credentialId: string;
  deviceId: string;
  secret: string;
  expiresAt: string;
}

export interface AuthenticatedDevice {
  credentialId: string;
  deviceId: string;
  platform: RemoteClientPlatform;
  label?: string;
  expiresAt: string;
  lastUsedAt: string;
}

export class DeviceCredentialService {
  private readonly credentials = new Map<string, DeviceCredential>();

  constructor(private readonly secretKey: string) {
    if (secretKey.length < 32) throw new Error('Device credential key must be at least 32 characters.');
  }

  issue(input: {
    deviceId?: string;
    platform: RemoteClientPlatform;
    label?: string;
    ttlSeconds?: number;
    now?: Date;
  }): IssuedDeviceCredential {
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

  authenticate(credentialId: string, secret: string, now = new Date()): AuthenticatedDevice | null {
    const record = this.credentials.get(credentialId);
    if (!record || record.revokedAt || Date.parse(record.expiresAt) <= now.getTime()) return null;
    const candidate = digest(normalizeSecret(secret), this.secretKey);
    if (!safeEqual(candidate, record.secretDigest)) return null;
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

  revoke(credentialId: string, now = new Date()): boolean {
    const record = this.credentials.get(credentialId);
    if (!record || record.revokedAt) return false;
    record.revokedAt = now.toISOString();
    return true;
  }

  revokeDevice(deviceId: string, now = new Date()): number {
    let count = 0;
    for (const record of this.credentials.values()) {
      if (record.deviceId === deviceId && !record.revokedAt) {
        record.revokedAt = now.toISOString();
        count += 1;
      }
    }
    return count;
  }

  activeCount(now = new Date()): number {
    let count = 0;
    for (const record of this.credentials.values()) {
      if (!record.revokedAt && Date.parse(record.expiresAt) > now.getTime()) count += 1;
    }
    return count;
  }
}

export interface RefreshTokenRecord {
  id: string;
  subject: string;
  issuedAt: string;
  expiresAt: string;
  usedAt?: string;
  revokedAt?: string;
  scopes: readonly string[];
  tokenDigest: Buffer;
}

export interface RotatedRefreshToken {
  tokenId: string;
  token: string;
  subject: string;
  scopes: readonly string[];
  expiresAt: string;
}

export class RotatingRefreshTokenStore {
  private readonly records = new Map<string, RefreshTokenRecord>();

  constructor(private readonly secretKey: string) {
    if (secretKey.length < 32) throw new Error('Refresh token key must be at least 32 characters.');
  }

  issue(subject: string, scopes: readonly string[], ttlSeconds = DEFAULT_REFRESH_TTL_SECONDS, now = new Date()): RotatedRefreshToken {
    if (!subject.trim()) throw new Error('Refresh token subject is required.');
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

  rotate(token: string, now = new Date()): RotatedRefreshToken | null {
    const candidateDigest = digest(normalizeSecret(token), this.secretKey);
    for (const record of this.records.values()) {
      if (!safeEqual(candidateDigest, record.tokenDigest)) continue;
      if (record.revokedAt || record.usedAt || Date.parse(record.expiresAt) <= now.getTime()) return null;
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

  revoke(tokenId: string, now = new Date()): boolean {
    const record = this.records.get(tokenId);
    if (!record || record.revokedAt) return false;
    record.revokedAt = now.toISOString();
    return true;
  }

  revokeSubject(subject: string, now = new Date()): number {
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

export type SecurityAuditAction =
  | 'client.enrolled'
  | 'client.authenticated'
  | 'client.revoked'
  | 'refresh.rotated'
  | 'refresh.rejected'
  | 'authorization.denied';

export interface SecurityAuditEvent {
  id: string;
  at: string;
  action: SecurityAuditAction;
  subjectId?: string;
  deviceId?: string;
  credentialId?: string;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SecurityAuditLog {
  private readonly events: SecurityAuditEvent[] = [];

  constructor(private readonly maxEvents = MAX_AUDIT_EVENTS) {
    if (!Number.isInteger(maxEvents) || maxEvents < 1) throw new Error('Invalid audit log size.');
  }

  record(input: Omit<SecurityAuditEvent, 'id' | 'at' | 'metadata'> & { metadata?: Record<string, unknown>; at?: string }): SecurityAuditEvent {
    const event: SecurityAuditEvent = {
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
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    return event;
  }

  list(limit = this.maxEvents): readonly SecurityAuditEvent[] {
    return this.events.slice(Math.max(0, this.events.length - Math.min(limit, this.maxEvents))).map((event) => ({
      ...event,
      metadata: { ...event.metadata },
    }));
  }
}

export const validateRemoteClientScopes = (
  scopes: readonly string[],
  allowed: ReadonlySet<RemoteClientScope> = REMOTE_CLIENT_SCOPE_SET,
): RemoteClientScope[] => {
  const unique = [...new Set(scopes)];
  if (unique.some((scope) => !allowed.has(scope as RemoteClientScope)))
    throw new Error('Requested remote-client scope is not allowed.');
  return unique as RemoteClientScope[];
};
