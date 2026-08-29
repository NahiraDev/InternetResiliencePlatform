export type InternetDiagnosis =
  | 'healthy'
  | 'dns_failure'
  | 'transport_failure'
  | 'tls_failure'
  | 'http_failure'
  | 'packet_loss'
  | 'latency_degradation'
  | 'ipv6_failure'
  | 'upstream_or_egress_issue'
  | 'possible_interference'
  | 'insufficient_evidence';

export type RecommendationKind =
  | 'observe'
  | 'prefer_resolver'
  | 'prefer_path'
  | 'recheck_destination'
  | 'defer_to_decision_engine';

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
  kind: RecommendationKind;
  diagnosis: InternetDiagnosis;
  confidence: number;
  rationale: string;
  evidence: string[];
  generatedBy: 'deterministic' | 'local-llm';
  createdAt: string;
}

export interface InternetIntelligenceAgentOptions {
  minConfidence?: number;
  maxHistory?: number;
  llm?: LocalLLMProvider;
}

export interface LocalLLMProvider {
  analyze(input: {
    current: InternetEvidence;
    history: readonly InternetEvidence[];
    baseline: AgentRecommendation;
  }): Promise<AgentRecommendation | null>;
}
