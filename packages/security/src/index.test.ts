import { describe, expect, it } from 'vitest';
import {
  AuditLog,
  CertificateAuthority,
  CryptoService,
  EndpointRegistry,
  KeyManager,
  PermissionEngine,
  RateLimiter,
  ReplayProtector,
  RequestSecurity,
  SecretManager,
  SecureStorage,
  SecurityEventBus,
  ThreatDetector,
  TokenService,
  createDeviceIdentity,
  createNodeIdentity,
} from './index.js';

describe('security foundation', () => {
  it('enforces RBAC and endpoint permission declarations', () => {
    const engine = new PermissionEngine();
    expect(engine.can({ id: 'u1', roles: ['Read Only'] }, ['audit.read'])).toBe(true);
    expect(engine.can({ id: 'u1', roles: ['Read Only'] }, ['settings.write'])).toBe(false);
    const registry = new EndpointRegistry();
    registry.register({ method: 'get', path: '/network', permissions: ['network.read'] });
    expect(registry.get('GET', '/network')?.permissions).toEqual(['network.read']);
    expect(() => registry.register({ method: 'GET', path: '/unsafe', permissions: [] })).toThrow();
  });

  it('issues and verifies typed zero trust tokens', () => {
    const tokens = new TokenService('a'.repeat(64));
    const token = tokens.issue({
      sub: 'user-1',
      type: 'api',
      roles: ['Admin'],
      permissions: ['security.manage'],
      ttlSeconds: 60,
    });
    expect(tokens.verify(token, 'api').sub).toBe('user-1');
    expect(() => tokens.verify(`${token}x`, 'api')).toThrow();
  });

  it('encrypts storage and secrets without exposing plaintext metadata', () => {
    const crypto = new CryptoService();
    const keys = new KeyManager(Buffer.alloc(32, 1));
    const storage = new SecureStorage<{ token: string }>(crypto, keys);
    storage.set('cached-token', { token: 'secret-token' });
    expect(storage.get('cached-token')?.token).toBe('secret-token');
    const secrets = new SecretManager(crypto, keys);
    secrets.put('api', 'api-key', 'plaintext-api-key');
    expect(secrets.reveal('api')).toBe('plaintext-api-key');
    expect(JSON.stringify(secrets.metadata())).not.toContain('plaintext-api-key');
    expect(keys.rotate()).toBe(2);
  });

  it('supports signatures, certificates, device identity, and node identity', () => {
    const crypto = new CryptoService();
    const keys = crypto.generateEd25519();
    const signature = crypto.sign('payload', keys.privateKey);
    expect(crypto.verify('payload', signature, keys.publicKey)).toBe(true);
    const ca = new CertificateAuthority('IRP Root');
    const cert = ca.create('device', keys.publicKey);
    expect(ca.validate(cert)).toBe(true);
    expect(ca.expiresWithin(cert, 366 * 86_400_000)).toBe(true);
    expect(createDeviceIdentity().fingerprint).toHaveLength(64);
    expect(createNodeIdentity(ca).certificate.subject).toContain('node_');
  });

  it('protects APIs with rate limits, replay checks, signatures, and headers', () => {
    const limiter = new RateLimiter(2, 1_000);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(false);
    const replay = new ReplayProtector();
    const nonce = 'nonce-1';
    const timestamp = new Date().toISOString();
    expect(replay.validate(nonce, timestamp)).toBe(true);
    expect(replay.validate(nonce, timestamp)).toBe(false);
    const request = new RequestSecurity(() => 'shared-secret');
    const sig = request.sign('k1', 'post', '/v1', '{}', 'n2', timestamp);
    expect(request.verify('k1', 'POST', '/v1', '{}', 'n2', timestamp, sig)).toBe(true);
    expect(request.headers()['x-frame-options']).toBe('DENY');
  });

  it('records tamper-evident audit logs and threat events', async () => {
    const audit = new AuditLog();
    audit.append({
      action: 'login',
      actorId: 'user',
      target: 'session',
      outcome: 'success',
      details: { token: 'do-not-log' },
    });
    audit.append({
      action: 'security.violation',
      actorId: 'user',
      target: 'api',
      outcome: 'failure',
    });
    expect(audit.verifyIntegrity()).toBe(true);
    expect(JSON.stringify(audit.entriesSince())).not.toContain('do-not-log');
    const bus = new SecurityEventBus();
    const detector = new ThreatDetector(bus, 2);
    await detector.recordFailure('user');
    await detector.recordFailure('user');
    await detector.replay('user');
    expect(bus.snapshot().map((e) => e.type)).toEqual(['BruteForceAttempt', 'ReplayAttempt']);
  });
});
