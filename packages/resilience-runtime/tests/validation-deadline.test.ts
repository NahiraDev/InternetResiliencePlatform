import { describe, expect, it } from 'vitest';
import {
  createCapabilitySnapshot,
  createPolicySnapshot,
  createRuntimeContext,
  defaultPolicy,
  DeterministicPlanner,
  RuntimeActionValidator,
} from '../src/index.js';

describe('RuntimeActionValidator deadline enforcement', () => {
  it('blocks a mutation when the runtime context deadline has expired', async () => {
    const context = createRuntimeContext({
      mode: 'simulation',
      deadline: '2020-01-01T00:00:00.000Z',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot(['dns.write'], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('simulation'),
        allowedActions: ['dns_switch', 'noop'],
        capabilityRequirements: { dns_switch: ['dns.write'] },
        simulationOnly: false,
      }),
    });
    const plan = await new DeterministicPlanner().plan(
      [
        {
          id: 'dns-switch',
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          correlationId: context.correlationId,
          source: 'test',
          metadata: {},
          intent: 'dns_switch',
          expectedBenefit: 0.9,
          risk: 0.1,
          confidence: 0.9,
          requiredCapabilities: ['dns.write'],
          dependencies: ['dns'],
          postconditions: ['dns switched'],
          verificationRequirements: ['dns healthy'],
          rejectionReasons: [],
        },
      ],
      context,
    );

    const validation = await new RuntimeActionValidator().validate(plan, context);
    expect(validation.valid).toBe(false);
    expect(validation.reasons).toContain('context deadline has expired');
  });

  it('rejects malformed deadlines instead of treating them as unlimited', async () => {
    const context = createRuntimeContext({
      mode: 'simulation',
      deadline: 'not-a-date',
      securityContext: { trusted: true },
      capabilitySnapshot: createCapabilitySnapshot([], true),
    });
    const plan = await new DeterministicPlanner().plan([], context);

    const validation = await new RuntimeActionValidator().validate(plan, context);
    expect(validation.valid).toBe(false);
    expect(validation.reasons).toContain('context deadline is invalid');
  });
});
