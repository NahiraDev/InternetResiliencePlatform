import { describe, expect, it } from 'vitest';
import { SafetyRollbackRecoveryKernel } from '../src/safety/safety-kernel.js';
import type { ActionExecution, ActionPlan, RuntimeContext } from '../src/domain/types.js';
import type { EventSink, RecoveryProvider } from '../src/ports/ports.js';
import { validateEvent } from '../src/events/event-taxonomy.js';

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

const make = (options = {}) => {
  const events: EventSink = { emit: async () => undefined };
  return new SafetyRollbackRecoveryKernel(events, recovery, options);
};

describe('SafetyRollbackRecoveryKernel', () => {
  it('blocks excessive blast radius', () => {
    const kernel = make();
    const assessment = kernel.assess(plan(0.2, { blastRadius: 0.9 }), context());
    expect(assessment.allowed).toBe(false);
    expect(assessment.reasons.join('; ')).toContain('blast radius');
    expect(assessment.blastRadius).toBe(0.9);
  });

  it('fails closed for expired context', () => {
    const kernel = make();
    const c = { ...context(), deadline: '2000-01-01T00:00:00.000Z' };
    expect(kernel.assess(plan(), c).reasons).toContain('context deadline has expired');
  });

  it('fails closed for cancelled context', () => {
    const kernel = make();
    const assessment = kernel.assess(plan(), { ...context(), cancelled: true });
    expect(assessment.allowed).toBe(false);
    expect(assessment.reasons).toContain('context is cancelled');
  });

  it('fails closed for an untrusted mutation context', () => {
    const kernel = make();
    const assessment = kernel.assess(plan(), {
      ...context(),
      mode: 'live',
      securityContext: { trusted: false },
    });
    expect(assessment.allowed).toBe(false);
    expect(assessment.reasons).toContain('trusted authorization is required for mutation');
  });

  it('allows a bounded, trusted, permitted plan', () => {
    const kernel = make();
    const assessment = kernel.assess(plan(), context());
    expect(assessment.allowed).toBe(true);
    expect(assessment.reasons).toEqual([]);
  });

  it('captures a checkpoint for a mutating plan and skips it for noop', async () => {
    const order: string[] = [];
    const kernel = make({
      checkpoint: async () => {
        order.push('checkpoint');
        return { state: 'before' };
      },
    });
    expect(await kernel.createCheckpoint(plan(), context())).toEqual({ state: 'before' });
    const noopPlan: ActionPlan = {
      ...plan(),
      selectedAction: { ...plan().selectedAction, intent: 'noop' },
    };
    expect(await kernel.createCheckpoint(noopPlan, context())).toBeUndefined();
    expect(order).toEqual(['checkpoint']);
  });

  it('rolls back a checkpoint through the configured rollback port', async () => {
    const kernel = make({
      checkpoint: async () => ({ state: 'before' }),
      rollback: async () => exec('success'),
    });
    const checkpoint = await kernel.createCheckpoint(plan(), context());
    const result = await kernel.rollbackCheckpoint(plan(), context(), checkpoint);
    expect(result?.status).toBe('success');
  });

  it('returns undefined rollback when no rollback port is configured', async () => {
    const kernel = make({ checkpoint: async () => ({ state: 'before' }) });
    expect(await kernel.rollbackCheckpoint(plan(), context(), { state: 'before' })).toBeUndefined();
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
    const kernel = new SafetyRollbackRecoveryKernel(events, rp);
    const result = await kernel.recover(plan(), 'verification failed', context());
    expect(result.status).toBe('success');
    expect(calls).toBe(1);
  });

  it('stamps the mutation transaction identity onto recovery evidence', async () => {
    const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const events: EventSink = {
      emit: async (type: string, payload: Record<string, unknown>) => {
        emitted.push({ type, payload });
      },
    };
    const kernel = new SafetyRollbackRecoveryKernel(events, recovery);
    await kernel.recover(plan(), 'verification failed', context(), 'transaction-42');
    const started = emitted.find((e) => e.type === 'runtime.safety.recovery.started');
    const completed = emitted.find((e) => e.type === 'runtime.safety.recovery.completed');
    expect(started?.payload.transactionId).toBe('transaction-42');
    expect(completed?.payload.transactionId).toBe('transaction-42');
    // Both are taxonomy-conformant only with the transaction identity present.
    for (const event of emitted) {
      expect(validateEvent(event.type, event.payload).valid).toBe(true);
    }
  });

  it('exposes no execution method, so the boundary stays the only live executor', () => {
    const kernel = make();
    expect((kernel as unknown as Record<string, unknown>).execute).toBeUndefined();
    expect(Object.getOwnPropertyNames(SafetyRollbackRecoveryKernel.prototype)).not.toContain(
      'execute',
    );
  });
});
