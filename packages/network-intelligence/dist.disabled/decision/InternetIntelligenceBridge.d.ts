import type { DecisionModelProvider, NetworkDecisionContext } from './NetworkDecisionEngine.js';
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
export declare class InternetIntelligenceBridge {
    private readonly advisor;
    private readonly timeoutMs;
    constructor(advisor: InternetIntelligenceAdvisor, options?: InternetIntelligenceBridgeOptions);
    analyze(context: NetworkDecisionContextWithInternetEvidence): Promise<AgentRecommendation | null>;
    modelProvider(): DecisionModelProvider;
}
//# sourceMappingURL=InternetIntelligenceBridge.d.ts.map