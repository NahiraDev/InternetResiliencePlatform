import Fastify from 'fastify';
import { JwtService, RbacAuthorization } from '@irp/auth';
import { describe, expect, it } from 'vitest';
import { registerRemoteClientRoutes } from './remote-client-api.js';

describe('Phase 42 remote client API', () => {
  const jwtSecret = 'j'.repeat(48);
  const credentialKey = 'c'.repeat(48);
  const refreshKey = 'r'.repeat(48);

  const createApp = async () => {
    const app = Fastify({ logger: false });
    const jwt = new JwtService(jwtSecret, 'irp');
    const rbac = new RbacAuthorization();
    app.setErrorHandler((error, _request, reply) => {
      const message = error instanceof Error ? error.message : String(error);
      reply.code((error as { statusCode?: number }).statusCode ?? 500).send({ error: message });
    });
    registerRemoteClientRoutes(app, { jwtSecret, credentialKey, refreshKey });
    app.get('/protected/runtime', async (request, reply) => {
      const raw = request.headers.authorization;
      const token = Array.isArray(raw) ? raw[0]?.slice(7) : raw?.slice(7);
      if (!token?.length) return reply.code(401).send({ error: 'unauthorized' });
      let claims;
      try {
        claims = jwt.verify(token, 'access');
      } catch {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      const allowed = await rbac.authorize({
        principal: { id: claims.sub, roles: claims.roles, scopes: claims.scopes },
        resource: '/protected/runtime',
        action: 'GET',
        requiredPermissions: ['runtime.read'],
      });
      return allowed ? { success: true } : reply.code(403).send({ error: 'forbidden' });
    });
    app.get('/protected/admin', async (request, reply) => {
      const raw = request.headers.authorization;
      const token = Array.isArray(raw) ? raw[0]?.slice(7) : raw?.slice(7);
      if (!token?.length) return reply.code(401).send({ error: 'unauthorized' });
      const claims = jwt.verify(token, 'access');
      const allowed = await rbac.authorize({
        principal: { id: claims.sub, roles: claims.roles, scopes: claims.scopes },
        resource: '/protected/admin',
        action: 'GET',
        requiredPermissions: ['runtime.admin'],
      });
      return allowed ? { success: true } : reply.code(403).send({ error: 'forbidden' });
    });
    return app;
  };

  it('enrolls a device, exchanges the credential, and enforces scopes', async () => {
    const app = await createApp();
    const adminToken = new JwtService(jwtSecret, 'irp').sign({
      sub: 'admin-1',
      roles: ['platform_admin'],
      scopes: ['runtime.admin'],
      type: 'access',
      ttlSeconds: 900,
    });

    const enrollment = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/remote/devices/enroll',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        deviceId: 'device-42',
        platform: 'linux',
        label: 'CI test device',
        scopes: ['runtime.read'],
      },
    });
    expect(enrollment.statusCode).toBe(201);
    const device = enrollment.json().data;
    expect(device.credentialId).toBeTypeOf('string');
    expect(device.secret).toMatch(/^irp_dc_/);
    expect(device.scopes).toEqual(['runtime.read']);

    const token = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/remote/token',
      payload: { credentialId: device.credentialId, secret: device.secret },
    });
    expect(token.statusCode).toBe(200);
    const issued = token.json().data;
    expect(issued.accessToken).toBeTypeOf('string');
    expect(issued.refreshToken).toMatch(/^irp_rt_/);
    expect(issued.scopes).toEqual(['runtime.read']);

    const protectedResponse = await app.inject({
      method: 'GET',
      url: '/protected/runtime',
      headers: { authorization: `Bearer ${issued.accessToken}` },
    });
    expect(protectedResponse.statusCode).toBe(200);

    const denied = await app.inject({
      method: 'GET',
      url: '/protected/admin',
      headers: { authorization: `Bearer ${issued.accessToken}` },
    });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });

  it('rotates refresh tokens and rejects replay', async () => {
    const app = await createApp();
    const adminToken = new JwtService(jwtSecret, 'irp').sign({
      sub: 'admin-1',
      roles: ['platform_admin'],
      scopes: ['runtime.admin'],
      type: 'access',
      ttlSeconds: 900,
    });
    const enrollment = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/remote/devices/enroll',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { platform: 'android', scopes: ['runtime.read'] },
    });
    const device = enrollment.json().data;
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/remote/token',
      payload: { credentialId: device.credentialId, secret: device.secret },
    });
    const refreshToken = first.json().data.refreshToken;

    const rotated = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/remote/refresh',
      payload: { refreshToken },
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().data.refreshToken).not.toBe(refreshToken);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/remote/refresh',
      payload: { refreshToken },
    });
    expect(replay.statusCode).toBe(401);
    await app.close();
  });

  it('revokes a device and invalidates refresh sessions', async () => {
    const app = await createApp();
    const adminToken = new JwtService(jwtSecret, 'irp').sign({
      sub: 'admin-1',
      roles: ['platform_admin'],
      scopes: ['runtime.admin'],
      type: 'access',
      ttlSeconds: 900,
    });
    const enrollment = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/remote/devices/enroll',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { platform: 'ios', scopes: ['runtime.read'] },
    });
    const device = enrollment.json().data;
    const token = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/remote/token',
      payload: { credentialId: device.credentialId, secret: device.secret },
    });
    const refreshToken = token.json().data.refreshToken;

    const revoke = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/remote/devices/${device.credentialId}/revoke`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().data.revoked).toBe(true);

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/remote/refresh',
      payload: { refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
    await app.close();
  });
});
