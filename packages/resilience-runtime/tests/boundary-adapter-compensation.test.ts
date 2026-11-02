/**
 * Regression tests for the live mutation chain's compensation and adapter selection.
 *
 * Found by the Linux network-namespace end-to-end test (packages/linux-client/src/
 * linux-chain.e2e.test.ts) and kept here so they run on every host, privileged or not:
 *
 * 1. `createDefaultRuntimeAdapterRegistry` registered deterministic placeholders
 *    (`supportsLive: false`) before the canonical network adapter, so `findForAction` always
 *    returned the placeholder and every live route action was rejected at validation.
 * 2. The privileged boundary's `compensate` only called the safety kernel's checkpoint rollback,
 *    which no composition configures, so it reported `rollback-failed` without ever asking the
 *    mutation's own adapter to undo it, and the transaction then reported itself recovered while
 *    the mutation was still applied.
 * 3. `verifyRollback` re-ran the post-mutation verification, which cannot confirm a rollback of a
 *    mutation that failed verification.
 */
import { describe, expect, it } from 'vitest';
import {
  CanonicalNetworkRuntimeAdapter,
  CoordinatedActionExecutor,
  InMemoryEventSink,
  RuntimeActionValidator,
  RuntimeAdapterRegistry,
  createAdapterExecution,
  createAdapterVerification,
  createCapabilitySnapshot,
  createDefaultRuntimeAdapterRegistry,
  createPolicySnapshot,
  createRuntimeContext,
  defaultPolicy,
  type ActionExecution,
  type ActionPlan,
  type ActionVerification,
  type RuntimeAdapter,
  type RuntimeContext,
} from '../src/index.js';
import { SafetyRollbackRecoveryKernel } from '../src/safety/safety-kernel.js';
import { createPrivilegedMutationBoundary } from '../src/transactions/privileged-boundary.js';
import { ConnectivityManager } from '@irp/connectivity';
import { RoutingEngine } from '@irp/routing';

describe('adapter selection for live actions', () => {
  const controlPlane = { connectivity: new ConnectivityManager(), routing: new RoutingEngine() };

  it.each([
    ['route_change', ['route.write']],
    ['connectivity_failover', ['connectivity.failover']],
  ] as const)('prefers the live-capable canonical adapter for %s', (action, capabilities) => {
    const adapter = createDefaultRuntimeAdapterRegistry(controlPlane).findForAction(action, capabilities);
    expect(adapter?.descriptor.adapterId).toBe('canonical-network-control-plane');
    expect(adapter?.descriptor.supportsLive).toBe(true);
  });

  it('keeps the non-live placeholders when no control plane is composed', () => {
    const adapter = createDefaultRuntimeAdapterRegistry().findForAction('route_change', ['route.write']);
    expect(adapter?.descriptor.adapterId).toBe('routing');
    expect(adapter?.descriptor.supportsLive).toBe(false);
  });

  it('exposes the canonical adapter as the only one that can prove a route rollback', () => {
    expect(typeof new CanonicalNetworkRuntimeAdapter(controlPlane).verifyRollback).toBe('function');
  });
});

