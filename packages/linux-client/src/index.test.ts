import { afterEach, describe, expect, it } from 'vitest';
import {
  LinuxClientRuntime,
  LinuxClientServer,
  LinuxSnapshotObservationProvider,
  LinuxSystem,
  type LinuxSystemAdapter,
  type NetworkSnapshot,
} from './index.js';

const healthySnapshot: NetworkSnapshot = {
  interfaces: 'eth0 UP 192.0.2.10/24',
  routes: 'default via 192.0.2.1 dev eth0',
  dns: 'Global DNS Servers: 1.1.1.1',
  capturedAt: '2026-09-23T00:00:00.000Z',
};

class FakeLinuxSystem implements LinuxSystemAdapter {
  policy = { autonomousMode: false };

  async snapshot(): Promise<NetworkSnapshot> {
    return healthySnapshot;
  }

  async setAutonomousMode(enabled: boolean): Promise<void> {
    this.policy = { autonomousMode: enabled };
  }

  getPolicy() {
    return { ...this.policy };
  }
}

describe('LinuxSystem', () => {
  it('starts with autonomous mode disabled', () => {
    expect(new LinuxSystem().getPolicy()).toEqual({ autonomousMode: false });
  });

  it('changes autonomous mode deterministically', async () => {
    const system = new LinuxSystem();
    await system.setAutonomousMode(true);
    expect(system.getPolicy()).toEqual({ autonomousMode: true });
    await system.setAutonomousMode(false);
    expect(system.getPolicy()).toEqual({ autonomousMode: false });
  });

  it('returns a defensive policy copy', async () => {
    const system = new LinuxSystem();
    await system.setAutonomousMode(true);
    const policy = system.getPolicy();
    policy.autonomousMode = false;
    expect(system.getPolicy().autonomousMode).toBe(true);
  });
});

describe('LinuxSnapshotObservationProvider', () => {
  it('turns read-only diagnostics into canonical health observations', async () => {
    const provider = new LinuxSnapshotObservationProvider(new FakeLinuxSystem());
    const result = await provider.collect({ correlationId: 'linux-test' } as never);

    expect(result.errors).toEqual([]);
    expect(result.observations).toHaveLength(3);
    expect(result.observations.map((observation) => observation.status)).toEqual([
      'healthy',
      'healthy',
      'healthy',
    ]);
  });
});

describe('LinuxClientRuntime', () => {
  it('starts one simulated canonical runtime cycle without host mutation', async () => {
    const runtime = new LinuxClientRuntime(new FakeLinuxSystem());

    await runtime.start();
    await runtime.start();
    const status = await runtime.status();

    expect(status.runtime.mode).toBe('simulation');
    expect(status.runtime.counters.cyclesTotal).toBe(1);
    expect(status.runtime.health.status).toBe('degraded');
    expect(status.capabilities).toEqual(expect.any(Array));
  });
});

describe('LinuxClientServer', () => {
  let server: LinuxClientServer | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  it('serves canonical runtime health evidence over the local client boundary', async () => {
    const system = new FakeLinuxSystem();
    server = new LinuxClientServer(system);
    await server.start(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('expected TCP server address');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runtime: { mode: 'simulation', counters: { cyclesTotal: 1 } },
      capabilities: expect.any(Array),
    });
  });
});
