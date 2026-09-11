import { describe, expect, it } from 'vitest';
import { SafetyRollbackRecoveryKernel, SafetyViolationError } from '../src/safety/safety-kernel.js';
import type { ActionExecution, ActionPlan, RuntimeContext } from '../src/domain/types.js';
import type { ActionExecutor, EventSink, RecoveryProvider } from '../src/ports/ports.js';
import { ActionTransactionEngine } from '../src/transactions/action-transaction.js';

const context = (): RuntimeContext => ({
  runtimeId: 'runtime',
  correlationId: 'corr',
  mode: 'simulation',
  policySnapshot: {
    id: 'policy',
    schemaVersion: 1,
    createdAt: '2026-09-08T00:00:00.000Z',
    source: 'test',
    metadata: {},
    policy: {
      allowedActions: ['route_change'],
      deniedActions: [],
      capabilityRequirements: {},
      securityConstraints: [],
      actionBudget: 1,
      maxConcurrentActions: 1,
      confidenceThreshold: 0.5,
      telemetryFreshnessMs: 60000,
      simulationOnly: true,
      failClosed: true,
    },
  },
  capabilitySnapshot: {
    id: 'caps',
    schemaVersion: 1,
    createdAt: '2026-09-08T00:00:00.000Z',
    source: 'test',
    metadata: {},
    capabilities: ['route.write'],
    trusted: true,
  },
  deadline: '2099-01-01T00:00:00.000Z',
  cancelled: false,
  securityContext: { trusted: true },
  configuration: {
    enabled: true,
    mode: 'simulation',
    cycleIntervalMs: 1000,
    maxActionsPerCycle: 1,
    maxConcurrentActions: 1,
    observationFreshnessMs: 60000,
    decisionTimeoutMs: 500,
    verificationTimeoutMs: 500,
    recoveryTimeoutMs: 500,
    persistenceMode: 'memory',
    replayEnabled: true,
  },
});

const plan = (risk = 0.2, metadata: Record<string, unknown> = {}): ActionPlan => ({
  id: 'plan',
  schemaVersion: 1,
  createdAt: '2026-09-08T00:00:00.000Z',
  correlationId: 'corr',
  source: 'test',
  metadata,
  selectedAction: {
    id: 'action',
    schemaVersion: 1,
    createdAt: '2026-09-08T00:00:00.000Z',
    correlationId: 'corr',
    source: 'test',
    metadata: {},
    intent: 'route_change',
    expectedBenefit: 0.8,
    risk,
    confidence: 0.9,
    requiredCapabilities: ['route.write'],
    dependencies: [],
    postconditions: ['route ok'],
    verificationRequirements: [],
    rejectionReasons: [],
  },
  alternatives: [],
  rejectionReasons: [],
  expectedBenefit: 0.8,
  risk,
  confidence: 0.9,
  policyResult: { allowed: true, reasons: [], requiredCapabilities: ['route.write'] },
  requiredCapabilities: ['route.write'],
  dependencies: [],
  expectedPostconditions: ['route ok'],
  verificationRequirements: [],
  rollbackStrategy: 'checkpoint',
});

const exec = (status: ActionExecution['status'] = 'success'): ActionExecution => ({
  id: 'execution',
  schemaVersion: 1,
  createdAt: '2026-09-08T00:00:00.000Z',
  correlationId: 'corr',
  source: 'test',
  metadata: {},
  status,
  simulated: true,
  actionId: 'action',
});

const recovery: RecoveryProvider = {
  recover: async () => ({
    id: 'recovery',
    schemaVersion: 1,
    createdAt: '2026-09-08T00:00:00.000Z',
    source: 'test',
    metadata: {},
    correlationId: 'corr',
    delegatedTo: 'failover',
    status: 'success',
    reason: 'verification failed',
  }),
};

const make = (executor: ActionExecutor, options = {}) => {
  const events: EventSink = { emit: async () => undefined };
  const tx = new ActionTransactionEngine(executor, events);
  return new SafetyRollbackRecoveryKernel(tx, events, recovery, options);
};

describe('SafetyRollbackRecoveryKernel', () => {
  it('blocks excessive blast radius before execution', async () => {
    let calls = 0;
    const kernel = make({
      execute: async () => {
        calls++;
        return exec();
      },
    });
    await expect(kernel.execute(plan(0.2, { blastRadius: 0.9 }), context())).rejects.toBeInstanceOf(
      SafetyViolationError,
    );
    expect(calls).toBe(0);
  });

  it('fails closed for expired context', async () => {
    let calls = 0;
    const kernel = make({
      execute: async () => {
        calls++;
        return exec();
      },
    });
    const c = { ...context(), deadline: '2000-01-01T00:00:00.000Z' };
    await expect(kernel.execute(plan(), c)).rejects.toBeInstanceOf(SafetyViolationError);
    expect(calls).toBe(0);
  });

  it('creates a checkpoint before mutation and rolls back failed execution', async () => {
    const order: string[] = [];
    const rollback = async () => {
      order.push('rollback');
      return exec('success');
    };
    const kernel = make(
      {
        execute: async () => {
          order.push('execute');
          return exec('failed');
        },
      },
      {
        checkpoint: async () => {
          order.push('checkpoint');
          return { state: 'before' };
        },
        rollback,
      },
    );
    const result = await kernel.execute(plan(), context());
    expect(order).toEqual(['checkpoint', 'execute', 'rollback']);
    expect(result.rollbackAttempted).toBe(true);
    expect(result.rollbackExecution?.status).toBe('success');
  });

  it('does not roll back successful execution', async () => {
    let rollbacks = 0;
    const kernel = make(
      { execute: async () => exec() },
      {
        checkpoint: async () => ({ state: 'before' }),
        rollback: async () => {
          rollbacks++;
          return exec();
        },
      },
    );
    const result = await kernel.execute(plan(), context());
    expect(result.rollbackAttempted).toBe(false);
    expect(rollbacks).toBe(0);
  });

  it('delegates verification recovery to the canonical recovery provider', async () => {
    let calls = 0;
    const rp: RecoveryProvider = {
      recover: async () => {
        calls++;
        return { ...(await recovery.recover(plan(), '', context())) };
      },
    };
    const events: EventSink = { emit: async () => undefined };
    const tx = new ActionTransactionEngine({ execute: async () => exec() }, events);
    const kernel = new SafetyRollbackRecoveryKernel(tx, events, rp);
    const result = await kernel.recover(plan(), 'verification failed', context());
    expect(result.status).toBe('success');
    expect(calls).toBe(1);
  });
});
