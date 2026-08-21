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
    expect(store.rotate(first.token, new Date('2026-01-01T00:02:00.000Z'))).toBeNull();
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
