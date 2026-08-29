import { describe, expect, it } from 'vitest';
import { InternetIntelligenceAgent } from './agent.js';
import type { InternetEvidence } from './types.js';

const healthy: InternetEvidence = {
  timestamp: '2026-08-29T17:00:00.000Z', latencyMs: 40, jitterMs: 3, packetLossRatio: 0,
  dnsLookupMs: 30, httpResponseMs: 80, httpsHandshakeMs: 50, ipv4Connectivity: true,
  ipv6Connectivity: true, gatewayReachable: true, internetReachable: true, qualityScore: 95,
};

describe('InternetIntelligenceAgent', () => {
  it('produces a deterministic healthy baseline', async () => {
    const result = await new InternetIntelligenceAgent().observe(healthy);
    expect(result.diagnosis).toBe('healthy');
    expect(result.generatedBy).toBe('deterministic');
  });

  it('does not treat destination failure as proof of filtering', async () => {
    const result = await new InternetIntelligenceAgent().observe({
      ...healthy, internetReachable: false, httpsHandshakeMs: null,
    });
    expect(result.diagnosis).toBe('tls_failure');
    expect(result.rationale).not.toMatch(/proof|confirmed.*filter/i);
  });

  it('bounds and defensively copies history', async () => {
    const agent = new InternetIntelligenceAgent({ maxHistory: 2 });
    await agent.observe(healthy);
    await agent.observe({ ...healthy, latencyMs: 60 });
    await agent.observe({ ...healthy, latencyMs: 80 });
    const history = agent.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.latencyMs).toBe(60);
  });

  it('falls back safely when local LLM is unavailable', async () => {
    const result = await new InternetIntelligenceAgent({
      llm: { analyze: async () => null },
    }).observe({ ...healthy, packetLossRatio: 0.4 });
    expect(result.diagnosis).toBe('packet_loss');
    expect(result.generatedBy).toBe('deterministic');
  });
});
