import { describe, expect, it, vi } from 'vitest';
import { InternetResilienceClient, ProductApiError } from './index.js';

describe('InternetResilienceClient', () => {
  it('requests health and version from the configured base URL', async () => {
    const fetcher = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ url }),
    })) as unknown as typeof fetch;
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
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
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
    }) as unknown as typeof fetch;
    const client = new InternetResilienceClient({ baseUrl: 'http://local', fetch: fetcher });
    await expect(client.capabilities()).resolves.toMatchObject({
      api: { version: '1', pathPrefix: '/api/v1' },
      clients: ['web', 'desktop', 'ios', 'android'],
    });
  });

  it('sends bearer credentials and version negotiation for client context', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
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
    }) as unknown as typeof fetch;
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
    await expect(client.requestCapability('/health')).rejects.toThrow(
      'Product API paths must use /api/v1/.',
    );
  });

  it('surfaces structured product API errors', async () => {
    const client = new InternetResilienceClient({
      baseUrl: 'http://local',
      fetch: (async () => ({
        ok: false,
        status: 406,
        json: async () => ({
          success: false,
          error: { code: 'API_VERSION_NOT_SUPPORTED', message: 'The requested API version is not supported.' },
        }),
      })) as unknown as typeof fetch,
    });
    await expect(client.capabilities()).rejects.toEqual(
      expect.objectContaining({
        status: 406,
        code: 'API_VERSION_NOT_SUPPORTED',
        name: 'ProductApiError',
        message: 'The requested API version is not supported.',
      }),
    );
  });

  it('preserves ProductApiError as an Error instance', async () => {
    const client = new InternetResilienceClient({
      baseUrl: 'http://local',
      fetch: (async () => ({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } }),
      })) as unknown as typeof fetch,
    });

    await expect(client.context()).rejects.toBeInstanceOf(ProductApiError);
  });

  it('propagates non-ok health responses with status-specific errors', async () => {
    const client = new InternetResilienceClient({
      baseUrl: 'http://local',
      fetch: (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch,
    });
    await expect(client.health()).rejects.toThrow('Health request failed: 503');
  });
});
