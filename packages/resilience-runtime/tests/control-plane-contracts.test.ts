import { describe, expect, it } from 'vitest';
import type {
  ActionExecution,
  ActionPlan,
  ActionVerification,
  ObservationBatch,
  PolicyEvaluation,
} from '../src/domain/types.js';
import type { NetworkStateSnapshot } from '../src/state/network-state.js';
import {
  CONTROL_PLANE_CONTRACT_VERSION,
  type ActionExecutionEvent,
  type AssuranceVerificationEvent,
  type ControlPlaneEventUnion,
  type ControlPlaneContractBoundary,
  type IntelligenceObservationEvent,
  type PolicyEvaluationEvent,
} from '../src/contracts/control-plane.js';

describe('control-plane contracts', () => {
  it('exposes a versioned boundary for each control-plane domain', () => {
    const domains: ControlPlaneContractBoundary[] = [
      { domain: 'intelligence', contractVersion: CONTROL_PLANE_CONTRACT_VERSION },
      { domain: 'policy', contractVersion: CONTROL_PLANE_CONTRACT_VERSION },
      { domain: 'execution', contractVersion: CONTROL_PLANE_CONTRACT_VERSION },
      { domain: 'assurance', contractVersion: CONTROL_PLANE_CONTRACT_VERSION },
    ];

    expect(domains).toHaveLength(4);
    expect(new Set(domains.map((domain) => domain.contractVersion))).toEqual(
      new Set([CONTROL_PLANE_CONTRACT_VERSION]),
    );
  });

  it('models every control-plane event with the canonical version and context', () => {
    const base = {
      id: 'event-1',
      aggregateId: 'runtime-1',
      occurredAt: new Date('2026-09-04T00:00:00.000Z'),
      contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
      correlationId: 'correlation-1',
      causationId: 'cause-1',
    };

    const events: ControlPlaneEventUnion[] = [
      {
        ...base,
        type: 'control-plane.intelligence.observation-reported',
        producer: 'intelligence',
        payload: {
          observation: {} as ObservationBatch,
          state: {} as NetworkStateSnapshot,
        },
      } satisfies IntelligenceObservationEvent,
      {
        ...base,
        type: 'control-plane.policy.evaluation-completed',
        producer: 'policy',
        payload: {
          plan: {} as ActionPlan,
          evaluation: {} as PolicyEvaluation,
        },
      } satisfies PolicyEvaluationEvent,
      {
        ...base,
        type: 'control-plane.execution.action-completed',
        producer: 'execution',
        payload: {
          plan: {} as ActionPlan,
          execution: {} as ActionExecution,
        },
      } satisfies ActionExecutionEvent,
      {
        ...base,
        type: 'control-plane.assurance.verification-completed',
        producer: 'assurance',
        payload: {
          plan: {} as ActionPlan,
          execution: {} as ActionExecution,
          verification: {} as ActionVerification,
        },
      } satisfies AssuranceVerificationEvent,
    ];

    expect(events).toHaveLength(4);
    expect(events.map((event) => event.type)).toEqual([
      'control-plane.intelligence.observation-reported',
      'control-plane.policy.evaluation-completed',
      'control-plane.execution.action-completed',
      'control-plane.assurance.verification-completed',
    ]);
    expect(new Set(events.map((event) => event.contractVersion))).toEqual(
      new Set([CONTROL_PLANE_CONTRACT_VERSION]),
    );
    expect(new Set(events.map((event) => event.producer))).toEqual(
      new Set(['intelligence', 'policy', 'execution', 'assurance']),
    );
    expect(events.every((event) => event.correlationId === 'correlation-1')).toBe(true);
    expect(events.every((event) => event.causationId === 'cause-1')).toBe(true);
  });
});
