import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createHttpControlPlaneClient } from '../src/http-control-plane-client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockClear();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const createMockResponse = (ok: boolean, status: number, body: unknown): Response => {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
};

describe('HttpControlPlaneClient (macOS)', () => {
  const stateDirectory = '/tmp/irp-macos-test';
  const client = createHttpControlPlaneClient('http://127.0.0.1:3000', stateDirectory);

  it('is not authenticated initially', () => {
    expect(client.isAuthenticated()).toBe(false);
    expect(client.getCurrentAccessToken()).toBeNull();
  });

  it('authenticates with device credentials and stores tokens', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse(true, 200, {
        success: true,
        data: {
          accessToken: 'access-token-1',
          refreshToken: 'refresh-token-1',
          tokenType: 'Bearer',
          expiresIn: 900,
          refreshExpiresAt: '2026-01-02T00:00:00.000Z',
          scopes: ['runtime.read', 'runtime.inspect'],
          device: {
            credentialId: 'cred-1',
            deviceId: 'device-1',
            platform: 'macos',
            label: 'test device',
          },
        },
      }),
    );

    await client.authenticateWithCredentials('cred-1', 'secret-1');

    expect(client.isAuthenticated()).toBe(true);
    expect(client.getCurrentAccessToken()).toBe('access-token-1');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/auth/remote/token');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string);
    expect(body.credentialId).toBe('cred-1');
    expect(body.secret).toBe('secret-1');
  }, 10000);

  it('fetches device snapshot with authentication', async () => {
    client['accessToken'] = 'test-access-token';
    client['refreshToken'] = 'test-refresh-token';

    mockFetch.mockResolvedValueOnce(
      createMockResponse(true, 200, {
        success: true,
        data: {
          connection: 'online',
          interfaceCount: 2,
          defaultRouteAvailable: true,
          dnsReachable: true,
          capturedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    );

    const snapshot = await client.snapshot('device-1');

    expect(snapshot.connection).toBe('online');
    expect(snapshot.interfaceCount).toBe(2);
    expect(snapshot.defaultRouteAvailable).toBe(true);
    expect(snapshot.dnsReachable).toBe(true);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/remote/devices/device-1/snapshot');
    expect(init?.headers?.Authorization).toBe('Bearer test-access-token');
  }, 10000);

  it('fetches device analytics', async () => {
    client['accessToken'] = 'test-access-token';

    mockFetch.mockResolvedValueOnce(
      createMockResponse(true, 200, {
        success: true,
        data: {
          sampleCount: 100,
          availabilityPercent: 99.5,
          medianLatencyMs: 12.5,
          packetLossPercent: 0.1,
        },
      }),
    );

    const analytics = await client.analytics('device-1');

    expect(analytics.sampleCount).toBe(100);
    expect(analytics.availabilityPercent).toBe(99.5);
    expect(analytics.medianLatencyMs).toBe(12.5);
    expect(analytics.packetLossPercent).toBe(0.1);
  }, 10000);

  it('sets device policy with POST body', async () => {
    client['accessToken'] = 'test-access-token';

    mockFetch.mockResolvedValueOnce(
      createMockResponse(true, 200, {
        success: true,
        data: { autonomousMode: false },
      }),
    );

    const policy = await client.setPolicy('device-1', false);
    expect(policy.autonomousMode).toBe(false);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/v1/remote/devices/device-1/policy');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string);
    expect(body.autonomousMode).toBe(false);
  }, 10000);

  it('refreshes tokens on 401 and retries the request', async () => {
    client['refreshToken'] = 'refresh-token-1';

    mockFetch
      .mockResolvedValueOnce(
        createMockResponse(false, 401, { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }),
      )
      .mockResolvedValueOnce(
        createMockResponse(true, 200, {
          success: true,
          data: {
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
            tokenType: 'Bearer',
            expiresIn: 900,
            refreshExpiresAt: '2026-01-03T00:00:00.000Z',
            scopes: ['runtime.read'],
          },
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse(true, 200, {
          success: true,
          data: {
            connection: 'online',
            interfaceCount: 1,
            defaultRouteAvailable: true,
            dnsReachable: true,
            capturedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      );

    const snapshot = await client.snapshot('device-1');
    expect(snapshot.connection).toBe('online');

    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 10000);

  it('signOut clears tokens', () => {
    client['accessToken'] = 'test-token';
    client['refreshToken'] = 'test-refresh';
    client.signOut();

    expect(client.isAuthenticated()).toBe(false);
    expect(client.getCurrentAccessToken()).toBeNull();
  });
});
