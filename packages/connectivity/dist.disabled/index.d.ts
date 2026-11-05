import type { KernelRuntime, Principal } from '@irp/kernel';
import type { MonitoringSnapshot } from '@irp/network';
import { MetricsRegistry } from '@irp/telemetry';
export type ConnectivityProviderType = 'ethernet' | 'wifi' | 'cellular' | 'usb-tether' | 'vpn' | 'proxy' | 'relay' | 'virtual' | 'custom';
export type ConnectivityCapability = 'connect' | 'disconnect' | 'activate' | 'deactivate' | 'monitor' | 'health-check' | 'supports-ipv4' | 'supports-ipv6' | 'supports-default-route' | 'supports-dns' | 'supports-multipath' | 'supports-tunneling';
export type ConnectivityState = 'unknown' | 'discovered' | 'available' | 'unavailable' | 'connecting' | 'connected' | 'active' | 'degraded' | 'failed' | 'disconnecting' | 'recovering' | 'disabled';
export type TransitionStatus = 'prepared' | 'validating' | 'activating' | 'verifying' | 'committed' | 'rolled-back' | 'failed' | 'rejected';
export type TransitionReason = 'active-source-failed' | 'health-degraded' | 'policy-requested' | 'manual-request' | 'preferred-source-recovered' | 'better-source-available' | 'critical-connectivity-loss' | 'provider-disabled' | 'provider-recovered' | 'candidate-activation-failed' | 'candidate-verification-failed';
export type ManualOverrideMode = 'force' | 'prefer' | 'disable' | 'enable' | 'clear';
export interface ConnectivityHealth {
    score: number;
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    latencyMs?: number;
    packetLoss?: number;
    jitterMs?: number;
    stability?: number;
    bandwidthMbps?: number;
    internetReachable?: boolean;
    dnsReachable?: boolean;
    gatewayReachable?: boolean;
    ipv4?: boolean;
    ipv6?: boolean;
    checkedAt: string;
    source?: 'provider' | 'network-intelligence' | 'simulation';
    factors?: Record<string, unknown>;
}
export interface ConnectivityResource {
    providerId: string;
    id: string;
    type: ConnectivityProviderType;
    interfaceName?: string;
    state: ConnectivityState;
    addresses: string[];
    gateway?: string;
    dnsServers: string[];
    capabilities: ConnectivityCapability[];
    health?: ConnectivityHealth;
    priority?: number;
    metadata: Record<string, unknown>;
}
export interface ConnectivityOperationResult {
    ok: boolean;
    resourceId: string;
    state?: ConnectivityState;
    error?: string;
    metadata?: Record<string, unknown>;
}
export interface ConnectivityProvider {
    readonly id: string;
    readonly type: ConnectivityProviderType;
    discover(): Promise<ConnectivityResource[]>;
    getState(resourceId?: string): Promise<ConnectivityState>;
    getHealth(resourceId?: string): Promise<ConnectivityHealth>;
    connect(resourceId: string): Promise<ConnectivityOperationResult>;
    disconnect(resourceId: string): Promise<ConnectivityOperationResult>;
    activate(resourceId: string): Promise<ConnectivityOperationResult>;
    deactivate(resourceId: string): Promise<ConnectivityOperationResult>;
    capabilities(resourceId?: string): ConnectivityCapability[];
}
export interface SourceId {
    providerId: string;
    resourceId: string;
}
export interface ConnectivitySource extends ConnectivityResource {
    sourceId: string;
    available: boolean;
    connected: boolean;
    active: boolean;
    preferred: boolean;
    candidate: boolean;
    failed: boolean;
    recovering: boolean;
    failure: FailureStats;
    score?: ConnectivityScore;
}
export interface ConnectivityScore {
    sourceId: string;
    score: number;
    band: 'unusable' | 'critical' | 'poor' | 'degraded' | 'healthy' | 'excellent';
    components: Record<string, number>;
    explanation: string[];
}
export interface ConnectionTransition {
    id: string;
    from: SourceId | undefined;
    to: SourceId | undefined;
    reason: TransitionReason;
    trigger: 'policy' | 'health' | 'manual' | 'provider' | 'recovery' | 'simulation';
    startedAt: string;
    completedAt: string | undefined;
    status: TransitionStatus;
    failure: {
        code: string;
        message: string;
    } | undefined;
    verification: ConnectivityHealth | undefined;
    metadata: Record<string, unknown>;
}
export interface SelectionCandidate {
    source: ConnectivitySource;
    score: ConnectivityScore;
    decision: 'eligible' | 'current' | 'disabled' | 'unhealthy' | 'unstable' | 'cooldown' | 'policy-rejected' | 'missing-capability' | 'lower-score' | 'failed-recently';
    reasons: string[];
}
export interface SelectionEvaluation {
    current: ConnectivitySource | undefined;
    availableSources: ConnectivitySource[];
    healthySources: ConnectivitySource[];
    candidates: SelectionCandidate[];
    selected: SelectionCandidate | undefined;
    reason: string;
    policyConstraints: string[];
    generatedAt: string;
}
export interface FailureStats {
    failureCount: number;
    successCount: number;
    switchCount: number;
    recoveryAttempts: number;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    lastFailure: string | undefined;
    lastRecovery: string | undefined;
    failureStartedAt: string | undefined;
    recentTransitions: string[];
}
export interface ConnectivityConfig {
    priorities: Partial<Record<ConnectivityProviderType, number>>;
    minimumHealthScore: number;
    minimumStabilityScore: number;
    minimumStabilityMs: number;
    switchingHysteresis: number;
    cooldownMs: number;
    failoverRetryCount: number;
    candidateTimeoutMs: number;
    verificationTimeoutMs: number;
    recoveryTimeoutMs: number;
    flappingThreshold: number;
    flappingWindowMs: number;
    maxHistory: number;
    failback: 'disabled' | 'safe' | 'preferred';
}
export interface PolicyDecision {
    allowed: boolean;
    reason?: string;
    constraints?: string[];
}
export interface ConnectivityManagerOptions {
    kernel?: KernelRuntime;
    principal?: Principal;
    metrics?: MetricsRegistry;
    config?: Partial<ConnectivityConfig>;
    policy?: (evaluation: SelectionEvaluation, transition?: Partial<ConnectionTransition>) => Promise<PolicyDecision> | PolicyDecision;
    healthSnapshot?: () => Promise<MonitoringSnapshot> | MonitoringSnapshot;
    now?: () => number;
}
export declare class ConnectivityError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, message: string, details?: Record<string, unknown>);
}
export declare class ProviderNotFound extends ConnectivityError {
    constructor(id: string);
}
export declare class ResourceNotFound extends ConnectivityError {
    constructor(id: string);
}
export declare class UnsupportedCapability extends ConnectivityError {
    constructor(capability: ConnectivityCapability, id: string);
}
export declare class InvalidTransition extends ConnectivityError {
    constructor(from: ConnectivityState, to: ConnectivityState);
}
export declare class SwitchRejected extends ConnectivityError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class FailoverExhausted extends ConnectivityError {
    constructor();
}
export declare const defaultConnectivityConfig: () => ConnectivityConfig;
export declare const assertConnectivityTransition: (from: ConnectivityState, to: ConnectivityState) => void;
export declare class ConnectivityProviderRegistry {
    private readonly providers;
    register(provider: ConnectivityProvider): void;
    unregister(id: string): void;
    get(id: string): ConnectivityProvider;
    list(): ConnectivityProvider[];
}
export declare class ConnectivityManager {
    private readonly options;
    readonly registry: ConnectivityProviderRegistry;
    private readonly resources;
    private readonly failures;
    private transitions;
    private active;
    private preferred;
    private disabled;
    private forced;
    private transitionLock;
    private lastSwitchAt;
    private stabilizationUntil;
    private readonly config;
    constructor(options?: ConnectivityManagerOptions);
    registerProvider(provider: ConnectivityProvider): Promise<void>;
    unregisterProvider(id: string): Promise<void>;
    getProviders(): ConnectivityProvider[];
    discoverProviders(): Promise<ConnectivityProvider[]>;
    discoverResources(): Promise<ConnectivityResource[]>;
    getResources(): ConnectivityResource[];
    getActiveSource(): ConnectivitySource | undefined;
    getAvailableSources(): ConnectivitySource[];
    getHealthySources(): ConnectivitySource[];
    selectSource(): Promise<SelectionEvaluation>;
    evaluate(): Promise<SelectionEvaluation>;
    activateSource(resourceId: string, reason?: TransitionReason): Promise<ConnectionTransition>;
    deactivateSource(resourceId: string): Promise<void>;
    switchSource(resourceId: string, reason?: TransitionReason, trigger?: ConnectionTransition['trigger']): Promise<ConnectionTransition>;
    failover(reason?: TransitionReason): Promise<ConnectionTransition>;
    failback(): Promise<ConnectionTransition | undefined>;
    recover(resourceId: string): Promise<boolean>;
    manualOverride(mode: ManualOverrideMode, resourceId?: string): Promise<void>;
    history(): ConnectionTransition[];
    private transitionTo;
    private candidate;
    private scoreSource;
    private source;
    private sources;
    private refreshHealth;
    private mergeHealth;
    private validateResource;
    private requireCapability;
    private stats;
    private markFailure;
    private markSuccess;
    private recordTransition;
    private addTransition;
    private reject;
    private enqueue;
    private audit;
    private metric;
    private now;
    private validateConfig;
}
export interface SimulationResourceInput {
    id: string;
    type?: ConnectivityProviderType;
    state?: ConnectivityState;
    health: Partial<ConnectivityHealth>;
    priority?: number;
    capabilities?: ConnectivityCapability[];
    activationFails?: boolean;
    verificationFails?: boolean;
}
export declare class SimulationConnectivityProvider implements ConnectivityProvider {
    readonly id: string;
    readonly type: ConnectivityProviderType;
    private readonly resources;
    private activationFailures;
    private verificationFailures;
    constructor(id: string, type: ConnectivityProviderType, inputs: SimulationResourceInput[]);
    discover(): Promise<ConnectivityResource[]>;
    getState(resourceId?: string): Promise<ConnectivityState>;
    getHealth(resourceId?: string): Promise<ConnectivityHealth>;
    capabilities(resourceId?: string): ConnectivityCapability[];
    connect(resourceId: string): Promise<ConnectivityOperationResult>;
    disconnect(resourceId: string): Promise<ConnectivityOperationResult>;
    activate(resourceId: string): Promise<ConnectivityOperationResult>;
    deactivate(resourceId: string): Promise<ConnectivityOperationResult>;
    setHealth(resourceId: string, health: Partial<ConnectivityHealth>): void;
    setActivationFailure(resourceId: string, fails: boolean): void;
    setVerificationFailure(resourceId: string, fails: boolean): void;
    private resource;
    private set;
}
//# sourceMappingURL=index.d.ts.map