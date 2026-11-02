import { describe, expect, it } from 'vitest';
import { createRuntimeContext } from '@irp/resilience-runtime';
import { LinuxWireGuardObservationProvider } from './linux-wireguard-observation-provider.js';

const context = () => createRuntimeContext({ mode: 'live', correlationId: 'wireguard-observation-test' });

describe('LinuxWireGuardObservationProvider', () => {
  it('does not create a tunnel when auto-connect is disabled and none is managed', async () => {
    const provider = new LinuxWireGuardObservationProvider({
      controlPlane: {
        configured: true,
        activeTunnel: undefined,
        managedTunnel: undefined,
        verify: async () => false,
      },
      autoConnect: false,
    });
    const result = await provider.collect(context());
    expect(result.observations).toEqual([]);
  });

  it('reports an initial autoconnect request only when explicitly enabled', async () => {
    const provider = new LinuxWireGuardObservationProvider({
      controlPlane: {
        configured: true,
        activeTunnel: undefined,
        managedTunnel: undefined,
        verify: async () => false,
      },
      autoConnect: true,
    });
    const result = await provider.collect(context());
    expect(result.observations[0]).toMatchObject({
      category: 'tunnel',
      metric: 'wireguard_autoconnect',
      status: 'degraded',
      metadata: { tunnelProviderId: 'wireguard', reconnect: false },
    });
    await expect(provider.collect(context()).then((next) => next.observations)).resolves.toEqual([]);
  });

  it('reports a healthy managed tunnel without creating a recovery incident', async () => {
    const provider = new LinuxWireGuardObservationProvider({
      controlPlane: {
        configured: true,
        activeTunnel: 'wg-1',
        managedTunnel: 'wg-1',
        verify: async () => true,
      },
      autoConnect: false,
    });
    const result = await provider.collect(context());
    expect(result.observations[0]).toMatchObject({
      metric: 'wireguard_handshake',
      value: 1,
      status: 'healthy',
      metadata: { tunnelProviderId: 'wireguard', tunnelId: 'wg-1', reconnect: false },
    });
  });

  it('requests a canonical reconnect for an unhealthy managed tunnel and bounds retries', async () => {
    const provider = new LinuxWireGuardObservationProvider({
      controlPlane: {
        configured: true,
        activeTunnel: 'wg-1',
        managedTunnel: 'wg-1',
        verify: async () => false,
      },
      autoConnect: false,
      maxRecoveryAttempts: 1,
    });
    const first = await provider.collect(context());
    expect(first.observations[0]).toMatchObject({
      metric: 'wireguard_handshake',
      status: 'failed',
      metadata: { tunnelProviderId: 'wireguard', tunnelId: 'wg-1', reconnect: true },
    });
    const second = await provider.collect(context());
    expect(second.observations[0]?.metadata).toMatchObject({
      recoveryExhausted: true,
      reconnect: true,
    });
  });

  it('emits no recovery signal when the configured provider is not authorized/configured', async () => {
    const provider = new LinuxWireGuardObservationProvider({
      controlPlane: {
        configured: false,
        activeTunnel: undefined,
        managedTunnel: undefined,
        verify: async () => false,
      },
      autoConnect: true,
    });
    const result = await provider.collect(context());
    expect(result.observations).toEqual([]);
  });
});
