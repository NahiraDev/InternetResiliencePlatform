import { describe, expect, it, vi } from 'vitest';
import { InternetResilienceClient, ProductApiError } from './index.js';
describe('InternetResilienceClient', () => {
    it('requests health and version from the configured base URL', async () => {
        const fetcher = vi.fn(async (url) => ({
            ok: true,
            json: async () => ({ url }),
        }));
        const client = new InternetResilienceClient({
            baseUrl: 'http://127.0.0.1:8080',
            fetch: fetcher,
        });
        await expect(client.health()).resolves.toEqual({ url: 'http://127.0.0.1:8080/api/v1/health' });
        await expect(client.version()).resolves.toEqual({
            url: 'http://127.0.0.1:8080/api/v1/version',
        });
    });
    it('discovers the server-authoritative capability manifest', async () => {
        const fetcher = vi.fn(async (url, init) => {
            expect(url).toBe('http://local/api/v1/product/capabilities');
            expect(new Headers(init?.headers).get('x-api-version')).toBe('v1');
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        api: {
                            name: 'InternetResiliencePlatform Product API',
                            version: '1',
                            pathPrefix: '/api/v1',
                            compatibility: 'backward-compatible-within-major',
                        },
                        clients: ['web', 'desktop', 'ios', 'android'],
                        capabilities: [],
                    },
                }),
            };
        });
        const client = new InternetResilienceClient({ baseUrl: 'http://local', fetch: fetcher });
        await expect(client.capabilities()).resolves.toMatchObject({
            api: { version: '1', pathPrefix: '/api/v1' },
            clients: ['web', 'desktop', 'ios', 'android'],
        });
    });
    it('sends bearer credentials and version negotiation for client context', async () => {
        const fetcher = vi.fn(async (_url, init) => {
            const headers = new Headers(init?.headers);
            expect(headers.get('authorization')).toBe('Bearer access-token');
            expect(headers.get('x-api-version')).toBe('v1');
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        apiVersion: '1',
                        principal: { id: 'device-1', roles: ['remote_client'], scopes: ['runtime'] },
                        capabilities: ['product.context.read'],
                    },
                }),
            };
        });
        const client = new InternetResilienceClient({
            baseUrl: 'http://local/',
            fetch: fetcher,
            accessToken: 'access-token',
        });
        await expect(client.context()).resolves.toEqual({
            apiVersion: '1',
            principal: { id: 'device-1', roles: ['remote_client'], scopes: ['runtime'] },
            capabilities: ['product.context.read'],
        });
    });
    it('normalizes the base URL and rejects non-product paths', async () => {
        const client = new InternetResilienceClient({ baseUrl: 'http://local/' });
        await expect(client.requestCapability('/health')).rejects.toThrow('Product API paths must use /api/v1/.');
    });
    it('surfaces structured product API errors', async () => {
        const client = new InternetResilienceClient({
            baseUrl: 'http://local',
            fetch: (async () => ({
                ok: false,
                status: 406,
                json: async () => ({
                    success: false,
                    error: {
                        code: 'API_VERSION_NOT_SUPPORTED',
                        message: 'The requested API version is not supported.',
                    },
                }),
            })),
        });
        await expect(client.capabilities()).rejects.toEqual(expect.objectContaining({
            status: 406,
            code: 'API_VERSION_NOT_SUPPORTED',
            name: 'ProductApiError',
            message: 'The requested API version is not supported.',
        }));
    });
    it('preserves ProductApiError as an Error instance', async () => {
        const client = new InternetResilienceClient({
            baseUrl: 'http://local',
            fetch: (async () => ({
                ok: false,
                status: 401,
                json: async () => ({
                    success: false,
                    error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' },
                }),
            })),
        });
        await expect(client.context()).rejects.toBeInstanceOf(ProductApiError);
    });
    it('propagates non-ok health responses with status-specific errors', async () => {
        const client = new InternetResilienceClient({
            baseUrl: 'http://local',
            fetch: (async () => ({ ok: false, status: 503 })),
        });
        await expect(client.health()).rejects.toThrow('Health request failed: 503');
    });
    it('fetches device snapshot', async () => {
        const fetcher = vi.fn(async (url) => {
            expect(url).toBe('http://local/api/v1/remote/devices/device-1/snapshot');
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        connection: 'online',
                        interfaceCount: 2,
                        defaultRouteAvailable: true,
                        dnsReachable: true,
                        capturedAt: '2026-01-01T00:00:00.000Z',
                    },
                }),
            };
        });
        const client = new InternetResilienceClient({ baseUrl: 'http://local', fetch: fetcher });
        const snapshot = await client.deviceSnapshot('device-1');
        expect(snapshot.connection).toBe('online');
        expect(snapshot.interfaceCount).toBe(2);
        expect(snapshot.defaultRouteAvailable).toBe(true);
        expect(snapshot.dnsReachable).toBe(true);
    });
    it('fetches device analytics', async () => {
        const fetcher = vi.fn(async (url) => {
            expect(url).toBe('http://local/api/v1/remote/devices/device-1/analytics');
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        sampleCount: 100,
                        availabilityPercent: 99.5,
                        medianLatencyMs: 12.5,
                        packetLossPercent: 0.1,
                    },
                }),
            };
        });
        const client = new InternetResilienceClient({ baseUrl: 'http://local', fetch: fetcher });
        const analytics = await client.deviceAnalytics('device-1');
        expect(analytics.sampleCount).toBe(100);
        expect(analytics.availabilityPercent).toBe(99.5);
        expect(analytics.medianLatencyMs).toBe(12.5);
        expect(analytics.packetLossPercent).toBe(0.1);
    });
    it('fetches device policy', async () => {
        const fetcher = vi.fn(async (url) => {
            expect(url).toBe('http://local/api/v1/remote/devices/device-1/policy');
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: { autonomousMode: false },
                }),
            };
        });
        const client = new InternetResilienceClient({ baseUrl: 'http://local', fetch: fetcher });
        const policy = await client.devicePolicy('device-1');
        expect(policy.autonomousMode).toBe(false);
    });
    it('sets device policy with POST body', async () => {
        let capturedBody;
        const fetcher = vi.fn(async (url, init) => {
            expect(url).toBe('http://local/api/v1/remote/devices/device-1/policy');
            expect(init?.method).toBe('POST');
            capturedBody = init?.body;
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: { autonomousMode: true },
                }),
            };
        });
        const client = new InternetResilienceClient({ baseUrl: 'http://local', fetch: fetcher });
        const result = await client.setDevicePolicy('device-1', true);
        expect(result.autonomousMode).toBe(true);
        expect(capturedBody).toBe(JSON.stringify({ autonomousMode: true }));
    });
    it('exchanges remote client credentials for tokens', async () => {
        const fetcher = vi.fn(async (url, init) => {
            expect(url).toBe('http://local/api/v1/auth/remote/token');
            expect(init?.method).toBe('POST');
            const body = JSON.parse(init?.body);
            expect(body.credentialId).toBe('cred-1');
            expect(body.secret).toBe('secret-1');
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        accessToken: 'access-token-1',
                        refreshToken: 'refresh-token-1',
                        tokenType: 'Bearer',
                        expiresIn: 900,
                        refreshExpiresAt: '2026-01-02T00:00:00.000Z',
                        scopes: ['runtime.read'],
                        device: {
                            credentialId: 'cred-1',
                            deviceId: 'device-1',
                            platform: 'android',
                            label: 'test device',
                        },
                    },
                }),
            };
        });
        const client = new InternetResilienceClient({ baseUrl: 'http://local', fetch: fetcher });
        const tokens = await client.remoteClientToken('cred-1', 'secret-1');
        expect(tokens.accessToken).toBe('access-token-1');
        expect(tokens.refreshToken).toBe('refresh-token-1');
        expect(tokens.tokenType).toBe('Bearer');
        expect(tokens.device.deviceId).toBe('device-1');
        expect(tokens.device.platform).toBe('android');
    });
    it('refreshes remote client tokens', async () => {
        const fetcher = vi.fn(async (url, init) => {
            expect(url).toBe('http://local/api/v1/auth/remote/refresh');
            expect(init?.method).toBe('POST');
            const body = JSON.parse(init?.body);
            expect(body.refreshToken).toBe('refresh-token-1');
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: {
                        accessToken: 'access-token-2',
                        refreshToken: 'refresh-token-2',
                        tokenType: 'Bearer',
                        expiresIn: 900,
                        refreshExpiresAt: '2026-01-03T00:00:00.000Z',
                        scopes: ['runtime.read'],
                    },
                }),
            };
        });
        const client = new InternetResilienceClient({ baseUrl: 'http://local', fetch: fetcher });
        const tokens = await client.remoteClientRefresh('refresh-token-1');
        expect(tokens.accessToken).toBe('access-token-2');
        expect(tokens.refreshToken).toBe('refresh-token-2');
    });
});
//# sourceMappingURL=index.test.js.map