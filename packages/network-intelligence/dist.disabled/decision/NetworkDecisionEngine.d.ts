export type DecisionType = 'routeDecision' | 'tunnelDecision' | 'proxyDecision' | 'dnsDecision' | 'connectivityDecision' | 'failoverDecision' | 'recoveryDecision';
export type DecisionCandidateType = 'connectivity-source' | 'route' | 'tunnel' | 'proxy' | 'dns-resolver' | 'failover-target';
export type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unavailable' | 'unknown';
export type FreshnessState = 'fresh' | 'stale' | 'expired' | 'unknown';
export type AnomalyState = 'normal' | 'warning' | 'anomalous' | 'unknown';
export type RecommendationStatus = 'recommended' | 'rejected' | 'expired' | 'stale';
export type RecommendedAction = 'remain' | 'reconnect' | 'switch-endpoint' | 'switch-tunnel' | 'switch-proxy' | 'switch-connectivity-source' | 'switch-route' | 'switch-dns-resolver' | 'none';
export interface Timestamped<T> {
    value: T;
    timestamp: string;
}
export interface CandidateMetrics {
    latencyMs?: number | null;
    packetLossRatio?: number | null;
    jitterMs?: number | null;
    throughputMbps?: number | null;
    availabilityRatio?: number | null;
    reliabilityRatio?: number | null;
    recoveryCost?: number | null;
    dnsHealth?: number | null;
    routeHealth?: number | null;
    tunnelHealth?: number | null;
}
export interface HistoricalObservation extends CandidateMetrics {
    timestamp: string;
    /** Optional scope carried with advisory evidence; ranking must not treat it as authority. */
    destination?: string;
    providerId?: string;
    pathId?: string;
    region?: string;
    failureDomain?: string;
    failureCount?: number;
    recoveryCount?: number;
    uptimeRatio?: number;
}
export interface NetworkPerformanceProfile {
    latencyScore: number;
    reliabilityScore: number;
    stabilityScore: number;
    throughputScore: number;
    dnsScore: number;
    routeScore: number;
    tunnelScore: number;
}
export interface DecisionCandidate {
    id: string;
    type: DecisionCandidateType;
    capabilities: readonly string[];
    health: HealthState;
    metrics: CandidateMetrics;
    policyCompatibility: boolean;
    securityCompatibility: boolean;
    score?: number;
    timestamp: string;
    metadata?: Record<string, unknown>;
}
export interface StateVersions {
    policyVersion: string;
    networkStateVersion: string;
    securityStateVersion: string;
    routingStateVersion?: string;
    tunnelStateVersion?: string;
    dnsStateVersion?: string;
}
export interface NetworkDecisionContext {
    timestamp: string;
    versions: StateVersions;
    connectivity?: Timestamped<unknown>;
    routingState?: Timestamped<unknown>;
    dnsState?: Timestamped<unknown>;
    tunnelState?: Timestamped<unknown>;
    securityState?: Timestamped<unknown>;
    policy?: Timestamped<unknown>;
    currentRoute?: string;
    currentTunnel?: string;
    currentResolver?: string;
    candidates: readonly DecisionCandidate[];
    historicalObservations?: Record<string, readonly HistoricalObservation[]>;
    requiredCapabilities?: readonly string[];
}
export interface DecisionRequest {
    type: DecisionType;
    context: NetworkDecisionContext;
    requestedAction?: RecommendedAction;
    now?: string;
    ttlMs?: number;
    modelProvider?: DecisionModelProvider;
    manualOverride?: ManualOverride;
    signal?: AbortSignal;
}
export interface ValidationResult {
    allowed: boolean;
    reason?: string | undefined;
    version?: string | undefined;
}
export interface PolicyValidator {
    validate(candidate: DecisionCandidate, context: NetworkDecisionContext): Promise<ValidationResult> | ValidationResult;
}
export interface SecurityValidator {
    validate(candidate: DecisionCandidate, context: NetworkDecisionContext): Promise<ValidationResult> | ValidationResult;
}
export interface CandidateEvaluation {
    candidate: DecisionCandidate;
    score: number;
    dimensions: Record<string, number>;
    reasons: string[];
    negativeFactors: string[];
    rejected: boolean;
    rejectionReason?: string | undefined;
    freshness: FreshnessState;
    anomaly: AnomalyState;
    predictedOutcome: string;
}
export interface DecisionResult {
    decisionId: string;
    type: DecisionType;
    timestamp: string;
    selectedCandidate: DecisionCandidate | null;
    candidates: CandidateEvaluation[];
    score: number;
    confidence: number;
    reasons: string[];
    rejectedCandidates: Array<{
        id: string;
        reason: string;
    }>;
    policyValidation: ValidationResult;
    securityValidation: ValidationResult;
    recommendedAction: RecommendedAction;
    expiresAt: string;
    versions: StateVersions;
    status: RecommendationStatus;
    rejectionReason?: string | undefined;
    fallbackUsed: boolean;
    explanation: string;
    predictedOutcomes: Record<string, string>;
}
export interface DecisionModelProvider {
    id: string;
    version: string;
    capabilities: readonly string[];
    evaluate?(context: NetworkDecisionContext, signal: AbortSignal): Promise<Partial<DecisionResult>>;
    score?(candidate: DecisionCandidate, context: NetworkDecisionContext, signal: AbortSignal): Promise<number>;
    explain?(decision: DecisionResult, signal: AbortSignal): Promise<string>;
}
export interface ModelOptions {
    timeoutMs: number;
    maxConcurrent: number;
}
export interface DecisionWeights {
    availability: number;
    latency: number;
    packetLoss: number;
    jitter: number;
    throughput: number;
    stability: number;
    security: number;
    policyCompliance: number;
    historicalReliability: number;
    recoveryCost: number;
}
export interface DecisionEngineOptions {
    weights?: Partial<DecisionWeights>;
    freshMs?: number;
    staleMs?: number;
    ttlMs?: number;
    maxHistoryPerCandidate?: number;
    maxCandidates?: number;
    maxConcurrentEvaluations?: number;
    model?: Partial<ModelOptions>;
    policyValidator?: PolicyValidator;
    securityValidator?: SecurityValidator;
    events?: {
        emit(event: string, payload: unknown): void | Promise<void>;
    };
    metrics?: {
        record(name: string, value: number, labels?: Record<string, string>): void;
    };
    audit?: {
        record(event: string, payload: unknown): void | Promise<void>;
    };
}
export interface ManualOverride {
    candidateId: string;
    reason: string;
    requestedBy: string;
    expiresAt: string;
}
export interface ActualOutcome {
    candidateId: string;
    healthy: boolean;
    failed: boolean;
    rank?: number;
    observedConfidence?: number;
}
export interface EvaluationMetrics {
    recommendationAccuracy: number;
    falsePositiveRate: number;
    falseNegativeRate: number;
    rankingQuality: number;
    confidenceCalibration: number;
}
export declare const DEFAULT_DECISION_WEIGHTS: DecisionWeights;
export declare class BoundedHistoricalObservations {
    private readonly maxPerCandidate;
    private readonly data;
    constructor(maxPerCandidate?: number);
    add(candidateId: string, observation: HistoricalObservation): void;
    get(candidateId: string): readonly HistoricalObservation[];
    snapshot(): Record<string, readonly HistoricalObservation[]>;
}
export declare class DecisionEvaluator {
    evaluate(decisions: readonly DecisionResult[], outcomes: readonly ActualOutcome[]): EvaluationMetrics;
}
export declare class NetworkDecisionEngine {
    private active;
    private readonly history;
    private readonly options;
    constructor(options?: DecisionEngineOptions);
    evaluate(request: DecisionRequest): Promise<DecisionResult>;
    rank(evaluations: readonly CandidateEvaluation[]): CandidateEvaluation[];
    recommend(request: DecisionRequest): Promise<DecisionResult>;
    simulate(request: DecisionRequest): Promise<DecisionResult>;
    simulateDecision(request: DecisionRequest): Promise<DecisionResult>;
    replay(context: NetworkDecisionContext, type: DecisionType, now?: string): Promise<DecisionResult>;
    explain(decision: DecisionResult): string;
    isExpired(decision: DecisionResult, now?: string): boolean;
    revalidate(decision: DecisionResult, context: NetworkDecisionContext, now?: string): RecommendationStatus;
    profile(c: DecisionCandidate, history?: readonly HistoricalObservation[]): NetworkPerformanceProfile;
    anomaly(c: DecisionCandidate, history?: readonly HistoricalObservation[]): AnomalyState;
    private evaluateCandidate;
    private dimensions;
    private freshness;
    private confidence;
    private historicalReliability;
    private stability;
    private reasons;
    private validatePolicy;
    private validateSecurity;
    private actionFor;
    private applyManualOverride;
    private tryModel;
    validateModelOutput(output: Partial<DecisionResult>, candidateIds: readonly string[]): ValidationResult;
    privacyFilter(value: unknown): unknown;
    private emit;
    private audit;
    private metric;
}
//# sourceMappingURL=NetworkDecisionEngine.d.ts.map