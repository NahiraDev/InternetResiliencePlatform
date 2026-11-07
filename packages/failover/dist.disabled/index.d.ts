interface EventPublisher {
    publish(event: unknown): Promise<void>;
}
interface MetricRecorder {
    record(name: string, value: number, labels?: Record<string, string>): void;
}
interface AuditAppender {
    append(input: {
        action: 'network.modify';
        actorId: string;
        target: string;
        outcome: 'success' | 'failure';
        details?: Record<string, unknown>;
    }): unknown;
}
interface ConnectivityAdapter {
    getAvailableSources(): ConnectivityLikeSource[];
    switchSource(resourceId: string, reason?: string, trigger?: string): Promise<{
        status?: string;
    }> | {
        status?: string;
    };
}
interface ConnectivityLikeSource {
    sourceId: string;
    health?: {
        score?: number;
    };
}
interface RoutingAdapter {
    simulateRouting(context: unknown): Promise<{
        candidates: RoutingLikeCandidate[];
    }> | {
        candidates: RoutingLikeCandidate[];
    };
    applyPlan(plan: never): Promise<unknown> | unknown;
}
interface RoutingLikeCandidate {
    path: {
        id: string;
    };
    totalScore: number;
    plan?: unknown;
}
interface DnsAdapter {
    decide(context: unknown, simulation?: boolean): Promise<{
        candidates: DnsLikeCandidate[];
    }> | {
        candidates: DnsLikeCandidate[];
    };
    setManualOverride(override: unknown): void;
}
interface DnsLikeCandidate {
    resolver: {
        id: string;
        transport: string;
    };
    score: number;
}
export type FailureDomain = 'connectivity' | 'route' | 'dns' | 'dns-transport' | 'resolver' | 'service' | 'platform' | 'configuration' | 'security';
export type FailureType = 'transient' | 'intermittent' | 'persistent' | 'systemic' | 'dependency' | 'configuration' | 'policy' | 'security' | 'resource' | 'unknown';
export type FailureSeverity = 'info' | 'minor' | 'major' | 'critical';
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type FailureState = 'detected' | 'confirmed' | 'recovering' | 'recovered' | 'unresolved' | 'escalated' | 'suppressed' | 'resolved';
export type RecoveryState = 'idle' | 'detecting' | 'confirming' | 'planning' | 'executing' | 'validating' | 'recovered' | 'stabilizing' | 'rolling-back' | 'degraded' | 'escalated' | 'cooldown';
export type RecoveryActionType = 're-probe' | 'retry' | 'reconnect' | 'switch-connectivity-source' | 'switch-route' | 'switch-resolver' | 'switch-dns-transport' | 'restart-subsystem' | 'reinitialize-component' | 'invalidate-cache' | 'clear-stale-state' | 'enter-degraded-mode' | 'rollback' | 'escalate';
export type CircuitState = 'closed' | 'open' | 'half-open';
export type ManualOverrideMode = 'force-preferred' | 'disable-automatic-failover' | 'force-recovery' | 'clear-failure-state' | 'reset-circuit-breaker' | 'reset-recovery-budget';
export type RecoveryCost = 'none' | 'low' | 'medium' | 'high';
export interface FailureEvidence {
    signalId: string;
    source: string;
    message: string;
    observedAt: string;
    weight: number;
    healthScore?: number;
    timeout?: boolean;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
}
export interface FailureImpact {
    affectedDomains: FailureDomain[];
    affectedComponents: string[];
    downstreamComponents: string[];
    serviceImpact: 'none' | 'degraded' | 'unavailable' | 'security-risk';
    estimatedBlastRadius: number;
}
export interface Failure {
    id: string;
    domain: FailureDomain;
    component: string;
    type: FailureType;
    severity: FailureSeverity;
    confidence: ConfidenceLevel;
    confidenceScore: number;
    detectedAt: string;
    source: string;
    evidence: FailureEvidence[];
    impact: FailureImpact;
    state: FailureState;
    correlationId?: string;
}
export interface HealthSignal {
    id?: string;
    domain: FailureDomain;
    component: string;
    source: string;
    status: 'healthy' | 'degraded' | 'unhealthy' | 'timeout' | 'error' | 'security-failure' | 'policy-denied';
    observedAt?: string;
    healthScore?: number;
    latencyMs?: number;
    timeout?: boolean;
    message?: string;
    metadata?: Record<string, unknown>;
}
export interface RecoveryConfig {
    detectionThreshold: number;
    confirmationThreshold: number;
    confidenceThreshold: number;
    maxRetries: number;
    maxRecoveryAttempts: number;
    maxFailovers: number;
    maxComponentSwitches: number;
    maxTotalRecoveryDurationMs: number;
    backoffInitialMs: number;
    backoffMaxMs: number;
    backoffJitterRatio: number;
    cooldownMs: number;
    hysteresisMinimumImprovement: number;
    stabilizationMs: number;
    recoveryTimeoutMs: number;
    maxConcurrentRecoveries: number;
    maxHistory: number;
    circuitBreakerFailureThreshold: number;
    circuitBreakerCooldownMs: number;
    failClosed: boolean;
    automaticRecovery: boolean;
    automaticConnectivitySwitching: boolean;
    automaticRouteSwitching: boolean;
    automaticResolverSwitching: boolean;
    automaticTransportSwitching: boolean;
}
export interface RecoveryCandidate {
    id: string;
    domain: FailureDomain;
    component: string;
    action: RecoveryActionType;
    eligible: boolean;
    rejectionReasons: string[];
    score: number;
    scoreComponents: Record<string, number>;
    cost: RecoveryCost;
    capabilities: string[];
    secure: boolean;
    source: 'connectivity' | 'routing' | 'dns' | 'dns-transport' | 'builtin' | 'plugin';
    payload?: unknown;
}
export interface RecoveryStrategy {
    id: string;
    trigger: FailureType | FailureDomain | 'any';
    scope: FailureDomain[];
    priority: number;
    prerequisites: string[];
    actions: RecoveryActionType[];
    validation: RecoveryActionType[];
    rollback: RecoveryActionType[];
    cooldownMs: number;
    budget: Partial<RecoveryConfig>;
}
export interface RecoveryStep {
    id: string;
    action: RecoveryActionType;
    candidateId?: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'rolled-back' | 'skipped';
    reason: string;
    startedAt?: string;
    completedAt?: string;
    rollback?: RecoveryActionType;
}
export interface RecoveryPlan {
    id: string;
    failure: Failure;
    candidates: RecoveryCandidate[];
    rejectedCandidates: RecoveryCandidate[];
    selectedStrategy: RecoveryStrategy;
    steps: RecoveryStep[];
    validation: RecoveryActionType[];
    rollback: RecoveryActionType[];
    timeoutMs: number;
    reason: string;
    dryRun: boolean;
    createdAt: string;
}
export interface RecoveryDecision {
    failure: Failure;
    confidence: ConfidenceLevel;
    impact: FailureImpact;
    candidates: RecoveryCandidate[];
    rejectedCandidates: RecoveryCandidate[];
    selectedStrategy: RecoveryStrategy;
    actions: RecoveryActionType[];
    validation: RecoveryActionType[];
    rollback: RecoveryActionType[];
    reason: string;
    expectedCost: RecoveryCost;
    explanation: RecoveryExplanation;
}
export interface RecoveryExplanation {
    summary: string;
    evidence: string[];
    candidateSummary: {
        id: string;
        eligible: boolean;
        score: number;
        reasons: string[];
    }[];
    decision: string;
    reason: string;
    policy: string[];
    security: string[];
}
export interface RecoveryHistorySnapshot {
    failureCount: number;
    recoveryCount: number;
    successRate: number;
    averageRecoveryDurationMs: number;
    lastFailure?: string;
    lastRecovery?: string;
    recentStrategies: string[];
    failedStrategies: string[];
    successfulStrategies: string[];
    records: RecoveryHistoryRecord[];
}
export interface RecoveryHistoryRecord {
    failureContext: Pick<Failure, 'id' | 'domain' | 'component' | 'type' | 'severity' | 'confidence'>;
    strategy: string;
    outcome: 'success' | 'failed' | 'rolled-back' | 'degraded' | 'escalated' | 'simulated';
    durationMs: number;
    cost: RecoveryCost;
    stability: ConfidenceLevel;
    rollback: boolean;
    policy: string[];
    environment: Record<string, unknown>;
    at: string;
}
export interface RecoveryPolicyDecision {
    allowed: boolean;
    reason?: string;
    constraints?: string[];
    allowInsecureFallback?: boolean;
}
export interface RecoveryAdapters {
    connectivity?: ConnectivityAdapter;
    routing?: RoutingAdapter;
    dns?: DnsAdapter;
    events?: EventPublisher;
    metrics?: MetricRecorder;
    audit?: AuditAppender;
    kernel?: unknown;
    principal?: {
        id: string;
    };
    securityPrincipal?: {
        id: string;
    };
    policy?: (decision: RecoveryDecision) => Promise<RecoveryPolicyDecision> | RecoveryPolicyDecision;
    validate?: (step: RecoveryStep, plan: RecoveryPlan) => Promise<boolean> | boolean;
}
export declare const defaultRecoveryConfig: () => RecoveryConfig;
export declare class DependencyGraph {
    private readonly edges;
    addDependency(upstream: string, downstream: string): void;
    downstream(component: string): string[];
    upstream(component: string): string[];
    recoveryOrder(domains: FailureDomain[]): FailureDomain[];
}
export declare class CircuitBreaker {
    private readonly threshold;
    private readonly cooldownMs;
    state: CircuitState;
    failures: number;
    openedAt: number;
    constructor(threshold: number, cooldownMs: number);
    allow(at?: number): boolean;
    record(success: boolean, at?: number): CircuitState;
    reset(): void;
}
export declare class RecoveryBudget {
    private readonly config;
    recoveryAttempts: number;
    retries: number;
    failovers: number;
    componentSwitches: number;
    readonly startedAt: number;
    constructor(config: RecoveryConfig);
    consume(kind: 'recovery' | 'retry' | 'failover' | 'switch'): boolean;
    reset(): void;
}
export declare class FailoverRecoveryEngine {
    private readonly adapters;
    readonly graph: DependencyGraph;
    private readonly config;
    private readonly signals;
    private readonly circuits;
    private readonly locks;
    private readonly history;
    private state;
    private automaticDisabled;
    constructor(adapters?: RecoveryAdapters, config?: Partial<RecoveryConfig>);
    getState(): RecoveryState;
    transition(to: RecoveryState): RecoveryState;
    detect(signal: HealthSignal): Failure | undefined;
    confirm(failure: Failure): Failure;
    correlate(failures: Failure[]): Failure[];
    simulateRecovery(input: Failure | HealthSignal): Promise<RecoveryDecision>;
    recover(input: Failure | HealthSignal): Promise<RecoveryPlan>;
    plan(failure: Failure, dryRun?: boolean): Promise<RecoveryPlan>;
    decision(plan: RecoveryPlan): RecoveryDecision;
    execute(plan: RecoveryPlan): Promise<RecoveryPlan>;
    manualOverride(mode: ManualOverrideMode, component?: string): Promise<void>;
    historySnapshot(): RecoveryHistorySnapshot;
    private candidates;
    private eligible;
    private candidate;
    private decisionFrom;
    private runStep;
    private perform;
    private rollback;
    private degradedPlan;
    private escalate;
    private classify;
    private confidence;
    private impact;
    private severity;
    private circuit;
    private transitionFromIdle;
    private record;
    private metric;
    private emit;
    private audit;
}
export {};
//# sourceMappingURL=index.d.ts.map