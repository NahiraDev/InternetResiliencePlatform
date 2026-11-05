import { EventEmitter } from 'node:events';
export interface Phase15ConnectivitySource {
    id: string;
    providerId?: string;
    type?: string;
    state?: string;
    health?: {
        score?: number;
    };
}
export interface Phase15NetworkPath {
    id: string;
    type?: string;
    capabilities?: string[];
    score?: number;
    state?: string;
    metadata?: Record<string, unknown>;
}
export interface Phase15EventBus {
    publish(event: {
        id: string;
        type: string;
        aggregateId: string;
        occurredAt: Date;
        payload: Record<string, unknown>;
    }): Promise<void>;
}
export interface Phase15MetricsRegistry {
    record(name: string, value: number, labels?: Record<string, string>): void;
}
export interface Phase15RoutingEngine {
    simulateRouting(context: {
        destination: {
            kind: 'hostname' | 'ip';
            value: string;
        };
    }): Promise<{
        selected?: {
            path: Phase15NetworkPath;
        };
    }>;
}
export interface Phase15KernelRuntime {
    id: string;
    state?: string;
}
export interface Phase15Principal {
    id: string;
    capabilities?: string[];
}
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS';
export type ResolverProtocol = 'udp' | 'tcp' | 'doh' | 'dot' | 'dnscrypt' | 'odoh' | 'doq';
export interface DnsQuestion {
    name: string;
    recordType: DnsRecordType;
    protocol?: 'udp' | 'tcp' | 'doh' | 'dot';
    interfaceName?: string;
}
export interface DnsAnswer {
    name: string;
    recordType: DnsRecordType;
    ttl: number;
    value: string;
    dnssecValidated?: boolean;
}
export interface ResolveOptions {
    timeoutMs?: number;
    protocol?: ResolverProtocol;
}
export interface ProviderMetadata {
    id: string;
    name: string;
    country?: string;
    homepage: string;
    endpoints: {
        ipv4: string[];
        ipv6: string[];
        doh?: string;
        dot?: string;
    };
    tags: string[];
}
export interface ProviderHealth {
    healthy: boolean;
    latencyMs: number;
    checkedAt: string;
    reason?: string;
}
export interface ProviderConfig {
    enabled: boolean;
    timeoutMs: number;
    protocols: ResolverProtocol[];
    bootstrapServers?: string[];
}
export interface DnsResolver {
    protocol: ResolverProtocol;
    resolve(question: DnsQuestion, provider?: DnsProvider, options?: ResolveOptions): Promise<DnsAnswer[]>;
}
export interface DnsProvider {
    id: string;
    name: string;
    config: ProviderConfig;
    addresses?: string[];
    privacyScore?: number;
    securityScore?: number;
    resolve(question: DnsQuestion, options?: ResolveOptions): Promise<DnsAnswer[]>;
    resolveIPv4(name: string, options?: ResolveOptions): Promise<string[]>;
    resolveIPv6(name: string, options?: ResolveOptions): Promise<string[]>;
    supportsDNSSEC(): boolean;
    supportsDoH(): boolean;
    supportsDoT(): boolean;
    metadata(): ProviderMetadata;
    health(): Promise<ProviderHealth>;
}
export interface DnsHealthCheck {
    check(provider: DnsProvider): Promise<ProviderHealth>;
}
export interface DnsHealthSample {
    providerId: string;
    healthy: boolean;
    latencyMs: number;
    packetLoss: number;
    timestamp: number;
    dnssecValid?: boolean;
    reason?: string;
}
export interface BenchmarkSample {
    providerId: string;
    latencyMs: number;
    success: boolean;
    timedOut: boolean;
    error?: string;
    timestamp: string;
}
export interface DnsBenchmark {
    run(providers: DnsProvider[], question: DnsQuestion): Promise<BenchmarkSample[]>;
}
export type DecisionStrategy = 'lowest-latency' | 'highest-availability' | 'lowest-packet-loss' | 'balanced' | 'privacy-first' | 'security-first' | 'custom';
export interface ProviderWeights {
    latency: number;
    availability: number;
    packetLoss: number;
    privacy: number;
    security: number;
    stability: number;
    prediction: number;
}
export interface FailoverConfig {
    failureThreshold: number;
    recoveryThreshold: number;
    cooldownMs: number;
    failback?: 'automatic' | 'manual' | 'disabled';
    redundantGroups?: string[][];
}
export interface DnsEngineConfig {
    strategy: DecisionStrategy;
    weights: ProviderWeights;
    failover: FailoverConfig;
    minSwitchScoreDelta: number;
    historyLimit: number;
    dnssec: {
        enabled: boolean;
        requireValidation: boolean;
    };
}
export interface ProviderScore {
    provider: DnsProvider;
    score: number;
    rank: number;
    reasons: string[];
    prediction: HealthPrediction;
}
export interface HealthPrediction {
    expectedLatencyMs: number;
    degradationScore: number;
    failureProbability: number;
    stabilityTrend: 'improving' | 'stable' | 'degrading';
}
export interface DnsEngineEvent {
    type: string;
    providerId?: string;
    message: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}
