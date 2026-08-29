import { analyzeInternetEvidence } from './analyzer.js';
import type { AgentRecommendation, InternetEvidence, InternetIntelligenceAgentOptions } from './types.js';

export class InternetIntelligenceAgent {
  private readonly history: InternetEvidence[] = [];
  private readonly minConfidence: number;
  private readonly maxHistory: number;
  private readonly llm: InternetIntelligenceAgentOptions['llm'];

  constructor(options: InternetIntelligenceAgentOptions = {}) {
    this.minConfidence = Math.min(1, Math.max(0, options.minConfidence ?? 0.65));
    this.maxHistory = Math.max(1, Math.min(1_000, options.maxHistory ?? 120));
    this.llm = options.llm;
  }

  async observe(evidence: InternetEvidence): Promise<AgentRecommendation> {
    const current = sanitizeEvidence(evidence);
    const baseline = analyzeInternetEvidence(current, this.history);
    this.history.push(current);
    if (this.history.length > this.maxHistory) this.history.splice(0, this.history.length - this.maxHistory);

    if (!this.llm || baseline.confidence < this.minConfidence) return baseline;
    const advised = await this.llm.analyze({ current, history: this.history, baseline });
    if (!advised || advised.confidence < this.minConfidence) return baseline;
    return advised;
  }

  getHistory(): readonly InternetEvidence[] {
    return this.history.map((item) => ({ ...item }));
  }
}

function sanitizeEvidence(input: InternetEvidence): InternetEvidence {
  const numeric = (value: number | null) => value === null || Number.isFinite(value) ? value : null;
  return Object.freeze({
    timestamp: new Date(input.timestamp).toISOString(),
    latencyMs: numeric(input.latencyMs),
    jitterMs: numeric(input.jitterMs),
    packetLossRatio: Number.isFinite(input.packetLossRatio) ? Math.min(1, Math.max(0, input.packetLossRatio)) : 1,
    dnsLookupMs: numeric(input.dnsLookupMs),
    httpResponseMs: numeric(input.httpResponseMs),
    httpsHandshakeMs: numeric(input.httpsHandshakeMs),
    ipv4Connectivity: Boolean(input.ipv4Connectivity),
    ipv6Connectivity: Boolean(input.ipv6Connectivity),
    gatewayReachable: Boolean(input.gatewayReachable),
    internetReachable: Boolean(input.internetReachable),
    qualityScore: Number.isFinite(input.qualityScore) ? Math.min(100, Math.max(0, input.qualityScore)) : 0,
    ...(input.destination ? { destination: input.destination.slice(0, 255) } : {}),
    ...(input.resolver ? { resolver: input.resolver.slice(0, 255) } : {}),
    ...(input.region ? { region: input.region.slice(0, 64) } : {}),
  });
}
