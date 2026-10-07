import { describe, expect, it } from 'vitest';
import {
  DeterministicPlanner,
  rankCandidates,
  noopCandidate,
} from '../src/planning/planner.js';
import { createRuntimeContext } from '../src/context/context.js';
import type { CandidateAction } from '../src/domain/types.js';

const candidate = (over: Partial<CandidateAction> = {}): CandidateAction => ({
  id: 'c',
  schemaVersion: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  correlationId: 'c',
  source: 'test',
  metadata: {},
  intent: 'route_change',
  expectedBenefit: 0.8,
  risk: 0.2,
  confidence: 0.9,
  requiredCapabilities: ['route.write'],
  dependencies: [],
  postconditions: ['route ok'],
  verificationRequirements: [],
  rejectionReasons: [],
  ...over,
});

const trusted = () =>
  createRuntimeContext({
    securityContext: { trusted: true },
    capabilitySnapshot: {
      id: 'caps',
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'test',
      metadata: {},
      capabilities: ['route.write', 'dns.write'],
      trusted: true,
    },
    policySnapshot: {
      id: 'policy',
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'test',
      metadata: {},
      policy: {
        allowedActions: ['route_change', 'dns_switch', 'noop'],
        deniedActions: [],
        capabilityRequirements: {},
        securityConstraints: [],
        actionBudget: 2,
        maxConcurrentActions: 1,
        confidenceThreshold: 0,
        telemetryFreshnessMs: 60_000,
        simulationOnly: false,
        failClosed: false,
      },
    },
  });

describe('ranking determinism (issue #277 re-verification)', () => {
  it('produces an order independent of input order', async () => {
    const a = candidate({ id: 'a', intent: 'route_change' });
    const b = candidate({ id: 'b', intent: 'dns_switch', expectedBenefit: 0.5 });
    const c = candidate({ id: 'c', intent: 'route_change', expectedBenefit: 0.5, risk: 0.5 });

    const planner = new DeterministicPlanner();
    const context = trusted();
    const forward = await planner.plan([a, b, c], context);
    const reversed = await planner.plan([c, b, a], context);
    const shuffled = await planner.plan([b, a, c], context);

    expect(forward.selectedAction.id).toBe(reversed.selectedAction.id);
    expect(forward.selectedAction.id).toBe(shuffled.selectedAction.id);
  });

  it('ranks identically regardless of how many ids were minted earlier in the process', () => {
    const pair = [
      candidate({ id: 'a', intent: 'route_change' }),
      candidate({ id: 'b', intent: 'route_change' }),
    ];
    const first = rankCandidates(pair, trusted(), { objectives: {
        reachability: 1,
        latency: 0,
        jitter: 0,
        packetLoss: 0,
        throughput: 0,
        reliability: 0,
        privacy: 0,
        trust: 0,
        security: 0,
        cost: 0,
        resourceUsage: 0,
        diversity: 0,
        recoveryProbability: 0,
        stability: 0,
      } }).map((entry) => entry.candidate.id);

    // Mintering unrelated ids must not change the ordering.
    noopCandidate(trusted());
    noopCandidate(trusted());

    const second = rankCandidates(pair, trusted(), { objectives: {
        reachability: 1,
        latency: 0,
        jitter: 0,
        packetLoss: 0,
        throughput: 0,
        reliability: 0,
        privacy: 0,
        trust: 0,
        security: 0,
        cost: 0,
        resourceUsage: 0,
        diversity: 0,
        recoveryProbability: 0,
        stability: 0,
      } }).map((entry) => entry.candidate.id);

    expect(second).toEqual(first);
  });

  it('gives the noop fallback a deterministic id', () => {
    const context = trusted();
    expect(noopCandidate(context).id).toBe(noopCandidate(context).id);
    expect(noopCandidate(createRuntimeContext({ correlationId: 'other' })).id).not.toBe(
      noopCandidate(context).id,
    );
  });

  it('exposes one ranking authority', async () => {
    const planner = new DeterministicPlanner();
    const context = trusted();
    const candidates = [
      candidate({ id: 'a', intent: 'route_change' }),
      candidate({ id: 'b', intent: 'dns_switch', expectedBenefit: 0.4 }),
    ];
    // `plan` is a thin wrapper over the objective-based ranking, so both entry
    // points agree.
    const viaPlan = await planner.plan(candidates, context);
    const { plan: viaObjectives } = await planner.planAgainstObjectives(candidates, context);
    expect(viaPlan.selectedAction.id).toBe(viaObjectives.selectedAction.id);
  });

  it('fails closed by reporting the denied candidate when nothing is eligible', async () => {
    const planner = new DeterministicPlanner();
    // Policy allows nothing this candidate needs.
    const context = createRuntimeContext({
      securityContext: { trusted: true },
      capabilitySnapshot: {
        id: 'caps',
        schemaVersion: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        source: 'test',
        metadata: {},
        capabilities: [],
        trusted: true,
      },
      policySnapshot: {
        id: 'policy',
        schemaVersion: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        source: 'test',
        metadata: {},
        policy: {
          allowedActions: ['route_change'],
          deniedActions: [],
          capabilityRequirements: {},
          securityConstraints: [],
          actionBudget: 1,
          maxConcurrentActions: 1,
          confidenceThreshold: 0,
          telemetryFreshnessMs: 60_000,
          simulationOnly: false,
          failClosed: false,
        },
      },
    });

    const plan = await planner.plan(
      [candidate({ id: 'denied', requiredCapabilities: ['route.write'] })],
      context,
    );
    // The denial must stay visible rather than silently degrading to noop.
    expect(plan.policyResult.allowed).toBe(false);
    expect(plan.selectedAction.id).toBe('denied');
    expect(plan.rejectionReasons.length).toBeGreaterThan(0);
  });
});