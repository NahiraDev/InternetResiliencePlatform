import { describe, expect, it } from 'vitest';
import { compileNetworkIntent } from '../src/intent/compiler.js';
import { arbitrateIntents, resolveIntentGovernance } from '../src/intent/governance.js';
import { createRuntimeContext } from '../src/context/context.js';
import { createNetworkIntent, type IntentAutonomyLevel } from '@irp/core';

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
});
