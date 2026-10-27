import { InMemoryHistoricalMeasurementStore } from '@irp/historical-analysis';
import { describe, expect, it } from 'vitest';
import {
  CanonicalDecisionProvider,
  FederatedEvidenceAdvisor,
  HistoricalAnalysisAdvisor,
  ProbeFederation,
  createProbeKeyPair,
  signProbeEvidence,
  createRuntimeContext,
  createCapabilitySnapshot,
  createPolicySnapshot,
  defaultPolicy,
  type Incident,
  type ObservationBatch,
  type RuntimeContext,
} from '../src/index.js';

const timestamp = '2026-09-12T12:00:00.000Z';

const observations: ObservationBatch = {
  id: 'observations',
  schemaVersion: 1,
  createdAt: timestamp,
  source: 'test',
  metadata: {},
  stale: false,
  minConfidence: 1,
  observations: [
    {
      id: 'internet',
      schemaVersion: 1,
      createdAt: timestamp,
      source: 'test',
      metadata: { destination: 'example.test' },
      category: 'network',
      metric: 'internet_reachable',
      value: false,
      timestamp,
      freshnessMs: 0,
      confidence: 1,
      severity: 'critical',
      status: 'failed',
    },
  ],
};

const context = (): RuntimeContext =>
  createRuntimeContext({
    mode: 'simulation',
    observationSnapshot: observations,
    securityContext: { trusted: true },
    capabilitySnapshot: createCapabilitySnapshot(['dns.write'], true),
    policySnapshot: createPolicySnapshot({
      ...defaultPolicy('simulation'),
      simulationOnly: false,
      allowedActions: ['dns_switch'],
    }),
  });

const incident: Incident = {
  id: 'dns-incident',
  schemaVersion: 1,
  createdAt: timestamp,
  correlationId: 'test',
  source: 'test',
  metadata: {},
  rootCause: 'dns failure',
  affectedComponents: ['dns'],
  confidence: 0.9,
  evidence: ['dns unavailable'],
  correlationReason: 'test',
  classification: 'primary_failure',
};

describe('historical analysis advisory integration', () => {
  it('feeds retained DNS evidence into the canonical decision provider as advisory ranking input', async () => {
    const store = new InMemoryHistoricalMeasurementStore([
      {
        timestamp: '2026-09-12T11:00:00.000Z',
        probeType: 'dns_switch',
        success: true,
        latencyMs: 24,
        packetLossPercent: 0,
      },
      {
        timestamp: '2026-09-12T11:30:00.000Z',
        probeType: 'dns_switch',
        success: true,
        latencyMs: 20,
        packetLossPercent: 0,
      },
    ]);
    const provider = new CanonicalDecisionProvider(undefined, {
      historicalEvidence: new HistoricalAnalysisAdvisor(store),
    });

    const candidates = await provider.decide([incident], context());
    expect(
      candidates.find((candidate) => candidate.intent === 'dns_switch')?.metadata,
    ).toMatchObject({
      historicalEvidence: {
        sampleCount: 2,
        successRatio: 1,
        freshestAt: '2026-09-12T11:30:00.000Z',
      },
    });
  });

  it('rejects retained evidence from a different destination', async () => {
    const store = new InMemoryHistoricalMeasurementStore([
      {
        timestamp: '2026-09-12T11:00:00.000Z',
        probeType: 'dns_switch',
        success: false,
        metadata: { destination: 'other.example' },
      },
      {
        timestamp: '2026-09-12T11:30:00.000Z',
        probeType: 'dns_switch',
        success: true,
        metadata: { destination: 'example.test', providerId: 'resolver-a' },
      },
    ]);
    const provider = new CanonicalDecisionProvider(undefined, {
      historicalEvidence: new HistoricalAnalysisAdvisor(store),
    });

    const candidates = await provider.decide([incident], context());
    expect(
      candidates.find((candidate) => candidate.intent === 'dns_switch')?.metadata,
    ).toMatchObject({
      historicalEvidence: { sampleCount: 1, successRatio: 1 },
    });
  });

  it('continues with local decisioning when the historical store is unavailable', async () => {
    const provider = new CanonicalDecisionProvider(undefined, {
      historicalEvidence: {
        observationsFor: async () => Promise.reject(new Error('history unavailable')),
      },
    });

    const candidates = await provider.decide([incident], context());
    expect(candidates.find((candidate) => candidate.intent === 'dns_switch')).toBeDefined();
    expect(candidates[0]?.metadata).not.toHaveProperty('historicalEvidence');
  });

  it('feeds accepted, destination-scoped federated evidence into canonical ranking', async () => {
    const keys = createProbeKeyPair();
    const federation = new ProbeFederation();
    federation.registerProbe({
      probeId: 'probe-1',
      name: 'Frankfurt',
      region: 'de-frankfurt',
      publicKeyPem: keys.publicKeyPem,
    });
    const result = federation.ingest(
      signProbeEvidence(
        {
          evidenceId: 'federated-example-1',
          probeId: 'probe-1',
          region: 'de-frankfurt',
          observedAt: new Date().toISOString(),
          destination: 'example.test',
          serviceStatus: 'reachable',
          measurements: { latencyMs: 35, packetLossPercent: 0 },
        },
        keys.privateKeyPem,
      ),
    );
    expect(result.accepted).toBe(true);

    const provider = new CanonicalDecisionProvider(undefined, {
      federatedEvidence: new FederatedEvidenceAdvisor(federation),
    });
    const candidates = await provider.decide([incident], context());
    expect(
      candidates.find((candidate) => candidate.intent === 'dns_switch')?.metadata,
    ).toMatchObject({
      historicalEvidence: { sampleCount: 1, successRatio: 1 },
    });
  });
});
