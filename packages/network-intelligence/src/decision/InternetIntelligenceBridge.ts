import type { DecisionModelProvider, DecisionResult, NetworkDecisionContext } from './NetworkDecisionEngine.js';

/** Structural contract keeps network-intelligence independent from any specific model package. */
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

export type NetworkDecisionContextWithInternetEvidence = NetworkDecisionContext & {
  internetEvidence?: InternetEvidence;
};

export interface InternetIntelligenceBridgeOptions {
  timeoutMs?: number;
}

/**
 * Runs the agent as a bounded advisory sidecar. It never selects a candidate,
 * changes policy/security state, or executes a network action.
 */
export class InternetIntelligenceBridge {
  private readonly timeoutMs: number;

  constructor(private readonly advisor: InternetIntelligenceAdvisor, options: InternetIntelligenceBridgeOptions = {}) {
    this.timeoutMs = Math.max(1, Math.min(5_000, options.timeoutMs ?? 400));
  }

  async analyze(context: NetworkDecisionContextWithInternetEvidence): Promise<AgentRecommendation | null> {
    const evidence = context.internetEvidence;
    if (!evidence) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await Promise.race([
        this.advisor.observe(evidence),
        new Promise<null>((resolve) => controller.signal.addEventListener('abort', () => resolve(null), { once: true })),
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
        const recommendation = await this.analyze(context as NetworkDecisionContextWithInternetEvidence);
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
