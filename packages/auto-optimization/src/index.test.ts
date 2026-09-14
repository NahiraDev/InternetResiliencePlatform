import { describe, expect, it } from 'vitest';
import type { ActionPlan, RuntimeContext } from '@irp/resilience-runtime';
import {
  AutoOptimizationEngine,
  MemoryAutoOptimizationStateStore,
  buildRecommendation,
  defaultAutoOptimizationPolicy,
  type AutoOptimizationPorts,
  type OptimizationRecommendation,
} from './index.js';

const plan = (overrides: Partial<ActionPlan> = {}): ActionPlan => ({
  id: 'plan-1',
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  source: 'phase-33-test',
  metadata: {},
  selectedAction: {
    id: 'action-1',
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    source: 'phase-33-test',
    metadata: {},
    intent: 'route_change',
    expectedBenefit: 80,
    risk: 10,
    confidence: 99,
    requiredCapabilities: [],
    dependencies: [],
    postconditions: ['route healthy'],
    verificationRequirements: ['route probe succeeds'],
    rejectionReasons: [],
  },
  alternatives: [],
  rejectionReasons: [],
  expectedBenefit: 80,
  risk: 10,
  confidence: 99,
  policyResult: { allowed: true, reasons: [], requiredCapabilities: [] },
  requiredCapabilities: [],
  dependencies: [],
  expectedPostconditions: ['route healthy'],
  verificationRequirements: ['route probe succeeds'],
  ...overrides,
});

const context = (): RuntimeContext =>
  ({
    runtimeId: 'runtime-1',
    correlationId: 'correlation-1',
    mode: 'live',
    policySnapshot: {
      id: 'policy-1',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      source: 'test',
      metadata: {},
      policy: {
        allowedActions: ['route_change'],
        deniedActions: [],
        capabilityRequirements: {},
        securityConstraints: [],
        actionBudget: 10,
        maxConcurrentActions: 1,
        confidenceThreshold: 90,
        telemetryFreshnessMs: 60_000,
        simulationOnly: false,
        failClosed: true,
        manualOverride: false,
      },
    },
    capabilitySnapshot: {
      id: 'cap-1',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      source: 'test',
      metadata: {},
      capabilities: ['route_change'],
      trusted: true,
    },
    deadline: new Date(Date.now() + 60_000).toISOString(),
    cancelled: false,
    securityContext: { trusted: true, principal: 'test' },
    configuration: {
      enabled: true,
      mode: 'live',
      cycleIntervalMs: 1_000,
      maxActionsPerCycle: 1,
      maxConcurrentActions: 1,
      observationFreshnessMs: 60_000,
      decisionTimeoutMs: 1_000,
      verificationTimeoutMs: 1_000,
      recoveryTimeoutMs: 1_000,
      persistenceMode: 'memory',
      replayEnabled: true,
    },
  }) as RuntimeContext;

const ports = (): AutoOptimizationPorts => ({});

const recommendation = (): OptimizationRecommendation =>
  buildRecommendation(plan(), {
    id: 'recommendation-1',
    source: 'recommendation',
    confidence: 99,
    risk: 10,
    expectedBenefit: 80,
    explanation: ['historically stable route'],
    createdAt: new Date().toISOString(),
  });

describe('AutoOptimizationEngine', () => {
  it('is disabled by default and exposes explicit opt-in control', async () => {
    const store = new MemoryAutoOptimizationStateStore(false);
    const engine = new AutoOptimizationEngine(defaultAutoOptimizationPolicy(), ports(), store);
    expect((await engine.evaluate(recommendation(), context())).blockReasons).toContain('disabled');
    await engine.setEnabled(true);
    expect((await engine.evaluate(recommendation(), context())).allowed).toBe(true);
  });

  it('blocks low-confidence recommendations', async () => {
    const policy = { ...defaultAutoOptimizationPolicy(), enabled: true };
    const engine = new AutoOptimizationEngine(
      policy,
      ports(),
      new MemoryAutoOptimizationStateStore(true),
    );
    const low = buildRecommendation(plan({ confidence: 50 }), {
      id: 'low-confidence',
      source: 'recommendation',
      confidence: 50,
      risk: 10,
      expectedBenefit: 80,
      explanation: [],
      createdAt: new Date().toISOString(),
    });
    const result = await engine.submit(low, context());
    expect(result.status).toBe('blocked');
    expect(result.evaluation.blockReasons).toContain('low_confidence');
  });

  it('publishes an eligible recommendation without creating a mutation path', async () => {
    const policy = { ...defaultAutoOptimizationPolicy(), enabled: true };
    const engine = new AutoOptimizationEngine(
      policy,
      ports(),
      new MemoryAutoOptimizationStateStore(true),
    );
    const result = await engine.submit(recommendation(), context());
    expect(result.status).toBe('recommended');
    expect(result.reason).toContain('ResilienceRuntime');
    expect((await engine.getState()).lastOutcome).toBeUndefined();
  });

  it('honors runtime manual override and never bypasses runtime policy', async () => {
    const policy = { ...defaultAutoOptimizationPolicy(), enabled: true };
    const engine = new AutoOptimizationEngine(
      policy,
      ports(),
      new MemoryAutoOptimizationStateStore(true),
    );
    const base = context();
    const overridden = {
      ...base,
      policySnapshot: {
        ...base.policySnapshot,
        policy: { ...base.policySnapshot.policy, manualOverride: true },
      },
    } as RuntimeContext;
    const result = await engine.submit(recommendation(), overridden);
    expect(result.status).toBe('blocked');
    expect(result.evaluation.blockReasons).toContain('manual_override');
  });

  it('never consumes an execution budget while publishing recommendations', async () => {
    const engine = new AutoOptimizationEngine(
      { ...defaultAutoOptimizationPolicy(), enabled: true },
      ports(),
      new MemoryAutoOptimizationStateStore(true),
    );
    expect((await engine.submit(recommendation(), context())).status).toBe('recommended');
    expect((await engine.getState()).actionsInWindow).toBe(0);
  });
});