export interface DnsRule {
    id: string;
    priority: number;
    match: 'domain' | 'wildcard' | 'suffix' | 'regex' | 'tld' | 'ip-range' | 'cidr';
    value: string;
    action: 'force-provider' | 'block' | 'bypass' | 'prefer-provider' | 'fallback-provider';
    provider?: string;
}
export interface RoutingProfile {
    id: string;
    name: string;
    preferredProviders: string[];
    timeoutMs: number;
    retryPolicy: {
        attempts: number;
        backoffMs: number;
    };
    benchmarkFrequencyMs: number;
    protocols: ResolverProtocol[];
}
export declare class NodeDnsResolver implements DnsResolver {
    readonly protocol: ResolverProtocol;
    constructor(protocol?: ResolverProtocol);
    resolve(question: DnsQuestion, provider?: DnsProvider, _options?: ResolveOptions): Promise<DnsAnswer[]>;
}
export declare class StaticDnsProvider implements DnsProvider {
    private readonly details;
    readonly config: ProviderConfig;
    private readonly resolvers;
    constructor(details: ProviderMetadata & {
        dnssec: boolean;
    }, config?: ProviderConfig, resolvers?: DnsResolver[]);
    get id(): string;
    get name(): string;
    resolve(question: DnsQuestion, options?: ResolveOptions): Promise<DnsAnswer[]>;
    resolveIPv4(name: string, options?: ResolveOptions): Promise<string[]>;
    resolveIPv6(name: string, options?: ResolveOptions): Promise<string[]>;
    health(): Promise<ProviderHealth>;
    latency(): Promise<number>;
    supportsDNSSEC(): boolean;
    supportsDoH(): boolean;
    supportsDoT(): boolean;
    metadata(): ProviderMetadata;
}
export declare const BUILTIN_PROVIDER_METADATA: Array<ProviderMetadata & {
    dnssec: boolean;
}>;
export declare const createBuiltinProviders: (configs?: Record<string, Partial<ProviderConfig>>, resolvers?: DnsResolver[]) => DnsProvider[];
export declare const defaultDnsEngineConfig: () => DnsEngineConfig;
export declare class InMemoryDnsCache {
    private readonly entries;
    private misses;
    get(question: DnsQuestion): DnsAnswer[] | undefined;
    set(question: DnsQuestion, answers: DnsAnswer[], ttlMs: number): void;
    stats(): {
        size: number;
        hitRatio: number;
    };
    clear(): void;
}
export declare class RuleEngine {
    private readonly rules;
    constructor(rules?: DnsRule[]);
    evaluate(question: DnsQuestion): DnsRule | undefined;
}
export declare const builtInProfiles: RoutingProfile[];
export declare class IntelligentDnsEngine extends EventEmitter {
    private readonly providers;
    private readonly healthCheck;
    private readonly config;
    private readonly rules;
    readonly ruleEngine: RuleEngine;
    private activeProviderId;
    private lastSwitchAt;
    private readonly history;
    readonly cache: InMemoryDnsCache;
    constructor(providers: DnsProvider[], healthCheck: DnsHealthCheck, config?: DnsEngineConfig, rules?: DnsRule[], ruleEngine?: RuleEngine);
    status(): {
        activeProviderId: string | undefined;
        strategy: DecisionStrategy;
        providers: ProviderScore[];
        cache: {
            size: number;
            hitRatio: number;
        };
    };
    evaluate(): Promise<ProviderScore[]>;
    resolve(question: DnsQuestion): Promise<DnsAnswer[]>;
    selectProvider(providerId: string): void;
    private recordHealth;
    rankProviders(): ProviderScore[];
    private score;
    private strategyWeights;
    private predict;
    private maybeSwitch;
    private recordEvent;
}
export type DnsResolverType = 'system' | 'local' | 'gateway' | 'public' | 'private' | 'custom' | 'plugin';
export type DnsTransportType = ResolverProtocol | 'system' | 'local-stub' | 'dnscrypt' | 'custom';
export type DnsResolverFamily = 'ipv4' | 'ipv6' | 'dual';
export type DnsResolverCapability = 'ipv4' | 'ipv6' | 'udp' | 'tcp' | 'dnssec' | 'edns' | 'dot' | 'doh' | 'doq' | 'dns64' | 'large-response' | 'custom-record-types' | string;
export type DnsResolverState = 'unknown' | 'discovered' | 'available' | 'healthy' | 'degraded' | 'failed' | 'recovering' | 'cooldown' | 'disabled';
export type DnsQueryType = DnsRecordType | 'SOA' | 'SRV' | 'PTR' | 'CAA' | string;
export type DnsQueryClass = 'IN' | 'CH' | 'HS' | string;
export type DnsResultState = 'success' | 'nxdomain' | 'no-data' | 'timeout' | 'servfail' | 'refused' | 'network-error' | 'transport-error' | 'validation-failed' | 'resolver-unavailable' | 'cancelled';
export type DnssecValidation = 'supported' | 'validated' | 'insecure' | 'bogus' | 'unavailable' | 'not-checked';
export type DnsAnomalyState = 'normal' | 'inconsistent' | 'suspicious' | 'validation-failed' | 'captive-portal-suspected';
export type DnsCacheDisposition = 'hit' | 'miss' | 'bypass' | 'stored' | 'expired';
export interface ResolverHealthStats {
    score: number;
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    latencyMs?: number;
    recentLatencyMs?: number;
    reliability: number;
    timeoutRate: number;
    successRate: number;
    servfailRate: number;
    nxdomainRate: number;
    successCount: number;
    failureCount: number;
    timeoutCount: number;
    servfailCount: number;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    lastFailure?: string;
    lastSuccess?: string;
    lastSelected?: string;
    checkedAt: string;
}
export interface SmartDnsResolver {
    id: string;
    name: string;
    type: DnsResolverType;
    address?: string;
    addresses: string[];
    transport: DnsTransportType;
    family: DnsResolverFamily;
    capabilities: DnsResolverCapability[];
    priority: number;
    health: ResolverHealthStats;
    state: DnsResolverState;
    enabled: boolean;
    metadata: Record<string, unknown>;
}
export interface DnsQuery {
    id: string;
    name: string;
    type: DnsQueryType;
    class: DnsQueryClass;
    transport?: DnsTransportType;
    timeoutMs: number;
    resolverTimeoutMs: number;
    overallTimeoutMs: number;
    policyContext?: Record<string, unknown>;
    source?: {
        providerId?: string;
        resourceId?: string;
        networkId?: string;
    };
    metadata: Record<string, unknown>;
}
export interface DnsResourceRecord {
    name: string;
    type: DnsQueryType;
    class: DnsQueryClass;
    ttl: number;
    value: string;
    metadata?: Record<string, unknown>;
}
export interface DnsResponseValidation {
    valid: boolean;
    dnssec: DnssecValidation;
    anomaly: DnsAnomalyState;
    reasons: string[];
}
export interface DnsResponse {
    queryId: string;
    answers: DnsResourceRecord[];
    authority: DnsResourceRecord[];
    additional: DnsResourceRecord[];
    rcode: DnsResultState;
    flags: Record<string, boolean>;
    ttl: number;
    resolverId: string;
    transport: DnsTransportType;
    latencyMs: number;
    validation: DnsResponseValidation;
    metadata: Record<string, unknown>;
}
export interface DnsResolutionResult {
    state: DnsResultState;
    response?: DnsResponse;
    decision: DnsDecision;
    attempts: DnsAttempt[];
    cached: boolean;
    error?: string;
}
export interface DnsAttempt {
    resolverId: string;
    transport: DnsTransportType;
    state: DnsResultState;
    latencyMs: number;
    retryable: boolean;
    reason?: string;
}
export interface DnsPolicyDecision {
    allowed: boolean;
    reason?: string;
    requiredResolverId?: string;
    preferredResolverId?: string;
    prohibitedResolverIds?: string[];
    requiredCapabilities?: DnsResolverCapability[];
    preferredTransport?: DnsTransportType;
    disabledTransports?: DnsTransportType[];
    scoreAdjustment?: Record<string, number>;
    flushCache?: boolean;
}
export interface DnsPolicyProvider {
    evaluate(query: DnsQuery, resolver: SmartDnsResolver): Promise<DnsPolicyDecision> | DnsPolicyDecision;
}
export interface DnsScoreFactor {
    id: string;
    weight: number;
    score(resolver: SmartDnsResolver, context: DnsDecisionContext): number;
    explain?(resolver: SmartDnsResolver, value: number): string;
}
export interface DnsTransport {
    id: string;
    type: DnsTransportType;
    supports(query: DnsQuery, resolver: SmartDnsResolver): boolean;
    resolve(query: DnsQuery, resolver: SmartDnsResolver, context: DnsDecisionContext): Promise<DnsResponse>;
}
export interface DnsPluginExtension {
    resolvers?: SmartDnsResolver[];
    transports?: DnsTransport[];
    scoringFactors?: DnsScoreFactor[];
    policyProviders?: DnsPolicyProvider[];
    validators?: Array<(response: DnsResponse, query: DnsQuery) => DnsResponseValidation>;
}
export interface ManualDnsOverride {
    mode: 'prefer-resolver' | 'require-resolver' | 'disable-resolver' | 'prefer-transport' | 'disable-transport' | 'flush-cache' | 'clear';
    target?: string;
    reason?: string;
}
export interface DnsDecisionContext {
    query: DnsQuery;
    resolvers?: SmartDnsResolver[];
    networkState?: Record<string, unknown>;
    connectivitySources?: unknown[];
    routingDecision?: unknown;
    manualOverride?: ManualDnsOverride;
    metadata?: Record<string, unknown>;
}
export interface DnsCandidate {
    resolver: SmartDnsResolver;
    eligible: boolean;
    rejectedReason?: string;
    score: number;
    scoreComponents: Record<string, number>;
    explanation: string[];
    policy: DnsPolicyDecision[];
}
export interface DnsDecision {
    query: DnsQuery;
    candidates: DnsCandidate[];
    rejectedCandidates: DnsCandidate[];
    selectedResolver?: SmartDnsResolver;
    selectedTransport?: DnsTransportType;
    selectedPath?: unknown;
    policy: DnsPolicyDecision[];
    reason: string;
    cache: {
        key: string;
        disposition: DnsCacheDisposition;
    };
    executionPlan: {
        fallbackOrder: string[];
        maxAttempts: number;
        timeoutMs: number;
        simulation: boolean;
    };
    explanation: Record<string, unknown>;
}
export interface DnsEnginePhase14Config {
    minimumHealthScore: number;
    cooldownMs: number;
    hysteresis: number;
    maxCacheEntries: number;
    maxTtlMs: number;
    minTtlMs: number;
    negativeTtlMs: number;
    retryCount: number;
    retryDelayMs: number;
    queryTimeoutMs: number;
    resolverTimeoutMs: number;
    overallTimeoutMs: number;
    transportPreference: DnsTransportType[];
    ipvPreference: DnsResolverFamily;
    consistencyCheck: boolean;
    anomalyDetection: boolean;
    privacyLogQueries: boolean;
}
export declare const defaultSmartDnsConfig: () => DnsEnginePhase14Config;
export declare const createResolverHealth: (p?: Partial<ResolverHealthStats>) => ResolverHealthStats;
export declare const createDnsQuery: (input: Partial<DnsQuery> & {
    name: string;
    type?: DnsQueryType;
}) => DnsQuery;
export declare const normalizeDnsName: (name: string) => string;
export declare const validateResolverDefinition: (r: SmartDnsResolver) => void;
export declare class DnsResolverRegistry {
    private readonly resolvers;
    register(r: SmartDnsResolver): SmartDnsResolver;
    unregister(id: string): void;
    get(id: string): SmartDnsResolver;
    find(id: string): SmartDnsResolver | undefined;
    list(): SmartDnsResolver[];
    enable(id: string): void;
    disable(id: string): void;
    update(id: string, patch: Partial<SmartDnsResolver>): SmartDnsResolver;
}
export declare class DnsCache {
    private readonly config;
    private readonly entries;
    constructor(config?: DnsEnginePhase14Config);
    key(q: DnsQuery, context?: string): string;
    get(q: DnsQuery, context?: string): DnsResolutionResult | undefined;
    set(q: DnsQuery, result: DnsResolutionResult, context?: string): void;
    flush(prefix?: string): number;
    stats(): {
        size: number;
        maxEntries: number;
    };
    private evict;
}
export declare class SystemDnsTransport implements DnsTransport {
    readonly id = "system-node-dns";
    readonly type: DnsTransportType;
    supports(q: DnsQuery): boolean;
    resolve(query: DnsQuery, resolver: SmartDnsResolver): Promise<DnsResponse>;
}
export declare const retryableDnsState: (s: DnsResultState) => boolean;
export declare const validateDnsResponse: (response: DnsResponse, query: DnsQuery) => DnsResponseValidation;
export declare const compareDnsResponses: (responses: DnsResponse[]) => {
    state: "consensus" | "minority" | "inconsistent" | "unknown";
    groups: Record<string, string[]>;
};
export declare const builtinDnsScoreFactors: () => DnsScoreFactor[];
export declare class SmartDnsEngine {
    private readonly options;
    readonly registry: DnsResolverRegistry;
    readonly cache: DnsCache;
    private readonly transports;
    private readonly policies;
    private readonly factors;
    private readonly singleFlight;
    private activeResolverId?;
    private manualOverride;
    private lastSwitchAt;
    constructor(options?: {
        events?: {
            publish: (event: unknown) => Promise<void>;
        };
        metrics?: {
            record: (name: string, value: number, labels?: Record<string, string>) => void;
        };
        config?: Partial<DnsEnginePhase14Config>;
    });
    readonly config: DnsEnginePhase14Config;
    registerResolver(r: SmartDnsResolver): SmartDnsResolver;
    registerTransport(t: DnsTransport): void;
    registerPolicy(p: DnsPolicyProvider): void;
    registerScoreFactor(f: DnsScoreFactor): void;
    registerExtension(e: DnsPluginExtension): void;
    decide(context: DnsDecisionContext, simulation?: boolean): Promise<DnsDecision>;
    simulateDnsResolution(context: DnsDecisionContext): Promise<DnsDecision>;
    resolve(input: DnsQuery | (Partial<DnsQuery> & {
        name: string;
        type?: DnsQueryType;
    }), context?: Omit<DnsDecisionContext, 'query'>): Promise<DnsResolutionResult>;
    private execute;
    setManualOverride(o: ManualDnsOverride): void;
    flushCache(prefix?: string): number;
    private candidate;
    private setActiveResolver;
    private updateHealth;
    private publish;
}
export type DnsTransportState = 'unknown' | 'available' | 'unavailable' | 'connecting' | 'healthy' | 'degraded' | 'failed' | 'recovering' | 'disabled';
export type DnsTransportCapability = 'plaintext' | 'encrypted' | 'tls' | 'https' | 'quic' | 'certificate-validation' | 'hostname-verification' | 'connection-reuse' | 'wire-format' | 'plugin-provided' | string;
export type DnsSecurityProfileId = 'strict' | 'secure' | 'balanced' | 'compatibility' | 'custom';
export type DnsTransportErrorCode = 'TransportUnavailable' | 'ConnectionTimeout' | 'ConnectionRefused' | 'TlsHandshakeFailed' | 'CertificateValidationFailed' | 'HostnameVerificationFailed' | 'HttpError' | 'HttpTimeout' | 'ProtocolError' | 'DnsMessageInvalid' | 'QuicHandshakeFailed' | 'TransportPolicyRejected' | 'TransportCancelled' | 'ConfigurationInvalid' | 'ResponseTooLarge' | 'CircuitOpen';
export type DnsTransportFailureKind = 'retryable-transport' | 'non-retryable-security' | 'resolver' | 'policy' | 'configuration' | 'cancelled';
export type CertificateValidationState = 'valid' | 'expired' | 'untrusted' | 'hostname-mismatch' | 'unexpected-chain' | 'validation-failed' | 'not-applicable';
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';
export declare class DnsTransportError extends Error {
    readonly code: DnsTransportErrorCode;
    readonly retryable: boolean;
    readonly failureKind: DnsTransportFailureKind;
    readonly details: Record<string, unknown>;
    constructor(code: DnsTransportErrorCode, message: string, retryable: boolean, failureKind: DnsTransportFailureKind, details?: Record<string, unknown>);
}
export interface DnsWireMessage {
    id: number;
    payload: Buffer;
    recordType?: DnsRecordType | undefined;
}
export interface TransportEndpoint {
    hostname: string;
    port: number;
    path?: string;
    url?: string;
    tlsServerName?: string;
}
export interface TransportConnection {
    id: string;
    key: string;
    transportId: string;
    type: DnsTransportType;
    endpoint: TransportEndpoint;
    createdAt: number;
    lastUsedAt: number;
    expiresAt: number;
    state: 'connecting' | 'open' | 'closed';
    raw?: unknown;
}
export interface TransportRetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    jitterRatio: number;
}
export interface TransportPoolConfig {
    maxConnections: number;
    idleTimeoutMs: number;
    maxLifetimeMs: number;
    keepAlive: boolean;
}
export interface TransportCircuitBreakerConfig {
    failureThreshold: number;
    recoveryTimeoutMs: number;
    halfOpenMaxAttempts: number;
}
export interface DnsTransportConfig {
    priority: DnsTransportType[];
    allowedTransports: DnsTransportType[];
    disabledTransports: DnsTransportType[];
    tls: {
        minVersion: 'TLSv1.2' | 'TLSv1.3';
        requireCertificateValidation: true;
        requireHostnameVerification: true;
    };
    timeouts: {
        connectMs: number;
        readMs: number;
        writeMs: number;
        queryMs: number;
        shutdownMs: number;
    };
    retry: TransportRetryConfig;
    pool: TransportPoolConfig;
    circuitBreaker: TransportCircuitBreakerConfig;
    maxResponseBytes: number;
    fallback: {
        allowPlaintextDowngrade: boolean;
        enabled: boolean;
    };
}
export interface DnsTransportSecurityProfile {
    id: DnsSecurityProfileId;
    allowedTransports: DnsTransportType[];
    requireEncrypted: boolean;
    requireCertificateValidation: boolean;
    requireHostnameVerification: boolean;
    allowPlaintextFallback: boolean;
    preferredOrder: DnsTransportType[];
}
export interface DnsTransportPolicy {
    requireEncryptedDns?: boolean;
    preferTransports?: DnsTransportType[];
    allowTransports?: DnsTransportType[];
    denyTransports?: DnsTransportType[];
    requireCertificateValidation?: boolean;
    requireResolverId?: string;
    requireTransport?: DnsTransportType;
    denyPlaintextDns?: boolean;
}
export interface DnsTransportContext {
    resolver: DnsProvider;
    networkState?: unknown;
    connectivitySource?: Phase15ConnectivitySource;
    route?: Phase15NetworkPath;
    policy?: DnsTransportPolicy;
    securityProfile?: DnsTransportSecurityProfile;
    timeoutMs?: number;
    signal?: AbortSignal;
    metadata?: Record<string, unknown>;
}
export interface DnsTransportScore {
    security: number;
    latency: number;
    reliability: number;
    availability: number;
    networkCompatibility: number;
    resolverCompatibility: number;
    connectionStability: number;
    historicalPerformance: number;
    policyPreference: number;
    total: number;
}
export interface DnsTransportCandidate {
    transport: SecureDnsTransport;
    endpoint: TransportEndpoint;
    score: DnsTransportScore;
}
export interface RejectedDnsTransportCandidate {
    transportId: string;
    type: DnsTransportType;
    reason: string;
    policyViolation: boolean;
    securityImplication?: string;
}
export interface DnsTransportDecision {
    query: {
        recordType: DnsRecordType;
        nameHash: string;
    };
    resolver: {
        id: string;
        name: string;
    };
    candidates: DnsTransportCandidate[];
    rejectedCandidates: RejectedDnsTransportCandidate[];
    selectedTransport?: DnsTransportCandidate;
    securityProfile: DnsTransportSecurityProfile;
    policy?: DnsTransportPolicy;
    route?: Phase15NetworkPath;
    reason: string;
    fallbackOrder: DnsTransportCandidate[];
    securityImplications: string[];
    dryRun: boolean;
}
export interface SecureDnsTransport {
    id: string;
    type: DnsTransportType;
    capabilities: DnsTransportCapability[];
    state: DnsTransportState;
    supports(query: DnsWireMessage, resolver: DnsProvider, context: DnsTransportContext): boolean;
    endpoint(resolver: DnsProvider): TransportEndpoint | undefined;
    connect(resolver: DnsProvider, context: DnsTransportContext): Promise<TransportConnection>;
    resolve(connection: TransportConnection, query: DnsWireMessage, context: DnsTransportContext): Promise<DnsWireMessage>;
    close(connection: TransportConnection): Promise<void>;
}
export declare const defaultDnsTransportConfig: () => DnsTransportConfig;
export declare const dnsTransportSecurityProfiles: Record<Exclude<DnsSecurityProfileId, 'custom'>, DnsTransportSecurityProfile>;
export declare const encodeDnsQuery: (question: DnsQuestion) => DnsWireMessage;
export declare const validateDnsWireResponse: (payload: Buffer, request?: DnsWireMessage, max?: number) => DnsWireMessage;
export declare const validateDohEndpoint: (url: string) => TransportEndpoint;
export declare const validateDotEndpoint: (host: string) => TransportEndpoint;
declare abstract class BaseTransport implements SecureDnsTransport {
    state: DnsTransportState;
    abstract id: string;
    abstract type: DnsTransportType;
    abstract capabilities: DnsTransportCapability[];
    abstract endpoint(resolver: DnsProvider): TransportEndpoint | undefined;
    supports(_q: DnsWireMessage, resolver: DnsProvider, ctx: DnsTransportContext): boolean;
    abstract connect(resolver: DnsProvider, context: DnsTransportContext): Promise<TransportConnection>;
    abstract resolve(connection: TransportConnection, query: DnsWireMessage, context: DnsTransportContext): Promise<DnsWireMessage>;
    close(connection: TransportConnection): Promise<void>;
}
export declare class DnsOverTlsTransport extends BaseTransport {
    id: string;
    type: DnsTransportType;
    capabilities: DnsTransportCapability[];
    endpoint(resolver: DnsProvider): TransportEndpoint | undefined;
    connect(resolver: DnsProvider, ctx: DnsTransportContext): Promise<TransportConnection>;
    resolve(connection: TransportConnection, query: DnsWireMessage, ctx: DnsTransportContext): Promise<DnsWireMessage>;
}
export declare class DnsOverHttpsTransport extends BaseTransport {
    id: string;
    type: DnsTransportType;
    capabilities: DnsTransportCapability[];
    private readonly agent;
    endpoint(resolver: DnsProvider): TransportEndpoint | undefined;
    connect(resolver: DnsProvider): Promise<TransportConnection>;
    resolve(connection: TransportConnection, query: DnsWireMessage, ctx: DnsTransportContext): Promise<DnsWireMessage>;
    close(connection: TransportConnection): Promise<void>;
}
export declare class DnsOverQuicTransport extends BaseTransport {
    id: string;
    type: DnsTransportType;
    capabilities: DnsTransportCapability[];
    endpoint(_resolver: DnsProvider): TransportEndpoint | undefined;
    supports(): boolean;
    connect(): Promise<TransportConnection>;
    resolve(): Promise<DnsWireMessage>;
}
export declare class DnsTransportRegistry {
    private readonly transports;
    register(t: SecureDnsTransport): void;
    get(id: string): SecureDnsTransport | undefined;
    list(): SecureDnsTransport[];
    byType(type: DnsTransportType): SecureDnsTransport[];
}
export declare const createDefaultDnsTransportRegistry: () => DnsTransportRegistry;
export declare class SecureDnsTransportEngine {
    private readonly options;
    private readonly registry;
    private readonly config;
    private readonly pool;
    private readonly circuits;
    private shuttingDown;
    constructor(options?: {
        registry?: DnsTransportRegistry;
        events?: Phase15EventBus;
        metrics?: Phase15MetricsRegistry;
        routing?: Phase15RoutingEngine;
        kernel?: Phase15KernelRuntime;
        principal?: Phase15Principal;
        config?: Partial<DnsTransportConfig>;
    });
    simulateDnsTransportSelection(question: DnsQuestion, resolver: DnsProvider, context?: Partial<DnsTransportContext>): Promise<DnsTransportDecision>;
    resolve(question: DnsQuestion, resolver: DnsProvider, context?: Partial<DnsTransportContext>): Promise<DnsWireMessage>;
    private select;
    private policyRejection;
    private score;
    private withRetry;
    private execute;
    private routeFor;
    shutdown(): Promise<void>;
    poolSize(): number;
    private circuit;
    private toTransportError;
    private validateConfig;
    private metric;
    private emit;
}
export {};
//# sourceMappingURL=index.d.ts.map