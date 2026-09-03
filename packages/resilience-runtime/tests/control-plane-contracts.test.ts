import { describe, expect, it } from 'vitest';
import type { ObservationBatch } from '../src/domain/types.js';
import type { NetworkStateSnapshot } from '../src/state/network-state.js';
import {
  CONTROL_PLANE_CONTRACT_VERSION,
  type ControlPlaneContractBoundary,
  type IntelligenceObservationEvent,
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

  it('models a typed intelligence event with correlation and causation context', () => {
    const event: IntelligenceObservationEvent = {
      id: 'event-1',
      type: 'control-plane.intelligence.observation-reported',
      aggregateId: 'runtime-1',
      occurredAt: new Date('2026-09-04T00:00:00.000Z'),
      contractVersion: CONTROL_PLANE_CONTRACT_VERSION,
      correlationId: 'correlation-1',
      causationId: 'cause-1',
      producer: 'intelligence',
      payload: {
        observation: {} as ObservationBatch,
        state: {} as NetworkStateSnapshot,
      },
    };

    expect(event.type).toBe('control-plane.intelligence.observation-reported');
    expect(event.correlationId).toBe('correlation-1');
    expect(event.causationId).toBe('cause-1');
    expect(event.contractVersion).toBe(1);
  });
});
