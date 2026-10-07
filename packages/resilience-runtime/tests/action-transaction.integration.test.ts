import { describe, expect, it } from 'vitest';
import {
  ActionTransactionEngine,
  IdempotencyConflictError,
} from '../src/transactions/action-transaction.js';
import { RuntimeAdapterRegistry, DeterministicRuntimeAdapter } from '../src/adapter-registry.js';
import { CoordinatedActionExecutor } from '../src/execution/execution.js';
import type { ActionPlan, RuntimeContext } from '../src/domain/types.js';
import type { EventSink } from '../src/ports/ports.js';

const runtimeContext = (): RuntimeContext => ({
  runtimeId: 'integration-runtime',
  correlationId: 'transaction-integration',
  mode: 'live',
  policySnapshot: {
    id: 'integration-policy',
    schemaVersion: 1,
    createdAt: '2026-09-08T00:00:00.000Z',
    source: 'integration-test',
    metadata: {},
    policy: {
      allowedActions: ['route_change'],
      deniedActions: [],
      capabilityRequirements: {},
      securityConstraints: [],
      actionBudget: 2,
      maxConcurrentActions: 2,
      confidenceThreshold: 0.5,
      telemetryFreshnessMs: 60_000,
      simulationOnly: false,
      failClosed: true,
    },
  },
  capabilitySnapshot: {
    id: 'integration-capabilities',
    schemaVersion: 1,
    createdAt: '2026-09-08T00:00:00.000Z',
    source: 'integration-test',
    metadata: {},
    capabilities: ['route.write'],
    trusted: true,
  },
  deadline: '2026-09-08T00:01:00.000Z',
  cancelled: false,
  securityContext: { trusted: true },
  configuration: {
    enabled: true,
    mode: 'live',
    cycleIntervalMs: 30_000,
    maxActionsPerCycle: 2,
    maxConcurrentActions: 2,
    observationFreshnessMs: 60_000,
    decisionTimeoutMs: 500,
    verificationTimeoutMs: 500,
    recoveryTimeoutMs: 500,
    persistenceMode: 'memory',
    replayEnabled: true,
  },
});

const actionPlan: ActionPlan = {
  id: 'integration-plan',
  schemaVersion: 1,
  createdAt: '2026-09-08T00:00:00.000Z',
  correlationId: 'transaction-integration',
  source: 'integration-test',
  metadata: {},
  selectedAction: {
    id: 'integration-route-change',
    schemaVersion: 1,
    createdAt: '2026-09-08T00:00:00.000Z',
    correlationId: 'transaction-integration',
    source: 'integration-test',
    metadata: {},
    intent: 'route_change',
    expectedBenefit: 0.9,
    risk: 0.1,
    confidence: 0.95,
    requiredCapabilities: ['route.write'],
    dependencies: [],
    postconditions: ['route_change verified'],
    verificationRequirements: ['route_change verification'],
    rejectionReasons: [],
  },
  alternatives: [],
  rejectionReasons: [],
  expectedBenefit: 0.9,
  risk: 0.1,
  confidence: 0.95,
  policyResult: { allowed: true, reasons: [], requiredCapabilities: ['route.write'] },
  requiredCapabilities: ['route.write'],
  dependencies: [],
  expectedPostconditions: ['route_change verified'],
  verificationRequirements: ['route_change verification'],
};

const sink: EventSink = {
  emit: async () => undefined,
};

describe('ActionTransactionEngine integration', () => {
  it('executes through the real coordinated executor and coalesces concurrent requests', async () => {
    const adapters = new RuntimeAdapterRegistry();
    adapters.register(
      new DeterministicRuntimeAdapter({
        adapterId: 'integration-routing-adapter',
        subsystem: 'routing',
        version: '1.0.0',
        capabilities: ['route.write'],
        supportedActions: ['route_change'],
        supportsSimulation: true,
        supportsSafe: true,
        supportsLive: true,
        requiredPermissions: [],
        requiredKernelCapabilities: [],
        verificationSupport: true,
        recoverySupport: false,
      }),
    );

    const engine = new ActionTransactionEngine(new CoordinatedActionExecutor(adapters), sink);
    const context = runtimeContext();

    const first = engine.execute(actionPlan, context, 'integration-concurrent-key');
    const second = engine.execute(actionPlan, context, 'integration-concurrent-key');
    const [a, b] = await Promise.all([first, second]);

    expect(a.status).toBe('success');
    expect(a.simulated).toBe(false);
    expect(b.status).toBe('duplicate');
    expect(b.simulated).toBe(false);
    expect(engine.list()).toHaveLength(1);
  });

  it('rejects a different action using the completed integration key', async () => {
    const adapters = new RuntimeAdapterRegistry();
    adapters.register(
      new DeterministicRuntimeAdapter({
        adapterId: 'integration-routing-adapter',
        subsystem: 'routing',
        version: '1.0.0',
        capabilities: ['route.write'],
        supportedActions: ['route_change'],
        supportsSimulation: true,
        supportsSafe: true,
        supportsLive: true,
        requiredPermissions: [],
        requiredKernelCapabilities: [],
        verificationSupport: true,
        recoverySupport: false,
      }),
    );

    const engine = new ActionTransactionEngine(new CoordinatedActionExecutor(adapters), sink);
    await engine.execute(actionPlan, runtimeContext(), 'integration-conflict-key');

    const conflictingPlan: ActionPlan = {
      ...actionPlan,
      id: 'integration-conflict-plan',
      selectedAction: {
        ...actionPlan.selectedAction,
        id: 'integration-different-action',
      },
    };

    await expect(
      engine.execute(conflictingPlan, runtimeContext(), 'integration-conflict-key'),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});
