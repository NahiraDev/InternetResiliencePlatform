import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerUnifiedProductRoutes, PRODUCT_API_MANIFEST } from './unified-product-api.js';

const createTestApp = (options: {
  principal?: { id: string; roles: string[]; scopes: string[]; organizationId?: string } | null;
  authorize?: (permission: string) => Promise<boolean>;
} = {}): FastifyInstance => {
  const app = Fastify({ logger: false });
  app.decorateRequest('jwtAuth', undefined as never);
  app.decorateRequest('rbac', undefined as never);
  app.decorateRequest('observabilityContext', undefined as never);
  app.addHook('onRequest', async (request) => {
    request.jwtAuth = {
      authenticate: vi.fn(async () => options.principal ?? null),
    } as never;
    request.rbac = {
      authorize: vi.fn(async ({ requiredPermissions }: { requiredPermissions?: string[] }) =>
        options.authorize ? options.authorize(requiredPermissions?.[0] ?? '') : false,
      ),
    } as never;
  });
  registerUnifiedProductRoutes(app);
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

  it('rejects unsupported API versions without authenticating the caller', async () => {
    const authenticate = vi.fn(async () => null);
    const app = Fastify({ logger: false });
    app.decorateRequest('jwtAuth', undefined as never);
    app.decorateRequest('rbac', undefined as never);
    app.addHook('onRequest', async (request) => {
      request.jwtAuth = { authenticate } as never;
      request.rbac = { authorize: vi.fn(async () => false) } as never;
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
