import { describe, expect, it } from 'vitest';
import type {
  ActionExecution,
  ActionPlan,
  ActionValidation,
  ActionVerification,
  RuntimeContext,
} from '@irp/resilience-runtime';
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

const successfulExecution = (): ActionExecution => ({
  id: 'execution-1',
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  source: 'test',
  metadata: {},
  status: 'success',
  simulated: false,
  actionId: 'action-1',
});

const successVerification = (): ActionVerification => ({
  id: 'verification-1',
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  source: 'test',
  metadata: {},
  status: 'success',
  verifiedPostconditions: ['route healthy'],
  failedPostconditions: [],
});

const failingVerification = (): ActionVerification => ({
  ...successVerification(),
  status: 'failed',
  verifiedPostconditions: [],
  failedPostconditions: ['route healthy'],
});

const validation: ActionValidation = {
  id: 'validation-1',
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  source: 'test',
  metadata: {},
  valid: true,
  reasons: [],
  policy: { allowed: true, reasons: [], requiredCapabilities: [] },
};

const ports = (verification: ActionVerification = successVerification()): AutoOptimizationPorts => ({
  validator: { validate: async () => validation },
  executor: { execute: async () => successfulExecution() },
  verifier: { verify: async () => verification },
  rollback: async () => ({ ...successfulExecution(), actionId: 'rollback-1' }),
});

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
    const engine = new AutoOptimizationEngine(policy, ports(), new MemoryAutoOptimizationStateStore(true));
    const low = buildRecommendation(plan({ confidence: 50 }), {
      id: 'low-confidence',
      source: 'recommendation',
      confidence: 50,
      risk: 10,
      expectedBenefit: 80,
      explanation: [],
      createdAt: new Date().toISOString(),
    });
    const result = await engine.apply(low, context());
    expect(result.status).toBe('blocked');
    expect(result.evaluation.blockReasons).toContain('low_confidence');
  });

  it('applies and verifies an eligible recommendation', async () => {
    const policy = { ...defaultAutoOptimizationPolicy(), enabled: true };
    const engine = new AutoOptimizationEngine(policy, ports(), new MemoryAutoOptimizationStateStore(true));
    const result = await engine.apply(recommendation(), context());
    expect(result.status).toBe('applied');
    expect(result.verification?.status).toBe('success');
    expect((await engine.getState()).lastOutcome).toBe('applied');
  });

  it('rolls back when verification fails', async () => {
    const policy = { ...defaultAutoOptimizationPolicy(), enabled: true };
    const engine = new AutoOptimizationEngine(
      policy,
      ports(failingVerification()),
      new MemoryAutoOptimizationStateStore(true),
    );
    const result = await engine.apply(recommendation(), context());
    expect(result.status).toBe('rolled_back');
    expect(result.rollbackExecution?.actionId).toBe('rollback-1');
  });

  it('honors runtime manual override and never bypasses runtime policy', async () => {
    const policy = { ...defaultAutoOptimizationPolicy(), enabled: true };
    const engine = new AutoOptimizationEngine(policy, ports(), new MemoryAutoOptimizationStateStore(true));
    const base = context();
    const overridden = {
      ...base,
      policySnapshot: {
        ...base.policySnapshot,
        policy: { ...base.policySnapshot.policy, manualOverride: true },
      },
    } as RuntimeContext;
    const result = await engine.apply(recommendation(), overridden);
    expect(result.status).toBe('blocked');
    expect(result.evaluation.blockReasons).toContain('manual_override');
  });

  it('supports deterministic dry-run without mutating the executor', async () => {
    let executions = 0;
    const policy = { ...defaultAutoOptimizationPolicy(), enabled: true, dryRun: true };
    const basePorts = ports();
    const testPorts: AutoOptimizationPorts = {
      ...basePorts,
      executor: { execute: async () => { executions += 1; return successfulExecution(); } },
    };
    const engine = new AutoOptimizationEngine(policy, testPorts, new MemoryAutoOptimizationStateStore(true));
    const result = await engine.apply(recommendation(), context());
    expect(result.status).toBe('dry_run');
    expect(executions).toBe(0);
  });

  it('enforces cooldown after a successful apply', async () => {
    const policy = { ...defaultAutoOptimizationPolicy(), enabled: true, cooldownMs: 60_000 };
    const engine = new AutoOptimizationEngine(policy, ports(), new MemoryAutoOptimizationStateStore(true));
    expect((await engine.apply(recommendation(), context())).status).toBe('applied');
    const second = await engine.apply({ ...recommendation(), id: 'recommendation-2' }, context());
    expect(second.status).toBe('blocked');
    expect(second.evaluation.blockReasons).toContain('cooldown');
  });
});
