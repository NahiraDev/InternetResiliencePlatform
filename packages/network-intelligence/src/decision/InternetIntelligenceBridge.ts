import type {
  DecisionModelProvider,
  DecisionResult,
  NetworkDecisionContext,
} from './NetworkDecisionEngine.js';

/** Minimal structural contract so network-intelligence does not depend on the agent package. */
export interface InternetIntelligenceAdvisor {
  observe(evidence: InternetEvidence): Promise<AgentRecommendation>;
}

export interface InternetEvidence {
  timestamp: string;
  latencyMs: number | null;
  jitterMs: number | null;
  packetLossRatio: number;
  dnsLookupMs: number | null;
  httpResponseMs: number | null;
  httpsHandshakeMs: number | null;
  ipv4Connectivity: boolean;
  ipv6Connectivity: boolean;
  gatewayReachable: boolean;
  internetReachable: boolean;
  qualityScore: number;
  destination?: string;
  resolver?: string;
  region?: string;
}

export interface AgentRecommendation {
  diagnosis: string;
  kind: string;
  confidence: number;
  rationale: string;
  evidence: readonly string[];
  generatedBy: 'deterministic' | 'local-llm';
  createdAt: string;
}

export interface InternetIntelligenceBridgeOptions {
  /** Do not let the advisory layer block the authoritative decision path. */
  timeoutMs?: number;
}

export class InternetIntelligenceBridge {
  private readonly timeoutMs: number;

  constructor(
    private readonly advisor: InternetIntelligenceAdvisor,
    options: InternetIntelligenceBridgeOptions = {},
  ) {
    this.timeoutMs = Math.max(1, Math.min(5_000, options.timeoutMs ?? 400));
  }

  async analyze(context: NetworkDecisionContext): Promise<AgentRecommendation | null> {
    const evidence = toInternetEvidence(context);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await Promise.race([
        this.advisor.observe(evidence),
        new Promise<null>((resolve) => {
          controller.signal.addEventListener('abort', () => resolve(null), { once: true });
        }),
      ]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  modelProvider(): DecisionModelProvider {
    return {
      id: 'irp-internet-intelligence-advisor',
      version: '1.0.0',
      capabilities: ['network-diagnosis', 'parameter-analysis', 'advisory-explanation'],
      evaluate: async (context) => {
        const recommendation = await this.analyze(context);
        if (!recommendation) return {};
        return {
          reasons: [
            `internet-intelligence:${recommendation.diagnosis}`,
            `internet-intelligence-confidence:${recommendation.confidence.toFixed(3)}`,
            ...recommendation.evidence.slice(0, 4).map((item) => `internet-intelligence-evidence:${item}`),
          ],
          explanation: recommendation.rationale.slice(0, 500),
        } satisfies Partial<DecisionResult>;
      },
    };
  }
}

function toInternetEvidence(context: NetworkDecisionContext): InternetEvidence {
  const candidates = context.candidates;
  const metrics = candidates.map((candidate) => candidate.metrics);
  const numberValue = (key: keyof InternetEvidence): number | null => {
    const values = metrics
      .map((item) => item[key as keyof typeof item])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return values.length ? Math.min(...values) : null;
  };
  const average = (key: 'latencyMs' | 'jitterMs' | 'packetLossRatio'): number | null => {
    const values = metrics
      .map((item) => item[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const reachable = candidates.some((candidate) => candidate.health === 'healthy' || candidate.health === 'degraded');
  const latencyMs = average('latencyMs');
  const jitterMs = average('jitterMs');
  const packetLossRatio = average('packetLossRatio') ?? 0;
  const dnsLookupMs = numberValue('dnsHealth');
  const httpResponseMs = numberValue('throughputMbps');
  const httpsHandshakeMs = numberValue('tunnelHealth');
  const qualityScore = candidates.length
    ? Math.round((candidates.reduce((sum, candidate) => sum + (candidate.score ?? 0), 0) / candidates.length) * 100)
    : 0;
  return {
    timestamp: context.timestamp,
    latencyMs,
    jitterMs,
    packetLossRatio: Math.max(0, Math.min(1, packetLossRatio)),
    dnsLookupMs,
    httpResponseMs,
    httpsHandshakeMs,
    ipv4Connectivity: reachable,
    ipv6Connectivity: Boolean(context.connectivity),
    gatewayReachable: reachable,
    internetReachable: reachable,
    qualityScore: Math.max(0, Math.min(100, qualityScore)),
    ...(context.currentRoute ? { destination: context.currentRoute } : {}),
    ...(context.currentResolver ? { resolver: context.currentResolver } : {}),
  };
}
