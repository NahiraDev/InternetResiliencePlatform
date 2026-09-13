import { describe, expect, it } from 'vitest';
import type { ObservationBatch, RuntimeContext } from '../src/domain/types.js';
import { CanonicalDecisionProvider } from '../src/canonical-decision-provider.js';
import { compileNetworkIntent } from '../src/intent/compiler.js';
import { createNetworkIntent } from '@irp/core';

const context = (observations: ObservationBatch): RuntimeContext => ({
  runtimeId: 'test-runtime',
  correlationId: 'test-correlation',
  mode: 'simulation',
  policySnapshot: {
    id: 'policy',
    schemaVersion: 1,
    createdAt: observations.createdAt,
    source: 'test',
    metadata: {},
    policy: {
      allowedActions: ['dns_switch', 'connectivity_failover', 'route_change', 'health_reprobe'],
      deniedActions: [],
      capabilityRequirements: {},
      securityConstraints: [],
      actionBudget: 10,
      maxConcurrentActions: 1,
      confidenceThreshold: 0.65,
      telemetryFreshnessMs: 60_000,
      simulationOnly: true,
      failClosed: true,
    },
  },
  capabilitySnapshot: {
    id: 'capabilities',
    schemaVersion: 1,
    createdAt: observations.createdAt,
    source: 'test',
    metadata: {},
    capabilities: ['dns.write'],
    trusted: true,
  },
  observationSnapshot: observations,
  deadline: new Date(Date.now() + 1_000).toISOString(),
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

const batch = (metrics: Record<string, unknown>): ObservationBatch => ({
  id: 'batch',
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  source: 'test',
  metadata: {},
  observations: Object.entries(metrics).map(([metric, value]) => ({
    id: metric,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    source: 'test',
    metadata: {},
    category: 'network',
    metric,
    value,
    timestamp: new Date().toISOString(),
    freshnessMs: 0,
    confidence: 1,
    severity: 'warning',
    status: 'degraded',
  })),
  stale: false,
  minConfidence: 1,
});

describe('CanonicalDecisionProvider', () => {
  it('mounts the internet intelligence diagnosis into the runtime decision candidates', async () => {
    const provider = new CanonicalDecisionProvider();
    const result = await provider.decide(
      [
        {
          id: 'incident-1',
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          correlationId: 'test-correlation',
          source: 'test',
          metadata: {},
          rootCause: 'dns failure',
          affectedComponents: ['dns'],
          confidence: 0.9,
          evidence: ['dns unavailable'],
          correlationReason: 'test',
          classification: 'primary_failure',
        },
      ],
      context(batch({ internet_reachable: false, dns_lookup_ms: null })),
    );

    const dns = result.find((candidate) => candidate.intent === 'dns_switch');
    expect(dns?.metadata).toMatchObject({
      intelligence: { diagnosis: 'dns_failure' },
    });
    expect(dns?.confidence).toBeGreaterThanOrEqual(0.92);
  });

  it('does not invoke intelligence when there is no incident', async () => {
    const provider = new CanonicalDecisionProvider();
    const result = await provider.decide([], context(batch({ internet_reachable: true })));
    expect(result).toHaveLength(1);
    expect(result[0]?.intent).toBe('noop');
  });

  it('carries a compiled intent into candidate metadata without granting execution authority', async () => {
    const intent = {
      ...createNetworkIntent({
        id: 'intent-destination',
        spec: { outcome: 'Maintain access', target: { destination: 'github.com' } },
      }),
      status: 'active' as const,
    };
    const result = await new CanonicalDecisionProvider().decide(
      [],
      { ...context(batch({ internet_reachable: true })), compiledIntent: compileNetworkIntent(intent) },
    );

    expect(result[0]?.intent).toBe('noop');
    expect(result[0]?.metadata).toMatchObject({
      intent: { id: 'intent-destination', desiredOutcome: 'Maintain access' },
      destination: 'github.com',
    });
  });

  it('mounts routing path evidence before canonical policy and execution', async () => {
    const provider = new CanonicalDecisionProvider(undefined, {
      pathEvidence: {
        evaluate: async () => ({
          destination: 'github.com',
          recommendation: 'switch',
          currentPathId: 'path:direct-a',
          selectedPathId: 'path:tunnel-b',
          currentScore: 35,
          selectedScore: 90,
          candidatePaths: [
            {
              id: 'path:direct-a',
              type: 'direct',
              score: 35,
              state: 'degraded',
              failureDomains: ['isp-a'],
            },
            {
              id: 'path:tunnel-b',
              type: 'tunnel',
              score: 90,
              state: 'available',
              failureDomains: ['provider-b'],
            },
          ],
          diverseAlternativeCount: 1,
          confidence: 0.9,
          expectedBenefit: 0.55,
          risk: 0.2,
          explanation: ['selected tunnel-b by score'],
        }),
      },
    });
    const result = await provider.decide(
      [
        {
          id: 'incident-2',
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          correlationId: 'test-correlation',
          source: 'test',
          metadata: {},
          rootCause: 'network path degradation',
          affectedComponents: ['route'],
          confidence: 0.9,
          evidence: ['direct path degraded'],
          correlationReason: 'test',
          classification: 'primary_failure',
        },
      ],
      context(batch({ internet_reachable: false, packet_loss_percent: 0.4 })),
    );

    expect(result.find((candidate) => candidate.intent === 'route_change')?.metadata).toMatchObject({
      pathEvidence: {
        selectedPathId: 'path:tunnel-b',
        diverseAlternativeCount: 1,
      },
      pathId: 'path:tunnel-b',
    });
  });
});
