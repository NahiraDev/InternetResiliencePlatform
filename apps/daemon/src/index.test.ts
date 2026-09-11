import { describe, expect, it, afterEach } from 'vitest';
import { createDaemon, createRuntimeDaemonHost } from './index.js';

afterEach(() => {
  delete process.env.IRP_TUNNEL_ENABLED;
  delete process.env.IRP_GATEWAY_SELECTION_ENABLED;
});

describe('daemon factory', () => {
  it('creates an application without starting host services', () => {
    const daemon = createDaemon();
    expect(daemon.state).toBe('created');
    expect(daemon.providers.length).toBeGreaterThan(0);
  });
});

describe('RuntimeDaemonHost', () => {
  it('binds the canonical network control plane with gateway selection and tunnel planes', () => {
    const host = createRuntimeDaemonHost();
    const health = host.health();
    expect(health.lifecycle).toBe('created');
    expect(health.gatewaySelection.configured).toBe(false);
    expect(health.tunnel.configured).toBe(false);
    expect(health.plugins).toEqual({ loaded: [], active: [] });
    expect(health.autoOptimization).toEqual({ bound: true, enabled: false });
    expect(health.capabilities).toEqual(expect.any(Array));
  });

  it('enables gateway selection and tunnel planes only via explicit environment opt-in', async () => {
    process.env.IRP_GATEWAY_SELECTION_ENABLED = '1';
    process.env.IRP_TUNNEL_ENABLED = '1';
    const host = createRuntimeDaemonHost();
    expect(host.gatewaySelection.configured).toBe(true);
    expect(host.tunnelPlane.configured).toBe(false);
    expect(host.plugins.isRunning).toBe(false);
    await host.plugins.start();
    expect(host.plugins.isRunning).toBe(true);
    await host.plugins.stop();
    expect(host.plugins.isRunning).toBe(false);
  });
});