describe('privileged boundary compensation', () => {
  const liveContext = (): RuntimeContext =>
    createRuntimeContext({
      mode: 'live',
      securityContext: { trusted: true, principal: 'test' },
      capabilitySnapshot: createCapabilitySnapshot(['route.write'], true),
      policySnapshot: createPolicySnapshot({
        ...defaultPolicy('live'),
        allowedActions: ['route_change'],
        simulationOnly: false,
      }),
    });

  const routePlan = (): ActionPlan =>
    ({
      id: 'plan-route',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      correlationId: 'corr',
      source: 'test',
      metadata: {},
      selectedAction: {
        id: 'act-route',
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        correlationId: 'corr',
        source: 'test',
        metadata: {},
        intent: 'route_change',
        expectedBenefit: 0.9,
        risk: 0.1,
        confidence: 0.9,
        requiredCapabilities: ['route.write'],
        dependencies: ['route_change'],
        postconditions: ['route_change verified'],
        verificationRequirements: ['destination outcome'],
        rejectionReasons: [],
      },
      alternatives: [],
      rejectionReasons: [],
      expectedBenefit: 0.9,
      risk: 0.1,
      confidence: 0.9,
      policyResult: { allowed: true, reasons: [], requiredCapabilities: ['route.write'] },
      requiredCapabilities: ['route.write'],
      dependencies: ['route_change'],
      expectedPostconditions: ['route_change verified'],
      verificationRequirements: ['destination outcome'],
    }) as ActionPlan;

  interface Script {
    rollback?: ActionExecution['status'] | 'throw' | 'absent';
    rollbackProof?: ActionVerification['status'] | 'absent';
    recoverStatus?: 'success' | 'failed';
  }

  /** An adapter whose mutation applies, whose destination verification fails, and whose rollback is scripted. */
  const build = (script: Script) => {
    const calls: string[] = [];
    const adapter: RuntimeAdapter = {
      descriptor: {
        adapterId: 'scripted-live-routing',
        subsystem: 'routing',
        version: '1',
        capabilities: ['route.write'],
        supportedActions: ['route_change'],
        supportsSimulation: true,
        supportsSafe: true,
        supportsLive: true,
        requiredPermissions: [],
        requiredKernelCapabilities: [],
        verificationSupport: true,
        recoverySupport: script.rollback !== 'absent',
      },
      execute: async (plan, context) => {
        calls.push('execute');
        return createAdapterExecution(plan, context, false, 'success');
      },
      // The destination does not verify, so the transaction has to be compensated.
      verify: async (plan, _execution, context) => {
        calls.push('verify');
        return createAdapterVerification(plan, context, 'failed');
      },
      ...(script.rollback !== 'absent'
        ? {
            rollback: async (plan, context) => {
              calls.push('rollback');
              if (script.rollback === 'throw') throw new Error('ip route del failed');
              return createAdapterExecution(plan, context, false, script.rollback ?? 'success');
            },
          }
        : {}),
      ...(script.rollbackProof !== undefined && script.rollbackProof !== 'absent'
        ? {
            verifyRollback: async (plan: ActionPlan, context: RuntimeContext) => {
              calls.push('verifyRollback');
              return createAdapterVerification(plan, context, script.rollbackProof as ActionVerification['status']);
            },
          }
        : {}),
    };
    const adapters = new RuntimeAdapterRegistry();
    adapters.register(adapter);
    const events = new InMemoryEventSink();
    const safetyKernel = new SafetyRollbackRecoveryKernel(events, {
      recover: async (plan, reason, context) => {
        calls.push('recover');
        return {
          id: 'rec',
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          correlationId: context.correlationId,
          source: 'test',
          metadata: {},
          delegatedTo: 'failover' as const,
          status: script.recoverStatus ?? 'failed',
          reason: `${reason} (${plan.id})`,
        };
      },
    });
    const boundary = createPrivilegedMutationBoundary({
      executor: new CoordinatedActionExecutor(adapters),
      events,
      safetyKernel,
      validator: new RuntimeActionValidator(undefined, adapters),
      adapters,
    });
    return { boundary, calls, events };
  };

  const mutate = (boundary: ReturnType<typeof build>['boundary']) =>
    boundary.mutate({
      plan: routePlan(),
      context: liveContext(),
      actor: { actorId: 'rt', boundary: 'canonical-runtime', grantedCapabilities: ['route.write'], verified: true },
      mutationId: 'mut',
      idempotencyKey: `idem-${Math.random()}`,
      resourceId: 'route_change',
    });

  it('asks the mutation\'s own adapter to undo it when no checkpoint rollback is configured', async () => {
    const { boundary, calls, events } = build({ rollback: 'success', rollbackProof: 'success' });
    const outcome = await mutate(boundary);
    expect(calls).toEqual(['execute', 'verify', 'rollback', 'verifyRollback']);
    expect(outcome.status).toBe('recovered');
    expect(outcome.phaseReached).toBe('verifyRollback');
    expect(events.events.map((e) => e.event)).toContain('runtime.mutation.rolledback');
    // A clean, proven rollback needs no last-resort recovery.
    expect(calls).not.toContain('recover');
  });

  it('proves the rollback with the adapter rather than by re-running the post-mutation check', async () => {
    const { boundary, calls } = build({ rollback: 'success', rollbackProof: 'success' });
    await mutate(boundary);
    // `verify` ran exactly once (the failed post-mutation check); the rollback was proven separately.
    expect(calls.filter((c) => c === 'verify')).toHaveLength(1);
    expect(calls).toContain('verifyRollback');
  });

  it('does not announce a rollback the adapter could not prove', async () => {
    const { boundary, calls, events } = build({ rollback: 'success', rollbackProof: 'failed' });
    const outcome = await mutate(boundary);
    expect(calls).toContain('recover');
    expect(events.events.map((e) => e.event)).not.toContain('runtime.mutation.rolledback');
    expect(outcome.status).toBe('failed');
  });

  it('does not treat a failed adapter rollback as compensation', async () => {
    const { boundary, calls, events } = build({ rollback: 'failed', rollbackProof: 'failed' });
    const outcome = await mutate(boundary);
    expect(calls).toContain('recover');
    const names = events.events.map((e) => e.event);
    expect(names).toContain('runtime.safety.rollback.failed');
    expect(names).not.toContain('runtime.mutation.rolledback');
    expect(outcome.status).toBe('failed');
  });

  it('reports a throwing adapter rollback as a compensation failure instead of crashing', async () => {
    const { boundary, calls } = build({ rollback: 'throw' });
    const outcome = await mutate(boundary);
    expect(calls).toContain('recover');
    expect(outcome.reasons.join(' ')).toMatch(/adapter-rollback-threw:ip route del failed/);
  });

  it('reports rollback-failed without inventing success when the adapter cannot roll back at all', async () => {
    const { boundary, events } = build({ rollback: 'absent' });
    const outcome = await mutate(boundary);
    expect(outcome.reasons).toContain('rollback-failed');
    expect(events.events.map((e) => e.event)).not.toContain('runtime.mutation.rolledback');
  });
});
