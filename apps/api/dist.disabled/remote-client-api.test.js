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
            const errorRecord = typeof error === 'object' && error !== null
                ? error
                : undefined;
            const message = typeof errorRecord?.message === 'string' ? errorRecord.message : String(error);
            const statusCode = typeof errorRecord?.statusCode === 'number' ? errorRecord.statusCode : 500;
            reply.code(statusCode).send({ error: message });
        });
        registerRemoteClientRoutes(app, { jwtSecret, credentialKey, refreshKey });
        app.get('/protected/runtime', async (request, reply) => {
            const raw = request.headers.authorization;
            const token = Array.isArray(raw) ? raw[0]?.slice(7) : raw?.slice(7);
            if (!token?.length)
                return reply.code(401).send({ error: 'unauthorized' });
            let claims;
            try {
                claims = jwt.verify(token, 'access');
            }
            catch {
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
            if (!token?.length)
                return reply.code(401).send({ error: 'unauthorized' });
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
    describe('device enrollment request flow', () => {
        const createUserApp = async () => {
            const app = Fastify({ logger: false });
            const jwt = new JwtService(jwtSecret, 'irp');
            const rbac = new RbacAuthorization();
            app.setErrorHandler((error, _request, reply) => {
                const errorRecord = typeof error === 'object' && error !== null
                    ? error
                    : undefined;
                const message = typeof errorRecord?.message === 'string' ? errorRecord.message : String(error);
                const statusCode = typeof errorRecord?.statusCode === 'number' ? errorRecord.statusCode : 500;
                reply.code(statusCode).send({ error: message });
            });
            registerRemoteClientRoutes(app, { jwtSecret, credentialKey, refreshKey });
            app.post('/api/v1/auth/test/token', async (request) => {
                const { email } = request.body;
                const token = jwt.sign({
                    sub: email,
                    roles: ['member'],
                    scopes: ['runtime.read', 'runtime.inspect'],
                    type: 'access',
                    ttlSeconds: 900,
                });
                return { success: true, data: { accessToken: token } };
            });
            return app;
        };
        it('user requests enrollment, admin approves, device exchanges credentials', async () => {
            const app = await createUserApp();
            // User registers enrollment request
            const userToken = new JwtService(jwtSecret, 'irp').sign({
                sub: 'user-1',
                roles: ['member'],
                scopes: ['runtime.read', 'runtime.inspect'],
                type: 'access',
                ttlSeconds: 900,
            });
            const requestRes = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/remote/devices/request',
                headers: { authorization: `Bearer ${userToken}` },
                payload: { platform: 'macos', label: 'My MacBook' },
            });
            expect(requestRes.statusCode).toBe(201);
            const requestData = requestRes.json().data;
            expect(requestData.requestId).toBeTypeOf('string');
            expect(requestData.status).toBe('pending');
            // Admin lists pending requests
            const adminToken = new JwtService(jwtSecret, 'irp').sign({
                sub: 'admin-1',
                roles: ['platform_admin'],
                scopes: ['runtime.admin'],
                type: 'access',
                ttlSeconds: 900,
            });
            const listRes = await app.inject({
                method: 'GET',
                url: '/api/v1/auth/remote/devices/requests',
                headers: { authorization: `Bearer ${adminToken}` },
            });
            expect(listRes.statusCode).toBe(200);
            const requests = listRes.json().data;
            expect(requests.length).toBeGreaterThanOrEqual(1);
            // Admin approves the request
            const requestId = requestData.requestId;
            const approveRes = await app.inject({
                method: 'POST',
                url: `/api/v1/auth/remote/devices/requests/${requestId}/approve`,
                headers: { authorization: `Bearer ${adminToken}` },
            });
            expect(approveRes.statusCode).toBe(200);
            const approveData = approveRes.json().data;
            expect(approveData.status).toBe('approved');
            expect(approveData.credentialId).toBeTypeOf('string');
            expect(approveData.deviceId).toBeTypeOf('string');
            expect(approveData.secret).toBeTypeOf('string');
            expect(approveData.secret).toMatch(/^irp_dc_/);
            // Device exchanges credentials for tokens
            const tokenRes = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/remote/token',
                payload: { credentialId: approveData.credentialId, secret: approveData.secret },
            });
            expect(tokenRes.statusCode).toBe(200);
            const tokenData = tokenRes.json().data;
            expect(tokenData.accessToken).toBeTypeOf('string');
            expect(tokenData.refreshToken).toBeTypeOf('string');
            expect(tokenData.device.deviceId).toBe(approveData.deviceId);
            await app.close();
        });
        it('non-admin cannot approve enrollment request', async () => {
            const app = await createUserApp();
            const userToken = new JwtService(jwtSecret, 'irp').sign({
                sub: 'user-1',
                roles: ['member'],
                scopes: ['runtime.read'],
                type: 'access',
                ttlSeconds: 900,
            });
            const requestRes = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/remote/devices/request',
                headers: { authorization: `Bearer ${userToken}` },
                payload: { platform: 'windows', label: 'My PC' },
            });
            expect(requestRes.statusCode).toBe(201);
            const requestId = requestRes.json().data.requestId;
            // Non-admin tries to approve
            const approveRes = await app.inject({
                method: 'POST',
                url: `/api/v1/auth/remote/devices/requests/${requestId}/approve`,
                headers: { authorization: `Bearer ${userToken}` },
            });
            expect(approveRes.statusCode).toBe(403);
            await app.close();
        });
        it('rejecting a request prevents approval', async () => {
            const app = await createUserApp();
            const userToken = new JwtService(jwtSecret, 'irp').sign({
                sub: 'user-1',
                roles: ['member'],
                scopes: ['runtime.read'],
                type: 'access',
                ttlSeconds: 900,
            });
            const adminToken = new JwtService(jwtSecret, 'irp').sign({
                sub: 'admin-1',
                roles: ['platform_admin'],
                scopes: ['runtime.admin'],
                type: 'access',
                ttlSeconds: 900,
            });
            const requestRes = await app.inject({
                method: 'POST',
                url: '/api/v1/auth/remote/devices/request',
                headers: { authorization: `Bearer ${userToken}` },
                payload: { platform: 'ios', label: 'My iPhone' },
            });
            expect(requestRes.statusCode).toBe(201);
            const requestId = requestRes.json().data.requestId;
            // Admin rejects
            const rejectRes = await app.inject({
                method: 'POST',
                url: `/api/v1/auth/remote/devices/requests/${requestId}/reject`,
                headers: { authorization: `Bearer ${adminToken}` },
            });
            expect(rejectRes.statusCode).toBe(200);
            expect(rejectRes.json().data.status).toBe('rejected');
            // Admin tries to approve again - should fail
            const approveRes = await app.inject({
                method: 'POST',
                url: `/api/v1/auth/remote/devices/requests/${requestId}/approve`,
                headers: { authorization: `Bearer ${adminToken}` },
            });
            expect(approveRes.statusCode).toBe(404);
            await app.close();
        });
    });
});
//# sourceMappingURL=remote-client-api.test.js.map