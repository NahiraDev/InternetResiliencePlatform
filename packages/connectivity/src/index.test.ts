import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '@irp/events';
import {
  ConnectivityManager,
  SimulationConnectivityProvider,
  SwitchRejected,
  assertConnectivityTransition,
} from './index.js';

const managerWith = async (...providers: SimulationConnectivityProvider[]) => {
  const events = new InMemoryEventBus();
  const manager = new ConnectivityManager({
    events,
    config: { cooldownMs: 0, minimumStabilityMs: 0 },
  });
  for (const provider of providers) await manager.registerProvider(provider);
  await manager.discoverResources();
  return manager;
};

describe('connectivity manager phase 12', () => {
  it('registers providers, discovers resources, and rejects invalid lifecycle transitions', async () => {
    const ethernet = new SimulationConnectivityProvider('eth', 'ethernet', [
      { id: 'eth0', health: { score: 95 } },
    ]);
    const manager = await managerWith(ethernet);
    expect(manager.getProviders()).toHaveLength(1);
    expect(manager.getAvailableSources().map((s) => s.sourceId)).toEqual(['eth:eth0']);
    expect(() => assertConnectivityTransition('available', 'recovering')).toThrow();
  });

  it('selects healthy source over failed higher-priority source with structured explanation', async () => {
    const ethernet = new SimulationConnectivityProvider('eth', 'ethernet', [
      { id: 'eth0', health: { score: 10, status: 'unhealthy' } },
    ]);
    const wifi = new SimulationConnectivityProvider('wifi', 'wifi', [
      { id: 'wlan0', health: { score: 82, latencyMs: 25, packetLoss: 0, stability: 90 } },
    ]);
    const manager = await managerWith(ethernet, wifi);
    const evaluation = await manager.evaluate();
    expect(evaluation.selected?.source.sourceId).toBe('wifi:wlan0');
    expect(evaluation.candidates.find((c) => c.source.sourceId === 'eth:eth0')?.decision).toBe(
      'unhealthy',
    );
  });

  it('performs safe failover through multiple candidates and records failed attempts', async () => {
    const eth = new SimulationConnectivityProvider('eth', 'ethernet', [
      { id: 'eth0', health: { score: 95 } },
    ]);
    const wifi = new SimulationConnectivityProvider('wifi', 'wifi', [
      { id: 'wlan0', health: { score: 90 }, activationFails: true },
    ]);
    const cell = new SimulationConnectivityProvider('cell', 'cellular', [
      { id: 'wwan0', health: { score: 88 } },
    ]);
    const manager = await managerWith(eth, wifi, cell);
    await manager.activateSource('eth:eth0');
    eth.setHealth('eth0', { score: 0, status: 'unhealthy' });
    const transition = await manager.failover();
    expect(transition.to).toEqual({ providerId: 'cell', resourceId: 'wwan0' });
    expect(manager.getActiveSource()?.sourceId).toBe('cell:wwan0');
  });

  it('rejects verification failure and does not commit broken active source', async () => {
    const eth = new SimulationConnectivityProvider('eth', 'ethernet', [
      { id: 'eth0', health: { score: 95 } },
    ]);
    const wifi = new SimulationConnectivityProvider('wifi', 'wifi', [
      { id: 'wlan0', health: { score: 90 }, verificationFails: true },
    ]);
    const manager = await managerWith(eth, wifi);
    await manager.activateSource('eth:eth0');
    await expect(manager.switchSource('wifi:wlan0')).rejects.toBeInstanceOf(SwitchRejected);
    expect(manager.getActiveSource()?.sourceId).toBe('eth:eth0');
  });

  it('honors hysteresis, cooldown, policy rejection, and manual override audits', async () => {
    const events: string[] = [];
    const bus = new InMemoryEventBus();
    bus.subscribe('connectivity.manual_override', (event) => {
      events.push(event.type);
    });
    const manager = new ConnectivityManager({
      events: bus,
      config: { cooldownMs: 60_000, switchingHysteresis: 20 },
      policy: () => ({ allowed: false, reason: 'test policy' }),
    });
    const eth = new SimulationConnectivityProvider('eth', 'ethernet', [
      { id: 'eth0', health: { score: 80 } },
    ]);
    const wifi = new SimulationConnectivityProvider('wifi', 'wifi', [
      { id: 'wlan0', health: { score: 90 } },
    ]);
    await manager.registerProvider(eth);
    await manager.registerProvider(wifi);
    await manager.discoverResources();
    await manager.manualOverride('prefer', 'eth:eth0');
    const evaluation = await manager.evaluate();
    expect(evaluation.selected).toBeUndefined();
    expect(events).toEqual(['connectivity.manual_override']);
  });

  it('recovers and safely fails back to the preferred source after health returns', async () => {
    const eth = new SimulationConnectivityProvider('eth', 'ethernet', [
      { id: 'eth0', health: { score: 95 } },
    ]);
    const wifi = new SimulationConnectivityProvider('wifi', 'wifi', [
      { id: 'wlan0', health: { score: 85 } },
    ]);
    const manager = await managerWith(eth, wifi);
    await manager.manualOverride('prefer', 'eth:eth0');
    await manager.activateSource('wifi:wlan0');
    const transition = await manager.failback();
    expect(transition?.to).toEqual({ providerId: 'eth', resourceId: 'eth0' });
  });

  it('prevents duplicate concurrent failovers from corrupting active state and detects flapping', async () => {
    let now = 1_000;
    const manager = new ConnectivityManager({
      now: () => now,
      config: { cooldownMs: 0, flappingThreshold: 2, flappingWindowMs: 10_000 },
    });
    const a = new SimulationConnectivityProvider('a', 'ethernet', [
      { id: 'a0', health: { score: 95 } },
    ]);
    const b = new SimulationConnectivityProvider('b', 'wifi', [
      { id: 'b0', health: { score: 92 } },
    ]);
    await manager.registerProvider(a);
    await manager.registerProvider(b);
    await manager.discoverResources();
    await manager.activateSource('a:a0');
    now += 1;
    await manager.switchSource('b:b0');
    now += 1;
    await manager.switchSource('a:a0');
    expect(manager.history().filter((t) => t.status === 'committed')).toHaveLength(3);
  });
});
