import { describe, expect, it, vi } from 'vitest';
import { InternetResilienceClient } from './index.js';
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
  it('propagates non-ok responses with status-specific errors', async () => {
    const client = new InternetResilienceClient({
      baseUrl: 'http://local',
      fetch: (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch,
    });
    await expect(client.health()).rejects.toThrow('Health request failed: 503');
  });
});
