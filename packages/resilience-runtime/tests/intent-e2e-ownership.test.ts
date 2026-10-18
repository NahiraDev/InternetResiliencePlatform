import { describe, expect, it, vi } from 'vitest';
import { createNetworkIntent } from '@irp/core';
import { compileNetworkIntent } from '../src/intent/compiler.js';
import { InMemoryIntentStore } from '../src/intent/arbitration.js';
import { resolveIntentGovernance } from '../src/intent/governance.js';
import { detectIntentDrift } from '../src/intent/drift.js';
import { BoundedClosedLoopController } from '../src/closed-loop.js';
import { createRuntimeContext } from '../src/context/context.js';
import type { ResilienceRuntime } from '../src/runtime.js';

const runtime = (status: 'success' | 'blocked' | 'failed'): ResilienceRuntime =>
  ({
    cycle: vi.fn(async () => ({
      status,
      decision: { outcome: status === 'success' ? 'apply' : status },
    })),
  }) as unknown as ResilienceRuntime;

const untrustedContext = createRuntimeContext({ mode: 'autonomous' });

const trustedLiveContext = createRuntimeContext({
  mode: 'live',
  securityContext: { trusted: true },
  capabilitySnapshot: {
    ...createRuntimeContext({ mode: 'live' }).capabilitySnapshot,
    trusted: true,
  },
});

describe('Intent ownership and stale handling end-to-end (Phases 79–83 / issue #13)', () => {
  it('persists compiled intent via InMemoryIntentStore, reloads, governs, and feeds observe-only drift into closed loop without mutation', async () => {
    const store = new InMemoryIntentStore();
    const draft = createNetworkIntent({
      id: 'intent-ownership-1',
      priority: 'high',
      autonomy: 'SAFE_AUTOMATION',
      spec: {
        outcome: 'Maintain stable low-latency access',
        target: { destination: 'example.com' },
        constraints: { 'objective.latency': 0.85 },
      },
    });
    const active = { ...draft, status: 'active' as const };
    const compiled = compileNetworkIntent(active);

    await store.put(compiled);
    const reloaded = await store.get(compiled.intentId);
    expect(reloaded).toEqual(compiled);
    expect(reloaded?.intentId).toBe('intent-ownership-1');

    const activeList = await store.getActive();
    expect(activeList).toHaveLength(1);

    const governance = resolveIntentGovernance(activeList, trustedLiveContext);
    expect(governance.admission).toBe('ALLOW');
    expect(governance.selectedIntent?.intentId).toBe('intent-ownership-1');
    expect(governance.mutationAllowed).toBe(true);

    const drift = detectIntentDrift(reloaded!, { latency: 0.2 });
    expect(drift.effective).toBe(true);
    expect(drift.recommendedAdmission).toBe('OBSERVE_ONLY');

    const fake = runtime('success');
    const controller = new BoundedClosedLoopController(fake);
    const loopResult = await controller.run({
      maxCycles: 1,
      correlationId: 'ownership-loop',
      driftInputs: {
        intent: reloaded!,
        observed: { latency: 0.2 },
      },
    });

    expect(loopResult.status).toBe('healthy');
    expect(loopResult.driftAssessments).toHaveLength(1);
    expect(loopResult.driftAssessments![0]!.recommendedAdmission).toBe('OBSERVE_ONLY');
    expect(loopResult.driftAssessments![0]!.intentId).toBe('intent-ownership-1');
    // Closed-loop controller and drift detector perform no privileged mutation of their own.
    expect(fake.cycle).toHaveBeenCalledTimes(1);
  });

  it('fail-closes on stale/expired compiled intent at store, governance and drift boundaries', async () => {
    const store = new InMemoryIntentStore();
    const compileAt = new Date(Date.now() - 60_000); // 1 min ago, while effective
    const draft = createNetworkIntent({
      id: 'intent-stale-1',
      priority: 'critical',
      spec: {
        outcome: 'Expired intent must not drive action',
        target: { destination: 'stale.example' },
      },
      effectiveFrom: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 30_000).toISOString(), // expired 30s ago
    });
    const active = { ...draft, status: 'active' as const };
    const compiled = compileNetworkIntent(active, compileAt);
    await store.put(compiled);

    const reloaded = await store.get(compiled.intentId);
    expect(reloaded).toBeDefined();

    const activeList = await store.getActive(); // now, after expiry
    expect(activeList).toHaveLength(0);

    const governance = resolveIntentGovernance([compiled], untrustedContext);
    expect(governance.admission).toBe('DENY');
    expect(governance.rejectedIntents.map((i) => i.intentId)).toContain('intent-stale-1');
    expect(governance.mutationAllowed).toBe(false);

    const drift = detectIntentDrift(compiled, { latency: 0.5 });
    expect(drift.effective).toBe(false);
    expect(drift.recommendedAdmission).toBe('DENY');
    expect(drift.reasons.some((r) => /effective lifecycle window/i.test(r))).toBe(true);

    const fake = runtime('success');
    const controller = new BoundedClosedLoopController(fake);
    const loopResult = await controller.run({
      maxCycles: 1,
      driftInputs: {
        intent: compiled,
        observed: { latency: 0.5 },
      },
    });

    expect(loopResult.driftAssessments).toHaveLength(1);
    expect(loopResult.driftAssessments![0]!.recommendedAdmission).toBe('DENY');
    expect(loopResult.driftAssessments![0]!.effective).toBe(false);
    // Drift remains observe-only; no additional mutation beyond the bounded runtime cycle.
    expect(fake.cycle).toHaveBeenCalledTimes(1);
  });
});
