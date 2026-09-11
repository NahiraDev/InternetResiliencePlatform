import { describe, expect, it } from 'vitest';
import {
  createDefaultRuntimeAdapterRegistry,
  createRuntimeContext,
  noopCandidate,
} from '@irp/resilience-runtime';
import { AutoOptimizationHost } from './auto-optimization-host.js';

describe('AutoOptimizationHost', () => {
  it('binds an auto-optimization engine that is disabled by default', async () => {
    const host = new AutoOptimizationHost({ adapters: createDefaultRuntimeAdapterRegistry() });
    const state = await host.engine.getState();
    expect(state.enabled).toBe(false);
  });

  it('blocks recommendations while automatic optimization is disabled', async () => {
    const host = new AutoOptimizationHost({ adapters: createDefaultRuntimeAdapterRegistry() });
    const context = createRuntimeContext({ mode: 'safe' });
    const plan = {
      id: 'test-plan',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      correlationId: context.correlationId,
      source: 'auto-optimization-host-test',
      metadata: {},
      selectedAction: noopCandidate(context),
      alternatives: [],
      rejectionReasons: [],
      expectedBenefit: 0,
      risk: 0,
      confidence: 1,
      policyResult: { allowed: true, reasons: [], requiredCapabilities: [] },
      requiredCapabilities: [],
      dependencies: [],
      expectedPostconditions: ['no mutation performed'],
      verificationRequirements: [],
    };
    const result = await host.engine.apply(
      {
        id: 'recommendation-1',
        plan,
        source: 'operator',
        confidence: 95,
        risk: 5,
        expectedBenefit: 70,
        explanation: ['test recommendation'],
        createdAt: new Date().toISOString(),
      },
      context,
    );
    expect(result.status).toBe('blocked');
    expect(result.evaluation.blockReasons).toContain('disabled');
    expect(result.reason).toContain('automatic optimization is disabled');
  });
});