import { describe, expect, it, vi } from 'vitest';
import {
  JwtAuthenticationProvider,
  JwtService,
  RbacAuthorization,
  hashPassword,
  verifyPassword,
} from './index.js';

const secret = 'phase-21.4-test-secret-with-at-least-32-characters';

describe('auth security contracts', () => {
  it('signs access tokens, authenticates bearer principals, and rejects tampering', async () => {
    const jwt = new JwtService(secret);
    const token = jwt.sign({
      sub: 'user-1',
      roles: ['operator'],
      scopes: ['network.read'],
      type: 'access',
      ttlSeconds: 60,
    });
    const principal = await new JwtAuthenticationProvider(jwt).authenticate({
      headers: { authorization: `Bearer ${token}` },
    });

    expect(principal).toMatchObject({
      id: 'user-1',
      roles: ['operator'],
      scopes: ['network.read'],
    });
    expect(() => jwt.verify(`${token.slice(0, -1)}x`, 'access')).toThrow('Invalid token signature');
  });

  it('fails closed for expired tokens and wrong token types', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T00:00:00.000Z'));
    const jwt = new JwtService(secret);
    const token = jwt.sign({
      sub: 'user-1',
      roles: [],
      scopes: [],
      type: 'refresh',
      ttlSeconds: 1,
    });
    expect(() => jwt.verify(token, 'access')).toThrow('Invalid token type');
    vi.setSystemTime(new Date('2026-08-15T00:00:02.000Z'));
    expect(() => jwt.verify(token, 'refresh')).toThrow('Token expired');
    vi.useRealTimers();
  });

  it('rejects malformed tokens, unsupported algorithms, and incomplete claims deterministically', () => {
    const jwt = new JwtService(secret);
    expect(() => jwt.verify('not.a.jwt', 'access')).toThrow('Invalid token');
    const token = jwt.sign({
      sub: 'user-1',
      roles: [],
      scopes: [],
      type: 'access',
      ttlSeconds: 60,
    });
    const [, payload, signature] = token.split('.');
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
      'base64url',
    );
    expect(() => jwt.verify(`${noneHeader}.${payload}.${signature}`, 'access')).toThrow(
      'Invalid token algorithm',
    );
    const hsHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const incompletePayload = Buffer.from(
      JSON.stringify({ iss: 'internet-resilience-platform', exp: 9_999_999_999, type: 'access' }),
    ).toString('base64url');
    const badSignature = Buffer.from('short').toString('base64url');
    expect(() => jwt.verify(`${hsHeader}.${incompletePayload}.${badSignature}`, 'access')).toThrow(
      'Invalid token signature',
    );
  });

  it('enforces RBAC permissions and platform admin override', async () => {
    const rbac = new RbacAuthorization();
    await expect(
      rbac.authorize({
        principal: null,
        resource: 'routes',
        action: 'write',
        requiredPermissions: ['network.write'],
      }),
    ).resolves.toBe(false);
    await expect(
      rbac.authorize({
        principal: { id: 'u', roles: [], scopes: ['network.read'] },
        resource: 'routes',
        action: 'write',
        requiredPermissions: ['network.write'],
      }),
    ).resolves.toBe(false);
    await expect(
      rbac.authorize({
        principal: { id: 'admin', roles: ['platform_admin'], scopes: [] },
        resource: 'routes',
        action: 'write',
        requiredPermissions: ['network.write'],
      }),
    ).resolves.toBe(true);
  });

  it('hashes passwords with unique salts and verifies only the original password', () => {
    const first = hashPassword('correct horse battery staple');
    const second = hashPassword('correct horse battery staple');
    expect(first).not.toBe(second);
    expect(verifyPassword('correct horse battery staple', first)).toBe(true);
    expect(verifyPassword('wrong', first)).toBe(false);
  });
});
