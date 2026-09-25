import { describe, expect, it } from 'vitest';
import { compileNetworkIntent } from '../src/intent/compiler.js';
import { arbitrateIntents, resolveIntentGovernance } from '../src/intent/governance.js';
import { createRuntimeContext } from '../src/context/context.js';
import { createNetworkIntent, type IntentAutonomyLevel } from '@irp/core';
import { DecisionOrchestrator } from '../src/decision-orchestration.js';
import type { CandidateAction, Incident } from '../src/domain/types.js';

const intent = (
  id: string,
  priority: 'low' | 'normal' | 'high' | 'critical',
  autonomy: IntentAutonomyLevel = 'SAFE_AUTOMATION',
) =>
  compileNetworkIntent({
    ...createNetworkIntent({
      id,
      priority,
      spec: { outcome: 'reach destination', target: { destination: 'github.com' } },
      confidence: 0.9,
      autonomy,
    }),
    status: 'active' as const,
  });

const candidate = (intent: CandidateAction['intent'] = 'route_change'): CandidateAction => ({
  id: 'candidate-1',
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  correlationId: 'test',
  source: 'test',
  metadata: {},
  intent,
  expectedBenefit: 0.8,
  risk: 0.2,
  confidence: 0.9,
  requiredCapabilities: [],
  dependencies: [],
  postconditions: [],
  verificationRequirements: [],
  rejectionReasons: [],
});


const trustedSimulationContext = (compiledIntent: ReturnType<typeof intent>, compiledIntents?: ReturnType<typeof intent>[]) => {
  const base = createRuntimeContext({
    mode: 'simulation',
    securityContext: { trusted: true },
    capabilitySnapshot: {
      ...createRuntimeContext({ mode: 'simulation' }).capabilitySnapshot,
      trusted: true,
    },
  });

  return createRuntimeContext({
    ...base,
    policySnapshot: {
      ...base.policySnapshot,
      policy: {
        ...base.policySnapshot.policy,
        allowedActions: ['route_change'],
        simulationOnly: true,
      },
    },
    compiledIntent,
    ...(compiledIntents ? { compiledIntents } : {}),
  });
};

describe('intent governance', () => {
  it('arbitrates overlapping intents deterministically by priority', () => {
    const selected = arbitrateIntents([intent('low', 'normal'), intent('high', 'critical')]);
    expect(selected.selectedIntent?.intentId).toBe('high');
    expect(selected.rejectedIntents.map((i) => i.intentId)).toEqual(['low']);
  });

  it('requires approval for advisory autonomy', () => {
    const context = createRuntimeContext({
      mode: 'live',
      securityContext: { trusted: true },
      capabilitySnapshot: {
        ...createRuntimeContext({ mode: 'live' }).capabilitySnapshot,
        trusted: true,
      },
    });
    const decision = resolveIntentGovernance([intent('advisory', 'high', 'ADVISORY')], context);
    expect(decision.admission).toBe('REQUIRE_APPROVAL');
    expect(decision.mutationAllowed).toBe(false);
  });

  it('propagates the arbitrated winner to candidate generation', async () => {
    let generatedFor: string | undefined;
    const provider = {
      async decide(
        _incidents: readonly Incident[],
        context: ReturnType<typeof createRuntimeContext>,
      ) {
        generatedFor = context.compiledIntent?.intentId;
        return [candidate()];
      },
    };
    const context = trustedSimulationContext(
      intent('low', 'normal'),
      [intent('low', 'normal'), intent('high', 'critical')],
    );
    const result = await new DecisionOrchestrator(provider).orchestrate([], context);
    expect(generatedFor).toBe('high');
    expect(result.selectedCandidate?.intent).toBe('route_change');
  });

  it('preserves plan-only candidates in simulation mode', async () => {
    const provider = {
      async decide() {
        return [candidate()];
      },
    };
    const context = trustedSimulationContext(intent('advisory', 'high', 'ADVISORY'));
    const result = await new DecisionOrchestrator(provider).orchestrate([], context);
    expect(result.governance.admission).toBe('REQUIRE_APPROVAL');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.rejectionReasons).toEqual([]);
  });

  it('bounds safe automation risk and denies untrusted live mutation', () => {
    const trusted = createRuntimeContext({
      mode: 'live',
      securityContext: { trusted: true },
      capabilitySnapshot: {
        ...createRuntimeContext({ mode: 'live' }).capabilitySnapshot,
        trusted: true,
      },
    });
    const safe = resolveIntentGovernance([intent('safe', 'high')], trusted);
    expect(safe.admission).toBe('ALLOW');
    expect(safe.maxRisk).toBe(0.5);

    const untrusted = createRuntimeContext({ mode: 'live' });
    const denied = resolveIntentGovernance([intent('unsafe', 'high')], untrusted);
    expect(denied.admission).toBe('DENY');
    expect(denied.mutationAllowed).toBe(false);
  });

  it('rejects stale compiled intents at the governance boundary', () => {
    const compiled = {
      ...intent('expired', 'critical'),
      expiresAt: '2020-01-01T00:00:00.000Z',
    };
    const decision = resolveIntentGovernance([compiled], trustedSimulationContext(compiled));

    expect(decision.admission).toBe('DENY');
    expect(decision.mutationAllowed).toBe(false);
    expect(decision.rejectedIntents.map((item) => item.intentId)).toEqual(['expired']);
    expect(decision.reasons).toContain(
      'all supplied compiled intents are outside their effective lifecycle window',
    );
  });
});
