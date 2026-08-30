import { describe, expect, it } from 'vitest';
import { InternetIntelligenceBridge, type InternetIntelligenceAdvisor, type NetworkDecisionContextWithInternetEvidence } from './InternetIntelligenceBridge.js';
const context: NetworkDecisionContextWithInternetEvidence = {
  timestamp: '2026-08-29T19:00:00.000Z',
  versions: { policyVersion: '1', networkStateVersion: '1', securityStateVersion: '1' },
  internetEvidence: { timestamp: '2026-08-29T19:00:00.000Z', latencyMs: 80, jitterMs: 4, packetLossRatio: 0.01, dnsLookupMs: 30, httpResponseMs: 100, httpsHandshakeMs: 40, ipv4Connectivity: true, ipv6Connectivity: false, gatewayReachable: true, internetReachable: true, qualityScore: 90 },
  candidates: [],
};
const recommendation = { diagnosis: 'healthy', kind: 'observe', confidence: 0.95, rationale: 'Measured evidence is healthy.', evidence: ['reachability-ok'], generatedBy: 'deterministic' as const, createdAt: '2026-08-29T19:00:00.000Z' };
describe('InternetIntelligenceBridge', () => {
  it('passes canonical evidence without inventing measurements', async () => {
    let received: unknown;
    const advisor: InternetIntelligenceAdvisor = { observe: async (evidence) => { received = evidence; return recommendation; } };
    await expect(new InternetIntelligenceBridge(advisor).analyze(context)).resolves.toEqual(recommendation);
    expect(received).toEqual(context.internetEvidence);
  });
  it('does not call the advisor when evidence is absent', async () => {
    let calls = 0;
    const advisor: InternetIntelligenceAdvisor = { observe: async () => { calls += 1; return recommendation; } };
    const { internetEvidence: _internetEvidence, ...contextWithoutEvidence } = context;
    const contextWithoutEvidenceTyped: Omit<NetworkDecisionContextWithInternetEvidence, 'internetEvidence'> = contextWithoutEvidence;
    await expect(new InternetIntelligenceBridge(advisor).analyze(contextWithoutEvidenceTyped)).resolves.toBeNull();
    expect(calls).toBe(0);
  });
  it('fails open when the advisory agent is unavailable', async () => {
    const advisor: InternetIntelligenceAdvisor = { observe: async () => { throw new Error('unavailable'); } };
    await expect(new InternetIntelligenceBridge(advisor).analyze(context)).resolves.toBeNull();
  });
  it('returns only advisory fields through the model-provider boundary', async () => {
    const provider = new InternetIntelligenceBridge({ observe: async () => recommendation }).modelProvider();
    const partial = await provider.evaluate?.(context, new AbortController().signal);
    expect(partial).toMatchObject({ reasons: expect.arrayContaining(['internet-intelligence:healthy']), explanation: recommendation.rationale });
    expect(partial).not.toHaveProperty('recommendedAction');
    expect(partial).not.toHaveProperty('selectedCandidate');
  });
});
