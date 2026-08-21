import { describe, expect, it } from 'vitest';
import {
  DeviceCredentialService,
  RotatingRefreshTokenStore,
  SecurityAuditLog,
  sanitizeSecurityMetadata,
  validateRemoteClientScopes,
} from './client-security.js';

describe('DeviceCredentialService', () => {
  const key = 'x'.repeat(32);

  it('issues and authenticates opaque device credentials', () => {
    const service = new DeviceCredentialService(key);
    const now = new Date('2026-01-01T00:00:00.000Z');
    const issued = service.issue({ platform: 'android', deviceId: 'device-1', ttlSeconds: 3600, now });
    expect(issued.secret).toMatch(/^irp_dc_/);
    expect(service.authenticate(issued.credentialId, issued.secret, now)?.deviceId).toBe('device-1');
    expect(service.activeCount(now)).toBe(1);
  });

  it('fails closed for wrong, revoked, and expired credentials', () => {
    const service = new DeviceCredentialService(key);
    const now = new Date('2026-01-01T00:00:00.000Z');
    const issued = service.issue({ platform: 'ios', ttlSeconds: 60, now });
    expect(service.authenticate(issued.credentialId, 'wrong', now)).toBeNull();
    expect(service.revoke(issued.credentialId, now)).toBe(true);
    expect(service.authenticate(issued.credentialId, issued.secret, now)).toBeNull();
    const expired = service.issue({ platform: 'ios', ttlSeconds: 60, now });
    expect(service.authenticate(expired.credentialId, expired.secret, new Date('2026-01-01T00:01:01.000Z'))).toBeNull();
  });

  it('revokes every active credential belonging to a device', () => {
    const service = new DeviceCredentialService(key);
    const now = new Date('2026-01-01T00:00:00.000Z');
    const first = service.issue({ platform: 'android', deviceId: 'device-1', ttlSeconds: 3600, now });
    const second = service.issue({ platform: 'android', deviceId: 'device-1', ttlSeconds: 3600, now });
    expect(service.revokeDevice('device-1', now)).toBe(2);
    expect(service.authenticate(first.credentialId, first.secret, now)).toBeNull();
    expect(service.authenticate(second.credentialId, second.secret, now)).toBeNull();
  });
});

describe('RotatingRefreshTokenStore', () => {
  const key = 'y'.repeat(32);

  it('rotates once and rejects replay', () => {
    const store = new RotatingRefreshTokenStore(key);
    const now = new Date('2026-01-01T00:00:00.000Z');
    const first = store.issue('user-1', ['runtime.read'], 3600, now);
    const next = store.rotate(first.token, new Date('2026-01-01T00:01:00.000Z'));
    expect(next?.subject).toBe('user-1');
    expect(next?.token).not.toBe(first.token);
    expect(next?.expiresAt).toBe(first.expiresAt);
    expect(store.rotate(first.token, new Date('2026-01-01T00:02:00.000Z'))).toBeNull();
  });

  it('rejects expired and revoked refresh tokens', () => {
    const store = new RotatingRefreshTokenStore(key);
    const now = new Date('2026-01-01T00:00:00.000Z');
    const expired = store.issue('user-1', ['runtime.read'], 300, now);
    expect(store.rotate(expired.token, new Date('2026-01-01T00:05:01.000Z'))).toBeNull();
    const active = store.issue('user-1', ['runtime.read'], 3600, now);
    expect(store.revoke(active.tokenId, now)).toBe(true);
    expect(store.rotate(active.token, now)).toBeNull();
  });

  it('revokes every active refresh token for a subject', () => {
    const store = new RotatingRefreshTokenStore(key);
    const now = new Date('2026-01-01T00:00:00.000Z');
    const first = store.issue('user-1', ['runtime.read'], 3600, now);
    const second = store.issue('user-1', ['platform.status'], 3600, now);
    expect(store.revokeSubject('user-1', now)).toBe(2);
    expect(store.rotate(first.token, now)).toBeNull();
    expect(store.rotate(second.token, now)).toBeNull();
  });
});

describe('security audit safety', () => {
  it('redacts sensitive metadata recursively', () => {
    const safe = sanitizeSecurityMetadata({
      authorization: 'Bearer secret',
      nested: { refreshToken: 'secret', value: 'ok' },
      count: 2,
    });
    expect(safe.authorization).toBe('[REDACTED]');
    expect((safe.nested as Record<string, unknown>).refreshToken).toBe('[REDACTED]');
    expect((safe.nested as Record<string, unknown>).value).toBe('ok');
  });

  it('bounds the in-memory audit log', () => {
    const audit = new SecurityAuditLog(2);
    audit.record({ action: 'client.enrolled', success: true, metadata: { value: 1 } });
    audit.record({ action: 'client.authenticated', success: true });
    audit.record({ action: 'authorization.denied', success: false });
    expect(audit.list()).toHaveLength(2);
    expect(audit.list()[0]?.action).toBe('client.authenticated');
  });
});

describe('remote client scopes', () => {
  it('accepts only the bounded allow-list', () => {
    expect(validateRemoteClientScopes(['runtime.read', 'runtime.read'])).toEqual(['runtime.read']);
    expect(() => validateRemoteClientScopes(['runtime.execute'])).toThrow(/not allowed/i);
  });
});
