import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryHistoricalMeasurementStore } from '@irp/historical-analysis';
import { registerHistoryRoutes } from './history-api.js';
const createTestApp = (options = {}) => {
    const app = Fastify({ logger: false });
    app.decorateRequest('jwtAuth', undefined);
    app.decorateRequest('rbac', undefined);
    app.addHook('onRequest', async (request) => {
        request.jwtAuth = {
            authenticate: vi.fn(async () => options.principal ?? null),
        };
        request.rbac = {
            authorize: vi.fn(async ({ requiredPermissions }) => options.authorize
                ? options.authorize(requiredPermissions?.[0] ?? '')
                : requiredPermissions?.[0] === 'runtime.inspect'),
        };
    });
    registerHistoryRoutes(app, options.store);
    return app;
};
describe('History API', () => {
    it('rejects anonymous access to historical reports', async () => {
        const app = createTestApp();
        const response = await app.inject({
            method: 'GET',
            url: '/api/v1/history/report?from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z',
        });
        expect(response.statusCode).toBe(401);
        await app.close();
    });
    it('rejects callers without runtime.inspect permission', async () => {
        const app = createTestApp({
            principal: { id: 'user-1', roles: [], scopes: [] },
            authorize: async () => false,
        });
        const response = await app.inject({
            method: 'GET',
            url: '/api/v1/history/report?from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z',
        });
        expect(response.statusCode).toBe(403);
        await app.close();
    });
    it('returns a JSON historical report for an authorized inspect caller', async () => {
        const store = new InMemoryHistoricalMeasurementStore();
        store.add({
            id: 'm1',
            timestamp: '2026-09-01T12:00:00.000Z',
            probeType: 'ping',
            success: true,
            latencyMs: 42,
        });
        store.add({
            id: 'm2',
            timestamp: '2026-09-01T12:15:00.000Z',
            probeType: 'ping',
            success: false,
            packetLossPercent: 12,
        });
        const app = createTestApp({
            principal: { id: 'user-1', roles: ['operator'], scopes: [] },
            store,
        });
        const response = await app.inject({
            method: 'GET',
            url: '/api/v1/history/report?from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z&probeTypes=ping',
        });
        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.success).toBe(true);
        expect(body.data.series.length).toBe(1);
        expect(body.data.series[0].probeType).toBe('ping');
        await app.close();
    });
    it('supports CSV export of the historical report', async () => {
        const store = new InMemoryHistoricalMeasurementStore();
        store.add({
            id: 'm1',
            timestamp: '2026-09-01T12:00:00.000Z',
            probeType: 'ping',
            success: true,
            latencyMs: 42,
        });
        const app = createTestApp({
            principal: { id: 'user-1', roles: ['operator'], scopes: [] },
            store,
        });
        const response = await app.inject({
            method: 'GET',
            url: '/api/v1/history/report?from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z&format=csv',
        });
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('text/csv');
        expect(response.body).toContain('probe');
        await app.close();
    });
});
//# sourceMappingURL=history-api.test.js.map