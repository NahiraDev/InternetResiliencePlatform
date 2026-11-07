import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerUnifiedProductRoutes, PRODUCT_API_MANIFEST } from './unified-product-api.js';
const createTestApp = (options = {}) => {
    const app = Fastify({ logger: false });
    app.decorateRequest('jwtAuth', undefined);
    app.decorateRequest('rbac', undefined);
    app.decorateRequest('observabilityContext', undefined);
    app.addHook('onRequest', async (request) => {
        request.jwtAuth = {
            authenticate: vi.fn(async () => options.principal ?? null),
        };
        request.rbac = {
            authorize: vi.fn(async ({ requiredPermissions }) => options.authorize ? options.authorize(requiredPermissions?.[0] ?? '') : false),
        };
    });
    const routeOptions = {};
    if (options.rateLimitStore !== undefined)
        routeOptions.rateLimitStore = options.rateLimitStore;
    registerUnifiedProductRoutes(app, routeOptions);
    return app;
};
describe('Unified Product API', () => {
    it('publishes a versioned public capability manifest', async () => {
        const app = createTestApp();
        const response = await app.inject({ method: 'GET', url: '/api/v1/product/capabilities' });
        expect(response.statusCode).toBe(200);
        expect(response.headers['x-api-version']).toBe('1');
        expect(response.headers['x-api-supported-versions']).toBe('v1');
        expect(response.json()).toEqual({ success: true, data: PRODUCT_API_MANIFEST });
        await app.close();
    });
    it('accepts array-valued version headers after normalization', async () => {
        const app = createTestApp();
        const response = await app.inject({
            method: 'GET',
            url: '/api/v1/product/capabilities',
            headers: {
                'x-api-version': ['v1', 'v1'],
            },
        });
        expect(response.statusCode).toBe(200);
        expect(response.headers['x-api-version']).toBe('1');
        await app.close();
    });
    it('rejects unsupported API versions without authenticating the caller', async () => {
        const authenticate = vi.fn(async () => null);
        const app = Fastify({ logger: false });
        app.decorateRequest('jwtAuth', undefined);
        app.decorateRequest('rbac', undefined);
        app.addHook('onRequest', async (request) => {
            request.jwtAuth = { authenticate };
            request.rbac = { authorize: vi.fn(async () => false) };
        });
        registerUnifiedProductRoutes(app);
        const response = await app.inject({
            method: 'GET',
            url: '/api/v1/product/capabilities',
            headers: { 'accept-version': 'v2' },
        });
        expect(response.statusCode).toBe(406);
        expect(response.json()).toEqual({
            success: false,
            error: {
                code: 'API_VERSION_NOT_SUPPORTED',
                message: 'The requested API version is not supported.',
                supportedVersions: ['v1'],
            },
        });
        expect(authenticate).not.toHaveBeenCalled();
        await app.close();
    });
    it('requires bearer authentication for client context', async () => {
        const app = createTestApp();
        const response = await app.inject({ method: 'GET', url: '/api/v1/product/context' });
        expect(response.statusCode).toBe(401);
        await app.close();
    });
    it('returns only capabilities authorized for the authenticated principal', async () => {
        const app = createTestApp({
            principal: { id: 'user-1', roles: ['operator'], scopes: ['runtime'] },
            authorize: async (permission) => permission === 'autopilot.read',
        });
        const response = await app.inject({
            method: 'GET',
            url: '/api/v1/product/context',
            headers: { authorization: 'Bearer test-token' },
        });
        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.data.principal).toEqual({
            id: 'user-1',
            roles: ['operator'],
            scopes: ['runtime'],
        });
        expect(body.data.capabilities).toContain('product.capabilities.read');
        expect(body.data.capabilities).toContain('product.context.read');
        expect(body.data.capabilities).toContain('runtime.autopilot.read');
        expect(body.data.capabilities).not.toContain('runtime.autopilot.execute');
        expect(body.data.capabilities).not.toContain('gateway.inventory');
        await app.close();
    });
    it('does not leak device-credential session capability into bearer context', async () => {
        const app = createTestApp({
            principal: { id: 'admin-1', roles: ['admin'], scopes: [] },
            authorize: async () => true,
        });
        const response = await app.inject({
            method: 'GET',
            url: '/api/v1/product/context',
            headers: { authorization: 'Bearer test-token' },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().data.capabilities).not.toContain('devices.session');
        await app.close();
    });
});
//# sourceMappingURL=unified-product-api.test.js.map