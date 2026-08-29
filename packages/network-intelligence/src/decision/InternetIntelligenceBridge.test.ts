import { describe, expect, it } from 'vitest';
import { InternetIntelligenceBridge, type InternetIntelligenceAdvisor } from './InternetIntelligenceBridge.js';
import type { NetworkDecisionContext } from './NetworkDecisionEngine.js';

const context: NetworkDecisionContext = {
  timestamp: '2026-08-29T19:00:00.000Z',
  versions: {
    policyVersion: '1',
    networkStateVersion: '1',
    securityStateVersion: '1',
  },
  internetEvidence: {
    timestamp: '2026-08-29T19:00:00.000Z',
    latencyMs: 80,
    jitterMs: 4,
    packetLossRatio: 0.01,
    dnsLookupMs: 30,
    httpResponseMs: 100,
    httpsHandshakeMs: 40,
    ipv4Connectivity: true,
    ipv6Connectivity: false,
    gatewayReachable: true,
    internetReachable: true,
    qualityScore: 90,
  },
  candidates: [],
};

const recommendation = {
  diagnosis: 'healthy',
  kind: 'observe',
  confidence: 0.95,
  rationale: 'Measured evidence is healthy.',
  evidence: ['reachability-ok'],
  generatedBy: 'deterministic' as const,
  createdAt: '2026-08-29T19:00:00.000Z',
};

describe('InternetIntelligenceBridge', () => {
  it('passes canonical evidence to the advisory agent without inventing measurements', async () => {
    let received: unknown;
    const advisor: InternetIntelligenceAdvisor = {
      observe: async (evidence) => {
        received = evidence;
        return recommendation;
      },
    };
    const bridge = new InternetIntelligenceBridge(advisor);
    await expect(bridge.analyze(context)).resolves.toEqual(recommendation);
    expect(received).toEqual(context.internetEvidence);
  });

  it('does not call the advisor when canonical evidence is absent', async () => {
    let calls = 0;
    const advisor: InternetIntelligenceAdvisor = {
      observe: async () => {
        calls += 1;
        return recommendation;
      },
    };
    const bridge = new InternetIntelligenceBridge(advisor);
    await expect(bridge.analyze({ ...context, internetEvidence: undefined })).resolves.toBeNull();
    expect(calls).toBe(0);
  });

  it('fails open to the deterministic decision path when the advisor is unavailable', async () => {
    const advisor: InternetIntelligenceAdvisor = {
      observe: async () => {
        throw new Error('advisor unavailable');
      },
    };
    await expect(new InternetIntelligenceBridge(advisor).analyze(context)).resolves.toBeNull();
  });

  it('exposes an advisory model provider without granting execution authority', async () => {
    const advisor: InternetIntelligenceAdvisor = { observe: async () => recommendation };
    const provider = new InternetIntelligenceBridge(advisor).modelProvider();
    const partial = await provider.evaluate?.(context, new AbortController().signal);
    expect(provider.id).toBe('irp-internet-intelligence-advisor');
    expect(partial).toMatchObject({
      reasons: expect.arrayContaining(['internet-intelligence:healthy']),
      explanation: recommendation.rationale,
    });
    expect(partial).not.toHaveProperty('recommendedAction');
    expect(partial).not.toHaveProperty('selectedCandidate');
  });
});
