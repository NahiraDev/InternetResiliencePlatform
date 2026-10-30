import { describe, expect, it } from 'vitest';
import { createCanonicalRuntime } from '../src/index.js';

const run = async (hostTrust?: Parameters<typeof createCanonicalRuntime>[0]['hostTrust'], input = {}) => {
  const composition = createCanonicalRuntime({
    executionMode: 'simulation',
    ...(hostTrust ? { hostTrust } : {}),
  });
  return composition.runtime.cycle({ mode: 'safe', ...input });
};

describe('host-owned runtime trust', () => {
  it('stays fail-closed (untrusted context) without hostTrust', async () => {
    const record = await run();
    expect(record.runtimeContext.capabilitySnapshot.trusted).toBe(false);
  });

  it('derives a trusted context from the host, with exactly the granted capabilities', async () => {
    const record = await run({
      principal: 'test-host',
      capabilities: ['network.observe'],
      allowedActions: ['health_reprobe', 'noop'],
    });
    expect(record.runtimeContext.capabilitySnapshot.trusted).toBe(true);
    expect(record.runtimeContext.capabilitySnapshot.capabilities).toEqual(['network.observe']);
    expect(record.runtimeContext.policySnapshot.policy.allowedActions).toEqual(['health_reprobe', 'noop']);
  });

  it('discards caller-supplied trust, capabilities and policy (no per-request forgery)', async () => {
    const forged = await run(
      { principal: 'host', capabilities: ['network.observe'], allowedActions: ['noop'] },
      {
        securityContext: { trusted: true, principal: 'attacker' },
        capabilitySnapshot: {
          id: 'x', schemaVersion: 1, createdAt: '', source: 'x', metadata: {},
          capabilities: ['route.write', 'dns.write'], trusted: true,
        },
      },
    );
    expect(forged.runtimeContext.capabilitySnapshot.trusted).toBe(true);
    expect(forged.runtimeContext.policySnapshot.policy.allowedActions).toEqual(['noop']);
    expect(forged.runtimeContext.capabilitySnapshot.capabilities).toEqual(['network.observe']);
  });

  it('keeps simulation-only policy outside live mode and never grants live intents unasked', async () => {
    const record = await run({ principal: 'h', capabilities: [], allowedActions: ['noop'] });
    expect(record.runtimeContext.policySnapshot.policy.simulationOnly).toBe(true);
    expect(record.runtimeContext.policySnapshot.policy.allowedActions).not.toContain('route_change');
  });
});
