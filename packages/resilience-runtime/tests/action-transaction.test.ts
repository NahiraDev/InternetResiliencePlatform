import { describe, expect, it } from 'vitest';
import { ActionTransactionEngine, IdempotencyConflictError } from '../src/transactions/action-transaction.js';
import type { ActionExecution, ActionPlan, RuntimeContext } from '../src/domain/types.js';
import type { ActionExecutor, EventSink } from '../src/ports/ports.js';

const context = (): RuntimeContext => ({
  runtimeId: 'runtime',
  correlationId: 'corr',
  mode: 'simulation',
  policySnapshot: {
    id: 'policy',
    schemaVersion: 1,
    createdAt: '2026-09-07T00:00:00.000Z',
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
      telemetryFreshnessMs: 60_000,
      simulationOnly: true,
      failClosed: true,
    },
  },
  capabilitySnapshot: {
    id: 'capabilities',
    schemaVersion: 1,
    createdAt: '2026-09-07T00:00:00.000Z',
    source: 'test',
    metadata: {},
    capabilities: ['route.write'],
    trusted: true,
  },
  deadline: '2026-09-07T00:01:00.000Z',
  cancelled: false,
  securityContext: { trusted: true },
  configuration: {
    enabled: true,
    mode: 'simulation',
    cycleIntervalMs: 30_000,
    maxActionsPerCycle: 1,
    maxConcurrentActions: 1,
    observationFreshnessMs: 60_000,
    decisionTimeoutMs: 500,
    verificationTimeoutMs: 500,
    recoveryTimeoutMs: 500,
    persistenceMode: 'memory',
    replayEnabled: true,
  },
});

const plan = (actionId: string): ActionPlan => ({
  id: `plan-${actionId}`,
  schemaVersion: 1,
  createdAt: '2026-09-07T00:00:00.000Z',
  correlationId: 'corr',
  source: 'test',
  metadata: {},
  selectedAction: {
    id: actionId,
    schemaVersion: 1,
    createdAt: '2026-09-07T00:00:00.000Z',
    correlationId: 'corr',
    source: 'test',
    metadata: {},
    intent: 'route_change',
    expectedBenefit: 0.8,
    risk: 0.2,
    confidence: 0.9,
    requiredCapabilities: ['route.write'],
    dependencies: [],
    postconditions: ['route verified'],
    verificationRequirements: ['route postcondition'],
    rejectionReasons: [],
  },
  alternatives: [],
  rejectionReasons: [],
  expectedBenefit: 0.8,
  risk: 0.2,
  confidence: 0.9,
  policyResult: { allowed: true, reasons: [], requiredCapabilities: ['route.write'] },
  requiredCapabilities: ['route.write'],
  dependencies: [],
  expectedPostconditions: ['route verified'],
  verificationRequirements: ['route postcondition'],
});

const execution = (actionId: string): ActionExecution => ({
  id: `execution-${actionId}`,
  schemaVersion: 1,
  createdAt: '2026-09-07T00:00:00.000Z',
  correlationId: 'corr',
  source: 'test',
  metadata: {},
  status: 'success',
  simulated: true,
  actionId,
  beforeState: { route: 'old' },
  afterState: { route: 'new' },
});

describe('ActionTransactionEngine', () => {
  it('executes once and replays completed requests idempotently', async () => {
    let calls = 0;
    const executor: ActionExecutor = {
      execute: async (p) => {
        calls += 1;
        return execution(p.selectedAction.id);
      },
    };
    const events: string[] = [];
    const sink: EventSink = { emit: async (event) => { events.push(event); } };
    const engine = new ActionTransactionEngine(executor, sink);

    const first = await engine.execute(plan('a'), context(), 'key-a');
    const second = await engine.execute(plan('a'), context(), 'key-a');

    expect(first.status).toBe('success');
    expect(second.status).toBe('duplicate');
    expect(calls).toBe(1);
    expect(events).toEqual([
      'runtime.transaction.created',
      'runtime.transaction.executing',
      'runtime.transaction.committed',
      'runtime.transaction.duplicate',
    ]);
  });

  it('rejects reuse of an idempotency key for a different action', async () => {
    const executor: ActionExecutor = { execute: async (p) => execution(p.selectedAction.id) };
    const sink: EventSink = { emit: async () => undefined };
    const engine = new ActionTransactionEngine(executor, sink);

    await engine.execute(plan('a'), context(), 'shared-key');

    await expect(engine.execute(plan('b'), context(), 'shared-key')).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );
  });

  it('coalesces concurrent requests for the same key', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const executor: ActionExecutor = {
      execute: async (p) => {
        calls += 1;
        await gate;
        return execution(p.selectedAction.id);
      },
    };
    const sink: EventSink = { emit: async () => undefined };
    const engine = new ActionTransactionEngine(executor, sink);

    const first = engine.execute(plan('a'), context(), 'concurrent');
    const second = engine.execute(plan('a'), context(), 'concurrent');
    release();

    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe('success');
    expect(b.status).toBe('duplicate');
    expect(calls).toBe(1);
  });

  it('records failed executions without pretending they committed', async () => {
    const executor: ActionExecutor = {
      execute: async (p) => ({ ...execution(p.selectedAction.id), status: 'failed', error: 'adapter failed' }),
    };
    const sink: EventSink = { emit: async () => undefined };
    const engine = new ActionTransactionEngine(executor, sink);

    const result = await engine.execute(plan('a'), context(), 'failed-key');

    expect(result.status).toBe('failed');
    expect(engine.list()[0]?.status).toBe('failed');
  });
});
