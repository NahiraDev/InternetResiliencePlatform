import { describe, expect, it } from 'vitest';
import type { CandidateAction, RuntimeContext } from '../src/domain/types.js';
import { DecisionOrchestrator } from '../src/decision-orchestration.js';
import type { DecisionProvider } from '../src/ports/ports.js';

const candidate = (
  id: string,
  overrides: Partial<CandidateAction> = {},
): CandidateAction => ({
  id,
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
  ...overrides,
});

const context = (overrides: Partial<RuntimeContext['policySnapshot']['policy']> = {}): RuntimeContext => ({
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
      allowedActions: ['route_change', 'dns_switch'],
      deniedActions: [],
      capabilityRequirements: {},
      securityConstraints: [],
      actionBudget: 10,
      maxConcurrentActions: 1,
      confidenceThreshold: 0.65,
      telemetryFreshnessMs: 60_000,
      simulationOnly: true,
      failClosed: true,
      ...overrides,
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

const provider = (candidates: readonly CandidateAction[]): DecisionProvider => ({
  decide: async () => candidates,
});

describe('DecisionOrchestrator', () => {
  it('composes policy, capability and security constraints without mutation', async () => {
    const selected = candidate('a', { confidence: 0.95 });
    const denied = candidate('b', { id: 'b', intent: 'dns_switch' });
    const insufficientCapability = candidate('c', {
      id: 'c',
      requiredCapabilities: ['tunnel.write'],
      confidence: 0.99,
    });

    const result = await new DecisionOrchestrator(
      provider([selected, denied, insufficientCapability]),
    ).orchestrate([], context({ deniedActions: ['dns_switch'] }));

    expect(result.selectedCandidate?.id).toBe('a');
    expect(result.candidates.map((item) => item.id)).toEqual(['a']);
    expect(result.blockedCandidates.map((item) => item.id)).toEqual(['b', 'c']);
    expect(denied.rejectionReasons).toEqual([]);
  });

  it('uses deterministic ordering for equal-quality candidates', async () => {
    const first = candidate('z', { confidence: 0.9, expectedBenefit: 0.8, risk: 0.2 });
    const second = candidate('a', { confidence: 0.9, expectedBenefit: 0.8, risk: 0.2 });

    const result = await new DecisionOrchestrator(provider([first, second])).orchestrate([], context());

    expect(result.candidates.map((item) => item.id)).toEqual(['a', 'z']);
    expect(result.selectedCandidate?.id).toBe('a');
  });

  it('fails closed when the runtime is not trusted', async () => {
    const trustedCandidate = candidate('a');
    const runtimeContext = context();
    const untrusted: RuntimeContext = {
      ...runtimeContext,
      capabilitySnapshot: { ...runtimeContext.capabilitySnapshot, trusted: false },
    };

    const result = await new DecisionOrchestrator(provider([trustedCandidate])).orchestrate([], untrusted);

    expect(result.selectedCandidate).toBeNull();
    expect(result.candidates).toHaveLength(0);
    expect(result.blockedCandidates).toHaveLength(1);
  });
});
