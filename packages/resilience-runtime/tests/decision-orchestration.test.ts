import { describe, expect, it } from 'vitest';
import type { CandidateAction, RuntimeContext } from '../src/domain/types.js';
import { DecisionOrchestrator } from '../src/decision-orchestration.js';
import type { DecisionProvider } from '../src/ports/ports.js';

const candidate = (id: string, overrides: Partial<CandidateAction> = {}): CandidateAction => ({
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

const context = (
  overrides: Partial<RuntimeContext['policySnapshot']['policy']> = {},
): RuntimeContext => ({
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
  it('defers policy, capability and security evaluation to the canonical planner gate', async () => {
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

    expect(result.selectedCandidate?.id).toBe('c');
    expect(result.candidates.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(result.blockedCandidates).toHaveLength(0);
    expect(denied.rejectionReasons).toEqual([]);
  });

  it('uses deterministic ordering for equal-quality candidates', async () => {
    const first = candidate('z', { confidence: 0.9, expectedBenefit: 0.8, risk: 0.2 });
    const second = candidate('a', { confidence: 0.9, expectedBenefit: 0.8, risk: 0.2 });

    const result = await new DecisionOrchestrator(provider([first, second])).orchestrate(
      [],
      context(),
    );

    expect(result.candidates.map((item) => item.id)).toEqual(['a', 'z']);
    expect(result.selectedCandidate?.id).toBe('a');
  });

  it('does not present an intent-governance-rejected candidate as selected', async () => {
    const result = await new DecisionOrchestrator(
      provider([candidate('high-risk', { risk: 0.9 })]),
    ).orchestrate(
      [],
      {
        ...context(),
        compiledIntent: {
          intentId: 'safe-intent',
          version: 1,
          priority: 'high',
          desiredOutcome: 'maintain connectivity',
          target: {},
          constraints: {},
          objectives: {
            reachability: 1,
            latency: 0,
            jitter: 0,
            packetLoss: 0,
            throughput: 0,
            reliability: 0,
            privacy: 0,
            trust: 0,
            cost: 0,
            diversity: 0,
          },
          confidence: 1,
          provenance: 'test',
          autonomy: 'SAFE_AUTOMATION',
          scope: { intentId: 'safe-intent' },
          compiledAt: '2026-09-07T00:00:00.000Z',
        },
      },
    );

    expect(result.selectedCandidate).toBeNull();
    expect(result.blockedCandidates).toHaveLength(1);
    expect(result.blockedCandidates[0]?.rejectionReasons).toContain(
      'candidate risk 0.9 exceeds intent risk budget 0.5',
    );
  });

  it('retains untrusted candidates for canonical policy evaluation', async () => {
    const trustedCandidate = candidate('a');
    const runtimeContext = context();
    const untrusted: RuntimeContext = {
      ...runtimeContext,
      capabilitySnapshot: { ...runtimeContext.capabilitySnapshot, trusted: false },
    };

    const result = await new DecisionOrchestrator(provider([trustedCandidate])).orchestrate(
      [],
      untrusted,
    );

    expect(result.selectedCandidate?.id).toBe('a');
    expect(result.candidates).toHaveLength(1);
    expect(result.blockedCandidates).toHaveLength(0);
  });
});
