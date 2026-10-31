import { describe, expect, it } from 'vitest';
import { createCanonicalRuntime, type ObservationProvider } from '../src/index.js';

const trust = {
  principal: 'test-host',
  capabilities: ['network.observe'],
  allowedActions: ['health_reprobe', 'noop', 'degraded_mode', 'recovery', 'rollback'],
} as const;
const withProvider = (provider: ObservationProvider) =>
  createCanonicalRuntime({ executionMode: 'simulation', hostTrust: trust, observationProviders: [provider] });

describe('a failing observation provider never yields a healthy status', () => {
  it('a throwing provider fails the cycle and the runtime reports failed health', async () => {
    const { runtime } = withProvider({ id: 'broken', collect: async () => { throw new Error('boom'); } });
    await expect(runtime.cycle({ mode: 'safe' })).rejects.toThrow('boom');
    const snapshot = await runtime.getRuntimeSnapshot();
    expect(snapshot.health.status).toBe('failed');
    expect(snapshot.health.status).not.toBe('healthy');
  });

  it('a provider that reports errors and no observations leaves health unknown, never healthy', async () => {
    const { runtime } = withProvider({
      id: 'blind',
      collect: async () => ({ providerId: 'blind', observations: [], collectedAt: new Date().toISOString(), errors: ['interface down'] }),
    });
    await runtime.cycle({ mode: 'safe' });
    const snapshot = await runtime.getRuntimeSnapshot();
    expect(snapshot.health.status).toBe('unknown');
  });
});
